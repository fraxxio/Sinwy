# Puck spike plan

An experiment to find out whether Puck (`@puckeditor/core`) is a good base for Sinwy's page builder (issue #72). It wires Puck into the real pages flow (editor, versioned save, plan gating, SSR storefront), builds the risky parts (a grid-snapped FreeGrid, per-breakpoint styles, server validation), and stress-tests them. It ends in a written evaluation with a go/no-go. Code quality is secondary: the output is evidence, not production code.

Run a phase with the `implementation-phase` skill. Finished phases and their logs are in [puck-spike-log.md](puck-spike-log.md). Background research: `report1.md` and `report2.md` at the repo root.

## Status

| Phase | Title | Depends on | Status | Commit |
| --- | --- | --- | --- | --- |
| 1 | Puck editor and SSR render on the real pages flow | – | done | `feat(backend, web, shared): puck spike phase 1, editor and ssr render` |
| 2 | FreeGrid: grid-snapped mode in a slot | 1 | todo | |
| 3 | Component set, rich text, theme tokens, Tailwind | 1 | todo | |
| 4 | Per-breakpoint styles | 2, 3 | todo | |
| 5 | Server validation, plan gating, migrations | 3 | todo | |
| 6 | Editor chrome with shadcn, and guardrails | 3 | todo | |
| 7 | Stress tests and performance | 2–6 | todo | |
| 8 | Editor usability review (agent + user) | 7 | todo | |
| 9 | Evaluation write-up and cleanup | 8 | todo | |

## Decisions

Settled with the product owner. Ask before changing any of them.

- **Spike lives in the real app.** Puck data is saved through the existing pages API as a new content `schemaVersion: 2` and rendered by the real storefront route, so auth, versioning, publishing and SSR are tested for real.
- **Branch.** Work stays on the current `pagebuilder-tryout` branch, one commit per phase.
- **Usability review.** An agent runs scripted non-technical-user tasks in the browser and records friction. The user then does the same tasks by hand and adds notes.
- **Evaluation output.** The plan ends with a written evaluation: pros and cons, a performance review, ease of development, ease of use for editors, and a go/no-go.

### Defaults (not yet confirmed; change only if asked)

1. Version 1 pages (the current `widgets` tree) stay as they are. No v1→v2 conversion: the Puck editor opens a v1 page as a blank Puck document, and the first save writes a v2 version.
2. The editor route is `/dashboard/$organizationSlug/pages/$id/edit` and sits inside `_shell` to reuse its organization and member context. It renders as a fixed full-screen layer over the shell.
3. Grid-snapped mode uses react-grid-layout v2 in the editor only. The public render is plain CSS Grid.
4. Theme tokens start from the existing org branding (`brandAttributes`: brand color and font) and add radius and spacing as page root props. A real org-wide token store is out of scope.
5. There is no code-review phase, because nothing merges to master. If the verdict is go, a separate production plan follows, and it includes a review of plan gating.
6. Evaluation is written to `docs/puck-evaluation.md`.

## Standing notes

Verified facts and gotchas the remaining phases rely on. Don't check them again. Each phase prunes this list when it finishes.

- **Record findings as you go.** Every phase's log entry gets a **Findings** list (what worked, friction, bugs, workarounds, Puck issues hit, rough hours spent) and a **Scores** line rating requirements touched as ✅ native, 🟡 custom work (S/M/L) or ❌. Phase 9 builds the evaluation from these, so be honest and specific.
- **Puck API, checked against the v0.24.0 docs:**
  - `walkTree(data, config, cb)` needs the Puck config to find slots. The Bun backend can't import the React config, so server validation walks the tree itself (phase 5).
  - `transformProps(data, transforms, config?)` handles prop migrations, and needs `config` to reach into slots. The docs apply it before both `<Puck>` and `<Render>`.
  - `resolvePermissions(data, params)` receives `params.parent`.
  - `<Puck onAction={(action, appState, prevAppState) => …}>` reports every dispatched action.
  - `iframe: { enabled, waitForStyles, syncHostStyles }`. Disabling the iframe also disables viewports.
