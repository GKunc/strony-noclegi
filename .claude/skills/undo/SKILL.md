---
name: undo
description: Show what changed on the site and undo a change ("cofnij", "przywróć poprzednią wersję", "what did we change last week?", "the old headline was better"). Undoing adds a reversing change; nothing is ever deleted from history.
---

# undo

1. `node tools/history.mjs` lists the recent site changes in plain words (number, date, description, what it touched). Tell the user in their language which changes these are; if the request is vague ("the old version"), show the candidates and let them pick.
2. Before undoing, say exactly what will come back (e.g. "the headline goes back to …"); `git show <commit>` shows the details. Get a clear yes for which change.
3. `node tools/history.mjs undo <number>`. It refuses if later changes edited the same lines: then undo the later ones first (newest first), or make the edit by hand.
4. `node tools/verify.mjs`, look at it in the preview, then `git push` and watch the deploy (`publish` skill steps 4-5). If the change touched emails or the form backend, also `node tools/form-worker.mjs deploy` (unless CI deploys the worker).
5. Never use `git reset --hard`, `git push --force` or anything else that rewrites history: an undo must itself be undoable.

Partial undo ("keep the new photo but bring back the old text"): copy the old text from `git show <commit>:<file>` and edit by hand; that is a normal change.
