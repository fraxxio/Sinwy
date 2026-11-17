# Puck spike plan

An experiment to find out whether Puck (`@puckeditor/core`) is a good base for Sinwy's page builder (issue #72). It wires Puck into the real pages flow (editor, versioned save, plan gating, SSR storefront), builds the risky parts (a grid-snapped FreeGrid, per-breakpoint styles, server validation), and stress-tests them. It ends in a written evaluation with a go/no-go. Code quality is secondary: the output is evidence, not production code.

Run a phase with the `implementation-phase` skill. Finished phases and their logs are in [puck-spike-log.md](puck-spike-log.md). Background research: `report1.md` and `report2.md` at the repo root.

## Status

| Phase | Title | Depends on | Status | Commit |
| --- | --- | --- | --- | --- |
| 1 | Puck editor and SSR render on the real pages flow | – | done | `feat(backend, web, shared): puck spike phase 1, editor and ssr render` |
| 2 | FreeGrid: grid-snapped mode in a slot | 1 | done | `feat(web): puck spike phase 2, freegrid` |
| 3 | Component set, rich text, theme tokens, Tailwind | 1 | done | `feat(web): puck spike phase 3, component set, rich text and tokens` |
| 4 | Per-breakpoint styles | 2, 3 | done | `feat(web): puck spike phase 4, per-breakpoint styles` |
| 5 | Server validation, plan gating, migrations | 3 | done | `feat(backend, web, shared): puck spike phase 5, validation, plan gating and migrations` |
| 6 | Editor chrome with shadcn, and guardrails | 3 | done | `feat(web): puck spike phase 6, editor chrome and guardrails` |
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
  - `resolvePermissions(data, params)` receives `params.parent`.
  - `<Puck onAction={(action, appState, prevAppState) => …}>` reports every dispatched action.
  - `iframe: { enabled, waitForStyles, syncHostStyles }`. Disabling the iframe also disables viewports.
- **Puck in our app (phase 1, verified):**
  - The storefront imports `Render` from `@puckeditor/core/rsc`, an editor-free entry that also exports `transformProps`, `walkTree`, `migrate` and `resolveAllData`. The main entry has no `sideEffects` field, so never import it from storefront code.
  - Field definitions live in `render-config.tsx`, because they are plain data and `<Render>` needs the slot ones. `editor-config.tsx` only adds labels, `defaultProps` and categories.
  - Puck 0.22+ injects its own CSS at runtime, so there's no `puck.css` import.
  - The iframe picks up host styles by default, so Tailwind classes work in the canvas. It also gets the app's `body` gradient, which the storefront shows too, so it was kept (phase 3).
  - Render skips unknown component types silently.
  - Ids are `Type-<uuid>` (about 45 characters, under `PAGE_CONTENT_LIMITS.widgetId` of 64).
  - `select` and `radio` values are stored as strings (`level: "2"`).
  - #1884 reproduces: children of `<Puck>` remount once (4 mounts in StrictMode), with the iframe on or off. Log phase 1.
- **Leads from the research reports, unverified.** TanStack Start recipe: PR #1542, not merged. (#1848 and the happy-dom lead were checked in phase 3: neither reproduced.)
- **Blocks, tokens and rich text (phase 3, verified; details in the phase 3 log):**
  - Services, org slug and branding reach renders through Puck `metadata` (`builderMetadata()` in `theme-tokens.ts`). Custom fields don't get `metadata`, so the editor also provides services through `BuilderServicesContext`.
  - Root tokens are CSS variables `--pb-radius` / `--pb-space`, set by the root render; blocks use static classes like `rounded-(--pb-radius)`. Every enum maps to a fixed class string through `known()`, unknown values fall back.
  - The editor wraps each slot child in Puck's `[data-puck-component]` div and `<Render>` doesn't, so `justify-items` and `w-full` behave differently in the two. Alignment uses inherited `text-align` instead; keep that rule for responsive layout.
  - The storefront renders rich text through `fieldTransforms.richtext` → `renderRichText` (`rich-text.tsx`), an allowlist HTML-to-React converter. Puck's own renderer lazy-loads about 117 KB gzip of Tiptap and sends each block twice in the SSR stream. The editor still uses Puck's.
  - FreeGrid's gap stays a fixed 16 px: RGL needs pixel margins, so it doesn't follow `--pb-space`.
  - Puck `select` options are JSON in the DOM (`{"value":"large"}`): use `selectOption({ label })`, finding the select by `option[value*=large]`. Radio options are `<label>`s. The root fields open from the "Page" breadcrumb (`button[class*=breadcrumbLabel]`, click it via `evaluate`).
  - Editing `render-config.tsx` makes Vite do a full reload ("Could not Fast Refresh"), not HMR.
