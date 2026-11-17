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
| 7 | Stress tests and performance | 2–6 | done | `docs: puck spike phase 7, stress tests and performance` |
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

- **Record findings as you go.** Every phase's log entry gets a **Findings** list (what worked, friction, bugs, workarounds, Puck issues hit, rough hours spent) and a **Scores** line rating requirements touched as ✅ native, 🟡 custom work (S/M/L) or ❌. Phase 9 builds the evaluation from these, so be honest and specific. Implementation details of phases 1–6 were pruned from these notes; they are in each phase's log entry.
- **Editor behaviour a user will hit (phases 6–7, verified; details in the logs):**
  - Hotkeys: Ctrl/⌘+Z/Shift+Z/Y and Delete are Puck's; Ctrl/⌘+C/V/D, Alt+↑/↓ and Escape are ours. History is debounced 300 ms, so wait about 400 ms between steps in tests.
  - Guardrails: Hero's first Heading and Button and Services' children can't be removed ("This block can't be removed"); Services' slot takes nothing new. Every other slot accepts any block, including Hero, Services and Section, and depth over 6 is only refused at save (400 toast).
  - Gating: Booking widget requires `advanced-widgets` (professional and enterprise). `editorConfigFor` hides it from the drawer on starter; the server refuses a new one with 402 `PLAN_UPGRADE_REQUIRED`.
  - Breakpoints: phone < 640, tablet 640–1023, desktop ≥ 1024. Editor viewports: Desktop 1280, Tablet 768, Phone 375.
  - Brand colour and font are org settings (`/dashboard/<slug>/settings/branding`), not editor fields. The editor's "Page" settings hold corner roundness and spacing.
  - Grabbing blocks (phase 7): Text blocks can't be dragged in the canvas (pressing selects text); grab a Heading or Button beside its text, a Section in its padding, a FreeGrid child at its cell centre (edges resize). The canvas doesn't auto-scroll while dragging; wheel-scroll during the drag. Touch needs a press-and-hold of at least 300 ms.
- **Seeds:**
  - Phase 7: pro org `seed-861ca6a6` (id `56364cfe-7e0b-45fb-82bd-f84c489e6333`, owner `webdevrokas+seed-861ca6a6-owner@gmail.com`): `large` (252 blocks, published), `small`, `nesting`, `shallow-grid`.
  - Phase 6: pro org `seed-76cc4ae3` (owner `webdevrokas+seed-76cc4ae3-owner@gmail.com`), page `phase-six-test` built from the Salon homepage template (versions 1–3).
  - Phase 5: pro org `seed-ec82fe5b` (page `pro-booking`, has a BookingWidget) and starter org `seed-c2b0a828` (page `starter-page`, page limit used).
  - Phase 3's pro org `seed-8cb1127f` (id `049b0269-7a40-4af6-9b5c-b0c548212db6`, owner `webdevrokas+seed-8cb1127f-owner@gmail.com`) has 3 services and two published v2 pages: `home` and `salon`.
  - `bun run dev:seed-scenario subscribed-org` gives a starter org. Its page limit is reached after one page, so seed a fresh one per run. `pro-org` gives a professional org (no services; add them in the dashboard for a booking task).
  - Log in with `bun run dev:login-as --email <email> --state`, then `playwright-cli state-load` the printed file. Polar is seeded and simulated; none of these phases touch it.
- **Dev and browser:**
  - Dev servers run in the background with logs in `/tmp/sinwy-backend.log` and `/tmp/sinwy-web.log`. The pages API takes the org UUID: `PUT /api/organizations/<orgId>/pages/<pageId>/content`, `POST …/publish`.
  - Our canvas scales the iframe to fit (about 60% for Desktop at 1440×900). Plain `locator.click()` inside the frame times out; click with `page.mouse` at points from `boundingBox()`.
  - Puck drag and drop needs stepped `page.mouse` moves through `run-code` (25 moves of 20 ms, a few small moves at the target, wait 300 ms, release). The recipe is in the phase 1 log.
  - Each drawer item renders twice: match `getByRole('button', { name: 'Add <Label>', exact: true }).first()` and click its box centre. The DOM can hold two action bars; the live one is `.last()`.
  - Field inputs: `input[name="<prop>"]:visible`. Puck `select` options are JSON in the DOM: use `selectOption({ label })`. Radio options are `<label>`s. The root fields open from the "Page" breadcrumb (`button[class*=breadcrumbLabel]`, click it via `evaluate`).
  - `window.__puckActions` (host window, not the iframe's) lists every dispatched action type.
  - Production-build timing (phase 7): `vite preview --port 4173` serves the build and proxies `/api`, but Better Auth refuses that origin; in Playwright, proxy `/api` with `route.fetch({ headers: { …, origin: "http://localhost:3000" } })` (overriding the header with `route.continue` doesn't work). Standalone Playwright scripts need `executablePath: "/run/current-system/sw/bin/chromium"`.
  - The Chrome DevTools MCP logs in on :3000 by setting `better-auth.session_token` through `document.cookie` (URL-encoded) in an isolated context.
- **Phase 9 cleanup:** phase 7 left scratch scripts and traces in `/tmp/sinwy-p7`, `/tmp/sinwy-build.log`, `/tmp/sinwy-preview.log`, `Sinwy.WebFrontend/dist/`, and login state files in `.playwright-cli/auth/`.

---

## Phase 8: Editor usability review (agent + user)

**Goal:** a judgement, from both a scripted run and the user's own hands-on session, of how easy the editor is for a non-technical business owner.

**Files:**
- New: `docs/puck-usability-tasks.md`, the task script.
- What the tasks touch (read, don't change):
  - `Sinwy.WebFrontend/src/shared/components/page-builder/`: `EditorChrome.tsx` (header, Add/Layers/Templates, toolbar), `editor-config.tsx` (drawer labels and categories, guardrails, `editorConfigFor` plan gating), `templates.ts` ("Salon homepage", "Simple page"), `render-config.tsx` (field labels).
  - `Sinwy.WebFrontend/src/modules/org-dashboard/routes/`: `_shell.pages.new.tsx` (new page), `_shell.pages.$id.edit.tsx` (editor), `_shell.settings.branding.tsx` (brand colour and font live here, not in the editor).
- There's no "premium gallery" block. The only plan-gated block is Booking widget (`advanced-widgets`, professional and up); use it for the starter-plan task.
- Known friction from phase 7 (log): no auto-scroll while dragging, Text blocks can't be dragged in the canvas, nonsense nesting is allowed, depth errors only at save.

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
