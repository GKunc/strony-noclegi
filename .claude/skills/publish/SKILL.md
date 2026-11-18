---
name: publish
description: Create the GitHub repo, switch on hosting (GitHub Pages), set a custom domain, deploy and confirm the site is live, then hook up Google Search Console and Bing. Use when the user wants the page online, a new domain, or asks "is it live?".
---

# publish

Hosting is GitHub Pages deployed by `.github/workflows/pages.yml`. The user should never have to open GitHub settings: do everything with the `gh` CLI and only ask them for things that need their own accounts (GitHub sign-in, DNS, Google/Bing).

## 0. Prerequisites
- `gh auth status` must succeed. If `gh` is missing: `brew install gh`. If not signed in, ask the user to run `gh auth login` themselves (it is their sign-in; never handle their token).
- Read REPO_OWNER, REPO_NAME, CUSTOM_DOMAIN from `brief/landing.md`.

## 1. Repo
- Check where you are: `gh repo view --json nameWithOwner,isTemplate,visibility`.
- If this is the template repo itself (`isTemplate: true`), do not publish it. Create the page repo from it, then continue in the new clone:
  `gh repo create OWNER/NAME --template <template owner>/<template name> --public --clone` (run it from the parent folder).
- If there is no remote yet: `gh repo create OWNER/NAME --public --source . --push`.
- Public is the default: GitHub Pages on a private repo requires a paid GitHub plan, and the site itself is public anyway. Only use `--private` if the user confirms they have GitHub Pro/Team/Enterprise.

## 2. Turn on Pages (deploys from the workflow)
```
gh api -X POST repos/OWNER/NAME/pages -f build_type=workflow \
  || gh api -X PUT repos/OWNER/NAME/pages -f build_type=workflow
```

## 3. URL (and optional custom domain)
- No custom domain: `gh api repos/OWNER/NAME/pages --jq .html_url` → SITE_URL (drop the trailing `/`).
- Custom domain: `gh api -X PUT repos/OWNER/NAME/pages -f cname=DOMAIN`. Tell the user exactly which DNS records to add at their registrar:
  - subdomain (`www.example.com`): `CNAME www -> OWNER.github.io`
  - apex (`example.com`): `A` 185.199.108.153, 185.199.109.153, 185.199.110.153, 185.199.111.153 and `AAAA` 2606:50c0:8000::153, 2606:50c0:8001::153, 2606:50c0:8002::153, 2606:50c0:8003::153
  - Recommend they also verify the domain in their GitHub account settings (protects against takeover).
  - Once DNS resolves and the certificate is issued (`gh api repos/OWNER/NAME/pages --jq .https_certificate.state` is `approved`): `gh api -X PUT repos/OWNER/NAME/pages -F https_enforced=true`.
  - SITE_URL = `https://DOMAIN`.
- Save SITE_URL (no trailing slash) in `site.config.json`. That one line is the whole change when the address moves later: canonicals, sitemap, robots, llms.txt, JSON-LD and 404 follow at the next build.

## 4. Deploy
1. `node tools/verify.mjs` must pass (the pre-push hook runs `--quick` too).
2. Commit and push to `main`. The workflow runs `node tools/verify.mjs --lighthouse` (the same command as locally; Lighthouse checks only the pages changed since the last successful deploy, and at most 5 random ones when a shared file such as the menu or CSS changed, so a deploy takes minutes, not most of an hour); only then does it deploy. To re-check every page, start the workflow by hand: `gh workflow run pages.yml`.
3. Wait for it: `gh run watch --exit-status $(gh run list --branch main --limit 1 --json databaseId --jq '.[0].databaseId')` (run in the background; takes a few minutes).
4. On failure: `gh run view --log-failed`, fix, push again. The Lighthouse report is attached to the run as the `lighthouse` artifact.

## 5. Confirm live
- `curl -sI SITE_URL/` returns 200; also check `/robots.txt`, `/sitemap.xml`, `/llms.txt`, `/indexnow.txt`, `/og.png`.
- The workflow's `after-deploy` job already pinged IndexNow (Bing, Yandex, Seznam, Naver; Bing feeds ChatGPT search and Copilot).