- **Puck in our app (phase 1, verified):**
  - The storefront imports `Render` from `@puckeditor/core/rsc`, an editor-free entry that also exports `transformProps`, `walkTree`, `migrate` and `resolveAllData`. The main entry has no `sideEffects` field, so never import it from storefront code.
  - Field definitions live in `render-config.tsx`, because they are plain data and `<Render>` needs the slot ones. `editor-config.tsx` only adds labels, `defaultProps` and categories.
  - Puck 0.22+ injects its own CSS at runtime, so there's no `puck.css` import.
  - The iframe picks up host styles by default, so Tailwind classes work in the canvas. It also gets the app's `body` gradient background (phase 3 or 6 should set a page background).
  - Render skips unknown component types silently.
  - Ids are `Type-<uuid>` (about 45 characters, under `PAGE_CONTENT_LIMITS.widgetId` of 64).
  - `select` and `radio` values are stored as strings (`level: "2"`).
  - #1884 reproduces: children of `<Puck>` remount once (4 mounts in StrictMode), with the iframe on or off. Log phase 1.
  - Rich text in `<Render>` is a `React.lazy` + `Suspense` import of `@tiptap/html`; check what that does to SSR in phase 3.
- **Leads from the research reports, unverified.** Check each one in the phase that needs it:
  - Issue #1848: `richtext` paste ignores `textAlign: false`.
  - Rich text rendering may pull Tiptap and happy-dom into the server bundle (happy-dom is a direct Puck dependency).
  - TanStack Start recipe: PR #1542, not merged.
  - RGL 2.3.0 has a drag regression (#2303), so pin 2.2.4 if it reproduces.
- **Existing content contract:**
  - `pageContentSchema` in `Sinwy.Shared/types/page/PageContent.ts` is a strict object with `schemaVersion: z.literal(1)`.
  - `savePageContentSchema` (`PageSchema.ts:53`) wraps it.
  - The backend caps a content body at 256 KB (`MAX_PAGE_CONTENT_BYTES`, `Sinwy.Backend/modules/pages/controller.ts:25`).
  - Plan gating lives in `contentSaveCheck` (`Sinwy.Backend/modules/pages/service.ts`, around line 200). It rejects a newly added widget whose `WIDGET_TYPES[type].requires` feature the plan lacks; widgets already on the page stay allowed.
  - `advanced-widgets` is in professional and enterprise, not starter (`Sinwy.Shared/types/plan/PlanFeatures.ts`).
- **Seeds:**
  - `bun run dev:seed-scenario subscribed-org` gives a starter org. Its page limit is reached after one page, so each e2e run seeds a fresh org.
  - `pro-org` gives a professional org.
  - Log in with `bun run dev:login-as`. Polar is seeded and simulated; none of these phases touch it.
- **Dev and browser:**
  - Dev servers run in the background with logs in `/tmp/sinwy-backend.log` and `/tmp/sinwy-web.log`.
  - The first visit after importing a new Puck entry makes Vite re-optimize deps and reload, with a one-off "Invalid hook call". Reload and the console is clean.
  - Puck drag and drop needs stepped `page.mouse` moves through `run-code`. The recipe is in the phase 1 log.
  - The editor's Save button gives no success feedback yet (phase 6 header).
- React Compiler is on through `reactCompilerPreset()` in `Sinwy.WebFrontend/vite.config.ts`. Tailwind 4 is loaded from `Sinwy.WebFrontend/src/styles.css`, and the brand variables are applied at `[data-brand-color]` / `[data-brand-font]` (around line 791).

---

## Phase 2: FreeGrid: grid-snapped mode in a slot

**Goal:** a FreeGrid component, nested inside a Section, lets the editor drag and resize its children on a snapping grid. It renders as plain CSS Grid on the storefront. This is the riskiest part of the spike.

**Files:**
- `Sinwy.WebFrontend/src/shared/components/page-builder/render-config.tsx`: component types (`BuilderComponents`), fields and render functions. FreeGrid's public render goes here.
- `page-builder/editor-config.tsx`: labels, `defaultProps`, categories. FreeGrid's editor-only render (RGL) and `resolvePermissions` go here, so RGL never reaches the storefront.
- `page-builder/PageEditor.tsx`: the `<Puck>` wrapper (save through `useGetPuck`, header actions). Add `onAction` logging here.
- `page-builder/PuckPage.tsx`: storefront `<Render>` from `@puckeditor/core/rsc`.
- `Sinwy.WebFrontend/src/shared/tests/page-renderer.test.ts`: SSR render tests. Put the layout-to-CSS-Grid unit test next to it.
- `Sinwy.WebFrontend/package.json`: add `react-grid-layout` v2.

**Steps:**
- `items` is a normal Puck slot, so outline, selection, copy/paste and permissions keep working.
- `layout` is a per-breakpoint map (`desktop`, `tablet`, `mobile`) of RGL items `{ i, x, y, w, h }`, keyed by child id.
- Editor render (`puck.isEditing`): RGL with no compaction. Overlap stays off unless it proves useful. Public render: CSS Grid using `grid-column` and `grid-row`, with no RGL in the storefront bundle.
- Children of a FreeGrid get `drag: false` through `resolvePermissions` when the parent is FreeGrid, so Puck's DnD and RGL don't both grab the gesture.
- Write each RGL `onDragStop` / `onResizeStop` back as one Puck dispatch. Use `onAction` to confirm that one gesture is one history entry.
- Try inserting from the Puck drawer straight into a FreeGrid, and dragging a child out of one. Record what works and what needed a workaround.
- If RGL inside the iframe can't be made to work, try the iframe-disabled mode and record the cost (viewports are lost).

**Tests that matter:**
- The layout-to-CSS-Grid mapping is pure and deterministic, so a unit test pins its output for a sample layout.

**Done when:**
- Inside a FreeGrid, move, resize, select, edit fields, duplicate, delete and undo all work, with one undo step per gesture.
- The storefront shows the same arrangement.
- Phase 9 needs these results to make its go/no-go call, so the Findings must state them plainly.

**Verify:**
- Seed: `subscribed-org`.
- In the editor, add Section > FreeGrid with three Heading children, then drag and resize them.
- Undo once: only the last gesture reverts.
- Save and publish. The public page shows the same positions, and the page's JS has no react-grid-layout chunk (check the network tab).

## Phase 3: Component set, rich text, theme tokens, Tailwind

**Goal:** a realistic block set exists, with inline rich text, theme tokens with live preview, and a working rule for user-chosen styles under Tailwind 4.

**Files:**
- `page-builder/` config and components.
- `Sinwy.WebFrontend/src/shared/lib/branding.ts`: `brandAttributes`, `BRAND_FONT_FAMILIES`.
- `Sinwy.WebFrontend/src/styles.css`: brand variables around line 791.
- `Sinwy.WebFrontend/src/modules/storefront/components/ServiceList.tsx`: can serve as the real data for the booking widget.

**Steps:**
- Components:
  - Columns (2–4 slots), Container, RichText (Puck `richtext` field, `contentEditable`), Image, Button.
  - A BookingWidget that renders the org's services, with a custom field UI (a service picker built with shadcn).
  - Two prebuilt "good-looking" sections (hero, services) whose slots are pre-filled through `defaultProps`.
- Theme tokens: brand color and font come from org branding. Radius and spacing are root fields, written as CSS variables at the root render. Check the live preview inside the iframe.
- Tailwind rule: blocks use static classes that reference CSS variables. User choices are enums mapped to fixed class strings, and free values go through inline CSS variables. Don't use the Tailwind CDN in the iframe.
- Rich text on SSR: check what `<Render>` pulls into the server and client bundles for `richtext` (the happy-dom lead). If it's heavy, sketch a small renderer of our own and note the cost.

**Tests that matter:**
- Rich text output is sanitized: a stored `<script>` or `javascript:` link doesn't reach the public HTML.

**Done when:**
- A salon-style homepage can be built from these blocks and looks the same in the editor and on the storefront.
- Changing a root token updates the preview live.

**Verify:**
- Seed: `pro-org`.
- Build a page with a hero, columns, rich text with a bold word, a link and a list, and a booking widget. Change the radius token: every block's corners update in the preview.
- Publish. The public HTML has the formatted text and the services list, styled the same as in the editor.

## Phase 4: Per-breakpoint styles

**Goal:** spacing, visibility, layout and FreeGrid positions can be set separately for desktop, tablet and mobile, and the storefront honours them.

**Files:**
- `page-builder/` config, components and FreeGrid from phases 2 and 3.
- `Sinwy.WebFrontend/src/styles.css`.

**Steps:**
- Add a `responsive<T>` custom field storing `{ base, tablet?, mobile? }`. Components turn it into CSS variables, which a small static stylesheet reads inside media or container queries.
- Tie the field to Puck's viewport switcher if possible: editing in the mobile viewport writes the mobile value. Record how much glue this needed.
- FreeGrid reads its per-breakpoint layout. A breakpoint without its own layout falls back to stacking its children in order.
- Try visibility per breakpoint (hide on mobile).

**Tests that matter:**
- The responsive-value-to-CSS-variable mapping, including the fallback when a breakpoint isn't set.

**Done when:**
- Rearranging a FreeGrid and changing padding in the mobile viewport leaves desktop unchanged, and a narrow browser window on the storefront shows the mobile layout.

**Verify:**
- Seed: `subscribed-org` with the phase 2 page.
- Switch to the mobile viewport, move a FreeGrid child, hide one block and change a Section's padding.
- Back on desktop, nothing has changed.
- Publish, then load the public page at 375 px and at 1280 px widths: each matches its own editor view.

## Phase 5: Server validation, plan gating, migrations

**Goal:** the backend refuses invalid or plan-locked v2 documents, and a stored document survives a component prop change.

**Files:**
- `Sinwy.Shared/types/page/PageContent.ts`.
- `Sinwy.Shared/types/plan/PlanFeatures.ts`.
- `Sinwy.Backend/modules/pages/service.ts`: `contentSaveCheck`.
- `Sinwy.Backend/modules/pages/tests/`.
- `page-builder/` config, where gating is filtered per plan.

**Steps:**
- In `Sinwy.Shared`, add one Zod schema per component's props, keyed by component type, along with which props are slots. Walk the tree ourselves; Puck's `walkTree` needs the React config.
- Reject:
  - unknown types
  - bad props
  - duplicate ids
  - over-deep or oversized trees (reuse the `PAGE_CONTENT_LIMITS` idea)
  - unsafe URLs
- Record how much of this duplicates the Puck config, and whether one source can drive both.
- Gating:
  - Mark BookingWidget (or a gallery) as `requires: "advanced-widgets"`.
  - The editor config built for a starter plan doesn't offer it.
  - `contentSaveCheck` applies the existing rule to v2: a newly added gated component is refused, one already on the page stays.
- Migration: rename one prop on a component that pages already use. Apply `transformProps` before `<Puck>` and `<Render>`, and decide whether stored documents are also migrated on save. Record the friction.

**Tests that matter:**
- A starter plan can't save a newly added gated component; a page that already had it stays saveable.
- Unknown type, bad prop, `javascript:` URL and an over-deep tree are each refused.
- An old-shape document renders correctly after the migration.

**Done when:**
- A forged save with a gated component on a starter org returns 402 with `PLAN_UPGRADE_REQUIRED`.
- Pages saved before the prop rename still render.

**Verify:**
- Seed: `subscribed-org` and `pro-org`.
- As the pro owner, add a BookingWidget and save: it saves.
- As the starter owner, the widget isn't in the drawer. A save replayed with it (copied request body) gets 402, and no new `page_content` row appears.
- Open a page saved before the rename: it renders unchanged.

## Phase 6: Editor chrome with shadcn, and guardrails

**Goal:** we know how far Puck's UI can be replaced with our own shadcn components, and which guardrails for non-technical users come built in versus need building.

**Files:**
- Editor route and `page-builder/` config.
- `Sinwy.WebFrontend/src/shared/components/ui/`: the shadcn components.

**Steps:**
- Recompose the editor with `<Puck>` children and overrides:
  - our own header (save, publish, undo/redo, viewport switch)
  - component drawer
  - outline
  - a fields panel that uses shadcn inputs for the common field types
- Record which parts couldn't be replaced, and how the result looks against our design rules (`docs/design-rules.md`).
- Guardrails to try:
  - undo and redo with the keyboard
  - copy/paste and duplicate
  - templates (start a page from a preset)
  - locked props (a preset section whose layout can't be changed)
  - required children that can't be deleted
  - sensible defaults on insert
  - keyboard-only navigation
- Theme the leftover Puck chrome through its CSS custom properties to match ours.

**Tests that matter:**
- None beyond keeping verify green; this phase is UI exploration.

**Done when:**
- The editor reads as part of Sinwy, and Findings list every guardrail as native, custom (with effort), or not possible.

**Verify:**
- Seed: `pro-org`.
- Start a new page from a template, duplicate a section, try to delete a locked child (refused), undo twice with the keyboard, and save from the custom header. A new version row appears.

## Phase 7: Stress tests and performance

**Goal:** there are numbers and observations for large pages, bundle sizes, SSR cost, deep nesting, touch editing, and breaking the page on purpose.

**Files:**
- Everything above.
- The build output from `bun run build` in `Sinwy.WebFrontend`.

**Steps:**
- Bundle sizes, gzipped:
  - editor route chunk(s)
  - storefront page route JS with and without the Puck renderer
  - whether Puck, Tiptap, RGL or happy-dom leak into the storefront
  - whether a lighter Render-only entry exists
- Large page: generate a document with 50+ sections and around 200 components through the API.
  - Measure editor load time, drag and typing responsiveness, and save time.
  - Measure SSR render time and HTML size.
  - Check whether the document hits the 256 KB cap.
  - Use a Chrome DevTools performance trace for editor interactions; ask the user to enable that MCP if it's off.
- Deep nesting: Section > Columns > Container > FreeGrid > block. Drag between nested slots and in and out of containers.
- Touch: an emulated tablet with touch, covering drag, select, resize in FreeGrid and rich text editing.
- Break it like a novice would:
  - drop blocks in odd places
  - delete required children
  - paste junk HTML into rich text
  - undo far back
  - open the same page in two tabs and save both (the existing `version-conflict` path)

**Tests that matter:**
- None new. Record measurements in Findings as numbers, with the machine and build mode stated.

**Done when:**
- Findings hold a table of bundle sizes and timings, and a list of what broke.

**Verify:**
- Seed: `pro-org` plus the generated large page.
- Open the large page in the editor, drag a section to the end, and type in a rich text block. Save and publish. The public page renders server-side.
- The second tab's save shows the "saved somewhere else" error and doesn't overwrite.

## Phase 8: Editor usability review (agent + user)

**Goal:** a judgement, from both a scripted run and the user's own hands-on session, of how easy the editor is for a non-technical business owner.

**Files:**
- New: `docs/puck-usability-tasks.md`, the task script.

**Steps:**
- Write 6–8 tasks in a salon owner's words, for example:
  - "make a homepage with your services and a booking button"
  - "change your brand color"
  - "put two photos side by side"
  - "make it look right on a phone"
  - "fix a typo"
  - "undo a mistake"
  - "add the premium gallery on a starter plan"
- Agent run: drive each task with `playwright-cli`, cold, from the task wording alone. Record:
  - steps taken
  - dead ends
  - unclear labels
  - moments a broken design was possible
  - a 1–5 ease score per task
  - screenshots of friction points only
- Hand the same script to the user. Wait for their notes, and add them next to the agent's.

**Tests that matter:**
- None.

**Done when:**
- `docs/puck-usability-tasks.md` holds the tasks, the agent's results and the user's notes.

**Verify:** None; the review is the flow.

## Phase 9: Evaluation write-up and cleanup

**Goal:** `docs/puck-evaluation.md` gives a go/no-go on Puck, backed by everything the spike found. The workspace is clean.

**Files:**
- `docs/puck-spike-log.md`: every phase's Findings and Scores.
- `docs/puck-usability-tasks.md`.
- `report1.md` and `report2.md`.
- Issue #72.

**Steps:**
- Write `docs/puck-evaluation.md` with these sections:
  - **Verdict:** go, no-go, or go with conditions, plus the runner-up (the assemble-it-ourselves stack) if no-go.
  - **Requirements scorecard:** requirements 1–9 from the research prompt as ✅ / 🟡 (S/M/L) / ❌, with evidence from the log, compared against what the reports predicted.
  - **Pros and cons.**
  - **Performance review:** bundle sizes, editor responsiveness, SSR timings, large-page behaviour.
  - **Ease of development:** API ergonomics, TypeScript quality, docs, workarounds, Puck bugs hit, and time spent against expectations.
  - **Ease of use for editors:** the agent's and the user's usability findings.
  - **What we'd build ourselves:** each item with S/M/L effort.
  - **Risks and lock-in.**
- Post a short summary comment on issue #72 linking the evaluation (ask the user before posting).
- Stop every dev server started during the plan's work.
- Delete the scratch artifacts: probe scripts, screenshots, generated large-page fixtures, browser logs.
- Keep the spike code on the branch.

**Tests that matter:**
- None.

**Done when:**
- The evaluation is written.
- The issue comment is posted or explicitly skipped.
- No dev servers or scratch files remain.

**Verify:** None.
