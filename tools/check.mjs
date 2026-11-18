#!/usr/bin/env node
// Release checks. Builds the site (src/ + site.config.json -> _site/) and checks the result.
// Usage: node tools/check.mjs [--if-configured]
//   --if-configured  do nothing while the repo is still the untouched template (used by hooks)
// Exits 1 on any error. Warnings are printed but do not fail.
// ALLOW_FILLER=1 skips the template-filler check (only for tools/selftest.mjs).
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { OUT, ROOT, SRC, CONFIG, walk, rel, read, siteUrl, urlToFile, loadConfig, isConfigured } from './lib.mjs';
import { buildSite } from './build.mjs';
import { buildEmails, emailNames, styleTokens, EMAIL_DIR } from './emails.mjs';
import { RUNTIME_KEYS } from '../worker/render.js';
import { findSecret } from './secrets.mjs';

const errors = [];
const warnings = [];
const err = (f, m) => errors.push(`${f}: ${m}`);
const warn = (f, m) => warnings.push(`${f}: ${m}`);
function done() {
  for (const w of warnings) console.log(`warn  ${w}`);
  for (const e of errors) console.log(`ERROR ${e}`);
  console.log(`\n${errors.length} error(s), ${warnings.length} warning(s)`);
  process.exit(errors.length ? 1 : 0);
}

// 0. Config and build
let config, site;
try {
  config = loadConfig();
  if (process.argv.includes('--if-configured') && !isConfigured(config)) {
    console.log('Template not configured yet (BRAND is empty in site.config.json); nothing to check.');
    process.exit(0);
  }
  site = buildSite({ config });
} catch (e) {
  err('build', e.message);
  done();
}
const dir = OUT;
const base = siteUrl(config);

const FORMAT = {
  SITE_URL: [/^https:\/\/[^\s/]+(\/[^\s]*[^\s/])?$/, 'must be an https URL without a trailing slash'],
  THEME_COLOR: [/^#[0-9a-fA-F]{6}$/, 'must be a 6-digit #hex colour'],
  LANG: [/^[a-z]{2}(-[A-Za-z]{2})?$/, 'must look like "en" or "pl"'],
  LOCALE: [/^[a-z]{2}_[A-Z]{2}$/, 'must look like "en_US" or "pl_PL"'],
  CONTACT_EMAIL: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'must be an email address'],
  EMAIL_FROM: [/^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/, 'must be a plain email address on a domain verified in Resend'],
  FORM_NOTIFY_TO: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'must be an email address'],
  TURNSTILE_SITE_KEY: [/^[0-9a-zA-Z_-]{10,}$/, 'must be the Turnstile site key (starts with 0x…)'],
  FORM_ENDPOINT: [/^https:\/\/\S+$/, 'must be an https URL'],
  INDEXNOW_KEY: [/^[A-Za-z0-9-]{8,128}$/, 'must be 8-128 letters/digits (openssl rand -hex 16)'],
  PRIVACY_UPDATED: [/^\d{4}-\d{2}-\d{2}$/, 'must be YYYY-MM-DD'],
};
for (const [key, [re, msg]] of Object.entries(FORMAT)) {
  if (config[key] && !re.test(config[key])) err('site.config.json', `${key} ${msg} (now "${config[key]}")`);
}
for (const [key, value] of Object.entries(config)) {
  if (typeof value !== 'string') err('site.config.json', `${key} must be a string`);
}

// Analytics: a known tool, and an id in the shape that tool uses.
const ANALYTICS_ID = {
  ga4: [/^G-[A-Z0-9]{4,}$/, 'a GA4 measurement id like G-XXXXXXXXXX (node tools/google.mjs analytics creates one)'],
  goatcounter: [/^[a-z0-9-]+$/, 'the GoatCounter site code (the "code" in code.goatcounter.com)'],
  cloudflare: [/^[a-f0-9]{32}$/, 'the 32-character Cloudflare Web Analytics token'],
  plausible: [/^([a-z0-9-]+\.)+[a-z]{2,}$/, 'the site domain as added in Plausible (empty = the SITE_URL host)'],
};
const analytics = config.ANALYTICS || 'none';
if (analytics !== 'none' && !ANALYTICS_ID[analytics]) {
  err('site.config.json', `ANALYTICS must be one of none, ${Object.keys(ANALYTICS_ID).join(', ')} (now "${analytics}")`);
} else if (ANALYTICS_ID[analytics]) {
  const [re, what] = ANALYTICS_ID[analytics];
  const id = config.ANALYTICS_ID || '';
  if (!(analytics === 'plausible' && !id) && !re.test(id)) err('site.config.json', `ANALYTICS_ID must be ${what} (now "${id}")`);
}

