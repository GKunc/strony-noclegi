#!/usr/bin/env node
// The site's change history in plain words, and undoing a change.
// Usage:
//   node tools/history.mjs [n=15]        last n changes to the site: number, date, description, what it touched
//   node tools/history.mjs undo <number|commit>
//        adds a new change that reverses that one (nothing is deleted from history, so an undo can be undone too)
import { spawnSync } from 'node:child_process';
import { ROOT } from './lib.mjs';

const git = (a) => { const r = spawnSync('git', a, { cwd: ROOT, encoding: 'utf8' }); return { ok: r.status === 0, out: (r.stdout || '').trim(), err: (r.stderr || '').trim() }; };
const SITE = ['src', 'emails', 'site.config.json', 'worker'];

function changes(n) {
  const out = git(['log', `-${n}`, '--no-merges', '--format=%H%x09%as%x09%an%x09%s', '--', ...SITE]).out;
  return out ? out.split('\n').map((l, i) => { const [sha, date, author, subject] = l.split('\t'); return { n: i + 1, sha, date, author, subject }; }) : [];
}
function touched(sha) {
  const files = git(['show', '--name-only', '--format=', sha, '--', ...SITE]).out.split('\n').filter(Boolean);
  const label = (f) => f === 'site.config.json' ? 'settings' : f.startsWith('emails/') ? 'emails' : f.startsWith('worker/') ? 'form backend'
    : f.startsWith('src/blog/') ? `blog: ${f.slice(9).replace(/\.html$/, '')}` : f.startsWith('src/_partials/') ? 'header/footer'
    : f.startsWith('src/css/') ? 'look (CSS)' : f.startsWith('src/js/') ? 'scripts' : f.replace(/^src\//, '').replace(/\.html$/, '').replace(/^index$/, 'home page');
  return [...new Set(files.map(label))].join(', ');
}

const [cmd, arg] = process.argv.slice(2);
if (cmd === 'undo') {
  if (!arg) { console.error('Usage: node tools/history.mjs undo <number|commit>'); process.exit(1); }
  if (git(['status', '--porcelain']).out) { console.error('There are unsaved (uncommitted) changes; commit or discard them first.'); process.exit(1); }
  const sha = /^\d{1,3}$/.test(arg) ? changes(Number(arg))[Number(arg) - 1]?.sha : git(['rev-parse', '--verify', `${arg}^{commit}`]).out;
  if (!sha) { console.error(`No change ${arg}.`); process.exit(1); }
  const subject = git(['log', '-1', '--format=%s', sha]).out;
  const r = git(['revert', '--no-edit', sha]);
  if (!r.ok) {
    git(['revert', '--abort']);
    console.error(`Could not undo "${subject}" automatically: later changes edited the same lines. Undo those first, or edit by hand.\n${r.err}`);
    process.exit(1);
  }
  console.log(`Undone: "${subject}" (as a new change, ${git(['rev-parse', '--short', 'HEAD']).out}).`);
  if (/emails|form backend/.test(touched(sha))) console.log('It touched the emails or the form backend: also run node tools/form-worker.mjs deploy (unless CI deploys the worker).');
  console.log('Push to publish it: git push');
} else {
  const list = changes(Number(cmd) || 15);
  if (!list.length) { console.log('No site changes yet.'); process.exit(0); }
  for (const c of list) console.log(`${String(c.n).padStart(2)}. ${c.date}  ${c.subject}\n      ${touched(c.sha)}  (${c.sha.slice(0, 7)}, ${c.author})`);
  console.log('\nUndo one: node tools/history.mjs undo <number>');
}
