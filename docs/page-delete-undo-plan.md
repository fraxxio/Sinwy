# Page delete undo plan

Deleting a block in the page editor happens in one click and autosave stores it within a second, so a mistaken delete of a whole section is easy to make and hard to notice (#84, from the #77 usability rerun). This plan shows a "Deleted · Undo" toast after every delete, from every place a block can be deleted, so the owner sees what went and gets it back in one click.

Run a phase with the `implementation-phase` skill. Finished phases and their logs are in [page-delete-undo-log.md](page-delete-undo-log.md).

## Status

| Phase | Title | Depends on | Status | Commit |
| --- | --- | --- | --- | --- |
| 1 | Delete toast with Undo | – | done | `feat(web): show a "Deleted" toast with Undo after every block delete in the page editor` |
| 2 | Usability rerun, review, docs and cleanup | 1 | done | `fix(web): undo a delete without the edit just before it, and keep a photo that finished uploading into a deleted block` |
| 3 | One undo step per rich-text edit | 2 | done | `fix(web): stop selecting a Text block from recording an undo step in the page editor` |

## Decisions

Settled with the product owner. Ask before changing any of them.

- **A toast after the delete, no confirm dialog.** Every delete happens at once and shows a "Deleted <block>" toast with an Undo button. Single-block deletes (a Heading, a Text) stay one step.
- **Toast Undo is one step back in history.** It does exactly what Ctrl+Z would. It doesn't re-insert a snapshot.
- **The toast lasts about 10 seconds and closes on the next change to the page**: any edit, Undo or Redo. That way it never undoes a different edit.
- **The same behaviour from all four delete paths:** the settings panel's Delete button, the canvas action bar, the Layers row's own Delete icon, and Delete/Backspace.
- **Recovery after leaving the editor is out of scope.** That needs "restore an earlier version", a separate feature (accepted in the #77 log).

### Defaults (not yet confirmed; change only if asked)

1. The toast title is "Deleted <name>", where the name is what the canvas calls the block (`canvasLabel`, else `blockTitle`, else the component label). The Heading that titles its section or Hero is named by its own text instead ("Deleted Heading · Inside the salon"), since its canvas label names the parent by that same text (chosen by the product owner after phase 1). For a block that holds others, the description says what was inside, for example "With 4 photos" or "With 3 blocks inside". A single block gets no description.
2. Only one delete toast shows at a time: a new delete replaces the previous toast.
3. A delete from the Layers row ends with nothing selected, like the other paths. Puck's own `remove` selects the next block.
4. The timeout is 10 000 ms. Base UI pauses it while the toast is hovered or focused.

## Standing notes

Verified facts and gotchas the remaining phases rely on. Don't check them again. Each phase prunes this list when it finishes.

- Deletes are caught in one place: `reportDelete` (Puck's `onAction`, `DeleteToast.tsx`) feeds `<DeleteToast />` and `noteDelete`. `splitDeleteEntry` (`delete-history.ts`) gives an edit made less than 250 ms before a delete its own history entry (log, phase 2). The toast closes when `appState.data` is no longer the object from straight after the delete.
- Rich-text fields and history (log, phase 3): Tiptap's `setEditable` emits `update`, and Puck's rich-text editor calls it on mount and saves that update as an edit while `ui.field.focus` names its field. Puck never clears that focus for a contenteditable, so any action that remounts the fields must clear it: `KeepUiOnHistory` (undo and redo) and `ForgetFieldFocusOnSelect` (selection) in `EditorLayout.tsx`. Puck already keys each settings field by the selected block's id, so re-keying changes nothing.
- In e2e, `editor.typeRichText` types at the end of the settings panel's rich-text field (`editor.settings.getByRole("textbox")`), and `richText()` builds a Text block. On the phone view a selected block's action bar covers the middle of the block below, so select that one with `editor.select`. Escape typed into it stays in the field and doesn't deselect the block.
- Autosave stores an edit about 1 s after it. An edit and a delete less than 250 ms apart are now separate undo steps (phase 2).
- The spec's `deleting` seed is its own `pro-org`, and a Professional org holds 5 pages. Its describe creates 4 pages and `richText`'s creates 3, so a new test that creates a page goes elsewhere or gets its own seed in `global-setup.ts`.
- `bun run test:editor` runs `Sinwy.WebFrontend/e2e/editor.e2e.ts` against the running stack (27 tests, about 1.8 min). It isn't part of `bun run verify`.

