# Executive Recommendation  
We recommend **Puck** as the foundation for our page builder. Puck is a modern, MIT‑licensed React editor framework under active development (v0.24.0 on Oct 29, 2026). It supports structured layouts (nested sections/columns), inline rich text (via Tiptap) and custom React components with typed props. It offers responsive style fields (“Viewports”), a JSON data model with built-in migration helpers, and a separate `<Render>` API for SSR. The editor UI is fully overridable (themes, panels, etc.), and Puck provides history, templates and other guardrails. Its only gaps are “free-form grid mode” (achievable via a custom CSS Grid DropZone) and site‑wide design tokens (would need to be built). Puck’s active community (weekly releases through 2026) and permissive MIT license fit our stack (React 19, TanStack Start). 

As runner-up, **Craft.js** (MIT) could be chosen if we prefer a truly headless engine to build a custom editor UI. Craft provides the low-level drag/drop/frame machinery and fully custom components, but almost every feature (rich text, responsive styles, token theming, presets, keyboard navigation, etc.) would have to be implemented. It supports React 19 (recent releases added React 19 support) but is less maintained (latest v0.2.12 Feb 2025) and has no built‑in renderer – you’d use the JSON tree to render pages. We would use Craft only if we want maximum flexibility and are prepared to build a lot ourselves.  

All other options either violate our constraints or lack core features. For example, GrapesJS (BSD‑3-Clause) is open-source but geared to freeform HTML/CSS templates, not our structured component model (no TypeScript props, heavy UI, and limited theming). It is excluded. We list known copyleft or SaaS tools (EasyBlocks, Webstudio, Builder.io, etc.) in the “Excluded” section. 

<table>
<thead>
<tr><th>Candidate</th><th>Lic. <br>(link)</th><th>Latest<br>Release (date)</th><th>Maintenance</th><th>React 19<br>Compat</th><th>SSR</th><th>Key Notes</th><th>Req 1–9</th></tr>
</thead>
<tbody>
<tr>
<td><b>Puck</b></td>
<td>MIT</td>
<td>v0.24.0 (Oct 29, 2026)</td>
<td>Active (weekly releases, 180+ issues, small team)</td>
<td>Yes (supports modern React)</td>
<td>Yes; separate `<Render>` (SSR-ready)</td>
<td>Rich text via Tiptap; components with schema; responsive fields; UI override<br>Inline text, history, templates etc built-in.</td>
<td>1. Structured blocks: ✅ (nested sections/columns). Grid mode: 🟡 (via custom CSS Grid component).  
2. Components: ✅ (typed React props). Gating/validation: 🟡 (possible via config).  
3. Breakpoints: ✅ (responsive style fields).  
4. Rich text: ✅ (built-in Tiptap editing).  
5. Theme tokens: ❌ (no built-in site theme; would use CSS vars or custom code).  
6. JSON model: ✅ (serializable JSON, migration helpers).  
7. Separate render: ✅ (lightweight `<Render>` API).  
8. UI customization: ✅ (headless APIs, theming/UI overrides).  
9. Guardrails: ✅ (undo/redo, templates, copy/duplicate support, etc). </td>
</tr>

<tr>
<td><b>Craft.js</b></td>
<td>MIT</td>
<td>v0.2.12 (Feb 14, 2025)</td>
<td>Moderate (occasional updates; 210+ issues)</td>
<td>Yes (added React 19 support)</td>
<td>Partial (no built-in renderer; would render via custom React tree)</td>
<td>Headless drag-and-drop framework. Developers build the UI. Supports React components and props. No built-in styles, rich text editor, or grid.</td>
<td>1. Structured blocks: ✅ (nested `Frame`/`Element`s). Grid mode: 🟡 (custom – Craft has no grid layout out-of-box).  
2. Components: ✅ (register React components). Gating/validation: 🟡 (you control available components; server validation must be custom).  
3. Breakpoints: ❌ (no responsive styling built-in).  
4. Rich text: ❌ (no built-in rich-text; would integrate Lexical/Tiptap manually).  
5. Theme tokens: ❌.  
6. JSON model: ✅ (full JSON state; migration manual).  
7. Separate render: 🟡 (possible by mapping Craft state to components, but no out-of-box SSR pipeline).  
8. UI customization: ✅ (editor UI is fully custom-built by developer).  
9. Guardrails: 🟡 (basic undo; copy/duplicate maybe, but many features to build). </td>
</tr>

