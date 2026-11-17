# Puck spike plan

An experiment to find out whether Puck (`@puckeditor/core`) is a good base for Sinwy's page builder (issue #72). It wires Puck into the real pages flow (editor, versioned save, plan gating, SSR storefront), builds the risky parts (a grid-snapped FreeGrid, per-breakpoint styles, server validation), and stress-tests them. It ends in a written evaluation with a go/no-go. Code quality is secondary: the output is evidence, not production code.

Run a phase with the `implementation-phase` skill. Finished phases and their logs are in [puck-spike-log.md](puck-spike-log.md). Background research: [puck-research-report1.md](puck-research-report1.md) and [puck-research-report2.md](puck-research-report2.md). Outcome: [puck-evaluation.md](puck-evaluation.md).

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
| 9 | Evaluation write-up and cleanup | 8 | done | `docs: puck spike phase 9, evaluation write-up and cleanup` |

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

- **The spike is finished.** The verdict (go, with conditions) is in [puck-evaluation.md](puck-evaluation.md); the research reports it compares against are `docs/puck-research-report1.md` and `report2.md`. A production plan starts from the evaluation's conditions and its "What we'd build ourselves" table.
