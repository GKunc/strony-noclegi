# Landing brief

Business facts for this page. Claude reads it before writing anything and never invents what is missing.

Short, reusable values (brand, colours, URL, title, headline, CTA, form endpoint, author, verification codes)
live in `site.config.json`, not here: the build puts them into every page. This file holds everything else.

## Identity
- LOGO: src/logo.svg (monogram TAO); favicon: src/favicon.svg (ze starej strony)
- Social profiles (become schema.org `sameAs`):
  -

## Hosting
- REPO_NAME: strony-noclegi
- REPO_OWNER: GKunc
- CUSTOM_DOMAIN: twojapartamentonline.pl

## Business
- What is offered: proste strony internetowe dla noclegów (apartamenty, domki, pensjonaty, pokoje, agroturystyki); szczegóły w src/index.html
- Target audience: mali właściciele obiektów noclegowych w całej Polsce (np. 2–5 apartamentów)
- Main problem solved: prowizje 15–20% Booking/Airbnb, brak danych gości i powracających gości bez pośrednika
- Unique selling points:
- Price / offer: Pakiet Start 2 000 zł netto, Plus 2 900 zł netto, Premium 4 900 zł netto; utrzymanie od 99 zł/mies. (FAQ i poradnik mówią 1 500 zł netto: niespójność do wyjaśnienia, patrz README)
- Location / service area: cała Polska. Kontakt: +48 782 312 090, biuro@twojapartamentonline.pl

## Proof (real only)
- Testimonials (quote, name, role, permission to publish):
  -
- Numbers / results (with source):
  -
- Client logos (with permission):
  -

## FAQ (real questions customers ask; becomes the FAQ section + FAQPage schema)
- Q:
  A:

## Author (for blog posts and E-E-A-T; name and URL go into site.config.json)
- AUTHOR_BIO: (one or two sentences on real expertise)

## Voice
- Tone:
- Words to use / avoid:

## SEO
- Primary keyword:
- Secondary keywords:
- Competitors / reference sites:

## Forms, analytics, compliance
- Contact form: external service: webhook n8n (FORM_ENDPOINT); maile wysyła n8n (src/templates/email-*.html). Nie wdrażać workera z szablonu.
- Who receives enquiries: (email address; FORM_NOTIFY_TO in site.config.json, empty = CONTACT_EMAIL)
- Reply promise for the autoreply: (e.g. "within one business day"; leave empty to promise no time)
- Named person to sign the autoreply: (optional)
- Analytics wanted: none (jak na starej stronie)
- AI_CRAWLERS: allow-all | search-only (search-only blocks model-training bots, keeps AI search)

## Facts Claude must not invent
- Brak danych firmy (nazwa prawna, adres, NIP). „Ponad 50 obiektów” i ocena 5/5 pochodzą ze starej strony, bez źródła. Brak opinii klientów.

## site.config.json cheat sheet
| Key | What to put |
| --- | --- |
| BRAND, BRAND_INITIAL | name; one letter for the generated favicon |
| THEME_COLOR | brand accent as 6-digit #hex |
| LANG, LOCALE | e.g. `pl` and `pl_PL` |
| LEGAL_ENTITY, CONTACT_EMAIL | who is responsible for the site (privacy policy) |
| SITE_URL | (auto, publish skill) https URL without trailing slash |
| INDEXNOW_KEY | (auto) `openssl rand -hex 16` |
| PAGE_TITLE | 30-60 chars incl. brand, primary keyword first |
| H1_HEADLINE, SUBHEADLINE, CTA_LABEL | hero copy and button label |
| META_DESCRIPTION | 120-155 chars, with a reason to click |
| LLMS_SUMMARY | 2-4 plain sentences: what the business is, for whom, where |
| BLOG_TITLE, BLOG_DESCRIPTION | needed from the first post on |
| AUTHOR_NAME, AUTHOR_URL | blog author (LinkedIn or about page) |
| FORM_ENDPOINT | (auto with the form worker: `node tools/form-worker.mjs deploy`) or the external form service URL |
| FORM_PROVIDER | who processes the form, for the privacy policy ("Cloudflare and Resend" with the worker) |
| EMAIL_FROM | sender of the autoreply; domain verified in Resend |
| FORM_NOTIFY_TO | who gets enquiries (empty = CONTACT_EMAIL) |
| TURNSTILE_SITE_KEY | Cloudflare Turnstile site key (anti-bot check, needed for the autoreply) |
| FORM_ACCESS_KEY | only for services that need a key in the form (e.g. Web3Forms) |
| ANALYTICS, ANALYTICS_ID | `none`, `plausible` (id = domain, may stay empty), `goatcounter` (site code), `cloudflare` (token), `ga4` (G-…) |
| PRIVACY_UPDATED | YYYY-MM-DD |
| GOOGLE_SITE_VERIFICATION, BING_SITE_VERIFICATION | filled after launch (`node tools/google.mjs verification-token`) |
