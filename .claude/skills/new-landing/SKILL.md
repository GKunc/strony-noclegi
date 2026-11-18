---
name: new-landing
description: Turn this template into a finished, published landing page from brief/landing.md. Use when starting a new page or when the user says "set up the landing".
---

# new-landing

The person using this does not need to know about GitHub Pages, Actions or DNS. Ask only for business facts; handle hosting yourself via the `publish` skill.

0. **Machine.** Run `node tools/doctor.mjs --fix`. Any ✘ → run the `dev-setup` skill first.
1. **Brief.** Read `brief/landing.md` (domain-knowledge skill) and `site.config.json`. Required before going on: the business sections of the brief, REPO_NAME, primary keyword, and in the config BRAND, THEME_COLOR, LANG, LOCALE, LEGAL_ENTITY, CONTACT_EMAIL, PAGE_TITLE, H1_HEADLINE, META_DESCRIPTION, CTA_LABEL, FORM_ENDPOINT. Ask for missing ones in one message; never guess.
2. **Repo and URL first.** Run `publish` steps 1-3 so the repo exists, Pages is enabled and the real SITE_URL is known (no trailing slash). Write SITE_URL and a fresh `INDEXNOW_KEY` (`openssl rand -hex 16`) into `site.config.json`, and the template commit the site starts from into `.template-version` (`gh api repos/<template repo from template.json>/commits/main --jq .sha > .template-version`; template updates need it).
3. **Fill `site.config.json`** (cheat sheet at the end of the brief). Do not replace `{{KEY}}` in the pages: the build does that on every run, and `node tools/check.mjs` lists every value still missing. Derived values:
   - BRAND_INITIAL from the brand; PRIVACY_UPDATED = today (YYYY-MM-DD).
   - BLOG_TITLE, BLOG_DESCRIPTION, AUTHOR_NAME, AUTHOR_URL are only needed once there is a first post.
4. **Copy.** Rewrite benefits, proof and FAQ from the brief (domain-knowledge skill).
   - No real testimonial → delete the whole `#proof` section and its nav link (the nav is in `src/_partials/header.html`). No FAQ → delete `#faq`, its nav link and the FAQPage JSON-LD block. Never ship filler; `tools/check.mjs` fails on it.
   - FAQ: each `<summary>` must equal a Question `name` in the FAQPage JSON-LD, answers identical.
   - Answer-first copy: the first paragraph under the H1 should say plainly what BRAND is, for whom and where (AI assistants quote this).
   - If LANG is not `en`, translate UI strings too: nav and skip link (`src/_partials/header.html`), footer and cookie banner (`src/_partials/footer.html`), form labels, `data-msg-*`, section headings, 404, thanks and privacy pages, and the emails in `emails/`.
5. **Schema.** Fill `sameAs` with social profile URLs. Add a `Service`, `Product` or `LocalBusiness` node to the `@graph` when the brief supports it (address/area only from the brief).
6. **Brand.** Set `--accent` / `--accent-text` in `src/css/styles.css` (and the dark-mode pair; both must keep 4.5:1 contrast). Replace `favicon.svg` with the logo mark if LOGO is given. Then run `node tools/make-assets.mjs` to create `og.png`, `apple-touch-icon.png`, `icon-192.png`, `icon-512.png`, and look at `og.png`.
7. **Analytics and form.**
   - Analytics: set ANALYTICS (`none`, `plausible`, `goatcounter`, `cloudflare`, `ga4`) and ANALYTICS_ID in `site.config.json`; the snippet, the privacy text and, for GA4, the consent banner follow by themselves. Prefer the cookie-free tools. For GA4 with the Google service account set up: `node tools/google.mjs analytics --account <id>` creates the property and fills both values.
   - Form: the default is the form worker with an autoreply (`publish` step 5b). Write the autoreply and the notification in the site's language from the brief with the `emails` skill (`emails/STYLE.md`). Only if the brief asks for an external form service instead: FORM_ENDPOINT from it (Formspree: `https://formspree.io/f/<id>`; key-in-form services such as Web3Forms: FORM_ACCESS_KEY); then there is no autoreply. Successful sends fire a `generate_lead` event in the analytics tool.
   - After the first deploy, ask the user before running `node tools/form-test.mjs --send` (it sends real emails); confirm they arrived.
8. **AI crawlers.** If AI_CRAWLERS is `search-only`, change the training-bot group in `src/robots.txt` to `Disallow: /`. Never block OAI-SearchBot, ChatGPT-User, PerplexityBot or Claude-SearchBot.
9. **llms.txt.** Make it a faithful plain-language summary: LLMS_SUMMARY, key offer facts, links.
10. **Verify.** `node tools/verify.mjs` must pass (release checks, build, HTML validation, internal links). Start the `site` preview (`.claude/launch.json`) and check with Chrome DevTools MCP: no console errors, layout at 375px and 1280px, light and dark mode, keyboard focus visible, form submits to the endpoint. Run the `seo` skill.
11. **Publish.** Run `publish` steps 4+ (commit, push, watch the deploy, confirm the live URL). Give the user the live URL and the open items (e.g. Search Console codes).
