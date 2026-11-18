#!/usr/bin/env node
// Tests the contact form worker locally: builds it from site.config.json and emails/, then sends it
// requests with Resend and Turnstile replaced by fakes. Nothing leaves this computer.
// Usage: node tools/test-worker.mjs   (part of tools/selftest.mjs)
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, loadConfig, siteUrl } from './lib.mjs';
import { bundle } from './form-worker.mjs';

const config = loadConfig();
const dir = bundle(config, join(ROOT, '.worker-test'));
const worker = (await import(pathToFileURL(join(dir, 'form.js')).href)).default;
const origin = new URL(siteUrl(config)).origin;
const notifyTo = config.FORM_NOTIFY_TO || config.CONTACT_EMAIL;

let sent = [];
let resendFails = false;
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  if (url === 'https://resend.test/emails') {
    if (resendFails) return new Response('{"message":"domain not verified"}', { status: 403 });
    sent.push(JSON.parse(init.body));
    return new Response('{"id":"x"}', { status: 200 });
  }
  if (url === 'https://turnstile.test/verify') {
    const ok = init.body.get('response') === 'human-token' && init.body.get('secret') === 'ts-secret';
    return new Response(JSON.stringify({ success: ok, hostname: new URL(origin).host }), { status: 200 });
  }
  throw new Error(`unexpected request to ${url}`);
};
const env = { RESEND_API_KEY: 're_test', TURNSTILE_SECRET_KEY: 'ts-secret', FORM_TEST_TOKEN: 'test-token', RESEND_API_URL: 'https://resend.test/emails', TURNSTILE_VERIFY_URL: 'https://turnstile.test/verify' };

async function post(fields, { from = origin, accept = 'application/json' } = {}) {
  sent = [];
  const body = new FormData();
  for (const [k, v] of Object.entries(fields)) body.append(k, v);
  const res = await worker.fetch(new Request('https://form.test/', { method: 'POST', headers: { Origin: from, Accept: accept }, body }), env);
  const text = await res.text();
  let json = {};
  try { json = JSON.parse(text); } catch { /* html/redirect */ }
  return { status: res.status, json, location: res.headers.get('Location'), cors: res.headers.get('Access-Control-Allow-Origin') };
}

let failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? '✔' : '✘'} ${name}${ok ? '' : `  ${detail}`}`); if (!ok) failed++; };
const base = { name: 'Anna Nowak', email: 'anna@example.com', message: 'Hello <b>there</b>', page: siteUrl(config) };

let r = await post({ ...base, 'cf-turnstile-response': 'human-token' });
const [notif, auto] = sent;
check('human: 200 with autoreply', r.status === 200 && r.json.autoreply === true, JSON.stringify(r));
check('human: notification to the business, Reply goes to the visitor', notif?.to?.[0] === notifyTo && notif?.reply_to === 'anna@example.com', JSON.stringify(notif));
check('human: autoreply to the visitor, Reply goes to the business', auto?.to?.[0] === 'anna@example.com' && auto?.reply_to === config.CONTACT_EMAIL, JSON.stringify(auto));
check('notification escapes the message in HTML', notif?.html.includes('Hello &lt;b&gt;there&lt;/b&gt;') && !notif?.html.includes('<b>there'), '');
check('autoreply greets by first name only', auto?.html.includes('Anna') && !auto?.html.includes('Nowak'), '');
check('sender shows the brand', /^".+" <.+@.+>$/.test(notif?.from || ''), notif?.from);
check('CORS allows the site', r.cors === origin, String(r.cors));

r = await post({ ...base, name: 'Visit http://spam.example now' , 'cf-turnstile-response': 'human-token' });
check('link in the name is left out of the autoreply', sent[1] && !sent[1].html.includes('spam.example') && !sent[1].subject.includes('spam'), sent[1]?.html.slice(0, 0));

r = await post(base);
check('no anti-bot token: notification only', r.status === 200 && r.json.autoreply === false && sent.length === 1, JSON.stringify(r));
r = await post({ ...base, 'cf-turnstile-response': 'forged' });
check('failed anti-bot check: notification only', r.json.autoreply === false && sent.length === 1, JSON.stringify(r));
r = await post({ ...base, 'cf-turnstile-response': 'test-token' });
check('test token (form-test.mjs) sends the autoreply', r.json.autoreply === true && sent.length === 2, JSON.stringify(r));
r = await post({ ...base, _gotcha: 'bot' });
check('honeypot: looks fine to the bot, sends nothing', r.status === 200 && sent.length === 0, JSON.stringify(r));
r = await post(base, { from: 'https://evil.example' });
check('other website: 403, sends nothing', r.status === 403 && sent.length === 0, JSON.stringify(r));
r = await post({ ...base, email: 'not-an-email' });
check('invalid email: 422', r.status === 422 && sent.length === 0, JSON.stringify(r));
r = await post(base, { accept: 'text/html' });
check('without JavaScript: redirect to thanks.html', r.status === 303 && r.location === `${siteUrl(config)}thanks.html`, JSON.stringify(r));
resendFails = true;
r = await post(base);
check('email service down: 502 so the page shows the error', r.status === 502 && r.json.ok === false, JSON.stringify(r));
resendFails = false;
const get = await worker.fetch(new Request('https://form.test/'), env);
check('GET is refused', get.status === 405);
const ver = await worker.fetch(new Request('https://form.test/?version'), env);
const { workerSource } = await import('./form-worker.mjs');
check('GET ?version reports the built version', (await ver.json()).version === workerSource(config).site.version);

globalThis.fetch = realFetch;
console.log(failed ? `\n${failed} worker test(s) failed` : '\nAll worker tests passed');
process.exit(failed ? 1 : 0);
