---
name: dev-setup
description: Prepare this computer to develop the landing page - install missing tools (Node, git, GitHub CLI, Chrome), sign in to GitHub, clone the repo, turn on git hooks, set up the live-reload preview and Chrome DevTools, then prove it all works. Use on a new or reinstalled computer, after cloning, when the SessionStart check reports problems, or when the user says "set up my environment", "przygotuj środowisko", "the preview doesn't work" or "something is broken on my machine".
---

# dev-setup

The person is not technical. Do the work yourself, explain in one plain sentence what each step is for, and only hand them the steps that need *them* (their password, their GitHub sign-in). Talk in their language (the LANG in `brief/landing.md`, or whatever they write in).

What the finished environment gives them:
| Piece | What it does |
| --- | --- |
| `tools/serve.mjs` (preview "site") | Local copy of the site at http://localhost:4321/, rebuilt and reloaded on every save |
| `tools/verify.mjs` | The exact command CI runs: build, release checks, HTML validation, internal links, optional Lighthouse |
| `.githooks/` | pre-commit: `check.mjs` when `src/` changes; pre-push: `verify.mjs --quick`. Broken pages never reach the deploy |
| `tools/doctor.mjs` | Diagnoses the machine; `--fix` repairs what it safely can. Runs quietly at every session start (`.claude/settings.json` hook) |
| `.mcp.json` | Chrome DevTools MCP for console, screenshots, 375px/desktop, light/dark checks |
| `.claude/settings.json` | Pre-approved safe commands, plus hooks: the site is rebuilt after each edit and verified before Claude finishes (`tools/hook.mjs`) |

## 1. Diagnose
Run `node tools/doctor.mjs`. Every ✘/! line has a `→` fix. Work through them in the order below; re-run doctor after each group.

## 2. Install missing tools (macOS)
- **Homebrew** missing (`which brew` empty): it needs the user's password, so they install it. Tell them to paste into the Terminal app:
  `/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"`
  and to run the two `echo ... >> ~/.zprofile` / `eval` lines it prints at the end. Then continue.
- Everything else, after telling the user what you will install (one message, one yes):
  - Node 22+: `brew install node@22 && brew link --overwrite node@22` (skip if `node -v` already ≥ 22, e.g. via nvm).
  - git: comes with `xcode-select --install` (a system dialog the user clicks through).
  - GitHub CLI: `brew install gh`
  - Chrome: `brew install --cask google-chrome`
- Python is no longer needed (the preview server is Node).
- Other OS: use the system package manager (winget/apt) with the same list.

## 3. Sign-ins and identity (the user does these)
- GitHub: the user runs `gh auth login` themselves (GitHub.com → HTTPS → "Login with a web browser"). Never handle their token. Then run `gh auth setup-git` yourself so `git push` uses the same sign-in.
- git identity, if doctor flags it: ask for their name and the email they use on GitHub, then `git config --global user.name "…"` and `git config --global user.email "…"`.

## 4. Get the code (only if this folder is not the page repo)
- `gh repo view --json nameWithOwner` fails or shows the template → read REPO_OWNER/REPO_NAME from `brief/landing.md` (or ask), then from the parent folder: `gh repo clone OWNER/NAME` and continue in that folder.
- Already cloned: `git pull --ff-only` so they start from the live version.

## 5. Automate
Run `node tools/doctor.mjs --fix`. It:
- enables the git hooks (`core.hooksPath=.githooks`),
- rewrites the "site" entry in `.claude/launch.json` for this machine (absolute Node path and folder) if it is wrong,
- pre-downloads the HTML validator so local checks are fast.
If `launch.json` changed only because of this machine's paths, do not commit that change unless the repo is only ever used here.

## 6. Prove it works (do all of it, don't ask the user to check)
1. `node tools/doctor.mjs` → no ✘.
2. `node tools/verify.mjs` → "All good". If it fails on the site itself, that is a real content problem: say so and offer to fix it (it would fail CI too).
3. Start the preview with `preview_start` name `site`; the page loads at http://localhost:4321/ with no console errors.
4. Live reload: touch a file (`touch src/css/styles.css`), confirm the page reloads (e.g. `performance.timeOrigin` changes via the browser's JS tool). No content edits.
5. Chrome DevTools MCP: search for its tools (`ToolSearch` "chrome-devtools"). If missing, check `.mcp.json` and that `npx -y chrome-devtools-mcp@latest --help` runs; the user may need to restart the session/app once and approve the project MCP server.
6. Hooks: `git config core.hooksPath` prints `.githooks`.
7. Optional, when they have 2 minutes: `node tools/verify.mjs --lighthouse` (same budgets as CI).

## 7. Report
Short, plain language: what was installed, what is now automatic, what is still waiting on them. Then the daily cheat sheet:
- "pokaż stronę" → preview `site`, edits appear instantly.
- "sprawdź czy wszystko działa" → `node tools/verify.mjs` (+ `--lighthouse`).
- "opublikuj zmiany" → commit + push; hooks check first, then the `publish` skill steps 4–5 watch the deploy.
- "coś nie działa na moim komputerze" → this skill again.

## Troubleshooting
- Port 4321 busy: `lsof -i :4321`; stop the old server (`preview_stop`) or the other app; don't change the port in CI-related files.
- `node: command not found` in the preview but works in Terminal (nvm): `node tools/doctor.mjs --fix` writes the absolute Node path into `launch.json`.
- Hook blocks a commit/push: show the error, fix the cause. Use `--no-verify` only if the user explicitly wants to push anyway, and say CI will likely fail.
- `gh` says the token lacks scopes: user runs `gh auth refresh -s workflow`.
