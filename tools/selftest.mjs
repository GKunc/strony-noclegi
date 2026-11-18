#!/usr/bin/env node
// Tests the template itself: copies the repo to a temp folder (with a space in its name, on purpose),
// fills it with tools/fixture/site.config.json plus one blog post made from blog/_template.html,
// and runs the real tools on it. Run after any change to tools/, src/ structure or the workflow.
// Usage: node tools/selftest.mjs [--lighthouse]
import { spawn, spawnSync } from 'node:child_process';
import { cpSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ROOT, rel, walk } from './lib.mjs';

const lighthouse = process.argv.includes('--lighthouse');
const tmp = join(tmpdir(), 'landing template selftest');
const SKIP = new Set(['.git', 'node_modules', '_site', '.preview', '.lighthouseci']);
rmSync(tmp, { recursive: true, force: true });
cpSync(ROOT, tmp, { recursive: true, filter: (p) => !SKIP.has(p.slice(ROOT.length + 1).split(/[\\/]/)[0]) });

const fixture = readFileSync(join(ROOT, 'tools/fixture/site.config.json'), 'utf8');
writeFileSync(join(tmp, 'site.config.json'), fixture);
const post = readFileSync(join(tmp, 'src/blog/_template.html'), 'utf8')
  .replace(/<!-- @vars[\s\S]*?-->/, `<!-- @vars\n${JSON.stringify({
    POST_TITLE: 'How often to water office plants & why',
    POST_DESCRIPTION: 'Fixture post for the template self-test: most office plants need water once a week, less in winter. Here is how to tell.',
    DATE: '2026-01-02',
    CTA_HEADING: 'Rather not think about it?',
    CTA_TEXT: 'We do the watering for you.',
  }, null, 2)}\n-->`)
  .replace('{{POST_BODY}}', '<p>Most office plants need water once a week.</p>\n      <h2>How to tell</h2>\n      <p>Push a finger two centimetres into the soil; water when it is dry.</p>');
writeFileSync(join(tmp, 'src/blog/how-often-to-water.html'), post);

let failed = false;
async function runAsync(name, script, args = [], opts = {}) {
  // Like run(), but does not block the event loop (a local server may be answering the tool).
  const { expectFail = false, env = {} } = opts;
  console.log(`\n━━ ${name}`);
  const status = await new Promise((done) => spawn(process.execPath, [join(tmp, script), ...args], { cwd: tmp, stdio: 'inherit', env: { ...process.env, ...env } }).on('exit', done));
  const ok = expectFail ? status !== 0 : status === 0;
  console.log(ok ? `✔ ${name}` : `✘ ${name}${expectFail ? ' (expected a failure, but it passed)' : ''}`);
  if (!ok) failed = true;
}

function run(name, script, args = [], { expectFail = false, env = {} } = {}) {
  console.log(`\n━━ ${name}`);
  const r = spawnSync(process.execPath, [join(tmp, script), ...args], { cwd: tmp, stdio: 'inherit', env: { ...process.env, ...env } });
  const ok = expectFail ? r.status !== 0 : r.status === 0;
  console.log(ok ? `✔ ${name}` : `✘ ${name}${expectFail ? ' (expected a failure, but it passed)' : ''}`);
  if (!ok) failed = true;
}

run('Generate og.png and icons', 'tools/make-assets.mjs');
run('Guard: template filler copy must be rejected', 'tools/check.mjs', [], { expectFail: true });
run('Full verification of the filled template', 'tools/verify.mjs', lighthouse ? ['--lighthouse', '--all'] : [], { env: { ALLOW_FILLER: '1' } });

const withConfig = (changes) => writeFileSync(join(tmp, 'site.config.json'), JSON.stringify({ ...JSON.parse(fixture), ...changes }, null, 2));
const OK = { env: { ALLOW_FILLER: '1' } };
const FAILS = { expectFail: true, env: { ALLOW_FILLER: '1' } };

