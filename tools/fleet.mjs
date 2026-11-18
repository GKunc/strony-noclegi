#!/usr/bin/env node
// All client sites made from this template, from the agency's side. Run it in the template repo.
// Usage:
//   node tools/fleet.mjs status [--owner a,b]   every site repo: template version, last deploy, open monitor issue
//   node tools/fleet.mjs update <owner/repo> [--push]
//        clone to a temp folder, bring it up to date with the template (tools/template-update.mjs),
//        run the checks, commit; --push publishes it (CI then checks and deploys)
// A site repo is recognised by its .template-version file.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ROOT, read } from './lib.mjs';

const [cmd, target, ...rest] = process.argv.slice(2);
const args = [target, ...rest].filter(Boolean);
const opt = (n) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : undefined; };
const sh = (c, a, o = {}) => { const r = spawnSync(c, a, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, ...o }); return { ok: r.status === 0, out: (r.stdout || '').trim(), err: (r.stderr || '').trim(), status: r.status }; };
const gh = (...a) => sh('gh', a);
const manifest = JSON.parse(read(join(ROOT, 'template.json')));

function status() {
  const owners = (opt('owner') || gh('api', 'user', '--jq', '.login').out).split(',').filter(Boolean);
  const head = gh('api', `repos/${manifest.repo}/commits/${manifest.branch || 'main'}`, '--jq', '.sha').out;
  console.log(`Template ${manifest.repo} @ ${head.slice(0, 7)}\n`);
  const rows = [];
  for (const owner of owners) {
    const repos = JSON.parse(gh('repo', 'list', owner, '--limit', '300', '--no-archived', '--json', 'nameWithOwner').out || '[]');
    for (const { nameWithOwner: repo } of repos) {
      if (repo === manifest.repo) continue;
      const v = gh('api', `repos/${repo}/contents/.template-version`, '--jq', '.content');
      if (!v.ok) continue; // not made from the template
      const sha = Buffer.from(v.out, 'base64').toString().trim();
      const behind = sha === head ? 0 : Number(gh('api', `repos/${manifest.repo}/compare/${sha}...${head}`, '--jq', '.ahead_by').out || NaN);
      const run = JSON.parse(gh('run', 'list', '-R', repo, '--workflow', 'pages.yml', '--branch', 'main', '--limit', '1', '--json', 'conclusion,status').out || '[]')[0];
      const issue = JSON.parse(gh('issue', 'list', '-R', repo, '--label', 'monitor', '--state', 'open', '--json', 'number').out || '[]')[0];
      const monitor = JSON.parse(gh('api', `repos/${repo}/actions/workflows/monitor.yml`, '--jq', '{state}').out || '{}').state;
      rows.push({ repo, template: behind ? `${behind} behind` : 'current', deploy: run ? run.conclusion || run.status : '-', monitor: issue ? `issue #${issue.number}` : monitor === 'active' ? 'ok' : monitor || '-' });
    }
  }
  if (!rows.length) return console.log('No site repos found (they carry a .template-version file).');
  const w = (k) => Math.max(k.length, ...rows.map((r) => String(r[k]).length));
  const cols = ['repo', 'template', 'deploy', 'monitor'];
  console.log(cols.map((c) => c.padEnd(w(c))).join('  '));
  for (const r of rows) console.log(cols.map((c) => String(r[c]).padEnd(w(c))).join('  '));
}

function update() {
  if (!target || !target.includes('/')) { console.error('Usage: node tools/fleet.mjs update <owner/repo> [--push]'); process.exit(1); }
  const tmp = mkdtempSync(join(tmpdir(), 'fleet-'));
  const dir = join(tmp, 'site');
  try {
    const c = gh('repo', 'clone', target, dir, '--', '--quiet');
    if (!c.ok) throw new Error(c.err);
    // The template's own (newest) updater works on the clone, whatever tools the site still has.
    const u = spawnSync(process.execPath, [join(ROOT, 'tools/template-update.mjs'), '--dir', dir, '--commit'], { stdio: 'inherit' });
    if (u.status === 2 || u.status === 3) throw new Error(`${target} needs a hand: clone it and run node tools/template-update.mjs there (conflicts or failing checks above).`);
    if (u.status !== 0) throw new Error('update failed (see above)');
    const v = spawnSync(process.execPath, ['tools/verify.mjs', '--if-configured'], { cwd: dir, stdio: 'inherit' });
    if (v.status !== 0) throw new Error('the updated site fails verify.mjs; not pushing');
    const ahead = sh('git', ['rev-list', '--count', '@{u}..HEAD'], { cwd: dir }).out;
    if (ahead === '0') return console.log(`${target} is already up to date.`);
    if (!args.includes('--push')) return console.log(`\n${target} updated and checked in ${dir}, not pushed (add --push).`);
    const p = sh('git', ['push', '--quiet'], { cwd: dir });
    if (!p.ok) throw new Error(p.err);
    console.log(`\nPushed ${target}; CI checks and deploys it (gh run watch -R ${target}).`);
  } catch (e) {
    console.error(`\n${e.message}`);
    process.exitCode = 1;
  } finally {
    if (args.includes('--push') || process.exitCode) rmSync(tmp, { recursive: true, force: true });
  }
}

({ status, update }[cmd] || (() => { console.error('Usage: node tools/fleet.mjs status [--owner a,b] | update <owner/repo> [--push]'); process.exit(1); }))();
