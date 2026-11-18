#!/usr/bin/env node
// Builds the deployable site: src/ + site.config.json -> _site/.
// Usage: node tools/build.mjs [outDir=_site]
//
// What it does to text files (html, xml, txt, svg, webmanifest):
//   {{KEY}}                    value from site.config.json, the page's own @vars, or a computed value
//                              (escaped for where it lands: HTML, JSON-LD, XML). Empty/unknown keys are
//                              left as {{KEY}} so tools/check.mjs can report them.
//   <!-- @include name -->     contents of src/_partials/name.html (shared head, header, footer)
//   <!-- @if KEY --> ... <!-- @endif -->   kept only when KEY has a value (<!-- @if !KEY --> for the opposite);
//                              <!-- @if KEY=value --> / <!-- @if !KEY=value --> compare; blocks may be nested
//   <!-- @vars { json } -->    at the top of a page: values just for that page (blog posts use this)
//   <!-- @posts -->            list of blog posts (in blog/index.html, blog/feed.xml, llms.txt)
// Computed: ROOT (relative path to the site root; absolute on 404.html), PAGE_URL, SLUG, YEAR, HAS_POSTS.
// Also: sitemap.xml is generated from the indexable pages; files and folders starting with "_" are not
// deployed; blog/ is left out until the first post exists.
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT, SRC, OUT, loadConfig, read, rel, siteUrl, walk } from './lib.mjs';

const TEXT = /\.(html|xml|txt|svg|webmanifest|json|md)$/;
const esc = {
  html: (v) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
  json: (v) => JSON.stringify(v).slice(1, -1).replace(/</g, '\\u003c'),
  raw: (v) => v,
};
export const fill = (text, vars, mode) =>
  text.replace(/\{\{([A-Z0-9_]+)\}\}/g, (m, k) => (vars[k] === undefined || vars[k] === '' || vars[k] === false ? m : esc[mode](String(vars[k]))));

function fillFile(text, vars, r) {
  if (/\.(webmanifest|json)$/.test(r)) return fill(text, vars, 'json');
  if (/\.(txt|md)$/.test(r)) return fill(text, vars, 'raw');
  // html / xml / svg: JSON-LD blocks need JSON escaping, everything else markup escaping.
  const ld = text.replace(/(<script type="application\/ld\+json">)([\s\S]*?)(<\/script>)/gi, (_, a, b, c) => a + fill(b, vars, 'json') + c);
  return fill(ld, vars, 'html');
}

function directives(text, vars, partials, r) {
  text = text.replace(/[ \t]*<!-- @include ([\w-]+) -->/g, (_, name) => {
    if (!(name in partials)) throw new Error(`${r}: unknown partial "${name}" (no src/_partials/${name}.html)`);
    return partials[name];
  });
  // Innermost blocks first (a body may not contain another @if), repeated until none are left.
  const IF = /[ \t]*<!-- @if (!?)([A-Z0-9_]+)(?:=([\w.-]+))? -->\n?((?:(?!<!-- @if )[\s\S])*?)[ \t]*<!-- @endif -->\n?/g;
  for (let prev; prev !== text;) {
    prev = text;
    text = text.replace(IF, (_, not, key, eq, body) => {
      const hit = eq === undefined ? Boolean(vars[key]) : String(vars[key] ?? '') === eq;
      return hit !== Boolean(not) ? body : '';
    });
  }
  return text;
}

/** Config values with defaults applied (what pages see). */
export function siteVars(config) {
  const v = { ...config };
  if (v.ANALYTICS === 'none') v.ANALYTICS = '';
  if (v.ANALYTICS === 'plausible' && !v.ANALYTICS_ID && v.SITE_URL) {
    try { v.ANALYTICS_ID = new URL(v.SITE_URL).host; } catch { /* check.mjs reports a bad SITE_URL */ }
  }
  return v;
}

/** Split a page into its @vars block (if any) and the rest. */
function pageVars(text, r) {
  const m = text.match(/^\s*<!-- @vars\s*([\s\S]*?)-->\s*/);
  if (!m) return { vars: {}, body: text };
  try {
    return { vars: JSON.parse(m[1]), body: text.slice(m[0].length) };
  } catch (e) {
    throw new Error(`${r}: the @vars block is not valid JSON: ${e.message}`);
  }
}

const today = () => new Date().toISOString().slice(0, 10);
function lastCommitDate(file) {
  try {
    const opts = { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] };
    if (execFileSync('git', ['status', '--porcelain', '--', file], opts).trim()) return today();
    return execFileSync('git', ['log', '-1', '--format=%cs', '--', file], opts).trim() || today();
  } catch {
    return today();
  }
}

