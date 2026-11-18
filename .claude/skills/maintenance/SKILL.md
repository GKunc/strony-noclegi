---
name: maintenance
description: Keep many client sites healthy from the template repo - which sites are behind the template, failing deploys, open monitor issues - and roll template improvements out to them. Also updating a single site from the template. Use for "update all sites", "which sites have problems?", "aktualizuj strony klientów", or after improving the template.
---

# maintenance

## Across all sites (run in the template repo)
1. `node tools/fleet.mjs status` (`--owner a,b` for client organisations): each site's template version, last deploy and open monitor issue.
2. Problems first: a failed deploy or an open "Site monitor" issue → open that repo (`gh repo clone`) and fix it there; the issue text says what is wrong.
3. Roll out template improvements: `node tools/fleet.mjs update OWNER/REPO` per site (updates, runs every check, commits, does not push). Show the user the list of sites and what changed in the template (`git log` since their version); push only after their yes: `node tools/fleet.mjs update OWNER/REPO --push`, then `gh run watch -R OWNER/REPO`.
4. A site that needs a hand (conflicts or failing checks) is reported; do it with the single-site steps below in that repo.

## One site (run in the site repo)
1. `node tools/template-update.mjs --check` lists what changed in the template since this site's version.
2. `node tools/template-update.mjs` applies it: template files replaced, template changes merged into the site's files, new settings added to `site.config.json` (empty: fill them, or the checks say what is missing).
3. Exit 2 = conflicts: resolve the `<<<<<<<` markers keeping the site's content and the template's improvement. Exit 3 = checks fail: fix like any other change.
4. `node tools/verify.mjs`, preview, commit ("Update tooling from the template"), push, watch the deploy. If `worker/` or `emails/STYLE.md` changed, also `node tools/form-worker.mjs deploy` (unless CI deploys the worker).

## Rules
- Files listed as `owned` in `template.json` belong to the template: never edit them in a site repo (the next update overwrites them). Improve the template instead, test with `node tools/selftest.mjs`, push it, roll it out.
- A site's `.template-version` says which template commit it is on; never edit it by hand except to repair a missing one.
