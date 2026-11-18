#!/usr/bin/env node
// The one command that decides whether the site may ship. CI runs exactly this (with --lighthouse).
// Usage: node tools/verify.mjs [--quick] [--lighthouse [--all] [--base=<commit>] [--dry-run]] [--if-configured]
//   default          build + release checks -> HTML validation -> internal links
//   --quick          build + release checks -> internal links (offline, about a second; pre-push and Stop hooks)
//   --lighthouse     also runs Lighthouse with the budgets in lighthouserc.json (needs Chrome), but only on
//                    the pages whose built HTML (or a file they load) differs from the <base> version:
//                    <base> is built in a temporary git worktree and the two _site folders are compared.
//                    No page changed -> Lighthouse is skipped. Everything is audited when lighthouserc.json
//                    changed, or when <base> is missing, all zeros, unknown or does not build.
//                    More than SAMPLE (5) pages changed = a shared file changed (menu, footer, stylesheet,
//                    script, site.config.json): SAMPLE of them, picked at random, are audited instead.
//     --base=<commit>  what to compare with. Default: origin/main locally; in CI (CI env set) a full run
//                      unless the workflow passes one (it passes the commit of the last successful deploy,
//                      so a page that failed before is checked again until it passes).
//     --all            audit every page, no sampling (Run workflow by hand in GitHub does this too)
//     --dry-run        only print which pages would be audited
//   --if-configured  do nothing while the repo is still the untouched template (used by hooks)
// The secret check (tools/secrets.mjs, every tracked file) always runs first, template or not.
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { ROOT, OUT, HTML_VALIDATE, LHCI, walk, read, rel, loadConfig, isConfigured } from './lib.mjs';

const argv = process.argv.slice(2);
const args = new Set(argv);
const option = (name) => { const a = argv.find((x) => x.startsWith(`--${name}=`)); return a === undefined ? undefined : a.slice(name.length + 3); };
const quick = args.has('--quick');
const lighthouse = args.has('--lighthouse');

const secrets = spawnSync(process.execPath, ['tools/secrets.mjs'], { cwd: ROOT, stdio: 'inherit' });
if (secrets.status !== 0) {
  console.log('\nFAILED: a key or token is in the repo (tools/secrets.mjs). Remove it before anything else.');
  process.exit(1);
}

if (args.has('--if-configured')) {
  let configured = true;
  try { configured = isConfigured(loadConfig()); } catch { /* a broken config is a real failure: fall through */ }
  if (!configured) {
    console.log('Template not configured yet (BRAND is empty in site.config.json); nothing to verify.');
    process.exit(0);
  }
}

const results = [];
function step(name, fn) {
  process.stdout.write(`\n▶ ${name}\n`);
  const t = Date.now();
  let ok;
  try { ok = fn() !== false; } catch (e) { console.error(e.message); ok = false; }
  results.push({ name, ok, s: ((Date.now() - t) / 1000).toFixed(1) });
  if (!ok) finish();
}
function run(cmd, cmdArgs) {
  const r = spawnSync(cmd, cmdArgs, { cwd: ROOT, stdio: 'inherit', shell: process.platform === 'win32' });
  return r.status === 0;
}
function finish() {
  console.log('\n──────── summary ────────');
  for (const r of results) console.log(`${r.ok ? '✔' : '✘'} ${r.name} (${r.s}s)`);
  const failed = results.some((r) => !r.ok);
  console.log(failed ? '\nFAILED: fix the step above before pushing.' : '\nAll good: this would pass CI.');
  process.exit(failed ? 1 : 0);
}

