#!/usr/bin/env node
// Google Search Console and Google Analytics 4 set-up through Google's APIs, so nobody has to click
// through the consoles for each new page. Uses one service account for all your pages: the one-time
// set-up is in the publish skill ("Google, one-time set-up").
//
// Usage:
//   node tools/google.mjs check
//       key found, token works, which Search Console sites and GA accounts the service account can see
//   node tools/google.mjs verification-token
//       asks Google for this site's verification code and writes GOOGLE_SITE_VERIFICATION to site.config.json
//       (deploy afterwards: the home page then carries the meta tag)
//   node tools/google.mjs search-console [--owners you@gmail.com,client@gmail.com]
//       after that deploy: verifies ownership, adds the owners (they see the site in Search Console),
//       adds the property and submits sitemap.xml
//   node tools/google.mjs analytics --account <GA account id> [--timezone Europe/Warsaw] [--currency PLN]
//       creates a GA4 property and web stream for SITE_URL; writes ANALYTICS=ga4 and ANALYTICS_ID
//   --dry-run   print the requests instead of sending them (no key needed)
//
// Key file: $GOOGLE_SERVICE_ACCOUNT, or ~/.config/landing-tools/google-service-account.json. Never put it in the repo.
import { createSign } from 'node:crypto';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { loadConfig, read, setConfig, siteUrl } from './lib.mjs';

const [cmd, ...rest] = process.argv.slice(2);
const flag = (name) => rest.includes(`--${name}`);
const opt = (name, fallback = '') => {
  const i = rest.indexOf(`--${name}`);
  return i >= 0 && rest[i + 1] && !rest[i + 1].startsWith('--') ? rest[i + 1] : fallback;
};
const DRY = flag('dry-run');
const KEY_FILE = process.env.GOOGLE_SERVICE_ACCOUNT || join(homedir(), '.config/landing-tools/google-service-account.json');
const SCOPES = {
  verify: 'https://www.googleapis.com/auth/siteverification',
  webmasters: 'https://www.googleapis.com/auth/webmasters',
  analytics: 'https://www.googleapis.com/auth/analytics.edit',
};

const die = (m) => { console.error(m); process.exit(1); };
const done = (m) => console.log(DRY ? `(dry run, nothing sent) ${m}` : `✔ ${m}`);

function loadKey() {
  if (!existsSync(KEY_FILE)) {
    die(`No Google service account key at ${KEY_FILE}.\nDo the one-time set-up in the publish skill ("Google, one-time set-up"), or set GOOGLE_SERVICE_ACCOUNT=/path/to/key.json.`);
  }
  let key;
  try { key = JSON.parse(read(KEY_FILE)); } catch (e) { die(`${KEY_FILE} is not valid JSON: ${e.message}`); }
  if (key.type !== 'service_account' || !key.private_key || !key.client_email) die(`${KEY_FILE} is not a service account key (JSON key from IAM > Service accounts > Keys).`);
  return key;
}

