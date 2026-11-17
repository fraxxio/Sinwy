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
| 8 | Editor usability review (agent + user) | 7 | done | `docs: puck spike phase 8, editor usability review` |
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

- **Evidence lives in the log.** Every phase's log entry has a **Findings** list and a **Scores** line (✅ native, 🟡 custom work S/M/L, ❌). Phase 8's entry adds the agent and user ease scores; the details and the user's own words are in `docs/puck-usability-tasks.md`.
- **The user's deciding question:** viability depends on how far Puck's own UI and behaviour can be customised (drawer cards with previews, insert position and scroll, the action bar, history without `ui`, dirty state). Forking Puck is the fallback, but a costly one. The verdict must answer this from what phases 1 and 6 did with `overrides`, `getPuck`, `resolvePermissions` and the custom `EditorChrome`, and say what can't be reached without a fork.
- **Dev servers:** web on :3000 and backend on :3001, run in the background with logs in `/tmp/sinwy-web.log` and `/tmp/sinwy-backend.log`. Stop both in phase 9.
- **Phase 9 cleanup:**
  - Delete: `/tmp/sinwy-p7`, `/tmp/sinwy-p8` (incl. the `pw` wrapper), `/tmp/sinwy-build.log`, `/tmp/sinwy-preview.log`, `Sinwy.WebFrontend/dist/`, `.playwright-cli/` snapshots and the login state files in `.playwright-cli/auth/`.
  - Keep: `docs/puck-usability/`, whose screenshots the task file links to.
  - `report1.md` and `report2.md` are untracked at the repo root: ask whether to commit or delete them.

---

## Phase 9: Evaluation write-up and cleanup

**Goal:** `docs/puck-evaluation.md` gives a go/no-go on Puck, backed by everything the spike found. The workspace is clean.

**Files:**
- New: `docs/puck-evaluation.md`.
- `docs/puck-spike-log.md`: every phase's Findings and Scores. Phase 7 holds the performance numbers, phase 8 the ease scores, and phases 1 and 6 the customisation evidence (overrides, chrome, action bar, hotkeys).
- `docs/puck-usability-tasks.md`: both runs, task by task, plus the user's closing summary.
- `Sinwy.WebFrontend/src/shared/components/page-builder/`: `EditorChrome.tsx` and `PageEditor.tsx` show how far the UI was replaced. Use them to answer the customisability question.
- `report1.md` and `report2.md` at the repo root (untracked): the predictions to compare against.
- Issue #72 (`gh issue view 72`).

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
