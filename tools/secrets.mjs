#!/usr/bin/env node
// Secret guard: keys, tokens and key files must never reach git (the repo is public, and git
// history keeps everything, even a file deleted in a later commit).
// Usage: node tools/secrets.mjs [--staged | --pending | --push | --outgoing]
//   (no flag)   every tracked file as it is on disk (CI, verify.mjs)
//   --staged    what is about to be committed (git pre-commit hook)
//   --pending   staged + changed + new (not ignored) files: what a commit could pick up (Claude Code hook)
//   --push      every commit about to be pushed; reads the pre-push hook's stdin
//   --outgoing  every commit on HEAD not yet on a remote (Claude Code hook before git push)
// Exits 1 and names the file (never the secret itself) when something is found.
// Checks file names (.env, *.pem, service account JSON, wrangler's .dev.vars, …) and contents
// (private keys, GitHub/Stripe/AWS/Slack/OpenAI/Anthropic/npm/Resend tokens, values given to
// RESEND_API_KEY, TURNSTILE_SECRET_KEY, CLOUDFLARE_API_TOKEN, FORM_TEST_TOKEN).
import { execFileSync } from 'node:child_process';
import { readFileSync, realpathSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT, walk, rel } from './lib.mjs';

/** [regex, what it is]. Shared with tools/check.mjs. Keep each regex unable to match its own source text. */
export const SECRET_PATTERNS = [
  [/-----BEGIN [A-Z ]*PRIVATE KEY( BLOCK)?-----/, 'a private key'],
  [/"type"\s*:\s*"service_account"/, 'a Google service account key'],
  [/\bgh[pousr]_[A-Za-z0-9]{36,}\b/, 'a GitHub token'],
  [/\bgithub_pat_[A-Za-z0-9_]{60,}\b/, 'a GitHub token'],
  [/\b[sr]k_live_[A-Za-z0-9]{16,}\b/, 'a Stripe secret key'],
  [/\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/, 'an AWS access key'],
  [/\bxox[abposr]-[A-Za-z0-9-]{10,}/, 'a Slack token'],
  [/\bsk-ant-[A-Za-z0-9_-]{32,}/, 'an Anthropic API key'],
  [/\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{40,}/, 'an OpenAI API key'],
  [/\bnpm_[A-Za-z0-9]{36}\b/, 'an npm token'],
  [/\bre_[A-Za-z0-9]{8,}_[A-Za-z0-9]{16,}\b/, 'a Resend API key'],
  [/\b(?:RESEND_API_KEY|TURNSTILE_SECRET_KEY|CLOUDFLARE_API_TOKEN|FORM_TEST_TOKEN)["']?(?:\s*[:=]\s*["']|=)[A-Za-z0-9_-]{16,}/, 'a form or Cloudflare secret'],
];

/** File names that only ever hold secrets. Example/template copies are allowed. */
const SECRET_FILE = [
  [/(^|\/)\.env(\.(?!example$|sample$|template$)[^/]+)?$/, 'an environment file (.env)'],
  [/(^|\/)\.dev\.vars$/, "wrangler's local secrets file (.dev.vars)"],
  [/\.(pem|key|p12|pfx|jks|keystore)$/i, 'a key or certificate file'],
  [/(^|\/)id_(rsa|dsa|ecdsa|ed25519)$/, 'an SSH private key'],
  [/service[-_]?account[^/]*\.json$/i, 'a Google service account key'],
  [/(^|\/)form-secrets\.json$/, 'the form secrets file'],
  [/(^|\/)\.npmrc$/, 'an npm config (may hold a token)'],
];

const BINARY = /\.(png|jpe?g|gif|webp|avif|ico|woff2?|ttf|otf|eot|mp4|webm|mov|pdf|zip|gz)$/i;
const MAX = 2_000_000;

/** What secret this text holds, or null. */
export function findSecret(text) {
  for (const [re, what] of SECRET_PATTERNS) if (re.test(text)) return what;
  return null;
}

const git = (args, opts = {}) => execFileSync('git', args, { cwd: ROOT, maxBuffer: 512 * 1024 * 1024, stdio: ['pipe', 'pipe', 'ignore'], ...opts });
const list = (out) => out.toString('utf8').split('\0').filter(Boolean);

/** Check one file: its name, then its contents (a getter, so binaries and big files are never read). */
function checkFile(path, contents, found) {
  for (const [re, what] of SECRET_FILE) if (re.test(path)) { found.push(`${path}: is ${what}`); return; }
  if (BINARY.test(path)) return;
  let buf;
  try { buf = contents(); } catch { return; }
  if (!buf || buf.length > MAX || buf.includes(0)) return;
  const what = findSecret(buf.toString('utf8'));
  if (what) found.push(`${path}: contains ${what}`);
}

/** Every commit in `revs` (git rev-list arguments): file names added and lines added. */
function checkCommits(revs, found) {
  const commits = list(git(['rev-list', '-z', ...revs])).flatMap((s) => s.split('\n')).filter(Boolean);
  for (const sha of commits) {
    const short = sha.slice(0, 7);
    for (const path of list(git(['diff-tree', '--root', '-r', '-z', '--name-only', '--no-commit-id', '--diff-filter=ACMR', sha]))) {
      const before = found.length;
      checkFile(path, () => git(['show', `${sha}:${path}`]), found);
      for (let i = before; i < found.length; i++) found[i] = `commit ${short}, ${found[i]}`;
    }
  }
  return commits.length;
}

function main() {
  const args = new Set(process.argv.slice(2));
  const found = [];
  let scope;
  try {
    if (args.has('--staged') || args.has('--pending')) {
      const files = list(git(['diff', '--cached', '--name-only', '-z', '--diff-filter=ACMR']));
      for (const f of files) checkFile(f, () => git(['show', `:${f}`]), found);
      scope = `${files.length} staged file(s)`;
      if (args.has('--pending')) {
        const staged = new Set(files);
        const more = list(git(['ls-files', '-z', '--modified', '--others', '--exclude-standard'])).filter((f) => !staged.has(f));
        for (const f of more) checkFile(f, () => (statSync(join(ROOT, f)).size > MAX ? null : readFileSync(join(ROOT, f))), found);
        scope = `${files.length + more.length} staged, changed or new file(s)`;
      }
    } else if (args.has('--push') || args.has('--outgoing')) {
      // pre-push stdin: "<local ref> <local sha> <remote ref> <remote sha>" per ref being pushed.
      let tips = ['HEAD'];
      if (args.has('--push')) {
        let stdin = '';
        try { stdin = readFileSync(0, 'utf8'); } catch { /* no stdin */ }
        const pushed = stdin.split('\n').map((l) => l.trim().split(/\s+/)[1]).filter((s) => s && !/^0+$/.test(s));
        if (stdin.trim()) tips = pushed; // only deletions: nothing to scan
      }
      let n = 0;
      if (tips.length) {
        try { n = checkCommits([...tips, '--not', '--remotes'], found); } catch { /* no commits yet */ }
      }
      scope = `${n} commit(s) not yet pushed`;
    } else {
      let files;
      try { files = list(git(['ls-files', '-z'])); } catch {
        // Not a git checkout (tools/selftest.mjs works on a plain copy): every file but build output.
        files = walk(ROOT).map((p) => rel(p, ROOT)).filter((f) => !/^(\.git|node_modules|_site|\.preview|\.lighthouseci)\//.test(f));
      }
      for (const f of files) checkFile(f, () => (statSync(join(ROOT, f)).size > MAX ? null : readFileSync(join(ROOT, f))), found);
      scope = `${files.length} tracked file(s)`;
    }
  } catch (e) {
    console.error(`Secret check could not read git: ${String(e.message).split('\n')[0]}`);
    process.exit(1);
  }

  if (!found.length) { console.log(`No secrets in ${scope}.`); return; }
  console.error(`SECRET FOUND: this must not go into git (the repo is public):\n  ${found.join('\n  ')}\n`);
  if (args.has('--staged') || args.has('--pending')) console.error('Keep it out of the commit: git restore --staged <file>, and move the secret to ~/.config/landing-tools/ (or add the file to .gitignore).');
  else if (args.has('--push') || args.has('--outgoing')) console.error('It is in a commit that is not pushed yet. Ask Claude to take it out of those commits before pushing (nothing is online yet).');
  else console.error('Remove it from the repo, and treat the key as leaked if it was ever pushed: revoke it and make a new one.');
  process.exit(1);
}

// Run only when called directly, not when imported by check.mjs (real paths: /var may be a symlink to /private/var).
const self = (() => { try { return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url)); } catch { return false; } })();
if (self) main();
