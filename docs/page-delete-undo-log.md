# Page delete undo log

Finished phases of the [page delete undo plan](page-delete-undo-plan.md).

## Phase 1: Delete toast with Undo

**Goal:** every block delete, from any of the four paths, shows a "Deleted <name>" toast whose Undo brings the block back with everything inside it, and the toast never undoes a different edit.

**Files:**
- `Sinwy.WebFrontend/src/modules/org-dashboard/components/page-editor/PageEditor.tsx`: the `<Puck>` mount (add `onAction`).
- `…/page-editor/EditorLayout.tsx`: where `KeepUiOnHistory` and `useEditorHotkeys` (around line 262) are mounted. Mount the toast's component here, inside the Puck tree.
- `…/page-editor/use-block-actions.ts`: `blockActions` (`remove`, `undo`, `historyPending`) and `useEditorHotkeys`.
- `…/page-editor/block-actions.ts`: `canvasLabel`, `blockTitle`, `zoneContent`. Add the pure helper for the toast text here.
- `…/page-editor/BlockChrome.tsx`: `BlockToolbar` and `BlockActionBar`. They should need no change, since the detection is in `onAction`.
- `Sinwy.WebFrontend/src/shared/components/ui/toast.tsx`: `toast`, `ToastList`.
- Tests: `Sinwy.WebFrontend/src/modules/org-dashboard/tests/page-editor-actions.test.ts` (add a `describe` for the toast text), `Sinwy.WebFrontend/e2e/editor.e2e.ts`, and `Sinwy.WebFrontend/e2e/editor-fixtures.ts` (`editorFor` has no Layers or toast locators yet; `heading`, `section` and `outline` are the block builders).
- `README.md` "Page editor spec": the list of what the spec covers.

**Steps:**
- Detect deletes only in `onAction`, for `action.type === "remove"`, and read the removed block from `prevAppState`. The four paths get no detection code of their own. Hand the delete to a small store or emitter, and let a component inside the Puck tree own the toast: show it, and close it.
- Add a pure `deletedNotice` (or similar) to `block-actions.ts` that turns the removed block into the toast's title and description, following Default 1. Count photos for a Photos block, and nested blocks for Section and Hero.
- Toast Undo calls `blockActions().undo()`, then closes the toast. The undo goes through `travelWhenRecorded`, so an Undo clicked within 250 ms of the delete still goes back to before the delete.
- The toast component remembers `appState.data` as it was straight after the delete, and closes the toast as soon as the data is a different object: an edit, an Undo, a Redo or the next delete. A new delete replaces the old toast (Default 2).
- After a delete from the Layers row, leave nothing selected (Default 3). Do it with a `setUi`, which Puck doesn't record, and outside the `onAction` call. Leave the Layers row's Duplicate as it is.
- Don't add a confirm dialog anywhere.

**Tests that matter:**
- Unit: `deletedNotice` names a Section by its Heading and says how many blocks it holds. It counts the photos of a Photos block. A Heading or Text gets a title and no description.
- e2e, the data-loss path: delete a Section that holds a Photos block, using the action bar, and wait for the autosave. Click Undo in the toast. The section is back with its photos, and once autosave runs, `pages.saved` equals the document from before the delete.
- e2e: the settings panel Delete, the Layers row Delete icon and the Delete key each show the same toast.
- e2e: delete, then edit another block's text, and the toast is gone, so a toast Undo can never take back that edit. Delete, then press Ctrl+Z, and the toast is gone and the block is back once.
- The existing keyboard test still passes.

**Done when:**
- All four delete paths show the toast. Its Undo restores the block, contents included, in one click, and the restore autosaves.
- `bun run verify` and `bun run test:editor` pass.

**Verify:** Seed a `pro-org` page through the API with a Hero, an "Inside the salon" Section holding a Photos block with at least two uploaded photos, and a "Find us" Section. Log in as the owner and open the page in the editor.
1. Select the "Inside the salon" section and click Delete on the canvas action bar. The section disappears and a toast reads "Deleted Inside the salon", with the photo count. After about 1 s, the newest `page_content` row for the page no longer mentions the section's id.
2. Click Undo in the toast. The section and its photos are back, the toast closes, and the next autosave writes a row that contains the section again.
3. Repeat step 1 from the Layers row's Delete icon, the settings panel's Delete button and the Delete key. Each shows the same toast, and nothing is left selected after the Layers delete.
4. Delete a Heading. It's gone at once, with no dialog, and a toast shows with no description.
5. Delete a block, then type in another Text block. The toast closes.

Nothing is simulated except login.