- **FreeGrid (phase 2, verified; details in the phase 2 log):**
  - `react-grid-layout` is pinned to exactly 2.2.4, because #2303 reproduces on 2.3.0. Don't upgrade it until a fixed release is out.
  - Layout is `{ desktop, tablet?, mobile? }`, each a map of child id to `{ x, y, w, h }` on 12 columns × 40 px rows with a 16 px gap (`free-grid-layout.ts`). Children without a cell stack at the bottom. Tablet without its own layout uses desktop's; phone stacks (`cellsByBreakpoint`, phase 4).
  - Placement has two paths. The editor uses a generated `<style>` with `@media` rules targeting Puck's `[data-puck-component="<id>"]` wrapper. The storefront uses `<Items as={FreeGridCells}>`, which wraps children by their React key (the id) in `[data-pb-cell]` divs with per-breakpoint variables.
  - Gestures write back through one `replace` dispatch (one history entry); `setUi` adds none. The compactor prevents collisions.
  - Grid children keep Puck drag. `drag: false` makes them `aria-disabled` and drags the parent instead.
- **Responsive props (phase 4, verified; details in the phase 4 log):**
  - Values are `{ base, tablet?, mobile? }`, or a plain value saved before a prop became responsive (read as `base`). Responsive props: Section/Services `padding`, `align` (Hero, Container, Heading, Button), Container `width`, Columns `count`, and `visibility` on every block (added by `withVisibility`, not in `BuilderComponents`).
  - Fields carry their options in Puck field `metadata.responsive` (`responsiveField()`), so phase 5's per-prop Zod schemas can be derived from the same data.
  - Breakpoints: phone < 640, tablet 640–1023, desktop ≥ 1024 (Tailwind `max-sm` / `max-lg`). Editor viewports: Desktop 1280, Tablet 768, Phone 375. The canvas iframe has the viewport's width, so media queries apply in the editor.
  - The pages API takes the org UUID, not the slug: `PUT /api/organizations/<orgId>/pages/<pageId>/content`, `POST …/publish`.
- **Puck editor DOM and events (phase 2):**
  - `[data-puck-component] *` gets `pointer-events: none` in the editor, so interactive UI inside a block needs `pointer-events: auto !important`.
  - Puck's drag starts on `pointerdown` on the component wrapper.
  - React listens at the iframe portal root: a native `stopPropagation` on `click` also blocks React `onClick` below it.
  - Every prop needs a field; hidden data uses a `custom` field.
