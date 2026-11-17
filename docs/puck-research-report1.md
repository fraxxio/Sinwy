# Sinwy Page Builder: Library Selection Report (checked 16 Nov 2026)

Build Sinwy's Page Builder on **Puck (`@puckeditor/core`, MIT, v0.24.0 released 29 Oct 2026)**. Add one custom "Free Grid" component that embeds **react-grid-layout v2** in the editor only and renders as plain CSS Grid on the public site. Use Puck's built-in **Tiptap-based `richtext` field** for inline text. No other permissively licensed framework covers as many of the nine requirements while still being actively maintained. The main gap is that no candidate has a native grid-snapped mode, so we build that part ourselves whichever library we pick.

## TL;DR
- **Top pick: Puck plus a custom react-grid-layout "Free Grid" slot component.** Puck is MIT, ships a release every 2–4 months, and as of 0.24 has nested slots, a permissions API, Tiptap rich text, data-migration helpers, theming, i18n of the editor chrome and a server-safe `<Render>`. That covers requirements 2 and 4–9 natively or with S/M work. Requirement 1 (grid-snapped mode) and requirement 3 (per-breakpoint styles) are M/L custom work on any candidate.
- **Runner-up: assemble it ourselves** from `@dnd-kit/react`, react-grid-layout v2 and Tiptap, with our own JSON document model. Choose this only if the spike shows Puck's iframe canvas and drag-and-drop can't host a nested grid-snapped mode cleanly. It costs roughly 2–3× more engineering, and `@dnd-kit/react` is still pre-1.0 (0.5.3).
- **Excluded:** Easyblocks, Webstudio and Plasmic Studio fail on copyleft licensing. Builder.io is a SaaS dependency. ChaiBuilder's core is BSD-3, but Postgres storage and multi-tenancy are in the paid Pro tier. GrapesJS core is BSD-3, but its React renderer is in the commercial Studio SDK. Craft.js is MIT but has had no release since 14 Feb 2025 and is effectively unmaintained.

## 1. Executive recommendation

**Top pick: Puck plus three things we build: a "Free Grid" component (react-grid-layout v2 in the editor, CSS Grid on render), a responsive-style field type, and server-side Zod validation via `walkTree`.**

Puck is the only actively maintained, permissively licensed, React-native editor that already treats our own components as first-class:
- typed `fields`, custom field UIs and slots
- per-component and per-instance permissions
- rich text as a field type
- prop migrations
- a renderer that runs on the server

Its default UI can be themed with CSS custom properties (0.22) and translated with a Dictionary API (0.23). It can also be recomposed by rendering our own layout as children of `<Puck>`. Our shadcn panels can therefore replace most of the chrome.

**Runner-up: the "assemble it ourselves" stack** (`@dnd-kit/react` + react-grid-layout v2 + Tiptap + our own document model). Switch to it if the spike shows either of these:
- (a) react-grid-layout inside Puck's iframe canvas conflicts with Puck's drag-and-drop or selection in ways overrides can't fix
- (b) Puck's undo history can't be made to treat a grid move as a single step

Do not choose Craft.js, even though it is MIT and React-native. Its last release is 0.2.12 (14 Feb 2025), and issue #747, "Is Craft.js still maintained?" (opened 1 Nov 2025), is still open with 5 comments per the GitHub issues list, while the 11 Dec 2025 discussion "Is the Craft.js still alive ?" shows 0 replies.

## 2. Comparison table (candidates that passed the hard constraints)

Legend: ✅ native · 🟡 possible with custom work (S/M/L) · ❌ not feasible. All rows checked 16 Nov 2026.

