# Landing page template

Static landing page: plain HTML, CSS, JS, no npm dependencies. `tools/build.mjs` turns `src/` + `site.config.json` into `_site/`, which CI deploys to GitHub Pages.
One repo per landing page. Start with the `new-landing` skill; hosting is handled by the `publish` skill. A new computer, or tooling that misbehaves → `dev-setup` skill (`node tools/doctor.mjs`).

## How the site is put together
- `site.config.json`: every shared value (brand, URL, title, CTA, form endpoint, …). Change a value here, never by search-and-replace in pages. Pages use it as `{{KEY}}`.
- `src/_partials/head.html`, `header.html`, `footer.html`: shared by every page via `<!-- @include name -->`. Navigation, footer and analytics change in one place.
- `src/*.html`: the pages. Page copy (sections, FAQ, privacy text) is written directly in them.
- `src/blog/<slug>.html`: one file per post, copied from `_template.html`, with a `<!-- @vars {…} -->` block at the top. The blog index, RSS feed, `llms.txt` entries and `sitemap.xml` are generated; never edit them by hand for a post.
- Build syntax (full list at the top of `tools/build.mjs`): `{{KEY}}`, `<!-- @include x -->`, `<!-- @if KEY -->…<!-- @endif -->`, `<!-- @vars -->`, `<!-- @posts -->`; computed `{{ROOT}}` (path to the site root: use it for every link inside partials), `{{PAGE_URL}}`, `{{YEAR}}`, `HAS_POSTS`.
- Files and folders starting with `_` are not deployed. `blog/` goes online with the first post.
- `worker/form.js`: the contact form backend (Cloudflare Worker) that emails the business and sends the visitor an autoreply; `tools/form-worker.mjs` builds it with the templates from `emails/`.

## Rules
- All page source lives in `src/`. Keep it dependency-free. Repo tooling lives in `tools/` (Node, no npm deps).
- Read `brief/landing.md` (via the `domain-knowledge` skill) before writing any copy. Never invent facts, numbers, testimonials or legal details. Remove a section rather than ship filler.
- A `{{KEY}}` with no value fails the checks: set it in `site.config.json`, or remove the markup that uses it.
- Mobile-first, semantic HTML, one `<h1>`, accessible forms, no layout shift, works without JS.
- Relative links inside pages (the site may live under `/<repo>/`); `{{ROOT}}` in partials.
- The person using this is not technical: never ask them to open GitHub settings. Do hosting work with `gh`, Google work with `tools/google.mjs`.
- Analytics, the consent banner and the privacy texts are driven by ANALYTICS / ANALYTICS_ID in `site.config.json`; never paste tracking snippets into pages.
- No secrets in the repo (it is public): keys and tokens live outside it (`~/.config/landing-tools/`). `tools/secrets.mjs` blocks key files (.env, *.pem, service account JSON, .dev.vars) and tokens in any file: at commit, at push, in CI, and in Claude's own git commands.
- `node tools/form-test.mjs --send` sends real emails: ask before running it.
- Contact form emails live in `emails/` (rules: `emails/STYLE.md`, skill: `emails`). They reach visitors only after `node tools/form-worker.mjs deploy`; the autoreply must never repeat what the visitor typed.

## Guards (they run by themselves; do not bypass them)
- After every edit a hook rebuilds the site; a broken build comes back to you as an error.
- When you finish a turn with uncommitted site changes, a hook runs `node tools/verify.mjs --quick` and sends failures back to you. Fix them, or ask the user for the missing fact.
- Before any `git commit` / `git push` Claude runs, a hook scans for secrets (`tools/secrets.mjs`) and refuses `--no-verify`; if it blocks, tell the user and never commit the secret.
- git pre-commit / pre-push hooks and CI run the same checks (the secret scan always, even in the untouched template); CI (`node tools/verify.mjs --lighthouse`) is what gates the deploy; its Lighthouse step checks only the pages that changed since the last successful deploy, and 5 random ones of them when more than 5 changed (a shared file such as the menu or CSS) (Run workflow by hand checks all).

## Before calling anything done
1. `node tools/verify.mjs` passes (build, release checks, HTML validation, internal links; `--lighthouse` for the full CI set: Lighthouse on pages changed since `origin/main`, `--all` for every page).
2. Preview (`.claude/launch.json` → `site`) checked in the browser: console clean, 375px and desktop, light and dark.
3. After pushing: `gh run watch` succeeds and the live URL returns 200.
4. Changed `tools/`, the partials or the workflow in the template itself → `node tools/selftest.mjs` passes.

## History and template
- Commit messages are read by non-technical people (`node tools/history.mjs`, `undo` skill): say in plain words what changed on the site ("New FAQ question about delivery times"), not how.
- Never rewrite history (`reset --hard`, `push --force`, amending pushed commits). Undo = `node tools/history.mjs undo`.
- Files listed as `owned` in `template.json` belong to the template and are replaced by template updates (`maintenance` skill): do not edit them in a site repo.

## Skills (`.claude/skills/`)
dev-setup, new-landing, publish, domain-knowledge, seo, blog-post, emails, audit, undo, handoff, maintenance, webmcp