let siteBase;
/** Local href/src/srcset/poster targets of a built page: [{ url, target }] (target = absolute path, or null for a bad URL). */
function localRefs(page) {
  if (siteBase === undefined) {
    siteBase = '';
    try { siteBase = String(loadConfig().SITE_URL || '').replace(/\/+$/, '') + '/'; } catch { /* reported by check.mjs */ }
  }
  const refs = [];
  const html = read(page).replace(/<!--[\s\S]*?-->/g, '');
  for (const m of html.matchAll(/\s(?:href|src|srcset|poster)\s*=\s*["']([^"']+)["']/gi)) {
    for (let url of m[1].split(',').map((s) => s.trim().split(/\s+/)[0])) {
      if (!url) continue;
      // Absolute links to this site (404.html, canonicals) are checked like local ones.
      if (siteBase.length > 1 && url.startsWith(siteBase)) url = '/' + url.slice(siteBase.length);
      else if (/^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(url)) continue;
      url = url.split(/[?#]/)[0];
      if (!url) continue;
      let target = null;
      try { target = url.startsWith('/') ? join(OUT, decodeURI(url)) : resolve(dirname(page), decodeURI(url)); } catch { /* bad URL */ }
      refs.push({ url, target });
    }
  }
  return refs;
}

/** Every local href/src in the built site must point at a file that exists. */
function checkLinks() {
  const bad = [];
  const pages = walk(OUT).filter((p) => p.endsWith('.html'));
  for (const page of pages) {
    for (const { url, target: t } of localRefs(page)) {
      let target = t;
      if (!target) { bad.push(`${page}: bad URL ${url}`); continue; }
      if (!target.startsWith(OUT)) { bad.push(`${page.slice(OUT.length + 1)} -> ${url} (points outside the site)`); continue; }
      if (existsSync(target) && statSync(target).isDirectory()) target = join(target, 'index.html');
      if (!existsSync(target)) bad.push(`${page.slice(OUT.length + 1)} -> ${url}`);
    }
  }
  if (bad.length) { console.error(`Broken internal links (${bad.length}):\n  ` + bad.join('\n  ')); return false; }
  console.log(`${pages.length} pages, no broken internal links.`);
}

/**
 * Built pages that differ from the <base> build: their HTML changed, or a file they load does
 * (stylesheet, script, image, font, video; files a stylesheet loads count for the pages using it).
 * Returns { pages: [paths relative to _site] } or { pages: null } for "audit everything", plus why.
 */
const SAMPLE = 5;
const ASSET = /\.(css|m?js|png|jpe?g|gif|webp|avif|svg|ico|woff2?|ttf|otf|mp4|webm)$/i;
function pagesToAudit() {
  if (args.has('--all')) return { pages: null, why: '--all' };
  const base = option('base') ?? (process.env.CI ? '' : 'origin/main');
  if (!base || /^0+$/.test(base)) return { pages: null, why: 'no earlier version to compare with' };
  const git = (a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  let sha;
  try { sha = git(['rev-parse', '--verify', '--quiet', `${base}^{commit}`]).trim(); } catch { return { pages: null, why: `${base} not found` }; }
  const label = `${base === sha ? '' : base + ' '}${sha.slice(0, 7)}`;
  try {
    if (git(['diff', '--name-only', sha, '--', 'lighthouserc.json']).trim()) return { pages: null, why: 'lighthouserc.json changed' };
  } catch { return { pages: null, why: `cannot compare with ${label}` }; }

  const tmp = mkdtempSync(join(tmpdir(), 'verify-base-'));
  const tree = join(tmp, 'base');
  try {
    git(['worktree', 'prune']);
    git(['worktree', 'add', '--detach', '--quiet', tree, sha]);
    // The base version's own build, into its own _site (works whatever tools that version had).
    const b = spawnSync(process.execPath, ['tools/build.mjs'], { cwd: tree, encoding: 'utf8' });
    const baseOut = join(tree, '_site');
    if (b.status !== 0 || !existsSync(baseOut)) return { pages: null, why: `${label} does not build` };

    const same = (r) => { const o = join(baseOut, r); return existsSync(o) && readFileSync(o).equals(readFileSync(join(OUT, r))); };
    const changed = new Set(walk(OUT).map((p) => rel(p, OUT)).filter((r) => !same(r)));
    const cssRefs = (r) => {
      const css = join(OUT, r);
      if (!existsSync(css)) return [];
      return [...read(css).matchAll(/url\(\s*["']?([^"')]+?)["']?\s*\)/gi)].map((m) => m[1])
        .filter((u) => !/^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(u))
        .map((u) => { try { return rel(u.startsWith('/') ? join(OUT, decodeURI(u.split(/[?#]/)[0])) : resolve(dirname(css), decodeURI(u.split(/[?#]/)[0])), OUT); } catch { return ''; } });
    };
    const pages = walk(OUT).filter((p) => p.endsWith('.html')).map((p) => rel(p, OUT)).filter((r) => {
      if (changed.has(r)) return true;
      // Only what the page loads counts: links to other pages, the feed or llms.txt do not.
      const loads = localRefs(join(OUT, r)).filter((x) => x.target?.startsWith(OUT)).map((x) => rel(x.target, OUT))
        .filter((f) => ASSET.test(f));
      return loads.some((f) => changed.has(f) || (f.endsWith('.css') && cssRefs(f).some((g) => changed.has(g))));
    });
    return { pages, why: `compared with ${label}` };
  } catch (e) {
    return { pages: null, why: `cannot build ${label} for comparison (${String(e.message).split('\n')[0]})` };
  } finally {
    try { git(['worktree', 'remove', '--force', tree]); } catch { /* not created */ }
    rmSync(tmp, { recursive: true, force: true });
  }
}

function lighthouseStep() {
  let { pages, why } = pagesToAudit();
  if (pages && !pages.length) {
    console.log(`No page changed (${why}): Lighthouse not needed.`);
    return true;
  }
  if (pages && pages.length > SAMPLE) {
    const all = pages.length;
    for (let i = pages.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pages[i], pages[j]] = [pages[j], pages[i]]; }
    pages.length = SAMPLE;
    pages.sort();
    why += `; ${all} pages changed, so a shared file did: ${SAMPLE} picked at random`;
  }
  const urls = pages ? pages.map((r) => `--collect.url=http://localhost/${encodeURI(r)}`) : [];
  console.log(pages ? `Auditing ${pages.length} changed page(s) (${why}):\n  ${pages.join('\n  ')}` : `Auditing every page (${why}).`);
  if (args.has('--dry-run')) return true;
  return run('npx', ['--yes', LHCI, 'autorun', ...urls]);
}

step('Build and release checks (tools/check.mjs)', () => run(process.execPath, ['tools/check.mjs']));
if (!quick) step('HTML validation', () => run('npx', ['--yes', HTML_VALIDATE, '_site/**/*.html']));
step('Internal links', checkLinks);
if (lighthouse) step('Lighthouse on changed pages (budgets in lighthouserc.json)', lighthouseStep);
if (!quick && !lighthouse) console.log('\n(Lighthouse skipped; add --lighthouse to run it like CI does.)');
finish();
