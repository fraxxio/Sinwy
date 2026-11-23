# Page autosave, drafts and publishing plan

Issue #77. The editor saves on its own and the owner can always tell whether what they see is saved and whether it's live. Drafts are stored as checkpoints rather than one row per save. Two editors can't silently overwrite each other, leaving the editor never loses work, and a draft can be discarded back to the published version. Publishing warns about unfilled placeholders first.

Every phase is done. The phases, their logs and the review's findings are in [page-autosave-log.md](page-autosave-log.md).

## Status

| Phase | Title | Depends on | Status | Commit |
| --- | --- | --- | --- | --- |
| 1 | Backend: checkpoint saves, guarded publish, discard | – | done | `feat(backend, web, shared): save page drafts as checkpoints, guard publish and add discard` |
| 2 | Autosave engine (plain module) | – | done | `feat(web): add the page autosave engine` |
| 3 | Autosave in the editor | 1, 2 | done | `feat(web): autosave page edits in the editor` |
| 4 | Conflicts and the leave guard | 3 | done | `feat(web): pause autosave on conflicts and guard leaving the editor` |
| 5 | Draft vs published in the editor, and discard | 1, 4 | done | `feat(web): show whether page changes are live, and publish and discard from the editor` |
| 6 | Pre-publish checks | 5 | done | `feat(web, shared): warn about unfilled blocks before publishing a page` |
| 7 | Usability rerun: tasks 5 and 6 (research) | 6 | done | `fix(backend): don't report unpublished changes when the draft matches what's live` |
| 8 | Code review, docs and cleanup | 7 | done | `fix(backend, web): answer a page save with the version it wrote, and refetch a page whose publish was refused` |

## Decisions

Settled with the product owner. Ask before changing any of them.

- **Drafts are checkpoints.** A save updates the latest `page_content` row in place, bumping its `version`, when that row is not the published one, was created by the same user, and was created less than 10 minutes ago. Otherwise the save inserts a new row. Every save still bumps `version`, so the `baseVersion` conflict check and the API stay as they are. Version numbers skip.
- **A conflict asks: mine or theirs.** On a 409 autosave pauses and a banner offers "Load latest", which drops the edits made here after a confirm, and "Keep mine", which saves this document over the newer one on purpose. Nothing is overwritten without a click.

### Defaults (not yet confirmed; change only if asked)

1. The checkpoint window is 10 minutes, compared in SQL (`created_at > now() - interval`), so app and DB clocks can't disagree.
2. Autosave waits 1 s after the last change (Puck records history after 250 ms) and at most 10 s during continuous typing. Network errors and 5xx retry after 1, 2, 5, 10 and 30 s, then every 30 s, with a "Retry now" button.
3. The Save button goes; Ctrl/⌘+S saves straight away. There's no success toast, and the error toast shows once when a save first fails, not on every retry.
4. Publish is also in the editor header. Unpublish stays on the page detail screen.
5. Publish takes `{ baseVersion }` and answers 409 if it isn't the latest, so nobody publishes content they haven't seen.
6. Discard (`POST .../discard`, `{ baseVersion }`) always inserts a new row holding the pinned content and re-pins `published_version_id` to it, leaving `published_at` alone. The discarded draft stays as a history row and versions never go backwards. A never-published page has nothing to discard (409 `PAGE_NOT_PUBLISHED`). Restoring blocks the plan no longer covers is allowed. No activity entry is recorded.
7. Discard remounts the editor with the published content, which clears undo history; the confirm dialog says so. It's offered in the editor and on the detail page.
8. "Keep mine" between two tabs of the same user can land in place within the window, overwriting the other tab's checkpoint. That's accepted because the user chose it.
9. Leaving the editor in-app while a save is pending flushes it, then navigates. A failed, blocked or conflicted save asks "Leave without saving?". Closing or reloading the tab with anything unsaved triggers `beforeunload`. No `keepalive` fetch: its 64 KB cap is below the 256 KB document limit.
10. Pre-publish checks warn and never block ("Publish anyway"). Template instruction text is left until templates exist; the placeholder marker from phase 6 is what they'll use.
11. Owner-facing copy stops showing version numbers, because they skip. It shows times instead ("Saved 2 minutes ago", "Published 3 days ago").
12. New e2e tests run against a second seeded `pro-org`, because the spec already uses all 5 Professional pages and the 1 Starter page.