## 5b. Contact form emails (form worker: notification + autoreply)
Needs the agency set-up below once. Per page:
1. Set EMAIL_FROM (an address on a domain verified in Resend), TURNSTILE_SITE_KEY, FORM_PROVIDER ("Cloudflare and Resend") and optionally FORM_NOTIFY_TO in `site.config.json`. Add the site's host to the Turnstile widget's hostnames (Cloudflare dashboard → Turnstile; the user does it, or uses one widget per page).
2. `node tools/form-worker.mjs deploy` (writes FORM_ENDPOINT), then `node tools/form-worker.mjs secrets` on the first deploy. Commit and push so the page posts to the worker.
3. With the user's OK: `node tools/form-test.mjs --send`; they confirm the notification and the autoreply arrived (check spam too).
4. Any later change in `emails/` or `worker/` goes live only with `node tools/form-worker.mjs deploy`.

### Contact form emails, one-time set-up (once per agency, not per page)
The user does the sign-ups in their browser; guide them, never handle the keys yourself.
1. **Cloudflare** (free): create an account; then in a terminal the user runs `npx wrangler login` (browser sign-in, once per computer).
2. **Turnstile**: Cloudflare dashboard → Turnstile → Add widget (mode "Managed"), hostnames = the client sites (up to 10 per widget; add more widgets as needed). Site key → TURNSTILE_SITE_KEY per page; secret key → the secrets file below.
3. **Resend** (free: 3,000 emails/month, 100/day): create an account, Domains → add the sending domain (the agency's, e.g. `mail.agency.pl`, or the client's own) and have the DNS records added (SPF/DKIM; the user or the client's DNS admin). API Keys → create a "Sending access" key.
4. The user creates `~/.config/landing-tools/form-secrets.json` themselves (it must never be in a repo):
   `{ "RESEND_API_KEY": "re_…", "TURNSTILE_SECRET_KEY": "0x…" }`
   `node tools/form-worker.mjs secrets` reads it and passes the values straight to Cloudflare without printing them.

### Form worker deploys from CI (optional, recommended for sites the client edits)
Then email changes go live with every push, and the monitor never finds a stale worker. The user creates a Cloudflare API token (dashboard → My Profile → API Tokens → template "Edit Cloudflare Workers") and sets it themselves in a terminal, so the token never passes through Claude:
`gh secret set CLOUDFLARE_API_TOKEN` (paste when asked) and `gh secret set CLOUDFLARE_ACCOUNT_ID` (from the dashboard sidebar).

## 6. Search engines
### Google Search Console (automatic once the service account exists)
1. `node tools/google.mjs check`. If it says there is no key, do "Google, one-time set-up" below first, or fall back to the manual way.
2. `node tools/google.mjs verification-token` writes GOOGLE_SITE_VERIFICATION into `site.config.json`. Commit, push, wait for the deploy (step 4).
3. `node tools/google.mjs search-console --owners <emails>`: verifies the site, makes those Google accounts owners (ask the user which: usually theirs and the client's), adds the property and submits `sitemap.xml`. The emails are passed on the command line only; never write them into the repo.
- Manual fallback: the user adds a *URL-prefix* property for `SITE_URL/` with the *HTML tag* method and pastes you the `content` value → GOOGLE_SITE_VERIFICATION in `site.config.json` → deploy → they click Verify and submit `sitemap.xml`.

### Bing Webmaster Tools
- Easiest: the user signs in at bing.com/webmasters and chooses "Import from Google Search Console" (after the step above). Otherwise BING_SITE_VERIFICATION in `site.config.json`, deploy, Verify.
- IndexNow already notifies Bing on every deploy.

### Google, one-time set-up (once per agency, not per page)
The user does this in their browser; guide them step by step and explain that it lets Claude set up Search Console and Analytics for every future page without clicking:
1. console.cloud.google.com → create a project (e.g. "landing-tools").
2. APIs & Services → Library → enable **Google Site Verification API**, **Google Search Console API** and **Google Analytics Admin API**.
3. IAM & Admin → Service accounts → Create (no roles needed) → Keys → Add key → JSON. Save the file as `~/.config/landing-tools/google-service-account.json` (or set `GOOGLE_SERVICE_ACCOUNT` to its path). It must never go into a repo; `tools/check.mjs` fails if it does.
4. For Analytics: analytics.google.com → Admin → Account access management → add the service account email (shown by `node tools/google.mjs check`) as **Editor**.
5. `node tools/google.mjs check` lists the Search Console sites and GA accounts it can use.

## 7. Report
Tell the user: the live URL, what was checked, and anything waiting on them (DNS, verification). No GitHub jargon unless they ask.