const postList = {
  'blog/index.html': (p) => `      <li><a href="${esc.html(p.slug)}.html">${esc.html(p.title)}</a><br><time datetime="${p.date}">${p.date}</time> · ${esc.html(p.description)}</li>`,
  'blog/feed.xml': (p) => `    <item>
      <title>${esc.html(p.title)}</title>
      <link>${p.url}</link>
      <guid>${p.url}</guid>
      <pubDate>${new Date(p.date + 'T09:00:00Z').toUTCString()}</pubDate>
      <description>${esc.html(p.description)}</description>
    </item>`,
  'llms.txt': (p) => `- [${p.title}](${p.url}): ${p.description}`,
};

/**
 * Build the site. preview: true makes 404.html use "/" instead of the live SITE_URL so it works on localhost.
 * Returns { out, pages: [relative html paths], posts: [{ file, slug, title, description, date, modified, url }] }.
 */
export function buildSite({ src = SRC, out = OUT, config = loadConfig(), preview = false } = {}) {
  const base = siteUrl(config);
  const files = walk(src).map((p) => ({ p, r: rel(p, src) }));
  const hidden = (r) => r.split('/').some((part) => part.startsWith('_'));

  const partials = {};
  for (const { p, r } of files) {
    const m = r.match(/^_partials\/([\w-]+)\.html$/);
    if (m) partials[m[1]] = read(p).replace(/\s+$/, '');
  }

  // Blog posts first: other pages list them.
  const posts = [];
  for (const { p, r } of files) {
    if (!/^blog\/[^/_][^/]*\.html$/.test(r) || r === 'blog/index.html') continue;
    const v = pageVars(read(p), r).vars;
    const slug = r.slice('blog/'.length, -'.html'.length);
    posts.push({ file: r, slug, title: v.POST_TITLE || '', description: v.POST_DESCRIPTION || '', date: v.DATE || '', modified: v.DATE_MODIFIED || v.DATE || '', url: `${base}blog/${slug}.html` });
  }
  posts.sort((a, b) => b.date.localeCompare(a.date) || a.slug.localeCompare(b.slug));

  rmSync(out, { recursive: true, force: true });
  const pages = [];
  for (const { p, r } of files) {
    if (hidden(r)) continue;
    if (r.startsWith('blog/') && !posts.length) continue; // no empty blog online
    if (r === 'sitemap.xml') continue; // generated below
    const target = join(out, r);
    mkdirSync(dirname(target), { recursive: true });
    if (!TEXT.test(r)) { cpSync(p, target); continue; }

    const { vars: own, body } = pageVars(read(p), r);
    const depth = r.split('/').length - 1;
    const vars = {
      ...siteVars(config),
      YEAR: String(new Date().getFullYear()),
      HAS_POSTS: posts.length > 0,
      ROOT: r === '404.html' ? (preview ? '/' : base) : depth ? '../'.repeat(depth) : './',
      PAGE_URL: base + (r === 'index.html' ? '' : r.endsWith('/index.html') ? r.slice(0, -'index.html'.length) : r),
      ...own,
    };
    if (r.startsWith('blog/') && r !== 'blog/index.html' && r.endsWith('.html')) {
      vars.SLUG = r.slice('blog/'.length, -'.html'.length);
      vars.DATE_MODIFIED ||= vars.DATE;
      vars.POST_IMAGE ||= config.SITE_URL ? `${base}og.png` : '';
    }

    let text = directives(body, vars, partials, r);
    if (postList[r]) text = text.replace(/[ \t]*<!-- @posts -->/g, posts.map(postList[r]).join('\n'));
    writeFileSync(target, fillFile(text, vars, r));
    if (r.endsWith('.html')) pages.push(r);
  }

  // Sitemap: every page that is not noindex, home first, <lastmod> from the page's last git commit.
  const indexable = pages.filter((r) => !/<meta\s+name="robots"\s+content="[^"]*noindex/i.test(read(join(out, r))));
  const order = (r) => (r === 'index.html' ? '0' : r.startsWith('blog/') ? '2' + r : '1' + r);
  indexable.sort((a, b) => order(a).localeCompare(order(b)));
  const urls = indexable.map((r) => {
    const loc = base + (r === 'index.html' ? '' : r.endsWith('/index.html') ? r.slice(0, -'index.html'.length) : r);
    return `  <url><loc>${esc.html(loc)}</loc><lastmod>${lastCommitDate(join(src, r))}</lastmod></url>`;
  });
  writeFileSync(join(out, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`);

  return { out, pages, posts, indexable };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { out, pages, posts } = buildSite({ out: resolve(process.argv[2] || OUT) });
    console.log(`Built ${out} (${pages.length} pages, ${posts.length} posts)`);
  } catch (e) {
    console.error(`Build failed: ${e.message}`);
    process.exit(1);
  }
}
