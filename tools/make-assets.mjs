#!/usr/bin/env node
// Generates og.png (1200x630), apple-touch-icon.png (180), icon-192.png, icon-512.png into src/
// from the favicon and BRAND, H1_HEADLINE, THEME_COLOR in site.config.json.
// Needs a local Chrome/Chromium (set CHROME=/path/to/chrome to override).
// Usage: node tools/make-assets.mjs
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, SRC, OUT, loadConfig } from './lib.mjs';
import { buildSite } from './build.mjs';

const dir = SRC;
const config = loadConfig();
const { BRAND: brand, H1_HEADLINE: headline, THEME_COLOR: color } = config;
if (!brand || !headline || !/^#[0-9a-fA-F]{6}$/.test(color || '')) {
  console.error('Set BRAND, H1_HEADLINE and THEME_COLOR (#hex) in site.config.json first.');
  process.exit(1);
}
buildSite({ config }); // the favicon in src/ may contain {{placeholders}}; use the built one

const candidates = [
  process.env.CHROME,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
].filter(Boolean);
const chrome = candidates.find((c) => existsSync(c));
if (!chrome) { console.error('Chrome not found; set CHROME=/path/to/chrome'); process.exit(1); }

const page = pathToFileURL(join(ROOT, 'tools/assets.html')).href;
const svg = pathToFileURL(join(OUT, 'favicon.svg')).href;
const shots = [
  { file: 'og.png', w: 1200, h: 630, q: { type: 'og', brand, headline, color, svg } },
  { file: 'apple-touch-icon.png', w: 180, h: 180, q: { type: 'icon', size: 180, color, svg } },
  { file: 'icon-192.png', w: 192, h: 192, q: { type: 'icon', size: 192, color, svg } },
  { file: 'icon-512.png', w: 512, h: 512, q: { type: 'icon', size: 512, color, svg } },
];
for (const s of shots) {
  const out = join(dir, s.file);
  execFileSync(chrome, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
    '--allow-file-access-from-files', '--virtual-time-budget=2000',
    `--window-size=${s.w},${s.h}`, `--screenshot=${out}`,
    `${page}?${new URLSearchParams(s.q)}`,
  ], { stdio: 'ignore' });
  console.log(`wrote ${out}`);
}
