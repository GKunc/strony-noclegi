// Fills the per-enquiry values into an email template. Shared by the worker, the preview and the checks.
//   {{name}}                 value (HTML-escaped in HTML emails)
//   {{#name}}…{{/name}}      kept when name has a value
//   {{^name}}…{{/name}}      kept when name is empty
export const RUNTIME_KEYS = ['name', 'email', 'message', 'date', 'page'];

const escapeHtml = (v) => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

export function renderTemplate(template, values, { html = false } = {}) {
  let out = template.replace(/\{\{([#^])([a-z]+)\}\}([\s\S]*?)\{\{\/\2\}\}/g, (_, kind, key, body) => (Boolean(values[key]) === (kind === '#') ? body : ''));
  out = out.replace(/\{\{([a-z]+)\}\}/g, (m, key) => (key in values ? (html ? escapeHtml(values[key] ?? '') : String(values[key] ?? '')) : m));
  return out;
}

/** { subject, html, text } for one email, ready to send. */
export function renderEmail(email, values) {
  return {
    subject: renderTemplate(email.subject, values).replace(/[\r\n]+/g, ' ').trim().slice(0, 200),
    html: renderTemplate(email.html, values, { html: true }),
    text: renderTemplate(email.text, values),
  };
}