- **Editor chrome (phase 6, verified; details in the phase 6 log):**
  - `EditorChrome.tsx` composes the editor from `<Puck>` children (header, Add/Layers/Templates, `EditorCanvas`, block toolbar + `Puck.Fields`). Puck's `Canvas` isn't exported: our canvas sizes and scales the iframe, `PageEditor` passes `ui.viewports` to start on Desktop, and a `CanvasZoom` context counter-scales our action bar. The header has Save (toast, dirty state from the history index) and Publish.
  - Editing commands live in `use-block-actions.ts`. Place blocks with `insert` + `replace` (one undo step, runs `resolveData`). `setData` needs `recordHistory: true` and skips `resolveData`. Puck's duplicate breaks FreeGrid layouts; use `cloneBlock`.
  - Hotkeys: Ctrl/⌘+Z/Shift+Z/Y and Delete are Puck's; Ctrl/⌘+C/V/D, Alt+↑/↓ and Escape are ours. History is debounced 300 ms, so wait about 400 ms between steps in tests.
  - Guardrails: `REQUIRED_CHILDREN` (Hero's first Heading and Button) and `LOCKED_LAYOUTS` (Services: slot `allow: []`, `tone`/`padding` read-only) in `editor-config.tsx`. A protected block's delete button reads "This block can't be removed".
  - Each drawer item renders twice: match `getByRole('button', { name: 'Add <Label>', exact: true }).first()` and click its box centre. Field overrides render their own label. `usePuck` selectors must return primitives or stable references.
  - Puck's tokens are overridden at `:root` in `styles.css` ("Page builder: Puck's own chrome").
- **Content contract (phase 5, verified; details in the phase 5 log):**
  - `Sinwy.Shared/types/page/PuckContent.ts`: `BLOCKS` (a strict Zod schema per block's props, its slots, `requires`), `BLOCK_VALUES`, `ROOT_PROPS`, `PUCK_LIMITS` (depth 6, 400 blocks), `BLOCK_MIGRATIONS`.
  - Adding a block or prop: update `BLOCKS` and the Puck fields together. `page-builder-contract.test.ts` fails when they drift, and the server refuses unknown props with 400.
  - A prop rename is an idempotent entry in `BLOCK_MIGRATIONS`. The server applies it on save; `migrateDocument()` (`PuckPage.tsx`) applies it on read for both `<Puck>` and `<Render>`.
  - Heading's prop is `size` (was `level`).
  - The backend caps a content body at 256 KB (`MAX_PAGE_CONTENT_BYTES`, `Sinwy.Backend/modules/pages/controller.ts`).
  - Gating: `contentSaveCheck` refuses a gated type (`gatedTypesIn`) that the latest version doesn't have, with 402 `PLAN_UPGRADE_REQUIRED` (code 4021). BookingWidget requires `advanced-widgets` (professional and enterprise).
  - `editorConfigFor(entitlements.features)` hides locked blocks from the drawer and from Services' default children.
  - URL rules (`resolveHref`, `imageSrc`) live in `Sinwy.Shared/types/page/PageUrls.ts`.
  - The backend dev server runs without `--watch`: restart it after changing Shared or backend code.
- **Seeds:**
  - Phase 6: pro org `seed-76cc4ae3` (owner `webdevrokas+seed-76cc4ae3-owner@gmail.com`), page `phase-six-test` built from the Salon homepage template (versions 1–3).
  - Phase 5: pro org `seed-ec82fe5b` (page `pro-booking`, has a BookingWidget) and starter org `seed-c2b0a828` (page `starter-page`, page limit used).
  - Phase 3's pro org `seed-8cb1127f` (id `049b0269-7a40-4af6-9b5c-b0c548212db6`, owner `webdevrokas+seed-8cb1127f-owner@gmail.com`) has 3 services and two published v2 pages: `home` (plain-value props from before phase 4) and `salon` (responsive props and a FreeGrid with `layout.mobile`).
  - Phase 4's starter org `seed-8a603a43` has published page `p4-e2e` with responsive values.
  - `bun run dev:seed-scenario subscribed-org` gives a starter org. Its page limit is reached after one page, so each e2e run seeds a fresh org.
  - `pro-org` gives a professional org.
  - Log in with `bun run dev:login-as --email <email> --state`, then `playwright-cli state-load` the printed file. Polar is seeded and simulated; none of these phases touch it.
- **Dev and browser:**
  - Dev servers run in the background with logs in `/tmp/sinwy-backend.log` and `/tmp/sinwy-web.log`.
  - The first visit after importing a new Puck entry makes Vite re-optimize deps and reload, with a one-off "Invalid hook call". Reload and the console is clean.
  - After changing a dependency's version, Vite keeps serving the old pre-bundle. Stop the web server, delete `Sinwy.WebFrontend/node_modules/.vite/deps`, and start it again (`bun run start:web > /tmp/sinwy-web.log`).
  - Our canvas scales the iframe to fit (about 60% for Desktop at 1440×900). Plain `locator.click()` inside the frame times out; click with `page.mouse` at points from `boundingBox()`.
  - The DOM can hold two action bars; the live one is `.last()`.
  - Field inputs: `input[name="<prop>"]:visible`.
  - `window.__puckActions` lists every dispatched action type.
  - Puck drag and drop needs stepped `page.mouse` moves through `run-code`. The recipe is in the phase 1 log.
- React Compiler is on through `reactCompilerPreset()` in `Sinwy.WebFrontend/vite.config.ts`. Tailwind 4 is loaded from `Sinwy.WebFrontend/src/styles.css`, and the brand variables are applied at `[data-brand-color]` / `[data-brand-font]` (around line 791).

---

## Phase 7: Stress tests and performance

**Goal:** there are numbers and observations for large pages, bundle sizes, SSR cost, deep nesting, touch editing, and breaking the page on purpose.

**Files:**
- `Sinwy.WebFrontend/src/shared/components/page-builder/`:
  - `PageEditor.tsx` (the `<Puck>` props) and `EditorChrome.tsx` (layout, `EditorCanvas` scaling, header save and publish).
  - `use-block-actions.ts`: insert, duplicate, paste and move. Use it to build the large page in the browser, or generate the JSON directly.
  - `editor-config.tsx`, `render-config.tsx`, `rich-text.tsx` (the storefront rich text renderer), `FreeGridEditor.tsx` (RGL, editor only).
  - `PuckPage.tsx`: `<Render>` from `@puckeditor/core/rsc`, used by `Sinwy.WebFrontend/src/shared/components/page-content/PageRenderer.tsx`.
- `Sinwy.WebFrontend/src/modules/storefront/routes/$pageSlug.tsx`: the SSR storefront page.
- `Sinwy.WebFrontend/src/modules/org-dashboard/routes/_shell.pages.$id.edit.tsx`: save with `baseVersion`, which is the version-conflict path for the two-tab test.
- `Sinwy.Shared/types/page/PuckContent.ts` (`PUCK_LIMITS`: depth 6, 400 blocks) and `Sinwy.Backend/modules/pages/controller.ts` (`MAX_PAGE_CONTENT_BYTES`, 256 KB).
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