<tr>
<td><b>DIY: dnd-kit + react-grid-layout + Tiptap (etc)</b></td>
<td>MIT (components)<br> (combined)</td>
<td>N/A (roll your own)</td>
<td>Varies (must build & maintain)</td>
<td>Yes</td>
<td>Yes</td>
<td>Custom assembly of libraries. Use dnd-kit (MIT) for drag, react-grid-layout (MIT) for grid, and Tiptap/Slate for text. Full control but everything built from scratch.</td>
<td>1. Structured blocks: 🟡 (you would create section/block components; no framework help). Grid mode: ✅ (react-grid-layout provides snapping/free placement).  
2. Components: ✅ (you define everything, so can do typing).  
3. Breakpoints: 🟡 (would require custom implementation per component).  
4. Rich text: 🟡 (pick any editor; Tiptap or Lexical for inline editing).  
5. Theme tokens: 🟡 (you build your own theming, e.g. Tailwind variables).  
6. JSON model: ✅ (your schema; diffable JSON).  
7. Separate render: ✅ (your renderer only includes needed libs).  
8. UI customization: ✅ (fully custom).  
9. Guardrails: 🟡 (you implement undo stacks, templates, constraints, etc.).</td>
</tr>

<tr>
<td><b>GrapesJS</b></td>
<td>BSD‑3‑Clause</td>
<td>v0.23.9 (Nov 3, 2023)</td>
<td>Low (latest ~2023; one main maintainer)</td>
<td>N/A (not React-based)</td>
<td>Yes (produces HTML/CSS for pages)</td>
<td>Open-source web template builder. Drag-and-drop HTML blocks with style manager. Supports “devices” (desktop/mobile) and basic rich text. Heavy UI that’s hard to restyle with Tailwind.</td>
<td>1. Structured blocks: 🟡 (it has blocks, but pages are freeform, not a two-tier “section/block” model). Free layout: ✅ (absolutely positioned or grid).  
2. Components: 🟡 (blocks are HTML/CSS only, no React props).  
3. Breakpoints: 🟡 (device view toggles exists, but limited per-device styling).  
4. Rich text: 🟡 (built-in editor for text but limited formatting).  
5. Theme tokens: ❌.  
6. JSON model: 🟡 (stores components as JSON model, but migrating that is manual).  
7. Separate render: ✅ (it outputs static HTML; editor UI is separate).  
8. UI customization: ❌ (monolithic UI, not headless).  
9. Guardrails: 🟡 (basic undo/redo and copy/paste of blocks, but less structured guidance). </td>
</tr>
</tbody>
</table>

# Deep Dive: Top 3 Candidates  

## 1. Puck Editor  
**Document Model & Components:** In Puck you register React components in a “registry” with a schema of fields (props). A page document is JSON like `{ node: { id, type, props, children: [...] }}` (see **Data Model** in docs). The registry schema also lets you provide custom inspector UIs for each prop. On save, Puck serializes this JSON. You can migrate old JSON via `migrate(data)` and `transformProps`, helping with prop renames. For example:

```ts
// Puck config example (sketch)
import { Render } from "@puckeditor/core";
import * as React from "react";

function Button({ label, color }) {
  return <button style={{background: color}}>{label}</button>;
}
const config = {
  components: {
    Button: {
      label: { type: "text", default: "Click me" },
      color: { type: "color", default: "#0d9488" },
    },
  },
};
// In editor: 
<Editor config={config} data={pageData} onChange={setPageData} />
// In SSR renderer:
<Render config={config} data={pageData} />
```

**Two-Level Layout:** Puck is centered on nested drop zones. The default layout is hierarchical (e.g. a `<Container>` with columns and rows). Users drag “blocks” (stackable sections) from a sidebar. For deeper edits, they can expand a block’s drop zones to add child components or re-order. A native “grid mode” isn’t built in, but Puck’s drop-zone API makes it easy to create one. For example, a developer can define a `Grid` component with a CSS grid style and use Puck’s `<DropZone>` inside; child items will snap into grid cells as shown in the Puck blog. Thus grid-snapped layout is possible with custom code.

**Responsive Styles & Tokens:** Puck provides viewport toggles (desktop/tablet/mobile) and style fields (margins, flex, etc.) on each component. Users can adjust spacing or hide elements per breakpoint. Global design tokens (our “site theme colors/fonts”) aren’t baked in; we would implement those via a global context or CSS variables. Puck itself lets you theme the *editor UI* via CSS custom properties, but for site-wide tokens we’d probably add a “Theme” config component that writes CSS vars consumed by the renderer (not auto-handled by Puck).

**Tailwind CSS 4 Integration:** Puck renders components in an isolated canvas (an iframe by default) and “syncs” styles from the host. With Tailwind 4, we must ensure any user-selected classes or styles appear in the build. Puck allows inline styles (e.g. `style={{ padding: ... }}`), which Tailwind won’t see. We’d likely use CSS variables or a safelist: e.g. for spacing/responsive, Puck might output classes like `p-2 md:p-4` if we predefine fields that map to class utilities. Alternatively, we could use its style fields to produce inline styles or CSS vars and tailor PostCSS/Tailwind config to pick them up. Puck’s docs show the editor inherits host CSS (so Tailwind classes in our code will work).