withConfig({ META_DESCRIPTION: '' });
run('Guard: a missing config value must be rejected', 'tools/check.mjs', [], FAILS);
withConfig({ ANALYTICS_ID: 'UA-12345-1' });
run('Guard: an old/invalid analytics id must be rejected', 'tools/check.mjs', [], FAILS);
withConfig({ ANALYTICS: 'matomo' });
run('Guard: an unknown analytics tool must be rejected', 'tools/check.mjs', [], FAILS);
withConfig({ FORM_ENDPOINT: 'http://example.com/form' });
run('Guard: a non-https form endpoint must be rejected', 'tools/check.mjs', [], FAILS);
withConfig({ ANALYTICS_ID: '-----BEGIN ' + 'PRIVATE KEY-----' }); // split so the secret guard does not flag this file
run('Guard: a secret in the config must be rejected', 'tools/check.mjs', [], FAILS);
withConfig({});
run('Secret guard: a clean repo passes', 'tools/secrets.mjs');
writeFileSync(join(tmp, 'notes.md'), `token: ${'ghp_' + 'a'.repeat(36)}\n`); // built here so this file holds no token
run('Secret guard: a token in any file must be rejected', 'tools/secrets.mjs', [], { expectFail: true });
rmSync(join(tmp, 'notes.md'));
writeFileSync(join(tmp, '.env'), 'X=1\n');
run('Secret guard: a .env file must be rejected', 'tools/secrets.mjs', [], { expectFail: true });
rmSync(join(tmp, '.env'));
for (const [tool, id] of [['plausible', ''], ['goatcounter', 'fixture'], ['cloudflare', '0123456789abcdef0123456789abcdef'], ['none', '']]) {
  withConfig({ ANALYTICS: tool, ANALYTICS_ID: id, FORM_ACCESS_KEY: 'fixture-access-key' });
  run(`Variant: ANALYTICS=${tool} builds and validates`, 'tools/verify.mjs', [], OK);
}
withConfig({});
run('Contact form worker (fake Resend and Turnstile)', 'tools/test-worker.mjs');
writeFileSync(join(tmp, 'emails/autoreply.txt'), readFileSync(join(tmp, 'emails/autoreply.txt'), 'utf8') + '\nYou wrote: {{message}}\n');
run('Guard: an autoreply that echoes the message must be rejected', 'tools/check.mjs', [], FAILS);
writeFileSync(join(tmp, 'emails/autoreply.txt'), readFileSync(join(ROOT, 'emails/autoreply.txt'), 'utf8'));
writeFileSync(join(tmp, 'emails/autoreply.html'), readFileSync(join(ROOT, 'emails/autoreply.html'), 'utf8').replace('<p>', '<p style="color:#ff0000">'));
run('Guard: a colour typed into an email must be rejected', 'tools/check.mjs', [], FAILS);
writeFileSync(join(tmp, 'emails/autoreply.html'), readFileSync(join(ROOT, 'emails/autoreply.html'), 'utf8'));
withConfig({ EMAIL_FROM: '' });
run('Guard: the form worker without a sender address must be rejected', 'tools/check.mjs', [], FAILS);
withConfig({});
// Live-site monitor against a local copy of the built site.
{
  spawnSync(process.execPath, [join(tmp, 'tools/build.mjs')], { cwd: tmp });
  const server = spawn(process.execPath, ['-e', `
    const http=require('http'),fs=require('fs'),path=require('path');const root=${JSON.stringify(join(tmp, '_site'))};
    http.createServer((q,r)=>{let p=path.join(root,decodeURIComponent(q.url.split('?')[0]));if(p.endsWith('/'))p+='index.html';
      fs.readFile(p,(e,b)=>{r.writeHead(e?404:200);r.end(e?'':b)})}).listen(4398,()=>console.log('up'))`]);
  await new Promise((done) => server.stdout.once('data', done));
  const local = ['--url', 'http://127.0.0.1:4398/', '--skip', 'external,worker,tls,github'];
  await runAsync('Monitor: healthy site passes', 'tools/monitor.mjs', local);
  rmSync(join(tmp, '_site/llms.txt'));
  await runAsync('Monitor: a missing file on the live site is reported', 'tools/monitor.mjs', local, { expectFail: true });
  server.kill();
}

