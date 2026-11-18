#!/usr/bin/env node
// Checks that this machine is ready to develop the site, and fixes what it safely can.
// Usage: node tools/doctor.mjs [--fix] [--quiet]
//   --fix    set up git hooks, repair .claude/launch.json for this machine, pre-download CI tools
//   --quiet  print only problems, skip network checks (used by the SessionStart hook)
// Exit code 1 when something required is missing.
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { delimiter, isAbsolute, join } from 'node:path';
import { createConnection } from 'node:net';
import { homedir } from 'node:os';
import { ROOT, CONFIG, HTML_VALIDATE, loadConfig, isConfigured } from './lib.mjs';

const args = new Set(process.argv.slice(2));
const FIX = args.has('--fix');
const QUIET = args.has('--quiet');
const PORT = 4321;

const rows = [];
const ok = (name, detail = '') => rows.push({ level: 'ok', name, detail });
const warn = (name, detail, fix) => rows.push({ level: 'warn', name, detail, fix });
const fail = (name, detail, fix) => rows.push({ level: 'fail', name, detail, fix });
const fixed = (name, detail) => rows.push({ level: 'fixed', name, detail });

function sh(cmd, cmdArgs, opts = {}) {
  const r = spawnSync(cmd, cmdArgs, { cwd: ROOT, encoding: 'utf8', timeout: 20000, ...opts });
  return { ok: r.status === 0, out: (r.stdout || '').trim(), err: (r.stderr || '').trim() };
}
function which(cmd) {
  if (isAbsolute(cmd)) return existsSync(cmd) ? cmd : null;
  for (const dir of (process.env.PATH || '').split(delimiter)) {
    const p = join(dir, cmd);
    if (dir && existsSync(p)) return p;
  }
  return null;
}
const brew = which('brew');
const install = (formula, cask = false) => (brew ? `brew install ${cask ? '--cask ' : ''}${formula}` : `install ${formula} (Homebrew: https://brew.sh)`);

// ── Tools ────────────────────────────────────────────────────────────────
const major = Number(process.versions.node.split('.')[0]);
if (major >= 22) ok('Node.js', process.version);
else fail('Node.js', `${process.version} is too old (need 22+)`, install('node@22'));

if (which('npx')) ok('npx'); else fail('npx', 'not found (comes with Node.js)', install('node@22'));

const git = which('git');
if (!git) fail('git', 'not found', 'xcode-select --install');
else {
  ok('git', sh('git', ['--version']).out.replace('git version ', ''));
  const name = sh('git', ['config', 'user.name']).out;
  const email = sh('git', ['config', 'user.email']).out;
  if (name && email) ok('git identity', name);
  else fail('git identity', 'name/email not set (commits need it)', 'git config --global user.name "Your Name" && git config --global user.email "you@example.com"');
}

const gh = which('gh');
if (!gh) fail('GitHub CLI (gh)', 'not found (needed to publish and watch deploys)', install('gh'));
else if (QUIET) {
  const user = sh('gh', ['config', 'get', 'user', '-h', 'github.com']).out;
  if (user) ok('GitHub CLI (gh)', `signed in as ${user}`);
  else fail('GitHub CLI (gh)', 'not signed in', 'the user runs: gh auth login');
} else {
  const s = sh('gh', ['auth', 'status', '-h', 'github.com']);
  const user = (s.out + s.err).match(/account (\S+)/)?.[1];
  if (s.ok) ok('GitHub CLI (gh)', `signed in as ${user || '?'}`);
  else fail('GitHub CLI (gh)', 'not signed in', 'the user runs: gh auth login');
}

const CHROME = [
  process.env.CHROME,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
].filter(Boolean).find((c) => existsSync(c));
if (CHROME) ok('Chrome', 'found (page checks, Lighthouse, social image)');
else fail('Chrome', 'not found (needed for page checks, Lighthouse and og.png)', install('google-chrome', true));

// ── Repo ─────────────────────────────────────────────────────────────────
if (git) {
  if (!sh('git', ['rev-parse', '--is-inside-work-tree']).ok) fail('git repo', 'this folder is not a git repo', 'clone the page repo: gh repo clone OWNER/NAME');
  else {
    const remote = sh('git', ['remote', 'get-url', 'origin']).out;
    if (remote) ok('git remote', remote.replace(/^https:\/\/github.com\/|\.git$/g, ''));
    else warn('git remote', 'no GitHub repo linked yet', 'run the publish skill');

    const hooks = sh('git', ['config', '--local', 'core.hooksPath']).out;
    if (hooks === '.githooks') ok('git hooks', 'checks run before each commit and push');
    else if (FIX && existsSync(join(ROOT, '.githooks'))) {
      sh('git', ['config', '--local', 'core.hooksPath', '.githooks']);
      for (const f of readdirSync(join(ROOT, '.githooks'))) chmodSync(join(ROOT, '.githooks', f), 0o755);
      fixed('git hooks', 'enabled .githooks (pre-commit, pre-push)');
    } else warn('git hooks', 'not enabled', 'node tools/doctor.mjs --fix');
  }
}

