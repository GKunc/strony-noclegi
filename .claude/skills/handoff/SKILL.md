---
name: handoff
description: Hand a finished landing page over to the client so they can change it themselves with Claude - GitHub access, their computer, Google and form accounts, and a short guide in their language. Use when the user says the site is done and the client should take over, or "przekaż stronę klientowi".
---

# handoff

Ask the user (the agency) two things first, in one message:
- **Who owns the repo afterwards?** Recommended: the agency keeps it and the client becomes a collaborator (the agency keeps template updates, monitoring and the form worker). Alternative: transfer ownership to the client's GitHub account (they then need their own Cloudflare/Resend for the form, and template updates need their permission).
- **The client's GitHub username** (they create a free account at github.com if they have none).

Then:
1. **Access.** Collaborator: `gh api -X PUT repos/OWNER/REPO/collaborators/USERNAME -f permission=push` (they get an email invitation to accept). Transfer (ask for an explicit yes, it is hard to undo): `gh api repos/OWNER/REPO/transfer -f new_owner=USERNAME`; afterwards the Pages URL stays the same only with a custom domain.
2. **Google.** Search Console: `node tools/google.mjs search-console --owners CLIENT_GOOGLE_EMAIL` (adds them as owner). GA4 (if used): the user adds the client in Analytics → Admin → Property access management (no API for this here).
3. **Form emails.** Collaborator setup: nothing changes (agency's worker and keys). Transfer: the client needs the "Contact form emails, one-time set-up" from the `publish` skill on their side, then `node tools/form-worker.mjs deploy` and `secrets` from their computer.
4. **Guide.** Write `GUIDE.md` in the site's language from the English base in this repo: replace `{{AGENCY_CONTACT}}` with the agency's contact, keep it short and concrete, use this site's real sections in the examples. Commit it.
5. **Their computer** (with the client, or send them the steps): install the Claude desktop app, sign in to GitHub, open the repo in Claude Code and say "przygotuj środowisko" / "set up my environment" (`dev-setup` skill does the rest).
6. Report: what the client received, what the agency keeps (monitor issues still reach the repo owner), and what is waiting on whom.
