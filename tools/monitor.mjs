#!/usr/bin/env node
// Checks the LIVE site (not the repo): pages and key files answer, the last deploy worked, outbound
// links still work, the certificate is not about to expire, the form worker runs the emails that are
// in the repo, Search Console verification is still in place, and (with --lighthouse) the live pages
// stay within the Lighthouse budgets. Runs weekly in CI (.github/workflows/monitor.yml) and on demand.
//
// Usage: node tools/monitor.mjs [--lighthouse] [--issue] [--url <base>] [--skip external,worker,tls,github,google]
//   --issue   (CI) open or update a GitHub issue when something is wrong, close it when all is well again
//   --url     check another address instead of SITE_URL (e.g. a local server; used by the self-test)
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { connect } from 'node:tls';
import { LHCI, ROOT, loadConfig, read, siteUrl, walk } from './lib.mjs';
import { buildSite } from './build.mjs';

const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined; };
const skip = new Set((opt('skip') || '').split(',').filter(Boolean));
const config = loadConfig();
const live = siteUrl(config);
const base = opt('url') ? opt('url').replace(/\/?$/, '/') : live;
const toBase = (u) => (u.startsWith(live) ? base + u.slice(live.length) : u);

const problems = [];
const notes = [];
const bad = (m) => { problems.push(m); console.log(`✘ ${m}`); };
const good = (m) => console.log(`✔ ${m}`);
const note = (m) => { notes.push(m); console.log(`! ${m}`); };

async function get(url, { method = 'GET', timeout = 15000 } = {}) {
  try {
    const res = await fetch(url, { method, redirect: 'follow', signal: AbortSignal.timeout(timeout), headers: { 'User-Agent': 'landing-monitor/1 (+site owner check)' } });
    return { status: res.status, text: method === 'GET' ? await res.text() : '' };
  } catch (e) {
    return { status: 0, error: e.cause?.code || e.name || e.message };
  }
}

// 1. Home, key files and every page in the live sitemap
const home = await get(base);
if (home.status !== 200) bad(`home page ${base} answers ${home.status || home.error}`);
else good(`home page ${base} is up`);
for (const f of ['robots.txt', 'sitemap.xml', 'llms.txt', 'og.png', ...(config.INDEXNOW_KEY ? ['indexnow.txt'] : [])]) {
  const r = await get(base + f, { method: f.endsWith('.png') ? 'HEAD' : 'GET' });
  if (r.status !== 200) bad(`${f} answers ${r.status || r.error}`);
}
const sitemap = await get(base + 'sitemap.xml');
const pages = [...(sitemap.text || '').matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1]);
let pagesOk = 0;
for (const u of pages) {
  const r = await get(toBase(u));
  if (r.status === 200) pagesOk++;
  else bad(`${u} answers ${r.status || r.error}`);
}
if (pages.length) good(`${pagesOk}/${pages.length} sitemap pages answer 200`);
else bad('sitemap.xml lists no pages');

// 2. Search Console verification still on the home page
if (!skip.has('google') && config.GOOGLE_SITE_VERIFICATION && home.status === 200) {
  if (home.text.includes(config.GOOGLE_SITE_VERIFICATION)) good('Google verification tag in place');
  else bad('Google verification tag missing from the live home page (Search Console access may be lost)');
}

// 3. The last deploy from main worked (otherwise the live site is older than the repo)
if (!skip.has('github')) {
  const r = spawnSync('gh', ['run', 'list', '--workflow', 'pages.yml', '--branch', 'main', '--limit', '1', '--json', 'conclusion,status,createdAt,url'], { cwd: ROOT, encoding: 'utf8' });
  const run = r.status === 0 ? JSON.parse(r.stdout || '[]')[0] : undefined;
  if (!run) note('could not read the deploy history (gh not signed in?)');
  else if (run.status === 'completed' && run.conclusion !== 'success') bad(`last deploy from main failed (${run.createdAt.slice(0, 10)}): ${run.url}`);
  else good(`last deploy: ${run.conclusion || run.status} (${run.createdAt.slice(0, 10)})`);
}

// 4. Certificate
if (!skip.has('tls') && base.startsWith('https://')) {
  const host = new URL(base).hostname;
  const days = await new Promise((done) => {
    const s = connect({ host, port: 443, servername: host, timeout: 10000 }, () => {
      const cert = s.getPeerCertificate();
      s.end();
      done(cert?.valid_to ? Math.floor((Date.parse(cert.valid_to) - Date.now()) / 864e5) : null);
    });
    s.on('error', () => done(null));
    s.on('timeout', () => { s.destroy(); done(null); });
  });
  if (days === null) bad(`could not check the HTTPS certificate of ${host}`);
  else if (days < 14) bad(`HTTPS certificate of ${host} expires in ${days} days`);
  else good(`HTTPS certificate valid for ${days} more days`);
}

