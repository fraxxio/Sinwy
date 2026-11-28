# Page delete undo plan

Deleting a block in the page editor happens in one click and autosave stores it within a second, so a mistaken delete of a whole section is easy to make and hard to notice (#84, from the #77 usability rerun). This plan shows a "Deleted · Undo" toast after every delete, from every place a block can be deleted, so the owner sees what went and gets it back in one click.

Run a phase with the `implementation-phase` skill. Finished phases and their logs are in [page-delete-undo-log.md](page-delete-undo-log.md).

## Status

| Phase | Title | Depends on | Status | Commit |
| --- | --- | --- | --- | --- |
| 1 | Delete toast with Undo | – | done | `feat(web): show a "Deleted" toast with Undo after every block delete in the page editor` |
| 2 | Usability rerun, review, docs and cleanup | 1 | done | `fix(web): undo a delete without the edit just before it, and keep a photo that finished uploading into a deleted block` |

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

All phases are done. What later work on the page editor should know:

- Deletes are caught in one place: `reportDelete` (Puck's `onAction`, `DeleteToast.tsx`) feeds `<DeleteToast />` and `noteDelete`. `splitDeleteEntry` (`delete-history.ts`) gives an edit made less than 250 ms before a delete its own history entry (log, phase 2).
- Still open, predates the plan: Puck's built-in rich-text field records a duplicate history entry when an already-edited Text block is selected, so Ctrl+Z needs two presses and the delete toast closes (log, phases 1 and 2).
- `bun run test:editor` runs `Sinwy.WebFrontend/e2e/editor.e2e.ts` against the running stack (24 tests, about 1.6 min). It isn't part of `bun run verify`.