try {
  const config = loadConfig();
  if (isConfigured(config)) ok('site config', `site.config.json (${config.BRAND})`);
  else if (!QUIET) warn('site config', 'site.config.json is still empty (this is the untouched template)', 'run the new-landing skill');
} catch (e) {
  fail('site config', e.message, `fix ${CONFIG}`);
}

const googleKey = process.env.GOOGLE_SERVICE_ACCOUNT || join(homedir(), '.config/landing-tools/google-service-account.json');
if (existsSync(googleKey)) ok('Google automation', 'service account key found (Search Console / GA4 set-up)');
else if (!QUIET) ok('Google automation', 'not set up (optional; publish skill, "Google, one-time set-up")');

const formSecrets = process.env.FORM_SECRETS || join(homedir(), '.config/landing-tools/form-secrets.json');
if (existsSync(formSecrets)) ok('Form emails', 'Resend and Turnstile keys found (form worker)');
else if (!QUIET) ok('Form emails', 'not set up (optional; publish skill, "Contact form emails, one-time set-up")');

if (existsSync(join(ROOT, 'brief/landing.md'))) ok('brief', 'brief/landing.md');
else fail('brief', 'brief/landing.md is missing', 'restore it from git or the template');

// ── Claude Code config ───────────────────────────────────────────────────
const launchPath = join(ROOT, '.claude/launch.json');
const wantSite = (exe) => ({ name: 'site', runtimeExecutable: exe, runtimeArgs: ['tools/serve.mjs', String(PORT)], cwd: ROOT.replace(/\/$/, ''), port: PORT });
let launch;
try { launch = JSON.parse(readFileSync(launchPath, 'utf8')); } catch { launch = null; }
const site = launch?.configurations?.find((c) => c.name === 'site');
const siteProblem = !site ? 'no "site" preview configured'
  : !which(site.runtimeExecutable || '') ? `${site.runtimeExecutable} not found on this machine`
  : site.cwd && !existsSync(site.cwd) ? `folder ${site.cwd} does not exist here`
  : site.cwd && site.cwd !== ROOT.replace(/\/$/, '') ? `points at another folder (${site.cwd})`
  : !(site.runtimeArgs || []).includes('tools/serve.mjs') ? 'uses the old server without live reload'
  : '';
if (!siteProblem) ok('preview config', `.claude/launch.json → http://localhost:${PORT}/`);
else if (FIX) {
  const cfg = launch && Array.isArray(launch.configurations) ? launch : { version: '0.0.1', configurations: [] };
  cfg.configurations = cfg.configurations.filter((c) => c.name !== 'site');
  cfg.configurations.unshift(wantSite(process.execPath));
  writeFileSync(launchPath, JSON.stringify(cfg, null, 2) + '\n');
  fixed('preview config', `.claude/launch.json now runs ${process.execPath} tools/serve.mjs`);
} else warn('preview config', siteProblem, 'node tools/doctor.mjs --fix');

if (existsSync(join(ROOT, '.mcp.json'))) ok('Chrome DevTools MCP', '.mcp.json');
else warn('Chrome DevTools MCP', '.mcp.json missing', 'restore .mcp.json from git');

if (existsSync(join(ROOT, '.claude/settings.json'))) ok('Claude settings', '.claude/settings.json');
else warn('Claude settings', '.claude/settings.json missing (permissions, session hook)', 'restore it from git or the template');

// ── Pre-download CI tools so the first local run is fast ─────────────────
if (FIX && which('npx')) {
  const v = sh('npx', ['--yes', HTML_VALIDATE, '--version'], { timeout: 180000 });
  if (v.ok) fixed('HTML validator', `cached (${v.out})`);
  else warn('HTML validator', 'could not download (offline?)', 'node tools/doctor.mjs --fix');
}

// ── Port ─────────────────────────────────────────────────────────────────
const portBusy = await new Promise((done) => {
  const s = createConnection({ port: PORT, host: '127.0.0.1' });
  s.once('connect', () => { s.destroy(); done(true); });
  s.once('error', () => done(false));
  setTimeout(() => { s.destroy(); done(false); }, 500);
});
if (!QUIET) {
  if (portBusy) warn('port ' + PORT, 'already in use (preview running, or another app)', `lsof -i :${PORT}`);
  else ok('port ' + PORT, 'free for the preview');
}

// ── Report ───────────────────────────────────────────────────────────────
const ICON = { ok: '✔', fixed: '✔', warn: '!', fail: '✘' };
const shown = QUIET ? rows.filter((r) => r.level === 'warn' || r.level === 'fail') : rows;
if (QUIET && shown.length) console.log('Dev environment check (node tools/doctor.mjs) found problems; the dev-setup skill fixes them:');
for (const r of shown) {
  console.log(`${ICON[r.level]} ${r.name}${r.detail ? ': ' + r.detail : ''}${r.level === 'fixed' ? ' (fixed)' : ''}`);
  if (r.fix) console.log(`    → ${r.fix}`);
}
const failures = rows.filter((r) => r.level === 'fail').length;
const warnings = rows.filter((r) => r.level === 'warn').length;
if (!QUIET) console.log(failures ? `\n${failures} required item(s) missing.` : warnings ? `\nReady, with ${warnings} suggestion(s).` : '\nAll set. Start the preview: "site" in .claude/launch.json.');
process.exit(failures ? 1 : 0);