### Log (2026-11-28, `feat(web): show a "Deleted" toast with Undo after every block delete in the page editor`)
- Shipped: `deletedNotice` in `block-actions.ts` (the canvas label as the title; "With 2 photos and 1 more block inside", "With 4 photos" or "With 3 blocks inside" as the description, counting every Image inside as a photo and not counting a Photos group itself as a block). `DeleteToast.tsx` holds `reportDelete` (Puck's `onAction`) and `<DeleteToast />` (10 s toast, Undo through `blockActions().undo()`, a new delete replaces the old toast, closes on any change to `appState.data`, clears the selection in a microtask after every remove). Unit tests for the text; an e2e "deleting" describe with three tests (action bar delete, autosave, toast Undo, saved document equal to before; settings panel, Layers row and Delete key show the same toast and a Heading's toast has no description; the toast closes on the next edit and on Ctrl+Z, and Ctrl+Z restores the block once). README spec list updated.
- Differs from plan: the title is "Deleted Section · Inside the salon", not the Verify brief's "Deleted Inside the salon", because Default 1 says the name is the canvas label. A sixth `pro-org` (`deleting`) is seeded for the spec because the first one ran out of its 5 pages. The edit-then-Ctrl+Z test waits for the edit to save before deleting, since an edit and a delete under 250 ms apart are one undo step (accepted in the standing notes).
- Checked in the running app (e2e agent, org `seed-9fe1f91f`, page with a Hero, "Inside the salon" with 2 uploaded photos, and "Find us"): all five Verify steps pass. Each delete autosaved a `page_content` version without `Section-salon`, and each toast Undo saved the next version with it back. The Layers delete left nothing selected. A Heading delete showed "Deleted Heading in Find us" with no description and no dialog. Typing in another Text block closed the toast. The toast closed by itself 10.1 s after the delete. No console errors and no new server or web log lines. Finding: selecting a Text block that was edited earlier closes the toast with no typing. Reproduced inline: that selection records a duplicate history entry (Puck's rich-text field), so the first Undo takes back nothing visible and the second restores the delete. Closing the toast is therefore correct, and the duplicate entry, which predates this plan, is left for phase 2. Also found: deleting a section's own title Heading is named "Heading in Inside the salon", the canvas label of a Heading that is now gone. Not checked: Redo closing the toast (a delete clears the redo stack and Undo already closes it), Ctrl+Z with focus in a rich-text editor, and an upload through the editor's own image field (the agent used the same endpoint).
- Follow-up (`feat(web): name a deleted title Heading by its own text in the delete toast`): the product owner chose to name the Heading that titles its parent by its own text, "Deleted Heading · Find us", rather than "Deleted Heading in Find us". Other Headings keep the canvas label. Default 1 was updated, with a unit test, and the e2e expectation changed.

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

### Log (2026-11-28, `fix(web): undo a delete without the edit just before it, and keep a photo that finished uploading into a deleted block`)
- Shipped: `splitDeleteEntry` (`delete-history.ts`). Puck records history 250 ms after the last dispatch, so an edit less than 250 ms before a delete shared the delete's entry, and both toast Undo and Ctrl+Z took back the edit too. `reportDelete` now notes the page before and after each delete. Once Puck records the delete (`DeleteToast`'s effect on `history.index`, and `travelWhenRecorded` before it travels), `setHistories` gives the page before the delete its own entry. The recorded entry keeps today's UI, so setting it changes neither the page object nor the selection, and the toast and autosave don't react. A photo upload that finished after its block was deleted used to be dropped silently, so Undo brought the block back without it. `WriteImage` now returns whether it wrote, and an unwritten upload stays as a failure, "This photo finished uploading after its block was deleted. Retry to add it.", whose Retry writes the stored photo without uploading again. Tests: `splitDeleteEntry` (4) and the upload tracker in unit tests; e2e "an edit just before a delete keeps its own undo step…" and "a photo that finishes uploading after its section was deleted comes back with Undo and Retry". Both e2e tests failed with their fix turned off ("Find us" came back instead of the edited text; no Retry alert). README spec list updated.
- Review answers: toast Undo can only take back the delete. The toast closes on any change to `appState.data` (edits, Undo, a finished upload's `replace`), and the only merge left, an edit within 250 ms after the delete, closes the toast first. Redo can't close it, because a delete clears the redo stack. An Undo while the upload is still running brings the block back before the write, so the photo lands. An Undo during an autosave conflict is an ordinary edit: the conflict banner's choices still apply, and "load the latest" replaces the data, which closes the toast.
- Usability task 6 (cold agent, owner wording, no UI hints; org `seed-9fe1f91f`, page `delete-undo-rerun` seeded with the phase 1 Verify content and the same 2 uploaded photos): the agent deleted "Inside the salon" from the settings panel. It saw "Deleted Section · Inside the salon — With 2 photos and 1 more block inside", which was still showing about 17 s later (hovered while being read), and clicked Undo. **Ease 5, no dead ends.** Its only stumble: a click in the middle of the section selected the inner Photos row, and it used "Select parent block" to reach the section.
- Differs from plan: Verify and the usability task ran as one agent. The page is a new copy, because the phase 1 page had lost its Headings during phase 1's checks. The seed org stays in place: the `e2e-test` skill keeps seeded data, and no tool removes an org cleanly. The rich-text duplicate history entry (standing note) is still open. It comes from Puck's rich-text editor (`Editor-*.mjs` re-fires `onChange` from its debounced state), and fixing it needs a wrapper around Puck's field, outside this plan.
- Checked in the running app: `page_content` went from v2 (with `Section-salon`) to v3 without it, then v4 with `Section-salon`, `Heading-salon`, `Image-1` and `Image-2`. All three are one checkpoint row updated in place, which is by design. The draft stayed unpublished (`published_version_id` NULL) and the storefront was unchanged (404 for the draft). No console errors and no server or web log warnings. `bun run verify` and `bun run test:editor` (24 tests, 1.6 min) pass. Not checked by a cold agent: the two review fixes (e2e only). A split's `before` entry carries no Puck `indexes`, so, by Puck's `setAction` source, undoing to it logs the console warning "`set` is expensive" (a warning, not an error; not seen in the browser).