// 5. Contact form worker runs the emails that are in the repo
if (!skip.has('worker') && /\.workers\.dev\/?$/.test(config.FORM_ENDPOINT || '')) {
  const { workerSource } = await import('./form-worker.mjs');
  let expected = '';
  try { expected = workerSource(config).site.version; } catch (e) { note(`form worker: ${e.message}`); }
  const r = await get(`${config.FORM_ENDPOINT.replace(/\/$/, '')}/?version`);
  let liveVersion = '';
  try { liveVersion = JSON.parse(r.text).version; } catch { /* old worker without the endpoint */ }
  if (r.status !== 200) bad(`contact form worker answers ${r.status || r.error}: enquiries may be lost`);
  else if (expected && liveVersion !== expected) bad(`contact form worker runs ${liveVersion || 'an older version'}, the repo has ${expected}: the emails or form changed but were not deployed (node tools/form-worker.mjs deploy)`);
  else good('contact form worker is up and matches the repo');
}

// 6. Outbound links (from the pages as built from the repo)
if (!skip.has('external')) {
  const out = mkdtempSync(join(tmpdir(), 'monitor-'));
  try {
    buildSite({ config, out });
    const links = new Map();
    for (const p of walk(out).filter((f) => f.endsWith('.html'))) {
      for (const [, href] of read(p).replace(/<!--[\s\S]*?-->/g, '').matchAll(/<a\s[^>]*href="(https?:\/\/[^"#]+)/gi)) {
        if (href.startsWith(live)) continue;
        if (!links.has(href)) links.set(href, p.slice(out.length + 1));
      }
    }
    let dead = 0;
    for (const [href, page] of links) {
      let r = await get(href, { method: 'HEAD', timeout: 10000 });
      if (r.status >= 400 || r.status === 0) r = await get(href, { timeout: 10000 }); // some servers refuse HEAD
      // 401/403/429: the site blocks bots, which says nothing about whether the link works for people.
      if (r.status === 0 || r.status === 404 || r.status === 410 || r.status >= 500) { dead++; bad(`dead link on ${page}: ${href} (${r.status || r.error})`); }
    }
    good(`${links.size - dead}/${links.size} outbound links work`);
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
}

// 7. Lighthouse on the live pages, same budgets as the deploy checks
if (args.includes('--lighthouse')) {
  const rc = JSON.parse(read(join(ROOT, 'lighthouserc.json')));
  const urls = [base, ...pages.map(toBase).filter((u) => u !== base)].slice(0, 8);
  rc.ci.collect = { url: urls, numberOfRuns: 1 };
  rc.ci.upload = { target: 'filesystem', outputDir: '.lighthouseci-live' };
  const file = join(tmpdir(), `lighthouserc-live-${process.pid}.json`);
  writeFileSync(file, JSON.stringify(rc));
  const r = spawnSync('npx', ['--yes', LHCI, 'autorun', `--config=${file}`], { cwd: ROOT, encoding: 'utf8', shell: process.platform === 'win32' });
  rmSync(file, { force: true });
  if (r.status === 0) good(`Lighthouse budgets met on ${urls.length} live pages`);
  else bad(`Lighthouse budgets not met on the live site:\n${((r.stdout || '') + (r.stderr || '')).split('\n').filter((l) => /✘|failure|expected|found/i.test(l)).slice(0, 15).join('\n')}`);
}

// Report
console.log(problems.length ? `\n${problems.length} problem(s) on ${live}` : `\nAll good on ${live}`);
if (args.includes('--issue')) {
  const TITLE = 'Site monitor: something needs attention';
  const gh = (a, input) => spawnSync('gh', a, { cwd: ROOT, encoding: 'utf8', input });
  spawnSync('gh', ['label', 'create', 'monitor', '--color', 'd93f0b', '--description', 'Found by tools/monitor.mjs'], { cwd: ROOT });
  const open = JSON.parse(gh(['issue', 'list', '--label', 'monitor', '--state', 'open', '--json', 'number']).stdout || '[]')[0];
  const body = `The weekly check of ${live} found:\n\n${problems.map((p) => `- ${p.replace(/\n/g, '\n  ')}`).join('\n')}${notes.length ? `\n\nNotes:\n${notes.map((n) => `- ${n}`).join('\n')}` : ''}\n\nAsk Claude in this repo: "fix the problems from the site monitor issue". Details: ${process.env.GITHUB_SERVER_URL || 'https://github.com'}/${process.env.GITHUB_REPOSITORY || ''}/actions/runs/${process.env.GITHUB_RUN_ID || ''}`;
  if (problems.length && open) gh(['issue', 'comment', String(open.number), '--body-file', '-'], body);
  else if (problems.length) gh(['issue', 'create', '--title', TITLE, '--label', 'monitor', '--body-file', '-'], body);
  else if (open) gh(['issue', 'close', String(open.number), '--comment', `All checks pass again (${new Date().toISOString().slice(0, 10)}).`]);
}
process.exit(problems.length ? 1 : 0);