// Template update: a site made from template v1 receives v2.
{
  const tpl = join(tmp, '.tpl-repo');
  const site = join(tmp, '.site-repo');
  const g = (cwd, ...a) => spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t.t', ...a], { cwd, encoding: 'utf8' });
  for (const d of [tpl, site]) { rmSync(d, { recursive: true, force: true }); cpSync(ROOT, d, { recursive: true, filter: (p) => !SKIP.has(p.slice(ROOT.length + 1).split(/[\\/]/)[0]) && !p.includes('.tpl-repo') }); g(d, 'init', '-q', '-b', 'main'); }
  g(tpl, 'add', '-A'); g(tpl, 'commit', '-qm', 'v1');
  const v1 = g(tpl, 'rev-parse', 'HEAD').stdout.trim();
  // The site: filled config and its own headline; template v2: tool change, CSS change, new config key.
  writeFileSync(join(site, 'site.config.json'), fixture);
  writeFileSync(join(site, 'src/index.html'), readFileSync(join(site, 'src/index.html'), 'utf8').replace('<p class="lead">', '<p class="lead" data-site="own">'));
  writeFileSync(join(site, '.template-version'), v1 + '\n');
  for (const f of ['og.png', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png', 'blog/how-often-to-water.html']) cpSync(join(tmp, 'src', f), join(site, 'src', f));
  g(site, 'add', '-A'); g(site, 'commit', '-qm', 'site');
  writeFileSync(join(tpl, 'tools/lib.mjs'), readFileSync(join(tpl, 'tools/lib.mjs'), 'utf8') + '\n// template v2\n');
  writeFileSync(join(tpl, 'src/css/styles.css'), readFileSync(join(tpl, 'src/css/styles.css'), 'utf8') + '\n/* template v2 */\n');
  writeFileSync(join(tpl, 'site.config.json'), readFileSync(join(tpl, 'site.config.json'), 'utf8').replace(/\n}\s*$/, ',\n  "NEW_SETTING": ""\n}\n'));
  g(tpl, 'add', '-A'); g(tpl, 'commit', '-qm', 'v2');
  const v2 = g(tpl, 'rev-parse', 'HEAD').stdout.trim();
  await runAsync('Template update applies v2 to a site made from v1', 'tools/template-update.mjs', ['--dir', site, '--commit'], { env: { TEMPLATE_URL: tpl, ALLOW_FILLER: '1', GIT_AUTHOR_NAME: 'selftest', GIT_AUTHOR_EMAIL: 'selftest@example.com', GIT_COMMITTER_NAME: 'selftest', GIT_COMMITTER_EMAIL: 'selftest@example.com' } });
  const ok = readFileSync(join(site, 'tools/lib.mjs'), 'utf8').includes('template v2')
    && readFileSync(join(site, 'src/css/styles.css'), 'utf8').includes('template v2')
    && readFileSync(join(site, 'src/index.html'), 'utf8').includes('data-site="own"')
    && JSON.parse(readFileSync(join(site, 'site.config.json'), 'utf8')).NEW_SETTING === ''
    && JSON.parse(readFileSync(join(site, 'site.config.json'), 'utf8')).BRAND === JSON.parse(fixture).BRAND
    && readFileSync(join(site, '.template-version'), 'utf8').trim() === v2;
  console.log(ok ? '✔ Template update: tool replaced, CSS merged, site edits and settings kept, new key added' : '✘ Template update result is wrong');
  if (!ok) failed = true;
  rmSync(tpl, { recursive: true, force: true }); rmSync(site, { recursive: true, force: true });
}

// Lighthouse picks only the pages a change touches (verify.mjs --lighthouse --dry-run prints them).
{
  const repo = join(tmpdir(), 'landing template selftest lighthouse');
  const g = (...a) => spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t.t', ...a], { cwd: repo, encoding: 'utf8' });
  rmSync(repo, { recursive: true, force: true });
  cpSync(tmp, repo, { recursive: true, filter: (p) => !/^(_site|\.tpl-repo|\.site-repo|\.lighthouseci)$/.test(p.slice(tmp.length + 1).split(/[\\/]/)[0]) });
  writeFileSync(join(repo, 'site.config.json'), fixture);
  g('init', '-q', '-b', 'main'); g('add', '-A'); g('commit', '-qm', 'base');
  const pick = (name, edit, expected) => {
    edit(); g('add', '-A'); g('commit', '-qm', name);
    const r = spawnSync(process.execPath, ['tools/verify.mjs', '--quick', '--lighthouse', '--dry-run', '--base=HEAD~1'], { cwd: repo, encoding: 'utf8', env: { ...process.env, ALLOW_FILLER: '1' } });
    const out = r.stdout + r.stderr;
    const got = out.includes('Lighthouse not needed') ? [] : out.includes('Auditing every page') ? 'all'
      : [...out.matchAll(/^ {2}(\S+\.html)$/gm)].map((m) => m[1]).sort();
    const ok = r.status === 0 && (typeof expected === 'function' ? expected(got) : JSON.stringify(got) === JSON.stringify(expected));
    console.log(ok ? `✔ Lighthouse pages: ${name}` : `✘ Lighthouse pages: ${name}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(got)}\n${out}`);
    if (!ok) failed = true;
  };
  const append = (f, text) => writeFileSync(join(repo, f), readFileSync(join(repo, f), 'utf8') + text);
  const post = 'src/blog/how-often-to-water.html';
  const editPost = (a, b) => () => writeFileSync(join(repo, post), readFileSync(join(repo, post), 'utf8').replace(a, b));
  pick('a blog post text changed -> only that post', editPost('once a week.</p>', 'once a week, less in winter.</p>'), ['blog/how-often-to-water.html']);
  pick('a blog post description changed -> that post and the blog index', editPost('Here is how to tell.', 'Here is how to check.'), ['blog/how-often-to-water.html', 'blog/index.html']);
  pick('only emails changed -> no Lighthouse', () => append('emails/autoreply.txt', '\n'), []);
  const usesCss = (() => { spawnSync(process.execPath, ['tools/build.mjs'], { cwd: repo }); return walk(join(repo, '_site')).filter((p) => p.endsWith('.html') && readFileSync(p, 'utf8').includes('styles.css')).map((p) => rel(p, join(repo, '_site'))).sort(); })();
  pick('the stylesheet changed -> 5 random pages that load it (all of them if 5 or fewer)', () => append('src/css/styles.css', '\n/* selftest */\n'),
    (got) => Array.isArray(got) && got.length === Math.min(5, usesCss.length) && got.every((p) => usesCss.includes(p)));
  pick('Lighthouse budgets changed -> every page', () => append('lighthouserc.json', '\n'), 'all');
  rmSync(repo, { recursive: true, force: true });
}

run('Google tool (dry run)', 'tools/google.mjs', ['search-console', '--owners', 'owner@example.com', '--dry-run']);
run('Form test (shows what it would send, sends nothing)', 'tools/form-test.mjs');

console.log(failed ? '\nSELFTEST FAILED' : `\nSelftest passed (${tmp})`);
process.exit(failed ? 1 : 0);