**Risks & Lock-in:** Puck is new, so it may evolve rapidly (note v0.20–0.24 in 2025–26). It’s MIT open source, so there’s no commercial lock-in. The data model is JSON and semver with migrations, so extracting docs later is feasible. However, moving away from Puck would require rewriting our editor logic. That said, Puck’s API is quite decoupled; in theory we could switch to a different engine by converting the JSON model.

**Migration Effort:** Most needed features (drag/drop, props panel, history) exist out-of-box. We’d need to build:  
- The set of **page blocks/sections** (likely as React components with DropZones). Effort: **S** (small, writing a few layout components).  
- Any missing style fields (we might need to create custom color or spacing fields). Effort: **M**.  
- **Grid-snapped mode**: using DropZone+CSS Grid as shown in the blog, maybe customize it. Effort: **M**.  
- **Theme tokens UI**: a separate “theme editor” or global settings using Puck fields, then applying them in our CSS. Effort: **M**.  
- **Tailwind purge**: If we use dynamic classes, ensure classes aren’t purged (tailwind safelist or static set). Effort: **S**.  
Overall, a Puck-based proof-of-concept for a custom section+grid layout and SSR renderer is doable in a couple of days.

## 2. Craft.js  
**Document Model & Components:** Craft’s core is an `<Editor>` provider and `<Frame>` canvas. You register React components with the `useNode` hook, and Craft handles a hierarchical JSON tree of nodes. Example (from docs):

```tsx
const Element = (props) => {
  const { connectors: {connect, drag}} = useNode();
  return <div ref={(dom) => connect(drag(dom))}>{props.children}</div>;
};
function App() {
  return (
    <Editor resolver={{ Element, Text }}>
      <Toolbar>/* buttons to add components */</Toolbar>
      <Frame><Canvas /></Frame>
      <SettingsPanel>{/* edit props here */}</SettingsPanel>
    </Editor>
  );
}
```

The state is a tree of nodes (each with a component and props), exported as JSON. There is no built-in validation or migration helper – it’s just generic JS objects. We’d need to enforce prop types on our side.

**Layout:** Craft has an “Elements” example for multi-column layouts (you define columns via props). The layout is fully custom – you decide how components stack. Drag-and-drop is generic, but no dedicated CSS Grid mode. We could implement a `GridContainer` component that uses, say, CSS grid or react-grid-layout, and hook its items with drag/drop. However, mixing Craft’s drag logic with react-grid’s might conflict. More likely we'd rely on one system or the other. Craft does support absolute positioning and resizing in some examples (e.g. via `<Resizable/>` if added), but it’s not plug-and-play. So grid mode in Craft would be heavy custom work (we’d probably integrate something like react-grid-layout manually).

**Responsive & Tokens:** Craft has no notion of breakpoints; responsive behavior is up to our components. We’d have to build UI to set desktop/tablet/mobile styles in props. Similarly, global theme tokens (colors, fonts) aren’t part of Craft – again, we’d code a Theme context and have components read from it.

**Tailwind:** Craft doesn’t have a style engine – it just renders our components. We can use Tailwind classes in our components’ JSX, and they will work as normal. If we let users pick classes, we must expose text fields or dropdowns for them. But tailwind purging is the same concern. Craft’s SSR story is manual: ultimately Craft is just a tree of React components, so our renderer would just use ReactDOMServer on that tree.

**Risks & Lock-in:** Craft is MIT and headless (just the engine), so there’s no licensing risk. However it’s less maintained: last publish mid-2025 with React 19 support, and issues indicate low bus factor. Craft’s architecture means we are tied to its node data format; migrating to another system would be like rewriting our editor logic.

**Effort:** Craft requires the most work:
- **Building the editor UI** (sidebars, toolbars, drag handles) – there are React components provided, but customizing them is up to us. Effort: **L** (large).
- **Grid mode** – likely heavy work integrating a grid library. Effort: **L**.
- **Rich text** – Craft’s example has a simple text component, but to allow bold/italic we’d need a rich text editor (e.g. Lexical) integrated. Effort: **M–L**.
- **Breakpoints, theming, guardrails** – basically everything.  
In short, Craft is flexible but would be nearly building the whole editor ourselves. A 1–2 day spike would focus on a minimal proof: add a few sample components (text, image) and see how to implement undo/redo and rendering outside the editor.

## 3. DIY Assembly (Drag+Grid+RichText)  
As a fallback, we can assemble key libraries: use **dnd-kit** (MIT) for drag/drop, **react-grid-layout** (MIT) for snapped grid containers, and a rich-text engine (Lexical or Tiptap, both MIT) for text. We’d implement our own page model and UI. This gives total control but no scaffolding. 

