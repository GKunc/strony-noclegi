// Email templates (emails/) + site.config.json -> ready-to-send templates with only the
// per-enquiry values ({{name}}, {{email}}, …) left. Used by the form worker build, the preview and the checks.
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, SRC, read } from './lib.mjs';
import { fill, siteVars } from './build.mjs';

export const EMAIL_DIR = join(ROOT, 'emails');

/**
 * The site's look, read from src/css/styles.css, so the emails always match the page:
 * {{STYLE_BG}}, {{STYLE_TEXT}}, {{STYLE_MUTED}}, {{STYLE_ACCENT}}, {{STYLE_ACCENT_TEXT}}, {{STYLE_CARD}},
 * {{STYLE_RADIUS}}, {{STYLE_FONT}} and the dark-mode set {{DARK_BG}}, {{DARK_TEXT}}, … .
 */
export function styleTokens(css = read(join(SRC, 'css/styles.css'))) {
  const vars = (block) => Object.fromEntries([...(block || '').matchAll(/--([\w-]+)\s*:\s*([^;}]+)/g)].map(([, k, v]) => [k, v.trim()]));
  const light = vars(css.match(/(?:^|\n):root\s*\{([^}]*)\}/)?.[1]);
  const dark = { ...light, ...vars(css.match(/@media\s*\(prefers-color-scheme:\s*dark\)\s*\{\s*:root\s*\{([^}]*)\}/)?.[1]) };
  const font = (css.match(/\bbody\s*\{[^}]*?font\s*:\s*[^;]*?\d(?:px|rem|em)(?:\/[\d.]+)?\s+([^;}]+)/)?.[1] || 'system-ui, sans-serif').trim().replace(/"/g, "'");
  const out = { STYLE_FONT: font };
  const names = { bg: 'BG', text: 'TEXT', muted: 'MUTED', accent: 'ACCENT', 'accent-text': 'ACCENT_TEXT', card: 'CARD', radius: 'RADIUS' };
  for (const [css, key] of Object.entries(names)) {
    if (light[css]) out[`STYLE_${key}`] = light[css];
    if (dark[css]) out[`DARK_${key}`] = dark[css];
  }
  return out;
}

/** Names of the emails (autoreply, notification, …): every emails/<name>.html that does not start with "_". */
export const emailNames = () => (existsSync(EMAIL_DIR) ? readdirSync(EMAIL_DIR).filter((f) => /^[a-z][\w-]*\.html$/.test(f)).map((f) => f.slice(0, -5)) : []);

/**
 * Gives the simple tags in an email body the website's look, as inline styles (email apps ignore
 * stylesheets). Write emails with these; anything already carrying a style="" is left alone.
 *   <p>  <h2>  <a>  <a class="btn">  <div class="card">  <table>  <td class="label">
 */
export function inlineStyles(html) {
  const S = {
    p: 'margin:0 0 16px;',
    h2: 'margin:0 0 12px;font-size:22px;line-height:1.3;font-weight:700;',
    a: 'color:{{STYLE_ACCENT}};',
    btn: 'display:inline-block;background:{{STYLE_ACCENT}};color:{{STYLE_ACCENT_TEXT}};padding:13px 22px;border-radius:{{STYLE_RADIUS}};font-weight:600;text-decoration:none;',
    card: 'margin:0 0 16px;padding:20px;background:{{STYLE_CARD}};border-radius:{{STYLE_RADIUS}};white-space:pre-wrap;',
    table: 'margin:0 0 16px;font:inherit;color:inherit;',
    td: 'padding:2px 16px 2px 0;vertical-align:top;',
    label: 'padding:2px 16px 2px 0;vertical-align:top;color:{{STYLE_MUTED}};',
  };
  const add = (tag, attrs, style, cls) => {
    if (/\sstyle=/.test(attrs)) return `<${tag}${attrs}>`;
    const rest = attrs.replace(/\sclass="[^"]*"/, '');
    return `<${tag}${cls ? ` class="${cls}"` : ''}${rest} style="${style}">`;
  };
  return html
    .replace(/<a((?:\s[^>]*)?)>/g, (m, at) => (/\sclass="btn"/.test(at) ? add('a', at, S.btn, 'e-btn') : add('a', at, S.a, 'e-link')))
    .replace(/<div((?:\s[^>]*)?)>/g, (m, at) => (/\sclass="card"/.test(at) ? add('div', at, S.card, 'e-card') : m))
    .replace(/<td((?:\s[^>]*)?)>/g, (m, at) => (/\sclass="label"/.test(at) ? add('td', at, S.label, 'e-muted') : add('td', at, S.td)))
    .replace(/<(p|h2|table)((?:\s[^>]*)?)>/g, (m, tag, at) => add(tag, at, S[tag]));
}

export function buildEmails(config) {
  const vars = { ...siteVars(config), ...styleTokens(), YEAR: String(new Date().getFullYear()) };
  try { vars.SITE_HOST = new URL(config.SITE_URL).host; } catch { /* reported by check.mjs */ }
  const layout = read(join(EMAIL_DIR, '_layout.html'));
  const out = {};
  for (const name of emailNames()) {
    const source = read(join(EMAIL_DIR, `${name}.html`));
    const subject = source.match(/^\s*<!-- @subject ([\s\S]*?) -->/)?.[1]?.trim() || '';
    const body = source.replace(/^\s*<!-- @subject [\s\S]*? -->\n?/, '');
    const textFile = join(EMAIL_DIR, `${name}.txt`);
    out[name] = {
      subject: fill(subject, vars, 'raw'),
      html: fill(layout.replace('<!-- @content -->', inlineStyles(body.trimEnd())).replace('{{SUBJECT}}', subject), vars, 'html'),
      text: existsSync(textFile) ? fill(read(textFile), vars, 'raw') : '',
    };
  }
  return out;
}

/** Example values for previews and tests. */
export const SAMPLE = {
  name: 'Anna',
  email: 'anna@example.com',
  message: 'Hello,\nI would like a quote for 20 plants in our office.\nThanks!',
  date: '2026-01-02 09:30 UTC',
  page: 'https://example.com/',
};