const tokens = new Map();
async function token(scope) {
  if (DRY) return 'DRY-RUN';
  if (tokens.has(scope)) return tokens.get(scope);
  const key = loadKey();
  const aud = key.token_uri || 'https://oauth2.googleapis.com/token';
  const now = Math.floor(Date.now() / 1000);
  const enc = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const unsigned = `${enc({ alg: 'RS256', typ: 'JWT' })}.${enc({ iss: key.client_email, scope, aud, iat: now, exp: now + 3600 })}`;
  const sig = createSign('RSA-SHA256').update(unsigned).sign(key.private_key).toString('base64url');
  const res = await fetch(aud, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${sig}` }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) die(`Google sign-in with the service account failed (${res.status}): ${data.error_description || data.error || 'unknown error'}`);
  tokens.set(scope, data.access_token);
  return data.access_token;
}

async function api(scope, method, url, body) {
  if (DRY) {
    console.log(`[dry-run] ${method} ${url}${body ? '\n          ' + JSON.stringify(body) : ''}`);
    return {};
  }
  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${await token(scope)}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  if (!res.ok) {
    const reason = data.error?.message || data.raw || res.statusText;
    const hint = res.status === 403 ? '\nHint: is the API enabled in the Google Cloud project, and does the service account have access (GA: added to the account as Editor)?' : '';
    die(`${method} ${url} failed (${res.status}): ${reason}${hint}`);
  }
  return data;
}

const config = loadConfig();
const SITE = siteUrl(config);
function needSite() {
  if (!/^https:\/\/[^/]+/.test(String(config.SITE_URL || ''))) die('Set SITE_URL in site.config.json first (the publish skill does it).');
}
const enc = encodeURIComponent;

async function check() {
  const key = DRY ? { client_email: '(dry-run)' } : loadKey();
  console.log(`Key: ${KEY_FILE}\nService account: ${key.client_email}`);
  const sites = await api(SCOPES.webmasters, 'GET', 'https://searchconsole.googleapis.com/webmasters/v3/sites');
  console.log(`\nSearch Console sites it can see (${(sites.siteEntry || []).length}):`);
  for (const s of sites.siteEntry || []) console.log(`  ${s.siteUrl} (${s.permissionLevel})`);
  const ga = await api(SCOPES.analytics, 'GET', 'https://analyticsadmin.googleapis.com/v1beta/accountSummaries');
  console.log(`\nGoogle Analytics accounts it can use (${(ga.accountSummaries || []).length}):`);
  for (const a of ga.accountSummaries || []) console.log(`  ${a.displayName}: --account ${a.account.replace('accounts/', '')} (${(a.propertySummaries || []).length} properties)`);
  if (!DRY && !(ga.accountSummaries || []).length) console.log(`  none: in Google Analytics, Admin > Account access management, add ${key.client_email} as Editor.`);
}

async function verificationToken() {
  needSite();
  const data = await api(SCOPES.verify, 'POST', 'https://www.googleapis.com/siteVerification/v1/token', {
    site: { type: 'SITE', identifier: SITE }, verificationMethod: 'META',
  });
  if (DRY) return;
  const code = String(data.token || '').match(/content="([^"]+)"/)?.[1] || data.token;
  if (!code) die(`Google returned no verification code: ${JSON.stringify(data)}`);
  setConfig('GOOGLE_SITE_VERIFICATION', code);
  console.log(`GOOGLE_SITE_VERIFICATION set in site.config.json.\nNext: commit, push, wait for the deploy, then run: node tools/google.mjs search-console --owners <emails>`);
}

async function searchConsole() {
  needSite();
  const owners = opt('owners').split(',').map((s) => s.trim()).filter(Boolean);
  for (const o of owners) if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(o)) die(`Not an email address: ${o}`);
  if (!config.GOOGLE_SITE_VERIFICATION) die('No GOOGLE_SITE_VERIFICATION yet: run node tools/google.mjs verification-token, then deploy.');

  if (!DRY) {
    const live = await fetch(SITE).then((r) => r.text()).catch(() => '');
    if (!live.includes(config.GOOGLE_SITE_VERIFICATION)) die(`${SITE} does not carry the verification meta tag yet. Commit, push and wait for the deploy first (gh run watch).`);
  }

  const resource = await api(SCOPES.verify, 'POST', `https://www.googleapis.com/siteVerification/v1/webResource?verificationMethod=META`, {
    site: { type: 'SITE', identifier: SITE },
  });
  done(`Ownership of ${SITE} verified`);

  if (owners.length) {
    const id = resource.id || SITE;
    const all = [...new Set([...(resource.owners || []), ...owners])];
    await api(SCOPES.verify, 'PUT', `https://www.googleapis.com/siteVerification/v1/webResource/${enc(id)}`, {
      site: { type: 'SITE', identifier: SITE }, owners: all,
    });
    done(`Owners: ${owners.join(', ')} (they see the site in Search Console with their Google account)`);
  }

  await api(SCOPES.webmasters, 'PUT', `https://searchconsole.googleapis.com/webmasters/v3/sites/${enc(SITE)}`);
  done('Property added to Search Console');
  await api(SCOPES.webmasters, 'PUT', `https://searchconsole.googleapis.com/webmasters/v3/sites/${enc(SITE)}/sitemaps/${enc(SITE + 'sitemap.xml')}`);
  done(`Sitemap submitted: ${SITE}sitemap.xml`);
}

async function analytics() {
  needSite();
  const account = opt('account');
  if (!/^\d+$/.test(account)) die('Pass the Google Analytics account id: --account 123456789 (node tools/google.mjs check lists them).');
  if (config.ANALYTICS === 'ga4' && config.ANALYTICS_ID && !flag('force')) {
    die(`GA4 is already set up (${config.ANALYTICS_ID}). Use --force to create another property.`);
  }
  const brand = config.BRAND || new URL(SITE).host;
  const property = await api(SCOPES.analytics, 'POST', 'https://analyticsadmin.googleapis.com/v1beta/properties', {
    parent: `accounts/${account}`,
    displayName: brand,
    timeZone: opt('timezone', 'Europe/Warsaw'),
    currencyCode: opt('currency', 'PLN'),
  });
  const name = property.name || 'properties/DRY-RUN';
  const stream = await api(SCOPES.analytics, 'POST', `https://analyticsadmin.googleapis.com/v1beta/${name}/dataStreams`, {
    type: 'WEB_DATA_STREAM', displayName: `${brand} website`, webStreamData: { defaultUri: SITE.replace(/\/$/, '') },
  });
  if (DRY) return;
  const id = stream.webStreamData?.measurementId;
  if (!id) die(`Google returned no measurement id: ${JSON.stringify(stream)}`);
  setConfig('ANALYTICS', 'ga4');
  setConfig('ANALYTICS_ID', id);
  console.log(`✔ GA4 property ${name} with web stream ${id}\nANALYTICS=ga4 and ANALYTICS_ID=${id} set in site.config.json. The consent banner and privacy text follow at the next build.`);
}

const COMMANDS = { check, 'verification-token': verificationToken, 'search-console': searchConsole, analytics };
if (!COMMANDS[cmd]) die('Usage: node tools/google.mjs check | verification-token | search-console [--owners a@b,c@d] | analytics --account <id> [--dry-run]');
await COMMANDS[cmd]();
