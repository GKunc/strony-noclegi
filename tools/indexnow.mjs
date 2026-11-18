#!/usr/bin/env node
// Tells Bing, Yandex and other IndexNow engines which URLs changed.
// Bing's index feeds ChatGPT search and Copilot, so this speeds up AI visibility.
// Usage: node tools/indexnow.mjs [baseCommit]   (no base, or all zeros = submit every sitemap URL)
import { execFileSync } from 'node:child_process';
import { ROOT, SRC, loadConfig, siteUrl, urlToFile, rel } from './lib.mjs';
import { buildSite } from './build.mjs';

const config = loadConfig();
const key = String(config.INDEXNOW_KEY || '').trim();
if (!/^[A-Za-z0-9-]{8,128}$/.test(key)) {
  console.log('No valid INDEXNOW_KEY in site.config.json, skipping.');
  process.exit(0);
}

const base = siteUrl(config);
const { indexable } = buildSite({ config });
const toUrl = (r) => base + (r === 'index.html' ? '' : r.endsWith('/index.html') ? r.slice(0, -'index.html'.length) : r);
const urls = indexable.map(toUrl);
const before = process.argv[2];
let changed = urls;
if (before && !/^0+$/.test(before)) {
  try {
    const diff = execFileSync('git', ['diff', '--name-only', before, 'HEAD', '--', 'src', 'site.config.json'], { cwd: ROOT, encoding: 'utf8' })
      .split('\n').filter(Boolean);
    // A change to the config, a shared partial, the styles or scripts touches every page.
    const shared = diff.some((f) => f === 'site.config.json' || /^src\/(_partials|css|js)\//.test(f));
    if (!shared) {
      const touched = new Set(diff.map((f) => f.replace(/^src\//, '')));
      const blogChanged = [...touched].some((f) => f.startsWith('blog/'));
      changed = urls.filter((u) => {
        const f = urlToFile(u, SRC, config);
        if (!f) return false;
        const r = rel(f);
        return touched.has(r) || (blogChanged && r === 'blog/index.html'); // a new post changes the blog index too
      });
    }
  } catch {
    changed = urls; // base commit not available (e.g. force push): submit everything
  }
}

if (!changed.length) {
  console.log('No sitemap pages changed, nothing to submit.');
  process.exit(0);
}

const body = { host: new URL(base).host, key, keyLocation: base + 'indexnow.txt', urlList: changed };
const res = await fetch('https://api.indexnow.org/indexnow', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
  body: JSON.stringify(body),
});
console.log(`IndexNow ${res.status} for ${changed.length} URL(s):\n${changed.join('\n')}`);
// 200/202 = accepted. 403/422 usually mean the key file is not live yet; not worth failing a deploy.
if (res.status >= 500) process.exit(1);