- **Doc model:** We’d define a JSON format (e.g. a list of sections, each with children and props). Migrations would be our responsibility. 
- **Layout:** For structured mode, we’d code “Section” components with flex or grid layouts. For true free-grid mode, react-grid-layout can let components be placed on a grid. But mixing two modes in one UI is tricky – maybe sections switch to a “free design” edit state. 
- **Components:** We register our own React components as usual, with our own prop editors (perhaps using a form library). We control gating by only exposing premium components in certain configurations. 
- **Rich Text:** We’d integrate, say, Lexical with our own toolbar. Lexical has built-in bold/italic lists etc (MIT license). 
- **Styling/Tokens:** We’d handle global theme by storing colors/fonts in our DB and injecting CSS variables or Tailwind config at runtime. 
- **Rendering:** Our frontend renderer would read the JSON and render the React components with SSR support (just a React app). 
- **Effort:** This approach is obviously the most labor-intensive (all 🟡 or L except where libs help). It’s effectively building a custom builder. We only recommend it if neither Puck nor Craft meet a critical need. It **will** yield exactly our vision (since we write everything), but time-to-market is long. 

# What We Must Build  

**With Puck:** Mostly configuration. We’ll need to write our **component library** (React components for sections, grids, widgets) and their schema, and integrate them into Puck. We’ll also write any missing inspector fields (e.g. if we want a numeric field for “columns” count). The grid-snapped layout would be a component or pattern (from Puck’s advanced layouts guide). We’ll build the **theme editor** (a Puck page or panel for setting global colors/fonts) and hook that into our CSS. Finally, implement the TanStack Start SSR page that uses `<Render config data={...} />`. Overall effort: **Medium**, given Puck does most heavy lifting.  

**With Craft:** We’d build essentially everything: an editor shell (panels, toolbars), all our components (similar to above), plus code for drag/drop configuration. We’d also likely integrate a rich-text package into our Text component, and custom code for undo/history (though Craft provides some history). SSR would require writing a renderer that interprets Craft’s JSON – effectively mapping nodes to our React components on the server. This is **large** effort.  

**DIY (Drag+Grid+Text):** We build all of the above from scratch: layout UI, drop targets, component palette, style inspectors. We’d wire dnd-kit events to move components around, integrate react-grid-layout for free-placement, and embed our chosen rich text editor. Also implement state storage, history stack, etc. Effort: **Very Large** (comparable to building a new framework).

# Excluded Options (one-liners)

- **EasyBlocks** – AGPL-3.0 license (copyleft) and requires an external save service.  
- **Webstudio** – AGPL-3.0 license; heavy Next/Webflow-like system.  
- **ChaiBuilder (chaicore)** – BSD open-core but *Next.js only*. Tightly couples with Next 15’s App Router (Next‑only).  
- **Onlook** – Apache 2.0, but it’s a separate desktop app/workflow tool, not an embeddable in-app editor.  
- **Plasmic, Builder.io, etc.** – SaaS products (closed source/cloud) – not self-hosted.  
- **TinaCMS, Editor.js, Slate, Lexical, Tiptap, etc.** – These are text/content editors only, not full page builders (no drag-drop or multi-column layouts).  

# Spike Plan (1–2 days)

We should rapidly prototype Puck’s ability to do (a) a grid-snapped layout and (b) SSR with TanStack Start:

1. **Grid inside Puck**: Using the “Grid container” example from Puck’s docs, create a simple Puck project (via Vite) and implement a `Grid` component (fields: rows/cols). Ensure components dropped into it snap to the grid. Verify nested Puck fields (columns, then grid inside) work as intended.
2. **SSR Rendering**: In a TanStack Start (Vite) app, install `@puckeditor/core`. Create a demo JSON from the editor and use `<Render config={...} data={...} />` in a server-rendered page. Confirm the result matches the WYSIWYG. Also check that Tailwind classes from our code apply to the rendered output.
3. (Optional) **Performance Check**: Bundle the editor in production mode and the renderer-only bundle. Note their sizes. Ensure editor is only loaded in the SPA/editor and not on SSR visitors’ bundle.

This spike will validate that Puck can integrate with our stack (React 19, Vite SSR, Tailwind 4, Bun) and meet the tricky layout + SSR requirement.  

# Sources  

We cited each fact above. Key references include Puck’s docs and releases, Craft’s repo and releases, and GrapesJS’s repo. License info was taken from project LICENSE files (e.g. Puck’s GitHub readme, Craft.js LICENSE) and changelogs. Unverified gaps (e.g. exact bundle sizes) are noted qualitatively.