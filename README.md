# TwojApartamentOnline.pl

Strona ofertowa TwojApartamentOnline.pl (strony internetowe dla właścicieli noclegów), przeniesiona z ręcznie pisanego HTML
(repo `GKunc/strony-noclegi`, gałąź `master`) na szablon `landing-template`. Prace leżą na gałęzi **`szablon`**; `master` nadal
zawiera starą stronę, która jest teraz online. Niczego jeszcze nie wypchnięto ani nie wdrożono.

## Uruchomienie lokalnie
```bash
node tools/serve.mjs 4397     # podgląd z odświeżaniem na http://localhost:4397 (port też w .claude/launch.json)
node tools/verify.mjs         # build + kontrole publikacji + walidacja HTML + linki (to samo co CI)
```
Build: `node tools/build.mjs` (z `src/` + `site.config.json` do `_site/`). Wymagany Node 22+, bez npm.

## Co gdzie jest
| Co | Gdzie |
| --- | --- |
| Wspólne dane (marka, tytuł, opis, adres formularza) | `site.config.json` |
| Nagłówek, stopka (z banerem cookies), `<head>` | `src/_partials/` |
| Strona główna (sekcje, cennik, FAQ, formularz) | `src/index.html` |
| Poradniki | `src/blog/<adres>.html` (lista `blog/`, RSS, sitemap i llms.txt generują się same) |
| Polityka prywatności, wzór umowy | `src/privacy.html`, `src/wzor-umowy.html` |
| Wygląd 1:1 ze starej strony | `src/css/styles.css` (sekcje stron zawężone klasą `<body class="page-…">`) |
| Motyw jasny/ciemny, cookies, menu, formularz z antyspamem | `src/js/theme.js`, `src/js/site.js`, `src/js/wzor-umowy.js` (eksport PDF) |
| Szablony maili dla n8n (bez zmian treści) | `src/templates/email-*.html` (publikowane pod tym samym adresem co dotąd) |

Treść wszystkich stron jest przeniesiona słowo w słowo (sprawdzone automatycznie: ta sama liczba i kolejność słów w `<main>`),
wygląd jest taki sam (porównane zrzuty przy 375 px i 1280 px). Strona nie ma zdjęć: ikony to emoji, grafiki to SVG (`favicon.svg`,
`logo.svg`, `og-image.svg`); `og.png` to wyrenderowana stara `og-image.svg` (SVG nie działa jako podgląd w social media).

## Formularz kontaktowy
Formularz działa jak dotąd: walidacja i zabezpieczenia antyspamowe ze starej strony (`src/js/site.js`), wysyłka do webhooka n8n
(`FORM_ENDPOINT` w `site.config.json`; dawniej ukryty w base64, teraz jawnie w `action`, bo wymagają tego kontrole szablonu).
Maile wysyła n8n, nie worker z szablonu, więc `emails/` i `worker/` nie są używane (`node tools/form-worker.mjs` nie uruchamiać).
Formularza nie testowano prawdziwą wysyłką (to wysłałoby zapytanie do n8n).

## Rezerwacje
Strona TwojApartamentOnline.pl nie ma kalendarza ani silnika rezerwacji (to strona agencji, nie obiektu), więc nie było czego
przenosić. Moduł rezerwacji występuje tylko jako punkt oferty w Pakiecie Premium. Widget Smoobu będzie potrzebny na stronach
klientów (obiektów), nie tutaj.

## Adresy i przekierowania (SEO)
Wszystkie zaindeksowane adresy zostają bez zmian (`/`, `/blog/<adres>.html` ×4, `/wzor-umowy.html`, `/templates/email-*.html`), poza jednym:

| Stary adres | Nowy adres | Jak |
| --- | --- | --- |
| `/polityka-prywatnosci.html` | `/privacy.html` | `src/polityka-prywatnosci.html`: natychmiastowe odświeżenie + canonical (GitHub Pages nie robi 301) |

Nowe adresy: `/blog/` (lista poradników), `/thanks.html` i `/404.html` (noindex), `/llms.txt`, `/blog/feed.xml`, `/og.png`, ikony.
Tytuły, opisy, Open Graph, dane strukturalne (Service, FAQ, BlogPosting, Breadcrumb) przeniesione. Zmiany wymuszone kontrolami szablonu
(limit 160 znaków opisu):
- strona główna, opis: „…Więcej rezerwacji bez prowizji Booking.” (było 203 znaki, końcówka o pośrednikach skrócona),
- `ile-kosztuje-strona-dla-noclegu`: opis skrócony do 147 znaków,
- `jak-opisac-nocleg-na-stronie`: opis bez słowa „Konkretne” (było 162 znaki),
- FAQ w danych strukturalnych ma teraz pełne odpowiedzi widoczne na stronie (wcześniej krótsze wersje).
Tytuły dłuższe niż 60 znaków zostawiono bez zmian (kontrola tylko ostrzega).

