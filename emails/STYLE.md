# Email style guide

Two emails are sent when someone submits the contact form. Both live in this folder and are part of the site:

| File | Sent to | When |
| --- | --- | --- |
| `autoreply.html` + `autoreply.txt` | the visitor | right after they send the form (only if the anti-bot check passed) |
| `notification.html` + `notification.txt` | the business (`FORM_NOTIFY_TO`, else `CONTACT_EMAIL`) | every enquiry; "Reply" goes straight to the visitor |

`_layout.html` wraps every HTML email (brand line, content, footer), styled like the website. The words go in the email files.
Preview: start the `site` preview and open `/__emails/`. Changes go live with `node tools/form-worker.mjs deploy`.

## Voice
- Follow the **Voice** section of `brief/landing.md` (tone, words to use and avoid). Same language as the site (`LANG`).
- Sound like a person at the business, not a system: "Thanks for getting in touch", not "Your submission has been received".
- Short. The autoreply is 40-120 words; nobody reads more after filling in a form.

## Autoreply: structure
1. Greeting with the first name if we have it (`{{#name}}…{{/name}}`), a neutral greeting otherwise (`{{^name}}…{{/name}}`).
2. One sentence confirming the message arrived.
3. What happens next and when. **Only promises from the brief** (e.g. "we reply within one business day" only if the brief says so). No brief fact → say "we will get back to you" without a time.
4. At most one button or link (by default "Visit our website"; a blog post or the offer page also works).
5. Sign-off with the brand name (or a named person if the brief names one).

## Autoreply: never
- Never repeat what the visitor typed except the first name. The autoreply goes to whatever address was entered, so echoing the message would let anyone send our branded email with their text to a stranger. `tools/check.mjs` fails if `{{message}}` or `{{email}}` appears in the autoreply.
- No marketing, discounts or newsletter sign-ups (it is a transactional email; adding marketing needs consent).
- No attachments, no tracking pixels, no images except the logo.
- No invented facts, prices or deadlines.

## Notification (to the business)
- Subject starts with the brand so it is easy to filter: "New enquiry: {{name}}" style.
- Shows name, email, the message as written, the date and the page it came from. Hitting Reply answers the visitor.

## Look: the same as the website
The emails take their look from the website, so they never drift apart:
- Colours, font and corner radius are read from `src/css/styles.css` (`--bg`, `--text`, `--muted`, `--accent`, `--accent-text`, `--card`, `--radius`, the `body` font, and the dark-mode values). Change the site's CSS and the emails follow at the next worker deploy.
- `_layout.html` mirrors the page: brand name top left like the site header, content on the page background, footer "© year brand · Privacy" like the site footer.
- Write the emails with plain tags; the build gives them the site's styles (email apps ignore stylesheets, so they are inlined):

| Write | Looks like on the site |
| --- | --- |
| `<p>` | body text |
| `<h2>` | a section heading |
| `<a href="…">` | a link in the accent colour |
| `<a class="btn" href="…">` | the site's button (`.btn`) |
| `<div class="card">` | a card block (`.card`, e.g. the quoted message) |
| `<table>` with `<td class="label">` | label/value rows, labels in the muted colour |

- Never type a colour (`#…`, `rgb(…)`) into a template: `tools/check.mjs` rejects it. In `_layout.html` use the tokens `{{STYLE_BG}}`, `{{STYLE_TEXT}}`, `{{STYLE_MUTED}}`, `{{STYLE_ACCENT}}`, `{{STYLE_ACCENT_TEXT}}`, `{{STYLE_CARD}}`, `{{STYLE_RADIUS}}`, `{{STYLE_FONT}}` and `{{DARK_…}}` for dark mode.
- Dark mode follows the site's dark colours in email apps that support it (Apple Mail, iOS, Outlook.com); others show the light version.
- Text at least 16 px; the site's colour pairs already meet 4.5:1 contrast. Every link or button is also written out in the text version.
- Every HTML email has a plain-text twin with the same content (`.txt`): some people and spam filters read only that.
- Keep each HTML email under 100 KB (Gmail cuts longer ones).

## Placeholders
- From `site.config.json` (filled when the worker is built): `{{BRAND}}`, `{{SITE_URL}}`, `{{CONTACT_EMAIL}}`, `{{LEGAL_ENTITY}}`, `{{THEME_COLOR}}`, `{{LANG}}`, any other config key.
- Per enquiry (filled when sending): `{{name}}`, `{{email}}`, `{{message}}`, `{{date}}`, `{{page}}`.
- Sections: `{{#name}}shown when there is a name{{/name}}`, `{{^name}}shown when there is none{{/name}}`.
- First line of each `.html` email: `<!-- @subject … -->`, the subject line (placeholders allowed).
