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
