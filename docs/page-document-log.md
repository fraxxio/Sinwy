# Page document log

Finished phases of the [page document plan](page-document-plan.md), each with its spec and log entry.

## Phase 1: Rich text allowlist in Shared

**Goal:** Shared can parse any HTML string into a tree of allowlisted nodes and serialise that tree back to canonical HTML. The server and the storefront use this one implementation.

**Files:**
- New: `Sinwy.Shared/types/page/RichText.ts`, exported from `Sinwy.Shared/types/page/index.ts`.
- Reference only: the spike's `Sinwy.WebFrontend/src/shared/components/page-builder/rich-text.tsx` (tag maps, drop-with-content set, entity decoding, implicit closing of `p` and `li`) and `Sinwy.Shared/types/page/PageUrls.ts` on `pagebuilder-tryout`.
- The current safe-URL regex: `SAFE_URL` in `Sinwy.WebFrontend/src/shared/components/page-content/PageRenderer.tsx:22`. Its consumers move to Shared in phase 3.
- New test: `Sinwy.Backend/modules/pages/tests/richText.test.ts`.

**Steps:**
- Export `parseRichText(html): RichTextNode[]` and `serializeRichText(nodes): string`, with `normalizeRichText = serialize ∘ parse`. Use no DOM and no dependency, so the same code runs in Bun and in the browser.
- Handle tags this way:
  - Map aliases: `b` → `strong`, `i` → `em`.
  - Unwrap unknown tags and keep their text.
  - Drop `script`, `style`, `iframe`, `noscript`, `template`, `textarea`, `title`, `svg` and `math` together with their content.
  - Keep no attributes except a safe `href` on `a`, plus a `target="_blank"` flag.
  - Wrap stray top-level text and inline content in `p`.
  - Close an open `p` or `li` the way HTML does.
- Put the link rule (`isSafeHref`) in a small Shared `PageUrls.ts`, together with an `isSafeImageSrc` for the manifest's image kind (http(s) or root-relative). Phase 3 points the web app's URL helpers at these.
- Normalising twice must give the same result as normalising once. The output must contain nothing outside the allowlist.
- Give `RichTextNode` a plain discriminated-union type. The web renderer in phase 3 switches on it.

**Tests that matter:**
- `<script>`, `onerror=`, `style=`, and `javascript:`, `JaVaScRiPt:` and entity-encoded `javascript:` links never survive.
- Unclosed tags, stray `</p>`, nested lists, entities (named and numeric) and text outside any block normalise to valid allowlisted HTML.
- Idempotence over every fixture: `normalize(normalize(x)) === normalize(x)`.
- The HTML Puck's richtext field produces (`<p>`, `<strong>`, `<ul><li><p>`, auto-linked `<a href target rel>`) is preserved.

**Done when:**
- The tests pass and nothing outside Shared imports the module yet.

**Verify:** None.

### Log (2026-11-18, `feat(shared): add rich text allowlist for page documents`)
- Shipped: `Sinwy.Shared/types/page/RichText.ts` (one-pass tokenizer, HTML-like tree builder, canonicalising pass, serializer) and `PageUrls.ts` (`isSafeHref`, `isSafeImageSrc`), both exported from `@sinwy/shared`. `Sinwy.Backend/modules/pages/tests/richText.test.ts` has 125 cases: XSS vectors, malformed HTML with exact expected output, Puck output kept byte for byte, idempotence over every fixture, the depth cap, linear time on unterminated markup and the URL rules.
- Differs from plan:
  - The spike's regex tokenizer was replaced by a hand-rolled linear one. The regex is quadratic on unterminated tags such as `<a <a <a …`. As in HTML, an unterminated tag, comment or raw-text element (`<script>` with no close) ends the input.
  - Nesting is capped at 16 levels. Bun's stack overflows at about 50k levels of `<b>`, and the 256 KB body allows 85k. The builder ignores deeper tags (it keeps their text), and the output pass flattens anything at depth 16 to text. A list or quote at that depth becomes a `p`. Idempotence holds past the cap.
  - Block-like unknown tags (`div`, `section`, `h1`, `h4`–`h6`, `pre`, `hr`, table cells, …) are unwrapped like other unknown tags, but still start a new paragraph. Otherwise pasted `<div>a</div><div>b</div>` would merge into "ab".
  - Canonical shape: stray inline content in the root, a quote or a mixed `li` goes into a `p`; stray `li`s go into a `ul`; non-`li` content in a list goes into an `li`. An `li` with both text and a nested list becomes `<li><p>…</p><ul>…</ul></li>`, which is Tiptap's shape. Empty inline elements and empty lists are dropped. Empty `p`, `li` and headings are kept.
  - Stored links keep only `href` and `target="_blank"`. Tiptap's `rel="noopener noreferrer nofollow"` is dropped, and the renderer adds `rel`. A link with an unsafe `href` is unwrapped and keeps its text. A nested `a` closes the open one, as in HTML.
  - Raw NUL characters and invalid numeric entities become U+FFFD, because Postgres `jsonb` rejects `\u0000`. A small set of named entities is decoded (`amp`, `lt`, `gt`, `quot`, `apos`, `nbsp`, typographic quotes and dashes, `hellip`, `copy`, …). Other named entities stay literal text.
  - `isSafeHref` follows the Decision's rule exactly, so bare paths like `book` are refused (Standing notes cover `field.link`).
- Checked in the running app: nothing; the phase has no Verify and no route uses the module yet. Checked in Bun that Zod 4 skips `.transform` after a failed `.max()`.
