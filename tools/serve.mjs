#!/usr/bin/env node
// Local preview server with live reload. No dependencies.
// Usage: node tools/serve.mjs [port=4321]   (or PORT=... env)
// - Builds src/ + site.config.json into .preview/ (same build as the deploy) and serves that.
// - Serves folders as /path/ -> /path/index.html, like GitHub Pages.
// - Unknown paths get 404.html with status 404.
// - Saving anything under src/ or site.config.json rebuilds and reloads open pages
//   (the reload script is injected only here, never in the deployed site).
import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync, watch, readFileSync } from 'node:fs';
import { extname, join, normalize, sep } from 'node:path';
import { ROOT, SRC } from './lib.mjs';
import { buildSite } from './build.mjs';
import { buildEmails, emailNames, SAMPLE } from './emails.mjs';
import { renderEmail } from '../worker/render.js';
import { loadConfig } from './lib.mjs';

const port = Number(process.argv[2] || process.env.PORT || 4321);
const root = join(ROOT, '.preview');

function rebuild() {
  try {
    buildSite({ out: root, preview: true });
    return true;
  } catch (e) {
    console.error(`Build failed, still showing the last good version: ${e.message}`);
    return false;
  }
}
rebuild();

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.xml': 'application/xml; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.md': 'text/markdown; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.avif': 'image/avif', '.gif': 'image/gif', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff',
  '.pdf': 'application/pdf', '.mp4': 'video/mp4', '.webm': 'video/webm',
};

const RELOAD = `<script>(()=>{try{const e=new EventSource('/__reload');e.onmessage=()=>location.reload();}catch{}})();</script>`;
const clients = new Set();

function resolveFile(urlPath) {
  let p;
  try { p = decodeURIComponent(urlPath.split(/[?#]/)[0]); } catch { return null; }
  const file = normalize(join(root, p));
  if (file !== root && !file.startsWith(root + sep)) return null; // no ../ escapes
  if (existsSync(file) && statSync(file).isDirectory()) {
    if (!p.endsWith('/')) return { redirect: p + '/' };
    const index = join(file, 'index.html');
    return existsSync(index) ? { file: index } : null;
  }
  return existsSync(file) ? { file } : null;
}

function send(res, status, file) {
  const type = TYPES[extname(file).toLowerCase()] || 'application/octet-stream';
  const headers = { 'Content-Type': type, 'Cache-Control': 'no-store' };
  if (type.startsWith('text/html')) {
    const body = readFileSync(file, 'utf8');
    const html = body.includes('</body>') ? body.replace(/<\/body>(?![\s\S]*<\/body>)/, RELOAD + '</body>') : body + RELOAD;
    res.writeHead(status, headers).end(html);
  } else {
    res.writeHead(status, headers);
    createReadStream(file).pipe(res);
  }
}

const server = createServer((req, res) => {
  if (req.url === '/__reload') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
    res.write(': connected\n\n');
    clients.add(res);
    req.on('close', () => clients.delete(res));
    return;
  }
  // Email previews: /__emails/ lists them, /__emails/<name>.html and .txt render with sample values,
  // ?noname shows the version without a name.
  if ((req.url || '').startsWith('/__emails')) return emailPreview(req, res);
  const hit = resolveFile(req.url || '/');
  if (hit?.redirect) return res.writeHead(301, { Location: hit.redirect }).end();
  if (hit?.file) return send(res, 200, hit.file);
  const notFound = join(root, '404.html');
  if (existsSync(notFound)) return send(res, 404, notFound);
  res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
});

function emailPreview(req, res) {
  const url = new URL(req.url, 'http://localhost');
  let emails;
  try { emails = buildEmails(loadConfig()); } catch (e) { return res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' }).end(e.message); }
  const m = url.pathname.match(/^\/__emails\/([\w-]+)\.(html|txt)$/);
  if (!m) {
    const rows = emailNames().map((n) => `<li><b>${n}</b>: <a href="/__emails/${n}.html">HTML</a> · <a href="/__emails/${n}.html?noname">HTML without name</a> · <a href="/__emails/${n}.txt">text</a> — subject: <i>${renderEmail(emails[n], SAMPLE).subject.replace(/</g, '&lt;')}</i></li>`).join('');
    return res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }).end(`<!DOCTYPE html><html lang="en"><meta charset="utf-8"><title>Email previews</title><body style="font:16px/1.6 system-ui;margin:2rem"><h1>Email previews</h1><p>Sample values; templates in emails/, style guide in emails/STYLE.md.</p><ul>${rows}</ul>${RELOAD}`);
  }
  const email = emails[m[1]];
  if (!email) return res.writeHead(404, { 'Content-Type': 'text/plain' }).end('No such email');
  const out = renderEmail(email, url.searchParams.has('noname') ? { ...SAMPLE, name: '' } : SAMPLE);
  if (m[2] === 'txt') return res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }).end(`Subject: ${out.subject}\n\n${out.text}`);
  return res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }).end(out.html.replace('</body>', RELOAD + '</body>'));
}

let timer;
try {
  const changed = () => {
    clearTimeout(timer);
    timer = setTimeout(() => { if (rebuild()) for (const c of clients) c.write('data: reload\n\n'); }, 100);
  };
  watch(SRC, { recursive: true }, changed);
  try { watch(join(ROOT, 'emails'), changed); } catch { /* no emails folder */ }
  watch(ROOT, (_, name) => { if (name === 'site.config.json') changed(); });
} catch {
  console.warn('File watching unavailable; live reload is off.');
}

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') console.error(`Port ${port} is already in use. Stop the other server or run: node tools/serve.mjs <other port>`);
  else console.error(e.message);
  process.exit(1);
});
server.listen(port, () => console.log(`Serving ${SRC} (built into .preview/) at http://localhost:${port}/ (live reload on)`));