// One brand colour: the config's THEME_COLOR (favicon, social image, browser bar) and the site's --accent
const accent = styleTokens().STYLE_ACCENT;
if (config.THEME_COLOR && accent && accent.toLowerCase() !== config.THEME_COLOR.toLowerCase()) {
  warn('src/css/styles.css', `--accent is ${accent} but THEME_COLOR is ${config.THEME_COLOR}: buttons and emails use --accent, icons and the browser bar THEME_COLOR (set them to the same brand colour)`);
}

// Contact form worker: everything it needs is set
if (/\.workers\.dev\/?$/.test(config.FORM_ENDPOINT || '')) {
  if (!config.EMAIL_FROM) err('site.config.json', 'FORM_ENDPOINT is the form worker, so EMAIL_FROM (sender address) is required');
  if (!config.TURNSTILE_SITE_KEY) warn('site.config.json', 'no TURNSTILE_SITE_KEY: enquiries arrive, but visitors get no autoreply');
}

// Email templates (emails/): complete, safe to send to strangers, within size limits
if (existsSync(EMAIL_DIR)) {
  let emails = {};
  try { emails = buildEmails(config); } catch (e) { err('emails', e.message); }
  if (!emailNames().includes('autoreply') || !emailNames().includes('notification')) err('emails', 'autoreply.html and notification.html are both required');
  for (const [name, mail] of Object.entries(emails)) {
    const f = `emails/${name}.html`;
    if (!mail.subject) err(f, 'first line must be <!-- @subject … -->');
    if (!mail.text.trim()) err(`emails/${name}.txt`, 'missing: every email needs a plain-text version');
    for (const [part, text] of [['html', mail.html], ['text', mail.text], ['subject', mail.subject]]) {
      const ph = text.match(/\{\{[A-Z0-9_]+\}\}/g);
      if (ph) err(f, `no value for ${[...new Set(ph)].join(', ')} in the ${part} (set it in site.config.json)`);
      for (const [, key] of text.matchAll(/\{\{[#^/]?([a-z]+)\}\}/g)) {
        if (!RUNTIME_KEYS.includes(key)) err(f, `unknown placeholder {{${key}}} in the ${part} (allowed: ${RUNTIME_KEYS.join(', ')})`);
      }
    }
    if (/<script\b|<link\b|<iframe\b|<form\b/i.test(mail.html)) err(f, 'no scripts, stylesheets, iframes or forms in emails (clients block them)');
    for (const img of mail.html.match(/<img\b[^>]*>/gi) || []) {
      if (!/\ssrc="https:\/\//.test(img)) err(f, `email images need an absolute https URL: ${img.slice(0, 80)}`);
      if (!/\salt="/.test(img)) err(f, `email image without alt: ${img.slice(0, 80)}`);
    }
    if (Buffer.byteLength(mail.html) > 100_000) err(f, 'HTML over 100 KB (Gmail cuts it off)');
  }
  // The emails take their look from the website (src/css/styles.css); a colour typed into a template drifts away from it.
  for (const p of walk(EMAIL_DIR).filter((f) => f.endsWith('.html'))) {
    const colour = read(p).replace(/<!--[\s\S]*?-->/g, '').match(/#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?)\(/);
    if (colour) err(rel(p, ROOT), `colour "${colour[0]}" typed in: use {{STYLE_*}} / {{DARK_*}} tokens or the btn/card classes, so the email matches the website (emails/STYLE.md)`);
  }
  const auto = emails.autoreply;
  if (auto) {
    // The autoreply goes to any address typed into the form: it must not carry text chosen by the sender.
    for (const key of ['message', 'email', 'page']) {
      if ([auto.subject, auto.html, auto.text].some((t) => t.includes(`{{${key}}}`))) err('emails/autoreply.html', `must not contain {{${key}}} (see emails/STYLE.md: never echo what the visitor typed)`);
    }
    const words = auto.text.replace(/\{\{[^}]*\}\}/g, ' ').split(/\s+/).filter(Boolean).length;
    if (words > 150) err('emails/autoreply.txt', `${words} words; keep the autoreply under 120 (emails/STYLE.md)`);
    else if (words > 120) warn('emails/autoreply.txt', `${words} words; the style guide aims for 40-120`);
  }
}

// Secrets never go into the site (the repo is public, and everything in src/ is published).
// Patterns live in tools/secrets.mjs, which also guards every commit and push.
for (const p of [CONFIG, ...walk(SRC), ...(existsSync(EMAIL_DIR) ? walk(EMAIL_DIR) : [])]) {
  if (!/\.(html|js|css|json|txt|xml|svg|md|webmanifest)$/.test(p)) continue;
  const text = read(p);
  const what = findSecret(text);
  if (what) err(rel(p, ROOT), `contains ${what}: remove it now (and revoke it if it was ever pushed)`);
}

const TEXT_EXT = /\.(html|xml|txt|js|css|json|webmanifest|svg|md)$/;
const FILLER = process.env.ALLOW_FILLER ? [] : [
  'Benefit one', 'Benefit two', 'Benefit three', 'Describe the outcome, not the feature',
  'Replace with a real testimonial', 'Name, Role', 'Question one?', 'Answer one.',
];
const REQUIRED = [
  'index.html', '404.html', 'privacy.html', 'robots.txt', 'sitemap.xml', 'llms.txt',
  'site.webmanifest', 'favicon.svg', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png',
  'og.png', 'indexnow.txt',
];

const files = walk(dir).map((p) => ({ p, r: rel(p, dir) }));
const html = files.filter(({ r }) => r.endsWith('.html'));

// 1. Required files
for (const f of REQUIRED) if (!existsSync(join(dir, f))) err(f, 'missing (run node tools/make-assets.mjs for images)');

// 2. Unfilled values, leftover build directives, filler copy, TODO markers
for (const { p, r } of files) {
  if (!TEXT_EXT.test(r)) continue;
  const text = read(p);
  const ph = text.match(/\{\{[A-Z0-9_]+\}\}/g);
  if (ph) err(r, `no value for ${[...new Set(ph)].join(', ')} (set it in site.config.json, or in the page's @vars block)`);
  const directive = text.match(/<!-- @(include|if|endif|vars|posts)\b[^>]*-->/);
  if (directive) err(r, `build directive was not processed: ${directive[0]} (check its spelling and placement)`);
  if (/\.(svg|xml)$/.test(r) && /<!--(?:(?!-->)[\s\S])*?--(?!>)/.test(text)) err(r, 'XML comment contains "--" (breaks the file)');
  if (r.endsWith('.html')) {
    for (const s of FILLER) if (text.includes(s)) err(r, `template filler text "${s}"`);
    if (/\bTODO\b/.test(text.replace(/<!--[\s\S]*?-->/g, ''))) err(r, 'visible TODO marker');
  }
}

// 3. Per-page HTML checks
const strip = (s) => s.replace(/<[^>]+>/g, '').replace(/&(amp|lt|gt|quot|#39);/g, (_, e) => ({ amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'" })[e]).replace(/\s+/g, ' ').trim();
const attr = (tag, name) => tag.match(new RegExp(`\\s${name}\\s*=\\s*"([^"]*)"`, 'i'))?.[1];
const metaContent = (text, key) => {
  for (const tag of text.match(/<meta\b[^>]*>/gi) || []) {
    if (attr(tag, 'name') === key || attr(tag, 'property') === key) return attr(tag, 'content');
  }
};
const titles = new Map();

for (const { p, r } of html) {
  const text = read(p).replace(/<!--[\s\S]*?-->/g, '');
  const noindex = /noindex/i.test(metaContent(text, 'robots') || '');

  if (!/<html[^>]*\slang="[a-z]{2}(-[A-Za-z]{2})?"/.test(text)) err(r, '<html> needs a valid lang');
  const h1 = text.match(/<h1\b/gi) || [];
  if (h1.length !== 1) err(r, `expected exactly one <h1>, found ${h1.length}`);

  const title = strip(text.match(/<title>([\s\S]*?)<\/title>/i)?.[1] || '');
  if (!title) err(r, 'missing <title>');
  else if (!noindex && (title.length < 25 || title.length > 65)) warn(r, `title is ${title.length} chars (aim for 30-60)`);
  if (title && !noindex) {
    if (titles.has(title)) err(r, `same <title> as ${titles.get(title)} (every page needs its own)`);
    else titles.set(title, r);
  }

  const desc = metaContent(text, 'description');
  if (!desc) err(r, 'missing meta description');
  else if (desc.length > 160) err(r, `meta description is ${desc.length} chars (max 160)`);
  else if (!noindex && desc.length < 70) warn(r, `meta description is only ${desc.length} chars`);

  if (!noindex) {
    const canon = text.match(/<link[^>]*rel="canonical"[^>]*>/i)?.[0];
    const href = canon && attr(canon, 'href');
    if (!href) err(r, 'missing canonical link');
    else if (!/^https:\/\//.test(href)) err(r, `canonical must be an absolute https URL (${href})`);
    else if (urlToFile(href, dir, config) !== p) err(r, `canonical ${href} does not point to this file`);
    if (!metaContent(text, 'og:image') && r !== 'privacy.html') warn(r, 'no og:image');
  }

  for (const form of text.match(/<form\b[^>]*>/gi) || []) {
    const action = attr(form, 'action') || '';
    if (attr(form, 'method')?.toLowerCase() === 'post' && !/^https:\/\//.test(action)) err(r, `form posts to "${action}": it needs the https FORM_ENDPOINT`);
  }
  if (/<form\b/i.test(text) && !/href="[^"]*privacy\.html"/.test(text)) err(r, 'page with a form must link to privacy.html');

  for (const img of text.match(/<img\b[^>]*>/gi) || []) {
    if (attr(img, 'alt') === undefined) err(r, `<img> without alt: ${img.slice(0, 80)}`);
    if (!attr(img, 'width') || !attr(img, 'height')) err(r, `<img> needs width and height (layout shift): ${img.slice(0, 80)}`);
  }

  // JSON-LD must parse; FAQPage must mirror the visible FAQ
  const blocks = [...text.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi)];
  for (const [, json] of blocks) {
    let data;
    try { data = JSON.parse(json); } catch (e) { err(r, `invalid JSON-LD: ${e.message}`); continue; }
    const nodes = [data, ...(data['@graph'] || [])];
    for (const n of nodes) {
      if (n['@type'] !== 'FAQPage') continue;
      const ld = (n.mainEntity || []).map((q) => String(q.name || '').trim()).sort();
      const visible = [...text.matchAll(/<summary>([\s\S]*?)<\/summary>/gi)].map((m) => strip(m[1])).sort();
      if (JSON.stringify(ld) !== JSON.stringify(visible)) err(r, 'FAQPage JSON-LD questions differ from the visible <summary> questions');
    }
    if (nodes.some((n) => Array.isArray(n.sameAs) && n.sameAs.length === 0)) warn(r, 'Organization.sameAs is empty (add social profiles if any)');
  }
}

// 4. Blog posts: dates and wiring (the build generates the wiring; this catches a broken marker)
if (existsSync(join(dir, 'robots.txt')) && !read(join(dir, 'robots.txt')).includes(`Sitemap: ${base}sitemap.xml`)) {
  err('robots.txt', 'Sitemap line does not match SITE_URL');
}
if (site.posts.length) {
  const at = (f) => (existsSync(join(dir, f)) ? read(join(dir, f)) : '');
  const blogIndex = at('blog/index.html');
  const feed = at('blog/feed.xml');
  const llms = at('llms.txt');
  const sitemap = at('sitemap.xml');
  for (const post of site.posts) {
    const r = post.file;
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(post.slug)) err(r, 'file name must be lowercase-with-hyphens.html');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(post.date) || Number.isNaN(Date.parse(post.date))) err(r, `@vars DATE must be YYYY-MM-DD (now "${post.date}")`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(post.modified) || post.modified < post.date) err(r, `@vars DATE_MODIFIED must be YYYY-MM-DD and not before DATE (now "${post.modified}")`);
    if (!blogIndex.includes(`href="${post.slug}.html"`)) err(r, 'not listed in blog/index.html (is the <!-- @posts --> marker still there?)');
    if (!feed.includes(`<link>${post.url}</link>`)) err(r, 'missing from blog/feed.xml (is the <!-- @posts --> marker still there?)');
    if (!llms.includes(post.url)) err(r, 'missing from llms.txt (is the <!-- @posts --> marker still there?)');
    if (!sitemap.includes(`<loc>${post.url}</loc>`)) err(r, 'missing from sitemap.xml (is the post marked noindex?)');
  }
}

done();
