#!/usr/bin/env node
// Sends one test enquiry through the contact form, exactly like the page does, so you know emails arrive.
// With the form worker, the test passes the anti-bot check with this worker's test token, so the
// autoreply is sent too. Both emails go to the business address (FORM_NOTIFY_TO, else CONTACT_EMAIL).
// Usage: node tools/form-test.mjs          show what would be sent (nothing is sent)
//        node tools/form-test.mjs --send   send it
import { existsSync } from 'node:fs';
import { loadConfig, read, siteUrl } from './lib.mjs';
import { TEST_TOKENS_FILE, workerName } from './form-worker.mjs';

const config = loadConfig();
const endpoint = String(config.FORM_ENDPOINT || '');
if (!/^https:\/\//.test(endpoint)) {
  console.error('Set FORM_ENDPOINT in site.config.json first (node tools/form-worker.mjs deploy does it for the form worker).');
  process.exit(1);
}
const isWorker = /\.workers\.dev\/?$/.test(endpoint);
const to = config.FORM_NOTIFY_TO || config.CONTACT_EMAIL || 'test@example.com';

const fields = {
  name: 'Formtest',
  email: to,
  message: `Test enquiry sent by tools/form-test.mjs on ${new Date().toISOString()}. If you can read this, the contact form works.`,
  page: siteUrl(config),
  _subject: `Test: contact form of the ${config.BRAND || 'landing'} website`,
};
if (config.FORM_ACCESS_KEY) fields.access_key = config.FORM_ACCESS_KEY;
let token = '';
if (isWorker && existsSync(TEST_TOKENS_FILE)) token = JSON.parse(read(TEST_TOKENS_FILE))[workerName(config)] || '';

if (!process.argv.includes('--send')) {
  console.log(`Would POST to ${endpoint}:`);
  for (const [k, v] of Object.entries(fields)) console.log(`  ${k}: ${k === 'access_key' ? '(set)' : v}`);
  if (isWorker) console.log(token ? '  (with this worker\'s test token: the autoreply is sent too, to the same address)' : '  (no test token: only the notification is sent; run node tools/form-worker.mjs secrets for one)');
  console.log('\nRun with --send to send it (real emails).');
  process.exit(0);
}

const body = new FormData();
for (const [k, v] of Object.entries(fields)) body.append(k, v);
if (token) body.append('cf-turnstile-response', token);
let res;
try {
  res = await fetch(endpoint, { method: 'POST', headers: { Accept: 'application/json', Origin: new URL(siteUrl(config)).origin }, body });
} catch (e) {
  console.error(`Could not reach ${endpoint}: ${e.message}`);
  process.exit(1);
}
const text = (await res.text()).slice(0, 500);
console.log(`${res.status} ${res.statusText}\n${text}`);
if (!res.ok) {
  console.log(isWorker
    ? '\nRejected. send_failed: check the Resend key, that the EMAIL_FROM domain is verified in Resend, and the worker logs (npx wrangler tail <name>).'
    : '\nRejected. Common causes: wrong FORM_ENDPOINT, the form is not confirmed yet, or the service blocks the domain.');
  process.exit(1);
}
let autoreply = false;
try { autoreply = JSON.parse(text).autoreply === true; } catch { /* not the worker */ }
console.log(`\nAccepted. Check ${to} (and spam) for the notification${autoreply ? ' and the autoreply' : ''}.`);
if (isWorker && !autoreply) console.log('The autoreply was not sent: no valid test token (node tools/form-worker.mjs secrets), or Resend refused it (worker logs).');