| | **Puck** | **DIY: dnd-kit/react + RGL v2 + Tiptap** | **Craft.js** | **GrapesJS core (OSS only)** |
|---|---|---|---|---|
| License (repo / npm) | MIT (npm sidebar "License MIT"; README "licensed under MIT"; LICENSE file not opened directly) | dnd-kit/react MIT (npm); RGL MIT and Tiptap core MIT not re-verified this session | MIT per third-party comparison; LICENSE not verified this session | BSD-3-Clause (third-party check of `packages/core/LICENSE` and package.json) |
| Latest version / date | 0.24.0 / 29 Oct 2026 | @dnd-kit/react 0.5.3 (MIT, 2,334,569 weekly downloads, "Published 13 days ago" per npm; already out by 31 Oct 2026); RGL 2.3.0 released 5 Oct 2026 (2.2.4 released 29 Jul 2026) | @craftjs/core 0.2.12 / 14 Feb 2025 | v0.22.16 released 28 Apr 2026, since superseded by v0.23.x (0.23.1 on 26 May 2026, 0.23.3 on 24 Jul 2026; GitHub lists up to v0.23.9) |
| Maintenance health | Active: 0.21 (Jan), 0.22 (Jun), 0.23 (Aug), 0.24 (Oct 2026); ~179k weekly npm downloads; company-backed | dnd-kit active but pre-1.0; RGL v2 TS rewrite Dec 2025, 2.3.0 has a drag regression (#2303) | Stalled: no release in ~21 months; "still maintained?" issue open | Active core; business model is the commercial Studio SDK |
| Bundle size (editor / renderer) | Unverified; no published figure. Renderer is `<Render>` from the main package, server-capable | Unverified; we control it | Unverified | Unverified |
| 1. Blocks + slots + grid mode | 🟡 Slots ✅; grid-snapped mode = custom RGL component (M–L) | 🟡 Everything custom (L) | 🟡 Canvas nodes ✅; grid mode custom (L) | 🟡 Nested components ✅; absolute/drag mode exists in core but not React-native (L) |
| 2. Custom components, per-plan gating, server validation | ✅ config + permissions; 🟡 Zod validation via `walkTree` (S–M) | 🟡 (M) | 🟡 resolver map; no permission API (M) | 🟡 React components need custom bridge or paid Studio SDK (L) |
| 3. Per-breakpoint styling | 🟡 custom responsive field + CSS vars (M); Puck viewports exist | 🟡 (M) | 🟡 (M) | ✅ device-based style manager (CSS-based) |
| 4. Inline rich text | ✅ Tiptap `richtext` field with `contentEditable` (0.21) | 🟡 Tiptap integration (M) | 🟡 bring your own (M) | ✅ built-in RTE (non-React) |
| 5. Global theme tokens | 🟡 root props → CSS variables (S) | 🟡 (S) | 🟡 (S) | 🟡 (S–M) |
| 6. JSON model, migrations, determinism | ✅ JSON `Data`; `migrate`, `transformProps`, `walkTree` | 🟡 design it (M) | 🟡 serialized node map; no migration helpers (M) | 🟡 project JSON; HTML/CSS oriented (M) |
| 7. Separate SSR renderer | ✅ `<Render>` works in server environments | 🟡 (M) | 🟡 needs own renderer (M) | 🟡 render stored HTML/CSS or write React renderer (M–L) |
| 8. Customizable editor UI | ✅ composition, overrides, CSS-var theming, plugin rail | ✅ fully ours (L) | ✅ headless | 🟡 UI replaceable but non-React core (M) |
| 9. Guardrails (undo, presets, duplicate, lock, kbd/touch) | ✅ history, duplicate, permissions, delete hotkeys, improved mobile UI (0.21); 🟡 templates (S) | 🟡 all custom (L) | 🟡 undo/redo bug report open (#728) | ✅ undo manager, blocks |
| React 19 / Compiler | ✅ React 19 peer since 0.17 (Dec 2024); no Compiler issues found | ✅ (React 18+ for RGL v2) | 🟡 React 19 added Feb 2025; #744 React 19 ref error open | n/a (non-React core) |
| SSR outside Next.js | ✅ TanStack Start recipe PR #1542 (adds /recipes/tanstack, /recipes/tanstack-ai and a create-puck-app template) still appears in Puck's open pull-requests list ("opened Jan 25, 2026"), so it is not merged; community OberonCMS supports TanStack Start | ✅ | 🟡 | ✅ |

**What the scores mean.** Puck is the only candidate where the remaining gaps (grid mode, responsive styles, Zod validation) are things we would have to build in every option anyway. With the other candidates we would also be building the core editor features.

## 3. Deep dive on the top 3

### 3.1 Puck (recommended)

**Document model and component registration.**
- A Puck `Data` payload is plain JSON: `{ root: { props }, content: ComponentData[] }`.
- Since 0.19, nested children live inside the parent's props as slot arrays. This "inline and recursive" model replaced the global `zones` object, which makes slot data "completely portable and straightforward to work with for data transformation or schema validation."
- Components are registered in a `Config`. Each component has typed `fields`, `defaultProps`, `render`, and optional `resolveData`, `resolveFields` and `resolvePermissions`.

```tsx
import type { Config } from "@puckeditor/core";
type Props = {
  Section: { bg: "surface" | "brand"; content: Slot; style: Responsive<SpacingStyle> };
  BookingWidget: { serviceIds: string[] };
  FreeGrid: { items: Slot; layout: Responsive<GridLayout> }; // our grid-snapped container
};
export const buildConfig = (plan: Plan): Config<Props> => ({
  root: { fields: { theme: { type: "custom", render: ThemeTokenEditor } } },
  components: {
    Section: { fields: { bg: { type: "select", options: [...] }, content: { type: "slot" } }, render: Section },
    ...(plan.premium ? { BookingWidget: bookingWidgetConfig } : {}), // per-plan gating
    FreeGrid: freeGridConfig,
  },
});
```

**Gating and validation.**
- Per-plan gating is plain config filtering: build the config per request. For finer control, use Puck's three permission layers:
  - global `permissions` prop
  - component `permissions`
  - dynamic `resolvePermissions`, which since 0.21 also receives the parent
- Supported permissions are `delete`, `drag`, `duplicate`, `edit`, `insert` plus custom flags.
- Server validation isn't built in. On the Bun server we walk the payload with `walkTree` and parse each node's props with a per-component Zod schema keyed by `type`. That is S–M effort. The same check should reject component types the org's plan doesn't allow.

**Migrations.**
- `migrate()` upgrades payloads across Puck's own breaking changes.
- `transformProps()` handles our prop renames and can run both before `<Puck>` and before `<Render>`.
- We should still store a `schemaVersion` per document and run our own ordered migration chain on read and on publish.

**Two-level layout.**
- *Structured blocks:* sections and blocks are components with `slot` fields. Since 0.18, Puck's drag-and-drop engine handles CSS grid and flexbox drop zones in every direction. Since 0.19, `defaultProps` and `resolveData` can pre-fill slots, which is how we ship prebuilt "good-looking" blocks whose internals stay editable.
- *Grid-snapped mode:* Puck doesn't have it. The maintainer said "Puck doesn't provide a grid, but it supports user grid implementations" and opened issue #843 for an official Grid component. A Jan 2025 request to resize grid cells like react-grid-layout was answered "would love that, but just haven't got around to it."

**Building our `FreeGrid` component:**
- **Data:** `items` is a normal Puck slot, so nesting, outline, copy/paste and permissions still work. `layout` is a per-breakpoint map `{ desktop: LayoutItem[], tablet: ..., mobile: ... }` keyed by child id, using RGL's `{ i, x, y, w, h }` shape.
- **Editor render (`puck.isEditing`):** wrap the slot's children in react-grid-layout v2. Use `useGridLayout`, or `<GridLayout>` with `useContainerWidth`, `compactor: null`/no compaction for free placement, and `allowOverlap` as a product decision. RGL handles move and resize. Puck handles selection and the field panel.
- **Public render:** don't ship RGL. Emit `display: grid` with `grid-column`/`grid-row` per item, set by CSS variables per breakpoint. The output is deterministic and SSR-safe. This matters because RGL v2's width prop is required and the recommended `useContainerWidth` hook only renders after mount.
- **Conflict handling:** inside a FreeGrid, children must not also be Puck-draggable. Set `drag: false` through `resolvePermissions` when `params.parent.type === "FreeGrid"`; Puck's 0.21 docs show exactly this pattern for a `Grid` parent. Write RGL's `onDragStop`/`onResizeStop` back via Puck's dispatch so each gesture creates one history entry. Undo granularity is the riskiest item for the spike.

**Per-breakpoint styles and theme tokens.**
- Build a custom field type, `responsive<T>`, that stores `{ base, tablet?, mobile? }`. Plugins and field overrides can add new field types, and since 0.24 fields can be grouped into tabs.
- Components turn responsive values into CSS custom properties on the element (e.g. `--pad-t-md`). A small static stylesheet consumes them inside media/container queries.
- Puck's iframe viewports give the desktop/tablet/mobile preview.
- Theme tokens live in `root.props.theme`. The root render writes them as CSS variables (`--color-brand`, `--radius`, `--font-heading`), so every block follows them and a root-field edit gives a live preview.

**Tailwind 4.** Tailwind only compiles classes it sees at build time, so user-chosen values must never become arbitrary class names. Three rules:
1. Blocks are authored with static Tailwind classes that reference CSS variables, e.g. `bg-[var(--color-brand)]`, `p-[var(--pad)]`.
2. User choices are constrained enums mapped to known class strings. A safelist via Tailwind 4's `@source inline()` is possible but not needed (not re-verified this session).
3. Free values go through inline CSS variables, never through classes.

In the editor, Puck copies host stylesheets into the preview iframe by default. `iframe.syncHostStyles` (0.22) can turn this off, and the iframe can be disabled entirely, which also disables viewports. One integrator used the Tailwind CDN inside Puck's iframe to get arbitrary classes in the editor. Don't do that: the editor would then render styles the production CSS doesn't contain.

**Rich text.**
- The `richtext` field (0.21) is built on Tiptap. It supports inline canvas editing with `contentEditable: true`, Tiptap extension `options` (e.g. heading levels), custom `tiptap.extensions`, and custom menus.
- Known rough edges:
  - Issue #1848 (0.23.0): `textAlign: false` was still applied on paste.
  - Rich text rendering pulls in Tiptap plus happy-dom on the server. One production Puck CMS (goodfellow-cms) replaced Puck's Tiptap renderer with its own `fieldTransforms`-based renderer "which avoids the happy-dom dependency on Cloudflare Workers."
- For Bun SSR, plan to do the same: store HTML or Tiptap JSON and render it with a small sanitizer on the public path.

**Risks and lock-in.**
- *Still pre-1.0.* Minor versions can break things. 0.24 had no breaking changes, but 0.19 changed the data model (DropZones → slots) and 0.21 renamed the package from `@measured/puck` to `@puckeditor/core`.
- *Iframe quirks.* Issue #1884 (0.23.0): children of `<Puck>` remount once after the preview iframe mounts, losing local state in custom panels.
- *Commercial upsell.* The commercial focus is Puck AI and Puck Cloud (`@puckeditor/cloud-client`, Puck AI 0.9 released 10 Nov 2026). The editor core we need is MIT and doesn't call any service, but AI page generation is a paid cloud feature. Treat it as out of scope.
- *Lock-in is low.* Data is our JSON and components are ordinary React, so migrating away means rewriting the editor shell while keeping the documents and the renderer (M).

### 3.2 Runner-up: assemble it ourselves (`@dnd-kit/react` + react-grid-layout v2 + Tiptap)

- **Document model:** we design it, e.g. `{ id, type, props, slots: Record<string, Node[]>, layout?: Responsive<GridLayout> }`, validated by a Zod discriminated union shared by the client and the Bun server. This is the best fit for Zod and Drizzle, but we also own undo/redo, selection, clipboard, keyboard navigation, outline and history (L).
- **Drag-and-drop:** `@dnd-kit/react` 0.5.3 is MIT with ~2.33M weekly downloads, but it's pre-1.0. A Nov 2025 discussion (#1842) was still asking for a stability timeline and whether new projects should use it or legacy `@dnd-kit/core`. Puck itself is built on the experimental dnd-kit branch with custom collision algorithms. In practice, Puck is what we'd end up re-implementing.
- **Grid mode:** RGL v2 (TypeScript rewrite, 2.0.0 released 9 Dec 2025) has headless hooks: `useGridLayout`, `useResponsiveLayout`, `useContainerWidth`, and a framework-agnostic `react-grid-layout/core`. This makes it easier to integrate with our own undo stack than with any framework's. Watch issue #2303: since 2.3.0, a dragged item no longer follows the pointer between grid steps. Pin 2.2.4 until it's fixed.
- **Tailwind, breakpoints, tokens:** same CSS-variable approach as Puck.
- **Risks:** the largest build, and many accessibility and touch edge cases to own. Lock-in is nil.

### 3.3 Third option: Craft.js (not recommended; for reference)

- **Model:** a flat serialized node map. Components are registered via a `resolver` object, and editable regions are `<Element canvas>`. The editor UI is fully headless, which is good for shadcn.
- **Status:**
  - Last release @craftjs/core 0.2.12 on 14 Feb 2025, which added React 19 support.
  - Open issues include React 19 `Element` ref errors (#744, Jul 2025), "Undo, redo not working" (#728), a keyboard drag-and-drop accessibility request (#722), and dynamic component registration (#750, Feb 2026).
  - Issue #747, "Is Craft.js still maintained?", has stayed open since 1 Nov 2025 with 5 comments per the GitHub issues list. The 11 Dec 2025 discussion "Is the Craft.js still alive ?" shows 0 replies.
- **Grid mode, breakpoints, rich text, migrations, permissions:** all custom (L in total).
- **Verdict:** only consider forking it. The bus factor is effectively one maintainer.

## 4. What we'd have to build ourselves

| Item | Puck | DIY stack | Craft.js |
|---|---|---|---|
| FreeGrid grid-snapped component (editor RGL + public CSS Grid) | M–L | M | L |
| Per-breakpoint `responsive<T>` field + CSS-var output | M | M | M |
| Theme-token root field + live preview | S | S | S |
| Server Zod validation + plan gating on save/publish | S–M (`walkTree`) | S (native to our model) | M |
| Document versioning, publish pinning, `schemaVersion` migrations | S (on top of `transformProps`) | M | M |
| Lightweight public renderer (no editor, no happy-dom) | S–M | M | M |
| Rich text | S (configure Tiptap field; custom SSR renderer) | M | M |
| shadcn editor chrome | M (composition/overrides) | L | M |
| Undo/redo, clipboard, duplicate, outline, keyboard and touch | ✅ provided | L | M (bugs) |
| Templates/presets library | S (slot `defaultProps`/`resolveData`) | M | M |

## 5. Excluded options

- **Easyblocks:** repo LICENSE is AGPL-3.0, and `@easyblocks/editor` 1.0.10 shows npm license "none". Last published about a year ago. Its token-based responsive design system is worth copying.
- **Webstudio:** core is AGPL-3.0-or-later, and the `sdk-components-animation` package is proprietary under a EULA. Worth copying: its CSS-first style engine with per-breakpoint style sources.
- **Plasmic:** loader/SDK packages are MIT, but Studio (the editor) is AGPL and/or SaaS. We'd need their editor.
- **Builder.io SDK:** SaaS-bound; content lives in Builder's service (not re-verified this session).
- **ChaiBuilder:** `@chaibuilder/sdk` is BSD-3-Clause (npm), latest 4.0.0-beta.51. But it targets Next.js 16 and "Tailwind CSS v3+". PostgreSQL storage, multi-tenancy, RBAC and revisions are in the paid yearly "chaipro" license, and the vendor says "SaaS platforms license chaipro". This is open-core where features we need sit behind payment.
- **GrapesJS Studio SDK:** proprietary license with license key and watermark. The official grapesjs.com SDK pricing page lists Free $0 (1,000 sessions/month, "With Studio branding"), Startup "$200/month" (20,000 sessions), Business "$2,000/month" (50,000 sessions), and custom-priced Enterprise. The React renderer (React components as blocks) is a Studio SDK plugin. GrapesJS core alone (BSD-3) stays in the table, but it's not React-native.
- **Onlook:** Apache-2.0, but it's a code-writing visual editor for Next.js + Tailwind repos, not an embeddable end-user page builder.
- **Reka.js, Pragmatic drag and drop, Gridstack, Lexical, Editor.js:** not verified in this session (unverified). None changes the recommendation. Gridstack would replace RGL only if we needed non-React reuse, and Lexical would replace Tiptap only if we drop Puck's richtext field.

## 6. Suggested 1–2 day spike (Puck)

**Day 1: the riskiest path first.**
1. Set up TanStack Start (Vite 8, Bun) with `@puckeditor/core@0.24.0` in `/editor/$pageId` (client-only route). Use PR #1542's TanStack recipe as reference. Turn the React Compiler on from the start, and log any StrictMode or Compiler warnings, plus the #1884 remount.
2. Build `Section` (slot) → `FreeGrid` (slot + RGL v2.2.4) → `Text` (richtext, contentEditable) and `Image` children. Check:
   - drag a new component from the Puck drawer *into* FreeGrid
   - move and resize inside it with snapping
   - select a child and edit its fields
   - **one undo step per move or resize**
   - duplicate and delete
   - the same on a touch device
3. Responsive layout: switch the viewport to mobile, rearrange, and confirm desktop is unchanged.

**Day 2: rendering and the data path.**
4. Public route `/$slug`: an SSR loader fetches pinned JSON from Postgres (Drizzle), runs `transformProps` and our migration chain, then renders with `<Render>` and the custom rich text renderer. FreeGrid outputs CSS Grid only. Measure the public JS payload. It must contain no Puck editor chunks, no RGL and no Tiptap. Record the editor and renderer bundle sizes, since no published figures exist.
5. Bun save endpoint: `walkTree` plus per-component Zod schemas, plan gating (reject `BookingWidget` for the free plan), and a new version row on every save.
6. Theme tokens: root field → CSS variables, live in the iframe. Tailwind 4 classes reference the variables, and no arbitrary values come from user data.

**Exit criteria:** grid gestures don't conflict with Puck drag-and-drop or selection, undo is one step per gesture, public pages ship no editor code, and SSR output matches the editor preview. If grid gestures or undo fail, switch to the DIY runner-up.

## 7. Caveats

- **Unverified:** bundle sizes for every candidate; a direct read of Puck's and Craft.js's LICENSE files (Puck's MIT status comes from npm, its README and its homepage); Craft.js's latest commit date and the replies in issue #747; Builder.io, Reka.js, Gridstack, Pragmatic drag and drop, Lexical and Editor.js details.
- Download counts and versions are snapshots as of mid-Nov 2026: Puck ~179,067/week, `@dnd-kit/react` 2,334,569/week.
- Some secondary sources are vendor marketing (Puck, ChaiBuilder, GrapesJS blogs) or aggregators (gjs.market, gappsy, opensourcealternatives). Licensing conclusions rely on repo, npm or vendor license pages wherever possible.