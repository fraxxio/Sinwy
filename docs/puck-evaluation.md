# Puck evaluation

Outcome of the Puck spike (issue #72). It tested `@puckeditor/core` 0.24.0 as the base for Sinwy's page builder, wired into the real pages flow: editor, versioned save, publish, plan gating and the SSR storefront. Evidence for every claim is in [puck-spike-log.md](puck-spike-log.md) (by phase) and [puck-usability-tasks.md](puck-usability-tasks.md). The predictions it is compared against are in [puck-research-report1.md](puck-research-report1.md) ("report 1") and [puck-research-report2.md](puck-research-report2.md) ("report 2").

Scores: ✅ native · 🟡 custom work, S/M/L · ❌ not possible.

## Verdict

**Go, with conditions.**

Report 1 set the exit criteria, and all of them passed:
- Grid gestures don't conflict with Puck's drag-and-drop or selection.
- Undo is one step per gesture.
- Public pages ship no editor code.
- SSR output matches the editor.

Nothing in the spike needed a fork or a patch of Puck. The weak spots are mostly our own work: editor chrome, blocks and product flows (media, version history, branding in the editor). They are not limits of Puck.

**The deciding question was how far Puck's UI and behaviour can be customised.** Answer: far enough for everything the usability review asked for. These parts sit behind fork-level walls:
- the DnD engine
- the canvas DOM
- the per-change state cost

None of them blocks a usable product. Details are in [Customisability](#customisability-the-deciding-question).

Conditions:
1. **Prove the untried extension points first, in a one-day check before the production plan.** Puck 0.24 exposes several hooks the spike didn't use, and three of the usability fixes depend on them:
   - a fully custom drawer (`Drawer` / `Drawer.Item`)
   - an action-bar drag handle (`dnd.enableDragHandle`)
   - the `componentOverlay` override
   - undo that keeps the viewport (`history.setHistories` / `setUi(…, false)`)
   - outline drag and auto-scroll inside our scaled canvas

   If the drawer or the undo fix can't be done without patching Puck, reopen this verdict.

   **Met (hooks check, #74):** all five work with Puck's exported API and our own code, with no patch and no fork, so the verdict stands. Two problems turned out to be ours:
   - the spurious history entries came from a `resolveData` in `ServicesSection`
   - the missing auto-scroll came from the global `body { overflow-x: hidden }` in `styles.css`, which is now `html { overflow-x: clip }`

   Caveats for production are in [puck-hooks-check-log.md](puck-hooks-check-log.md). The main ones:
   - Redo with a RichText block selected adds a data-identical history entry (open, for #76)
   - the drawer relies on one Puck class name
   - a drag release with no final pointer move cancels
2. **Pin Puck to an exact version.** Make an e2e test of the FreeGrid editor the gate for every Puck upgrade, because the editor relies on Puck's wrapper DOM (see Risks).
3. **Keep `PUCK_LIMITS` (400 blocks, depth 6).** Measure typing on a real mid-range tablet before raising it.
4. **Plan media upload and version history in the product scope.** They are needed whatever the editor library is.

**Runner-up, if the condition 1 check fails:** assemble it ourselves (`@dnd-kit/react` + react-grid-layout v2 + Tiptap + our own document model), as report 1 proposed. The spike makes its cost clearer. These all came free with Puck and would be ours to build:
- drag-and-drop across nested slots
- selection
- history
- the field panel
- permissions
- the outline
- iframe viewports
- inline rich text

That is report 1's "2–3× more engineering", and nothing the spike saw argues for a lower figure. Forking Puck (MIT) sits between the two options. Prefer a small `bun patch` for any single fix before considering a fork.

## Requirements scorecard

Requirements 1–9 from the research prompt. "Predicted" is report 1 (report 2 where it differs).

| # | Requirement | Result | Predicted | Evidence |
| --- | --- | --- | --- | --- |
| 1 | Blocks, slots, grid-snapped mode | Slots ✅. Grid mode 🟡 M | 🟡 M–L | Phase 2: FreeGrid is a normal slot, with an RGL 2.2.4 overlay in the editor only and plain CSS Grid on the storefront. Move, resize, select, edit, duplicate, delete and undo all work, and one gesture is one history entry. About 200 lines. Gaps: drawer inserts ignore the drop point, the 2D drop feedback is weak, and rows are a fixed 40 px. |
| 2 | Custom components, plan gating, server validation | Components ✅. Custom field 🟡 S. Gating 🟡 S. Validation 🟡 M | ✅ / 🟡 S–M | Phases 3 and 5. `walkTree` needs the React config, so the server walker and Zod schemas are our own (`PuckContent.ts`). Puck has no data validation and no insert permission by plan. Field names, slots and prop types are written twice and guarded by a drift test. |
| 3 | Per-breakpoint styles | 🟡 M | 🟡 M (report 2: ✅, wrong) | Phase 4. Puck has viewports but no per-viewport props. `responsive<T>` is our custom field, mapped to CSS variables read by Tailwind `max-lg`/`max-sm` classes. The canvas iframe has the viewport's real width, so the same media queries drive the editor and the storefront. |
| 4 | Inline rich text | Editing 🟡 S. Storefront render 🟡 M | ✅ (custom SSR renderer expected) | Phase 3. Inline editing, Ctrl+B, lists and auto-links work. We added the ProseMirror `white-space` CSS, and there's no link button. Puck's render path ships about 117 KB gzip of Tiptap and renders each block twice in the SSR stream, so it was replaced by a 130-line allowlist renderer through `fieldTransforms`. The predicted happy-dom problem didn't occur, and #1848 didn't reproduce. |
| 5 | Global theme tokens | ✅ mechanism, 🟡 S for the UI | 🟡 S (report 2: ❌) | Phase 3. Root fields become CSS variables with a live preview in the iframe, and org brand colour and font arrive through `metadata`. A branding panel inside the editor is our work (phase 8). |
| 6 | JSON model, migrations | ✅ | ✅ | Phase 5. Plain JSON. `transformProps` migrates on read before both `<Puck>` and `<Render>`, and the same functions in Shared migrate on save. Migrations are props-only, run on every read, and must be idempotent. |
| 7 | Separate SSR renderer | ✅ | ✅ (size unknown) | Phases 1 and 7. The `@puckeditor/core/rsc` entry is about 6 KB gzip. SSR takes 15–23 ms for 252–388 blocks, with no hydration warnings. No Tiptap, RGL or dnd-kit in the storefront. |
| 8 | Customisable editor UI | 🟡 M | ✅ (report 2: "fully overridable") | Phase 6, and the next section. Layout, fields, drawer items and the action bar are replaced natively. The canvas had to be rebuilt. Outline rows, slot placeholders, drop indicators and the drag preview can only be themed, or (outline) replaced whole. Both reports were too optimistic. |
| 9 | Guardrails | Mostly ✅. Copy/paste and templates 🟡 S. Keyboard and touch 🟡 M | ✅, templates 🟡 S | Phases 6 and 7. Native: undo/redo and hotkeys, duplicate, locked props (`readOnly`), required children (`resolvePermissions` with `parent`), defaults on insert, Tiptap-sanitised paste. Ours: copy/paste (Puck has none), templates, and a duplicate that keeps FreeGrid layouts. Weak: keyboard-only editing, and touch (press-and-hold, small FreeGrid handles). |

Also on the issue's checklist:
- React 19, the React Compiler and StrictMode: no warnings. The #1884 remount happens once, so `<Puck>` children must tolerate one remount.
- Tailwind 4: native in the canvas through synced host styles. User choices are enums mapped to static classes, and free values go through CSS variables.
- License: MIT, in both the LICENSE file and npm.

## Customisability (the deciding question)

What phases 1 and 6 did:
- `EditorChrome.tsx` replaces Puck's whole layout through `<Puck>` children: our header, the Add/Layers/Templates panel, our canvas, and a right panel with a block toolbar and `Puck.Fields`.
- `PageEditor.tsx` adds the `drawerItem`, `actionBar`, `fieldTypes` and `fieldLabel` overrides.
- Every editing command goes through `useGetPuck().dispatch` and `getPermissions`.

The items the user asked about:

| Item | Reachable without a fork? | How | Effort |
| --- | --- | --- | --- |
| Drawer cards with previews, bigger cards, ready-made blocks first | Yes | The `drawerItem` override already renders our card. `Drawer` and `Drawer.Item` are exported, so the whole drawer can be our own grid of preview cards with our own grouping and order. A locked "upgrade to use" tile is our own card, not a `Drawer.Item`. *Hooks check: works, no patch.* Our groups render as one `Drawer` each around a grid of `Drawer.Item` cards, and the `drawerItem` override is no longer needed. Puck renders each item twice; the hidden copy is made `inert` through Puck's `Drawer-draggableBg` class name. | S–M |
| Insert position and scroll | Yes, for click-to-add. Partly, for drag | Click-to-add is already ours (`placementFor` plus `insert`/`replace`). Scrolling to the new block means finding `[data-puck-component=<id>]` in the iframe and scrolling to it. An end-of-page drop area is padding in our root render. The drop position during a drag is Puck's collision logic (1D). `dnd.behavior` only changes the placeholder style. | S, and drag precision isn't ours to change |
| Action bar | Yes | The `actionBar` override is fully ours already. `dnd.enableDragHandle` makes Puck pass a drag handle to the override, which fixes "Text blocks can't be dragged" from phase 7. `componentOverlay` replaces the hover and selection overlay. *Hooks check: both work, no patch.* The handle drag shows Puck's line placeholder, and the preview follows the pointer at any zoom. Our overlay is a Tailwind ring with a hover label. Puck clips the bar at the top of the iframe; our action bar shifts itself down to fix that. | S |
| Undo without the viewport jumping | Yes | Puck's history stores the whole app state, `ui` included. *Hooks check: works, no patch.* The spurious entries were ours: `ServicesSection.resolveData` returned a `readOnly` map, and Puck recorded that as a change after load. Locked fields are now a custom field that renders `AutoField` read-only. A layout effect on `history.index` dispatches `setUi` with the user's viewport after any undo or redo, and dispatched `setUi` is never recorded. That covers the buttons and Puck's hotkeys. Open: with a RichText block selected, Redo adds a data-identical entry, so getting back takes two Undo clicks (#76). | S |
| Dirty state | Yes | Ours: compare `appState.data` with the last saved document instead of the history index. | S |
| Outline | Theme only, or replace whole | The `outline` override replaces the whole panel, and then the tree, selection and drag are ours to write. `Puck.Outline` rows can't be changed one by one. Dragging in `Puck.Outline` works, also across slots, and the panel auto-scrolls (hooks check). It can't drop after the last root section. | M to replace |
| Canvas | Rebuilt by us | `Canvas` isn't exported, so composing means writing our own (`EditorCanvas`, about 60 lines: sizing, zoom, deselect). Puck's AutoScroller is on by default (`dnd.disableAutoScroll`). *Hooks check: auto-scroll works in our scaled canvas, no patch.* The cause was the global `body { overflow-x: hidden }`, which also loads in the iframe. It is now `html { overflow-x: clip }`. | Done |

Only a fork can change these:
- **The canvas DOM.** Each slot child is wrapped in `[data-puck-component]`, and every element inside gets `pointer-events: none`. FreeGrid placement and the alignment rules are built around this. It's workable, but it's an internal Puck can change.
- **The drag-and-drop engine.** 1D collision, drop indicators, the drag preview and press-and-hold on touch.
- **Per-change state work.** Puck rebuilds its whole-tree index on every change, which makes typing O(blocks) (see Performance).
- Small things that `bun patch` can fix if they bother us: the `@import` of Inter from `rsms.me`, the deselect when a viewport button inside Puck's canvas is clicked (our own switcher avoids it already). Drawer items rendering twice for screen readers is fixed without a patch (hooks check).

## Pros and cons

**Pros**
- The riskiest piece works. Free grid layout inside a slot works with one undo step per gesture, and the storefront gets plain CSS Grid.
- The storefront stays light and fast: about 6 KB gzip of Puck render code, and 15–23 ms SSR for very large pages.
- The data is plain JSON we fully control: validated, migrated and gated on our server with no Puck code there.
- Puck gave us a lot for free: nested drag-and-drop, selection, history, field panel, outline, permissions (per parent, too), iframe viewports with real media queries, and inline rich text.
- Customising goes through public APIs: `<Puck>` composition, overrides, `dispatch`, `getPermissions`, `metadata`, `fieldTransforms` and `transformProps`. The editor reads as part of Sinwy.
- MIT, active (a release every 2–4 months), and React 19 and Compiler clean.

**Cons**
- Pre-1.0, and the FreeGrid editor depends on Puck's internal canvas DOM.
- The whole editor UI isn't replaceable: canvas overlays, drop indicators and outline rows can only be themed.
- Puck has no concept of breakpoints, data validation or plan gating, and its rich-text render path is too heavy for the storefront. All of these are ours to build.
- Typing it is awkward. Casts are needed at `<Render data>`, field spreads, generic config wrappers, `transformProps` and slot `defaultProps`.
- Typing gets slower as pages grow: about 100 ms per keystroke on a 250-block page at 4× CPU throttling.
- Touch and keyboard-only editing are usable but rough.

## Performance review

Production build, AMD Ryzen 5 7600X, headless Chromium. "4× CPU" stands in for a mid-range tablet. Full tables are in phase 7.

| What | Result |
| --- | --- |
| App baseline JS (every page) | 274.5 KB gzip |
| Storefront page | 293.5 KB static, of which the Puck render path is 14.5 KB (our blocks 7.7, `/rsc` 6.3). No Tiptap, ProseMirror, RGL, dnd-kit or happy-dom. |
| Editor route | 531.4 KB static (+257 KB), 721.8 KB at runtime with the lazy Tiptap editor |
| 252-block page | 69.8 KB JSON. SSR TTFB 15 ms (388 blocks: 23 ms). HTML 25.4 KB gzip, a third of it the inline hydration data. |
| Storefront hydration, 252 blocks | No long tasks unthrottled. At 4× CPU, TBT 171–193 ms. |
| Editor load, 252 blocks | 0.9–1.05 s to all blocks in the canvas, longest task about 220 ms (each Text block mounts its own Tiptap editor) |
| Typing, 252 blocks | 24–32 ms per key unthrottled. 96–104 ms per key at 4× CPU, with a long task on every key. |
| Save | 56–83 ms for a 68 KB body |
| Drag a section for 15 s | 17 ms average frame, 6 frames over 50 ms |

- The storefront and SSR are not a concern.
- The editor bundle is fine for a dashboard route.
- The weak point is typing on large pages on slow devices. Puck's per-change work grows with page size (only about 8 components re-render per keystroke, so our memoisation holds), and we can't change that from outside. `PUCK_LIMITS` (400 blocks) bounds it. The byte cap (256 KB) only bites with about 4 KB of text per section.

## Ease of development

- **Time.**
  - Phases 1–8 took about 20.5 h of agent time (1.5, 2.5, 2.5, 2, 2.5, 3.5, 4, 2).
  - The core go/no-go questions (SSR pipe, FreeGrid, undo) were answered in about 4 h, close to report 1's "day 1".
  - The rest is breadth the reports' 1–2 day spike didn't cover: validation, gating, breakpoints, chrome, stress tests and usability.
  - Roughly 5,100 lines of spike code: about 4,800 in `page-builder/` and 330 in the Shared contract.
- **API ergonomics.** Good:
  - `dispatch` with one history entry per `replace`
  - `getPuck()` usable inside iframe renders
  - `<Items as>` for per-child wrappers on the server
  - `metadata` reaching every render
  - slot `defaultProps` for presets
  - `resolvePermissions` with `parent`
  - `fieldTransforms` for swapping the renderer of one field type

  Less good:
  - custom fields don't get `metadata` (we used a React context)
  - `setData` neither records history nor runs `resolveData`
  - `usePuck` selectors must return stable values
- **TypeScript.** The most constant friction. `Config` generics don't compose across a component map, `Fields<Props>` rejects spreads with an override, and `exactOptionalPropertyTypes` clashes with `Render`'s `data` type. Each workaround is a one-line cast, but there are many of them.
- **Docs.** The public API is documented. The canvas DOM and event model weren't, and phase 2 spent about half its time reading Puck's source for them:
  - the wrapper element around each slot child
  - the `pointer-events` rule
  - drag starting on `pointerdown`
  - React listening at the iframe portal
- **Puck bugs and quirks hit.** None blocking:
  - the #1884 remount
  - the deselect on viewport switch
  - missing ProseMirror CSS in inline mode
  - the `componentItem` deprecation warning while the types still offer it
  - drawer items rendered twice (fixed in the hooks check)
  - the action bar clipped at the top (fixed in the hooks check)
  - the external Inter font request
  - spurious history entries on select (the hooks check found the cause was ours)
  - Undo restoring the viewport (fixed in the hooks check)

  Outside Puck: RGL 2.3.0's drag bug (#2303), pinned to 2.2.4.

## Ease of use for editors

Ease scores (1–5) from the scripted agent run and the product owner's hand run:

| Task | Agent | User | Whose problem |
| --- | --- | --- | --- |
| Homepage with services and booking | 4 | 3 | Ours: the v1 wizard templates, text-only template and drawer cards, + inserting off-screen |
| Brand colour | 3 | 1 | Ours: branding only in Settings |
| Two photos side by side | 2 | 2 | Ours: URL-only images, low-level blocks first. Puck: drag precision into slots. |
| Looks right on a phone | 4 | 4 | Ours: no Columns gap, overlapping placeholders |
| Fix a typo | 4 | 4 | Ours: Save vs Publish unclear, no autosave |
| Undo a mistake | 4 (1 after leaving) | 4 | Ours: no version history, no leave guard. Puck: Undo restores the viewport (fixed in the hooks check). |
| Booking form on starter | 3 | 1 | Ours: gated blocks vanish with no upgrade tile |
| Move a section | 4 | 4 | Works. No auto-scroll in our canvas on long pages; the hooks check found our CSS caused it and fixed it. |

What worked:
- the Salon homepage template
- inline text editing
- the phone and tablet preview with automatic stacking and clear per-breakpoint labels
- Undo/Redo
- Move up and down
- dragging

The user's view: the UI looks good and is a good foundation, and viability depends on customisability. The previous section answers that.

Nearly every low score traces to our own chrome, blocks or missing product features, not to a Puck limit. The editor ease score from phase 8 is 🟡 L, which is mostly the S-sized fixes listed below.

## What we'd build ourselves

For production, on top of what the spike already built:

| Item | Effort |
| --- | --- |
| Block manifest in Shared that generates both the Zod schemas and the Puck fields (replaces the drift test) | M |
| Custom drawer: big preview cards, ready-made blocks first and low-level blocks lower down, plain-language names and descriptions, locked upgrade tiles | S–M |
| Template picker with previews. The new-page wizard opens the v2 editor with the chosen template (retire the v1 wizard templates). | S |
| Insert-and-scroll, an end-of-page drop area, text labels on panel actions | S |
| Dirty state by data, undo that keeps the viewport (proved in the hooks check), the Redo duplicate entry, a leave guard, Ctrl/⌘+S | S–M |
| Autosave of drafts (product decision: draft versus version rows) | M |
| Branding panel in the editor, shared with Settings → Branding | S–M |
| Media upload and library for Image and Hero | M–L |
| Version history, restore, and "revert to published" | M |
| Nesting rules (slot `allow` lists) and the depth limit enforced in the editor | S |
| Pre-publish checks (placeholders, empty images, template instruction text) | S |
| Link picker for Button (pages, booking) and a link button in rich text | S–M |
| Action-bar drag handle (`dnd.enableDragHandle`), own `componentOverlay`, and the action bar kept inside the iframe (all proved in the hooks check) | S |
| Long-page drag: keep `html { overflow-x: clip }` and nothing on the iframe body; an end-of-page drop area (Layers can't drop after the last section either) | S |
| FreeGrid production pass: auto-height rows, drop at the pointer, 2D drop feedback, touch-sized handles | M |
| Columns gap and image fit settings | S |
| Keyboard-only editing beyond what exists (moving between slots) | M |
| Touch editing pass | M |
| Production review of plan gating (plan Default 5) | S |

## Risks and lock-in

- **Pre-1.0 churn.** 0.19 changed the data model and 0.21 renamed the package. Pin exactly and upgrade on purpose.
- **Reliance on internals.** The FreeGrid editor and two layout rules depend on Puck's canvas wrapper DOM and event handling. The custom drawer's screen-reader fix depends on the `Drawer-draggableBg` class name. A change there breaks the editor, not the storefront. The upgrade-gate e2e test covers this.
- **Performance ceiling.** O(blocks) work per change. Mitigated by the 400-block cap. `_experimentalVirtualization` exists but wasn't tried.
- **Dependencies.** RGL is pinned to 2.2.4 until #2303 is released. dnd-kit, which Puck uses, is pre-1.0.
- **Vendor direction.** The commercial focus is Puck AI and Cloud. The editor core is MIT and makes no service calls (except the Inter font import).
- **Lock-in is low.** The documents are our JSON, validated and migrated by our code, and the storefront is our components behind a 6 KB `<Render>`. Leaving Puck means rewriting the editor shell (M–L) while keeping the stored documents and the storefront. A fork is allowed by MIT. Its cost is tracking upstream.