## Wdrożenie (do zrobienia za zgodą właściciela)
Obecnie GitHub Pages działa w trybie „legacy”: serwuje pliki prosto z `master`. Ten projekt potrzebuje trybu GitHub Actions
i gałęzi `main` (workflow `.github/workflows/pages.yml` publikuje tylko z `main`). Kolejność:
1. `git push -u origin szablon` i PR → CI (`verify.mjs --lighthouse`) sprawdzi stronę bez publikacji.
2. Zmienić domyślną gałąź na `main` (np. `gh api -X POST repos/GKunc/strony-noclegi/branches/master/rename -f new_name=main`)
   albo dopisać `master` do `on.push.branches` w workflow.
3. Przełączyć Pages na Actions: `gh api -X PUT repos/GKunc/strony-noclegi/pages -f build_type=workflow` (domena `twojapartamentonline.pl` zostaje).
4. Scalić PR → `gh run watch` → sprawdzić, że https://twojapartamentonline.pl zwraca 200.
Plik `CNAME` w katalogu głównym jest pozostałością po trybie legacy (w trybie Actions domenę trzyma ustawienie Pages).

## Kwestie do decyzji właściciela
- **Model cenowy.** Strona mówi „jednorazowo, bez abonamentu” i ma ceny jednorazowe; plan to sprzedaż w abonamencie. Treść przeniesiono 1:1, bez zmian.
- **Niespójna cena.** FAQ, poradnik „Ile kosztuje…” i dane strukturalne (`Offer.price` 1500) podają 1 500 zł netto, a cennik 2 000 / 2 900 / 4 900 zł netto.
- **„Zaufali nam właściciele ponad 50 obiektów”** i gwiazdki 5/5: przeniesione 1:1; warto potwierdzić, że to aktualne fakty.
- **Administrator danych** w polityce prywatności to „TwojApartamentOnline.pl”, bez firmy, adresu i NIP-u. Warto uzupełnić (`LEGAL_ENTITY` + `src/privacy.html`).
- **Ikona strony** (`favicon.svg`) ma w opisie starą nazwę „StronaNoclegi.pl” (niewidoczne dla gości); `logo.svg` (monogram TAO) nie jest nigdzie używane.
- **Analityka**: brak (jak dotąd). Po włączeniu `ANALYTICS` trzeba ręcznie poprawić punkt 7 polityki prywatności (tekst jest ręczny, nie z szablonu).
- **Wspólne pliki szablonu**: strona nie ładuje `src/js/main.js` z szablonu (zastępuje go `site.js`). Przy aktualizacji z szablonu sprawdzić, czy nowe funkcje (np. przełącznik motywu) nie dublują się z `theme.js`. Ta sekcja README też zostanie nadpisana przy aktualizacji szablonu: przenieść ją wtedy do osobnego pliku.

---

# Landing page template

Static landing pages (plain HTML, CSS, JS) built and maintained with Claude Code, optimized for Google and AI assistants (ChatGPT, Perplexity, Claude, AI Overviews), hosted on GitHub Pages. One repo per page.

## Make a new page
1. Fill in `brief/landing.md` (business facts, FAQ, repo name) and `site.config.json` (brand, colour, title, headline, CTA, form endpoint; cheat sheet at the end of the brief).
2. Open this repo in Claude Code and say: **"set up the landing"**.

Claude creates the page repo from this template, switches on hosting, fills the page, generates the social image and icons, runs every check, deploys, sets up Search Console and analytics, and gives you the live URL. You only provide business facts and, when asked, sign in to GitHub (`gh auth login`) and add DNS records for a custom domain. Google set-up is automatic after a one-time service account set-up (publish skill).

## Day to day
- new computer / "the preview doesn't work" → `dev-setup` skill (installs tools, git hooks, live-reload preview)
- "write a blog post about …" → `blog-post` skill
- "check SEO" / "why don't we show up in ChatGPT?" → `seo` skill
- "is the site OK?" → `audit` skill (the live site is also checked every Monday; problems open a GitHub issue)
- "undo the last change" → `undo` skill
- "hand the site over to the client" → `handoff` skill
- "update all client sites" (in the template repo) → `maintenance` skill
- "put it on example.com" → `publish` skill

