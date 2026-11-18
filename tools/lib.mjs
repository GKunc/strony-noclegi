// Shared helpers for the repo tooling. Node 22+, no dependencies.
import { readFileSync, readdirSync, statSync, existsSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

// fileURLToPath (not URL.pathname): the repo may live in a folder with spaces or non-ASCII letters.
export const ROOT = fileURLToPath(new URL('..', import.meta.url)).replace(/[\\/]$/, '');
export const SRC = join(ROOT, 'src');
export const OUT = join(ROOT, '_site');
export const CONFIG = join(ROOT, 'site.config.json');

// Single place for the pinned versions of the tools CI and local checks download.
export const HTML_VALIDATE = 'html-validate@11.21.1';
export const LHCI = '@lhci/cli@0.16.1';
export const WRANGLER = 'wrangler@4.153.0';

export function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

/** Path relative to base, always with forward slashes. */
export const rel = (p, base = SRC) => relative(base, p).split(sep).join('/');
export const read = (p) => readFileSync(p, 'utf8');

/** site.config.json as an object of strings. Throws a readable error when it is missing or not valid JSON. */
export function loadConfig(file = CONFIG) {
  if (!existsSync(file)) throw new Error('site.config.json is missing (restore it from git or the template)');
  try {
    return JSON.parse(read(file));
  } catch (e) {
    throw new Error(`site.config.json is not valid JSON: ${e.message}`);
  }
}

/** False while the repo is still the untouched template (no brand set). */
export const isConfigured = (config) => Boolean(config.BRAND && String(config.BRAND).trim());

/** The home URL from the config, always ending in "/". */
export const siteUrl = (config) => String(config.SITE_URL || '').replace(/\/+$/, '') + '/';

/** Map a public URL to its file under dir (src/ or _site/), or null if it is not on this site. */
export function urlToFile(url, dir, config) {
  const base = siteUrl(config);
  if (base === '/' || !url.startsWith(base)) return null;
  let path = decodeURI(url.slice(base.length).split(/[?#]/)[0]);
  if (path === '' || path.endsWith('/')) path += 'index.html';
  const file = join(dir, path);
  return existsSync(file) ? file : null;
}

/**
 * Set one value in site.config.json without touching the rest of the file (keeps its grouping and order).
 * The key must already exist in the file.
 */
export function setConfig(key, value, file = CONFIG) {
  const text = read(file);
  const re = new RegExp(`("${key}"\\s*:\\s*)"(?:[^"\\\\]|\\\\.)*"`);
  if (!re.test(text)) throw new Error(`${key} is not in site.config.json; add the line "${key}": "" first`);
  writeFileSync(file, text.replace(re, (_, k) => k + JSON.stringify(String(value))));
}
