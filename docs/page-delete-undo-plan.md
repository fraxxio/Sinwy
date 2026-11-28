# Page delete undo plan

Deleting a block in the page editor happens in one click and autosave stores it within a second, so a mistaken delete of a whole section is easy to make and hard to notice (#84, from the #77 usability rerun). This plan shows a "Deleted · Undo" toast after every delete, from every place a block can be deleted, so the owner sees what went and gets it back in one click.

Run a phase with the `implementation-phase` skill. Finished phases and their logs are in [page-delete-undo-log.md](page-delete-undo-log.md).

## Status

| Phase | Title | Depends on | Status | Commit |
| --- | --- | --- | --- | --- |
| 1 | Delete toast with Undo | – | done | `feat(web): show a "Deleted" toast with Undo after every block delete in the page editor` |
| 2 | Usability rerun, review, docs and cleanup | 1 | todo | |

## Decisions

Settled with the product owner. Ask before changing any of them.

- **A toast after the delete, no confirm dialog.** Every delete happens at once and shows a "Deleted <block>" toast with an Undo button. Single-block deletes (a Heading, a Text) stay one step.
- **Toast Undo is one step back in history.** It does exactly what Ctrl+Z would. It doesn't re-insert a snapshot.
- **The toast lasts about 10 seconds and closes on the next change to the page**: any edit, Undo or Redo. That way it never undoes a different edit.
- **The same behaviour from all four delete paths:** the settings panel's Delete button, the canvas action bar, the Layers row's own Delete icon, and Delete/Backspace.
- **Recovery after leaving the editor is out of scope.** That needs "restore an earlier version", a separate feature (accepted in the #77 log).

### Defaults (not yet confirmed; change only if asked)

1. The toast title is "Deleted <name>", where the name is what the canvas calls the block (`canvasLabel`, else `blockTitle`, else the component label). For a block that holds others, the description says what was inside, for example "With 4 photos" or "With 3 blocks inside". A single block gets no description.
2. Only one delete toast shows at a time: a new delete replaces the previous toast.
3. A delete from the Layers row ends with nothing selected, like the other paths. Puck's own `remove` selects the next block.
4. The timeout is 10 000 ms. Base UI pauses it while the toast is hovered or focused.

## Standing notes

Verified facts and gotchas the remaining phases rely on. Don't check them again. Each phase prunes this list when it finishes.

- Deletes are caught in one place: `reportDelete` (Puck's `onAction`, `DeleteToast.tsx`) reads the removed block from `prevAppState` and hands it to `<DeleteToast />` (mounted in `EditorLayout.tsx`), which shows the toast, clears the selection in a microtask, and closes the toast when `appState.data` is no longer the object from straight after the delete.
- Puck's built-in rich-text field records a duplicate history entry when an already-edited Text block is selected. The page doesn't change, but `appState.data` does, so the delete toast closes. That's correct: its Undo would only take back that empty entry. Ctrl+Z and the header Undo need two presses in the same case. This bug predates the plan (log, phase 1).
- Deleting a section's own title Heading is named "Deleted Heading in Inside the salon": the canvas label (Default 1) names the parent by the Heading that is being deleted. Ask the product owner before changing it (log, phase 1).
- Base UI keeps a closing toast in the DOM with `data-ending-style` for its exit animation; `editor.deleteToast` in `editor-fixtures.ts` skips it. `editor.deleteLayer(index)` deletes a top-level block from the Layers tab, whose rows are labelled only by block type ("Section").
- The spec's `deleting` seed is its own `pro-org`; a Professional org holds 5 pages, so a new describe that creates pages needs its own seed in `global-setup.ts`.
- Autosave stores an edit about 1 s after it. An undo made inside that delay never reaches the server, so the e2e must wait for the save after the delete before undoing if it checks `page_content`. An edit and a delete less than 250 ms apart are one undo step, so a test that edits and then deletes waits for the edit to save first.
- `bun run test:editor` runs `Sinwy.WebFrontend/e2e/editor.e2e.ts` against the running stack (22 tests, about 1.3 min). It isn't part of `bun run verify`.

---

## Phase 2: Usability rerun, review, docs and cleanup

**Goal:** a cold agent recovers a mistakenly deleted photos section within the session without hunting for Undo, and the docs describe the toast.

**Files:**
- Review: the phase 1 commit. `Sinwy.WebFrontend/src/modules/org-dashboard/components/page-editor/DeleteToast.tsx` (`reportDelete`, `DeleteToast`), `deletedNotice` in `…/page-editor/block-actions.ts`, and the `onAction` and `<DeleteToast />` mounts in `PageEditor.tsx` and `EditorLayout.tsx`.
- History: `travelWhenRecorded` and `historyPending` in `…/page-editor/use-block-actions.ts`, `KeepUiOnHistory` in `EditorLayout.tsx`, and the rich-text field in `…/page-editor/editor-fields.tsx` (the duplicate-entry note above).
- Uploads finishing during a toast: `…/page-editor/image-field.tsx` (`replace` dispatches) and `uploads.ts`.
- The usability brief from #77 (in `git show 3e2e220`, `docs/page-autosave-log.md`, phase 7, task 6).
- Tests: `Sinwy.WebFrontend/src/modules/org-dashboard/tests/page-editor-actions.test.ts` (`deletedNotice`), `Sinwy.WebFrontend/e2e/editor.e2e.ts` ("deleting" describe, `deleting` seed) and `e2e/editor-fixtures.ts` (`deleteToast`, `deleteLayer`).
- Docs: `README.md` "Page editor spec" (already lists the delete toast), this plan and its log.
- Cleanup: `.playwright-cli/scratch/` (phase 1 Verify seed script, probes, login state), `.playwright-cli/logs/`, and the seeded org `seed-9fe1f91f`.

**Steps:**
- Run usability task 6 with the `e2e-test` skill: a cold agent, the owner's wording ("I deleted the photos part by accident. Get it back."), no UI hints. Start from the phase 1 Verify page, and have the agent delete the photos section itself first. Record the steps, the ease (1 to 5) and any dead ends. Fix small findings here, and ask before filing larger ones.
- Review the phase 1 diff for lost edits. Can toast Undo take back anything other than the delete? Does the toast close on Undo, Redo and on edits from another source, such as a finished photo upload? Does an Undo during an autosave conflict or a pending upload behave? Fix what's found, each fix with a test.
- Update the README spec list. Move phase 1 and this phase to the log, and shrink this plan.
- Stop every dev server started during the plan's work, unless the user asked to keep it running. Delete the scratch seed scripts, screenshots, `.playwright-cli/` page and console files, and seed data that are no longer needed.

**Tests that matter:**
- Every review fix comes with a test of the path it fixes.

**Done when:**
- The cold agent gets the section back in the session by the toast, or by an Undo it finds at once, with an ease of 4 or 5. No edit is lost.
- `bun run verify` and `bun run test:editor` pass.

**Verify:** The same seed as phase 1. A cold agent, given only the task in the owner's words, deletes the "Inside the salon" section and gets it back. The storefront is unchanged, and the newest `page_content` row contains the section and its photos again. Nothing is simulated except login.
