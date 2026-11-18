// Contact form handler: a Cloudflare Worker. Built and deployed by `node tools/form-worker.mjs deploy`
// (which writes ./site.js with the email templates and site settings); do not deploy this file by hand.
//
// POST from the landing page form:
//   1. drops bots (honeypot field, wrong origin, invalid email)
//   2. emails the business (notification; Reply goes to the visitor)
//   3. emails the visitor an autoreply, only when Cloudflare Turnstile confirmed a human
//      (otherwise anyone could make us send branded email to any address)
// Answers JSON to the page's script, or redirects to thanks.html when the browser had no JavaScript.
//
// Secrets (node tools/form-worker.mjs secrets): RESEND_API_KEY, TURNSTILE_SECRET_KEY, FORM_TEST_TOKEN.
// For tests only: RESEND_API_URL and TURNSTILE_VERIFY_URL override the API addresses.
import { SITE, EMAILS } from './site.js';
import { renderEmail } from './render.js';

const LIMIT = { name: 100, email: 254, message: 5000, page: 300 };
const EMAIL_RE = /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[^\s@<>"',;]{2,}$/;

/** A name we are willing to put into an email to a stranger: no links, no addresses, short. */
function safeName(name) {
  const n = name.replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim();
  if (!n || n.length > 60 || /https?:|www\.|:\/\/|@|\.[a-z]{2,}\b/i.test(n)) return '';
  return n.split(' ')[0];
}

async function isHuman(token, ip, env) {
  if (!token) return false;
  if (env.FORM_TEST_TOKEN && token === env.FORM_TEST_TOKEN) return true; // node tools/form-test.mjs --send
  if (!env.TURNSTILE_SECRET_KEY) return false;
  const body = new FormData();
  body.append('secret', env.TURNSTILE_SECRET_KEY);
  body.append('response', token);
  if (ip) body.append('remoteip', ip);
  try {
    const res = await fetch(env.TURNSTILE_VERIFY_URL || 'https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body });
    const data = await res.json();
    return data.success === true && (!data.hostname || SITE.hosts.includes(data.hostname));
  } catch {
    return false;
  }
}

async function send(env, { to, replyTo, subject, html, text }) {
  const res = await fetch(env.RESEND_API_URL || 'https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: SITE.from, to: [to], reply_to: replyTo, subject, html, text }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${(await res.text()).slice(0, 300)}`);
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const allowed = SITE.origins.includes(origin) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
    const cors = allowed ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {};
    const wantsJson = (request.headers.get('Accept') || '').includes('application/json');

    const respond = (status, result, extra = {}) => {
      if (wantsJson) {
        return new Response(JSON.stringify({ ok: status < 400, result, ...extra }), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
      }
      if (status < 400) return Response.redirect(`${SITE.url}thanks.html`, 303);
      return new Response(`Sorry, the message could not be sent (${result}). Please write to ${SITE.contact}.`, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: { ...cors, 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'Accept, Content-Type', 'Access-Control-Max-Age': '86400' } });
    }
    if (request.method === 'GET' && new URL(request.url).searchParams.has('version')) {
      // Lets tools/monitor.mjs check that the live emails match the repo (no secrets, no side effects).
      return new Response(JSON.stringify({ version: SITE.version }), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
    }
    if (request.method !== 'POST') return new Response('This address only accepts the contact form.', { status: 405, headers: { Allow: 'POST' } });
    if (!allowed) return respond(403, 'wrong_origin');

    let form;
    try { form = await request.formData(); } catch { return respond(400, 'bad_request'); }
    const field = (k, max) => String(form.get(k) ?? '').trim().slice(0, max);
    if (field('_gotcha', 100)) return respond(200, 'ok'); // bot: pretend it worked

    const email = field('email', LIMIT.email + 1);
    if (email.length > LIMIT.email || !EMAIL_RE.test(email)) return respond(422, 'invalid_email');
    const values = {
      name: field('name', LIMIT.name),
      email,
      message: field('message', LIMIT.message),
      date: new Date().toISOString().replace('T', ' ').slice(0, 16) + ' UTC',
      page: field('page', LIMIT.page) || SITE.url,
    };

    try {
      await send(env, { to: SITE.notifyTo, replyTo: email, ...renderEmail(EMAILS.notification, values) });
    } catch (e) {
      console.error('notification failed', e.message);
      return respond(502, 'send_failed');
    }

    let autoreply = false;
    if (await isHuman(field('cf-turnstile-response', 4096), request.headers.get('CF-Connecting-IP'), env)) {
      try {
        await send(env, { to: email, replyTo: SITE.replyTo, ...renderEmail(EMAILS.autoreply, { ...values, name: safeName(values.name) }) });
        autoreply = true;
      } catch (e) {
        console.error('autoreply failed', e.message); // the business already has the enquiry; do not fail the visitor
      }
    }
    return respond(200, 'ok', { autoreply });
  },
};
