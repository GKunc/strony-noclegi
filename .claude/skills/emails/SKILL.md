---
name: emails
description: Write or change the contact form emails (the autoreply visitors get and the notification the business gets) in emails/, following emails/STYLE.md, preview them and put them live. Use when asked to change the autoreply, "odpowiedź automatyczna", the email look, sender, or who receives enquiries.
---

# emails

The emails are part of the site: `emails/autoreply.*` (to the visitor), `emails/notification.*` (to the business), `emails/_layout.html` (look shared by both). The rules are in `emails/STYLE.md`: read it fully before writing.

1. Read `brief/landing.md` (domain-knowledge skill) for the voice, the language and the promises you may make (reply time, next steps). Nothing that is not in the brief.
2. Edit the `.html` and the `.txt` together; they must say the same thing. Subject is the first line of the `.html` (`<!-- @subject … -->`). Placeholders and `{{#name}}` sections are listed in STYLE.md.
3. Look at them: start the `site` preview and open `/__emails/` (sample values; also check "without name" and the text version, at 375 px and in dark mode).
4. `node tools/verify.mjs` checks them (missing values, plain-text twin, no echo of visitor text in the autoreply, length, size). `node tools/test-worker.mjs` runs the form worker against fake email/anti-bot services.
5. Put them live: `node tools/form-worker.mjs deploy` (the templates are built into the worker; pushing the repo alone does not change the emails). Then, with the user's OK, `node tools/form-test.mjs --send` and ask them to confirm both emails arrived and look right.

Other changes:
- Sender address: `EMAIL_FROM` in `site.config.json` (its domain must be verified in Resend). Who gets enquiries: `FORM_NOTIFY_TO` (empty = `CONTACT_EMAIL`). Redeploy the worker after either.
- Look: it comes from the website's CSS (`src/css/styles.css`), so change colours there, not in the emails. Structure (brand line, footer) is in `emails/_layout.html`; write content with the plain tags from STYLE.md (`<p>`, `<a class="btn">`, `<div class="card">`), never typed colours.
