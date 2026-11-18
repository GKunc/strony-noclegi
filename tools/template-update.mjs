#!/usr/bin/env node
// Brings a site repo up to date with the template it was made from (template.json -> repo).
//   - files the template owns (template.json "owned") are replaced with the template's version
//   - template changes to the site's own files (pages, partials, emails, css) are merged in 3-way;
//     where the site changed the same lines, git conflict markers are left for Claude to resolve
//   - keys new in the template's site.config.json are added (empty), existing values are kept
//   - .template-version records the template commit the site is now on
// Usage: node tools/template-update.mjs [--check] [--commit] [--dir <site repo>] [--to <commit>]
//   --check   only list what changed in the template since this site's version
//   --commit  commit the update when it applied cleanly
// TEMPLATE_URL overrides the template's git URL (tests).
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { ROOT } from './lib.mjs';

const args = process.argv.slice(2);
const opt = (n) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : undefined; };
const dir = resolve(opt('dir') || ROOT);
const die = (m) => { console.error(m); process.exit(1); };
const git = (a, input) => {
  const r = spawnSync('git', a, { cwd: dir, encoding: 'utf8', input, maxBuffer: 64 * 1024 * 1024 });
  return { ok: r.status === 0, out: (r.stdout || '').trim(), err: (r.stderr || '').trim(), raw: r.stdout || '' };
};

const manifest = JSON.parse(readFileSync(join(dir, 'template.json'), 'utf8'));
const versionFile = join(dir, '.template-version');
if (!existsSync(versionFile)) die('No .template-version: this repo does not say which template commit it was made from.\nIf you know it, write the commit id into .template-version and run again.');
const from = readFileSync(versionFile, 'utf8').trim();

const url = process.env.TEMPLATE_URL || `https://github.com/${manifest.repo}.git`;
const fetched = git(['fetch', '--quiet', '--no-tags', url, opt('to') || manifest.branch || 'main']);
if (!fetched.ok) die(`Could not fetch the template from ${url}:\n${fetched.err}\n(Private template: the person running this needs access; gh auth setup-git.)`);
const to = opt('to') ? git(['rev-parse', opt('to')]).out : git(['rev-parse', 'FETCH_HEAD']).out;
if (!git(['cat-file', '-e', `${from}^{commit}`]).ok) die(`The template history does not contain ${from} (.template-version).`);

if (from === to) { console.log(`Up to date with the template (${to.slice(0, 7)}).`); process.exit(0); }
const log = git(['log', '--no-merges', '--format=  %h %as %s', `${from}..${to}`]).out;
console.log(`Template changes since ${from.slice(0, 7)}:\n${log || '  (none listed)'}`);
if (args.includes('--check')) process.exit(0);

if (git(['status', '--porcelain']).out) die('\nThe repo has uncommitted changes; commit or discard them first.');

const newManifest = JSON.parse(git(['show', `${to}:template.json`]).raw);
const owned = newManifest.owned;
const isOwned = (f) => owned.some((o) => (o.endsWith('/') ? f.startsWith(o) : f === o));
const files = (sha) => git(['ls-tree', '-r', '--name-only', sha]).out.split('\n').filter(Boolean);

// 1. Owned files: take the template's version; drop the ones the template deleted.
const toFiles = files(to);
let replaced = 0;
for (const f of toFiles.filter(isOwned)) {
  const content = spawnSync('git', ['show', `${to}:${f}`], { cwd: dir, maxBuffer: 64 * 1024 * 1024 }).stdout;
  const target = join(dir, f);
  if (existsSync(target) && readFileSync(target).equals(content)) continue;
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
  replaced++;
}
for (const f of files(from).filter(isOwned)) if (!toFiles.includes(f) && existsSync(join(dir, f))) { rmSync(join(dir, f)); replaced++; }
// Keep executables executable (git hooks).
for (const f of toFiles.filter((f) => f.startsWith('.githooks/'))) spawnSync('chmod', ['+x', join(dir, f)]);

// 2. The site's own files: merge the template's changes in.
const exclude = [...owned.map((o) => `:(exclude)${o}`), ':(exclude)site.config.json', ':(exclude)brief/', ':(exclude).template-version'];
const patch = git(['diff', '--binary', from, to, '--', '.', ...exclude]).raw;
let conflicts = [];
if (patch.trim()) {
  const applied = git(['apply', '--3way', '--whitespace=nowarn'], patch);
  conflicts = [...(applied.err.matchAll(/^U (.+)$/gm))].map((m) => m[1]);
  if (!applied.ok && !conflicts.length) die(`Merging the template changes failed:\n${applied.err}`);
  git(['reset', '--quiet']); // --3way stages; leave everything unstaged for review
}

// 3. New config keys.
const cfgPath = join(dir, 'site.config.json');
let cfgText = readFileSync(cfgPath, 'utf8');
const mine = JSON.parse(cfgText);
const theirs = JSON.parse(git(['show', `${to}:site.config.json`]).raw);
const added = Object.keys(theirs).filter((k) => !(k in mine));
for (const k of added) cfgText = cfgText.replace(/(\S)\s*\n\}\s*$/, `$1,\n  ${JSON.stringify(k)}: ${JSON.stringify(theirs[k])}\n}\n`);
if (added.length) { JSON.parse(cfgText); writeFileSync(cfgPath, cfgText); }

writeFileSync(versionFile, to + '\n');
console.log(`\nUpdated to template ${to.slice(0, 7)}: ${replaced} template file(s) replaced${patch.trim() ? ', template changes merged into site files' : ''}${added.length ? `, new settings in site.config.json: ${added.join(', ')}` : ''}.`);
if (conflicts.length) {
  console.log(`\nConflicts (the site and the template changed the same lines), resolve the <<<<<<< markers in:\n${conflicts.map((c) => `  ${c}`).join('\n')}`);
  process.exit(2);
}
const verify = spawnSync(process.execPath, ['tools/verify.mjs', '--quick', '--if-configured'], { cwd: dir, encoding: 'utf8' });
if (verify.status !== 0) {
  console.log(`\nThe updated site fails the checks:\n${(verify.stdout + verify.stderr).trim().split('\n').slice(-20).join('\n')}`);
  process.exit(3);
}
console.log('Checks pass.');
if (args.includes('--commit')) {
  git(['add', '-A']);
  const c = git(['commit', '--quiet', '-m', `Update tooling from the template (${from.slice(0, 7)} -> ${to.slice(0, 7)})`]);
  if (!c.ok) die(c.err);
  console.log('Committed.');
}