## What's inside
| Path | Purpose |
| --- | --- |
| `site.config.json` | Every shared value (brand, URL, title, CTA, form endpoint…); pages use them as `{{KEY}}` |
| `src/` | Page sources: home, blog, privacy, 404, robots.txt, llms.txt, RSS feed, manifest, icons |
| `src/_partials/` | Head, header and footer shared by every page |
| `brief/landing.md` | Business facts; Claude never invents beyond it |
| `tools/build.mjs` | Builds `_site/`: fills values, includes partials, generates the sitemap, blog index, feed and llms.txt entries |
| `tools/serve.mjs` | Local preview with live reload (the `site` preview) |
| `tools/verify.mjs` | The command that gates every deploy, locally and in CI (`--quick` offline; `--lighthouse` adds Lighthouse on the pages changed since `origin/main`, `--lighthouse --all` on every page) |
| `tools/hook.mjs` | Claude Code hooks: rebuild after each edit, verify before Claude finishes |
| `tools/selftest.mjs` | Tests the template itself on a fixture site (`tools/fixture/`) |
| `tools/google.mjs` | Search Console (verify, owners, sitemap) and GA4 (property + stream) through Google's APIs |
| `emails/` | Autoreply and notification emails (HTML + text), shared layout, `STYLE.md` style guide; preview at `/__emails/` |
| `worker/form.js` | Contact form backend (Cloudflare Worker + Resend): notification to the business, autoreply to the visitor, Turnstile anti-bot |
| `tools/form-worker.mjs` | Builds the worker with the email templates, deploys it, sets its secrets |
| `tools/test-worker.mjs` | Tests the worker locally against fake email/anti-bot services |
| `tools/form-test.mjs` | Sends a real test enquiry (`--send`): notification + autoreply |
| `tools/monitor.mjs` | Checks the live site; weekly in CI (`.github/workflows/monitor.yml`), problems open a GitHub issue |
| `tools/history.mjs` | Site changes in plain words; `undo <n>` reverses one |
| `template.json`, `tools/template-update.mjs` | Which files belong to the template; brings a site up to date with it (`.template-version`) |
| `tools/fleet.mjs` | From the template repo: status of every client site, roll template updates out |
| `GUIDE.md` | Short guide for the client, translated at handoff |
| `src/js/consent.js` | GA4 behind a cookie banner (Consent Mode v2; nothing loads before "Accept") |
| `tools/doctor.mjs` | Checks this computer is ready to develop; `--fix` sets up hooks and the preview |
| `.githooks/` | pre-commit: release checks; pre-push: `verify.mjs --quick` |
| `tools/check.mjs` | Release checks (missing values, filler copy, meta, unique titles, JSON-LD, FAQ schema, blog posts) |
| `tools/make-assets.mjs` | Generates `og.png` and app icons from the brand (needs local Chrome) |
| `tools/indexnow.mjs` | Notifies Bing/IndexNow of changed URLs after each deploy |
| `.github/workflows/pages.yml` | On PRs and pushes to `main`: `verify.mjs --lighthouse`, where Lighthouse checks only the pages whose built output changed since the last successful deploy (more than 5 → 5 random ones; none → skipped; `lighthouserc.json` changed, first deploy or Run workflow by hand → every page). On `main` then → deploy → smoke test → IndexNow. In the template repo: `selftest.mjs` |
| `.github/dependabot.yml` | Keeps the workflow's actions up to date |
| `lighthouserc.json` | Lighthouse budgets: performance ≥ 0.9; accessibility, best practices, SEO ≥ 0.95; CLS ≤ 0.1 |
| `.claude/skills/` | dev-setup, new-landing, publish, domain-knowledge, seo, blog-post, emails, audit, undo, handoff, maintenance, webmcp |
| `.claude/launch.json` | Local preview server (`node tools/serve.mjs 4321`, live reload) |
| `.mcp.json` | Chrome DevTools MCP for checking pages while developing |

Requirements on the machine running Claude Code: Node 22+, git, Chrome and the GitHub CLI. Say "set up my environment" and the `dev-setup` skill installs and checks them.

## Maintaining this template
- Mark this repo as a template once: `gh repo edit --template`. CI and deploy are skipped in the template repo itself (it is all `{{placeholders}}`) and run in every repo created from it.
- To test template changes run `node tools/selftest.mjs` (`--lighthouse` for the full set). It fills a copy of the repo from `tools/fixture/`, adds a blog post and runs the real tools; CI does the same in the template repo.
