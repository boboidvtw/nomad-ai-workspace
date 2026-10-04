# Rendering and export regression notes

Read this file when changing Mermaid, KaTeX, rendered previews, Quote Reply, or conversation export
output.

## Gemini turns must be paired by document order

- **Trap:** Conversation export could omit or duplicate most Gemini responses, and collapse repeated
  prompts into one, when virtualized turns exposed a mix of zero and nonzero `offsetTop` values.
  Turn elements can have different offset parents, so their local offsets are not comparable.
- **Rule:** Pair each response with the preceding user turn using DOM document order, bounded by the
  next user turn. Keep repeated prompts as separate turns; selector queries are already unique and
  top-level filtered. Do not use layout offsets as a shared conversation coordinate system.
- **Guard:** `src/pages/content/export/__tests__/chatPairs.test.ts` and
  `src/pages/content/fork/__tests__/chatPairs.test.ts` cover the export and fork collectors with
  repeated prompts and mixed virtualized offsets.

## Sanitized Mermaid SVGs must retain theme CSS and SVG labels

- **Trap:** Mermaid flowcharts turned black, then lost labels after the theme was restored. The CSS
  guard rejected Mermaid's contained tooltip `z-index` and removed the generated `<style>` block;
  DOMPurify removed HTML-label `foreignObject` nodes. Direct `main` commit `109a6698` introduced the
  over-broad guard in v1.8.0.
- **Rule:** Keep contained tooltip stacking while continuing to reject viewport-escaping CSS, render
  labels as sanitizable SVG text, translate simple HTML emphasis to Mermaid Markdown, and decode
  Mermaid's double-escaped ampersands only inside sanitized SVG text nodes.
- **Guard:** `src/pages/content/mermaid/__tests__/mermaid.test.ts` covers safe theme CSS, SVG
  labels, emphasis, entities, and unsafe escape CSS. Also check a real Gemini flowchart in Chrome; a
  synthetic malicious style fixture alone misses this regression.

## Rendered Quote Reply blocks must preserve their raw markers

- **Trap:** Quote Reply could leave raw `>` lines ungrouped in the live composer even when sent
  quotes were styled. Styling a sent user message could also remove its markers from export,
  timeline summaries, or cleanup, and user LaTeX rendering could later erase the visual treatment.
  Gemini uses separate DOM shapes for the editable Quill composer and sent user messages. The
  displayed user-message DOM is also shared by several features: the LaTeX renderer rebuilds
  matching paragraph contents, while export and timeline code still read the original text from
  those same paragraphs.
- **Rule:** Classify consecutive composer paragraphs with CSS classes only so caret, IME, and
  submitted Markdown remain native. Group sent quoted paragraphs in a semantic blockquote, hide each
  marker without deleting it, reapply decoration after relevant DOM changes, and restore the
  original structure during teardown.
- **Guard:** `src/pages/content/quoteReply/__tests__/renderedQuotes.test.ts` verifies raw-text
  preservation, composer grouping and live edits, idempotence, late messages, renderer repaint,
  teardown, and browser-neutral logical CSS. The Quote Reply integration suite verifies that
  rendering remains active when its insertion action is disabled.

## Rendered code previews must tear down when their source stops matching

- **Trap:** A WaveDrom block could keep showing and exporting its old diagram after the source
  became invalid or its language label changed to ordinary JSON. The renderer returned early on
  invalid or newly ineligible source without unwrapping the previously rendered block.
- **Rule:** Share one per-wrapper teardown path between runtime disable, parse failure, and
  language/content reclassification. Restore the native code block and copy control and clear the
  render markers.
- **Guard:** `src/pages/content/wavedrom/__tests__/wavedrom.test.ts`
  (`restores the source block when explicit WaveDrom becomes invalid` and
  `restores the source block when a rendered generic block gets a specific label`).

## User export HTML must materialize multiline text

- **Trap:** PDF and image exports collapsed line breaks inside a multiline user prompt even though
  Markdown and JSON retained the original text. The user-content extractor escaped a multiline text
  part into one paragraph but left newline characters as HTML whitespace, which browsers collapse.
- **Rule:** Escape the text first, then serialize its newline characters as explicit `<br />`
  elements. Keep the plain-text representation unchanged.
- **Guard:** `src/pages/content/export/adapter/__tests__/platformAdapters.test.ts`
  (`renders multiline user prompts with explicit HTML line breaks`).

## Inline search illustrations must stay in image export

- **Trap:** "Copy response as image" dropped Gemini's inline instructional
  pictures (web-cited screenshots with a 来源 caption) even though surrounding
  list text survived. `extractAssistantImage` used descendant `querySelectorAll`
  and `return true` on the parent, so a wrapper that failed to emit (lazy
  `about:blank` / missing `img.image` / missing `data-full-size-image-uri`)
  swallowed the whole figure, caption included. Copy-as-image renders HTML, not
  Markdown, so a successful text-only walk looks like the image was never there.
- **Rule:** Treat only the image host itself (`single-image`, `generated-image`,
  `.attachment-container.search-images`, `.image-container[data-full-size-image-uri]`)
  as consumed. Resolve `currentSrc` / `data-src` before the `src` attribute.
  Keep captions in the HTML figure. Sweep leftovers beside `.markdown` the same
  way YouTube covers do, skipping hosts already walked in DOM order. Licensed
  hero shots live in `button.image-button` inside `.image-container.hide-from-message-actions`
  and use `img.hero-image`, not `img.image` — do not treat that button or class
  as export chrome.
- **Guard:** `src/pages/content/export/adapter/__tests__/platformAdapters.test.ts`
  (`exports licensed hero search images wrapped in Gemini image-buttons`,
  `preserves classic Gemini search images`, `does not drop surrounding prose`,
  `keeps inline single-image illustrations between lists`,
  `resolves lazy search-image placeholders`,
  `picks up search images rendered beside the markdown container`).

## Export fetch limits must not delete rendered content

- **Trap:** PDF and PNG exports silently omitted images after the first 40. The image fetch cap was
  implemented by removing later image nodes from the render tree, conflating bounded network
  inlining with content preservation.
- **Rule:** Inline at most 40 images, but leave every remaining rendered image and its original
  source intact for the browser renderer. This cap is only for PDF and PNG inlining. Markdown
  archives stream every fetched image and must not reuse the slice.
- **Guard:** `src/features/export/services/__tests__/ImageExportService.test.ts` and
  `src/features/export/services/__tests__/PDFPrintService.test.ts`
  (`preserves images beyond the inlining fetch cap`).

## Markdown archives must keep every image instead of stopping at 40

- **Trap:** Markdown export saved exactly 40 images into `assets/` and left the rest as remote
  links, with no notice. `downloadMarkdownOrZip` sliced the URL list with
  `MAX_EXPORT_IMAGE_COUNT` before fetching, then held every accepted blob in JSZip until
  `generateAsync` copied the whole archive again.
- **Rule:** Do not cap the image count. Write each image into the zip as a Blob part as soon as it
  arrives and drop its bytes, so only the fetches in flight sit in the JS heap. Keep the total under
  `MAX_MARKDOWN_ARCHIVE_IMAGE_BYTES` and a single image under `MAX_EXPORT_IMAGE_BYTES`, and tell
  the user when any image stays a remote link.
- **Guard:** `src/features/export/services/__tests__/markdownImageArchive.test.ts`
  (`archives every image of a long conversation in order`),
  `src/features/export/services/__tests__/ConversationExportService.test.ts`
  (`stores image bytes in the zip without a 40-image cutoff`),
  `src/features/export/services/__tests__/streamingZip.test.ts`.

## Export image timeouts must cover the body, not just the headers

- **Trap:** `fetchWithTimeout` cleared its timer and dropped the cancel listener as soon as the
  response headers arrived. A body that stalled after that left `reader.read()` waiting forever,
  and cancelling the export could not stop it. With no 40-image cap, one stuck image hangs the
  whole Markdown archive.
- **Rule:** Keep one `AbortController` alive until the body is read. Restart an idle timer on
  every chunk so slow but moving downloads finish, and forward the export signal the whole time.
  A single image that cannot be read keeps its link and counts as omitted.
- **Guard:** `src/features/export/services/__tests__/boundedImageFetch.test.ts`
  (`gives up on an image whose body stalls after the headers`,
  `stops reading a stalled body when the export is cancelled`),
  `src/features/export/services/__tests__/markdownImageArchive.test.ts`
  (`keeps the link of an image it cannot read and still downloads the rest`).

## Export temp files must not go into the page's private file system

- **Trap:** An earlier draft streamed the archive into `navigator.storage.getDirectory()`. From a
  content script that is the host page's origin, so a full conversation sat in Gemini's storage,
  readable by page scripts and shared across `/u/<index>/` accounts. `<a download>` never reports
  completion, so the file could only be swept on a later export, and never if none followed.
- **Rule:** Build the archive from Blob parts in the content script. If an export ever outgrows
  that, move packaging to an extension-owned context with `downloads`, which reports completion,
  instead of borrowing page storage.
- **Guard:** `src/features/export/services/__tests__/markdownImageArchive.test.ts`
  (`archives every image of a long conversation in order`).

## Zip entries carry a wall clock, not a build-time constant

- **Trap:** The streaming writer packed a hardcoded `2026-01-01 00:00` into every DOS date field,
  so every extracted file showed that date no matter when it was exported, and the constant only
  gets more wrong each year. JSZip had been writing a real timestamp.
- **Rule:** Derive the DOS stamp from the clock once per archive and share it across every entry,
  keeping the two-second resolution and the 1980-2107 range the format allows.
- **Guard:** `src/features/export/services/__tests__/streamingZip.test.ts`
  (`encodes a wall-clock time into the DOS date and time fields`,
  `stamps every entry with the time the archive was written`).

## Mermaid must honor Gemini explicit light theme

- **Trap:** With Gemini set to light while the browser reported a dark system preference, Mermaid
  diagrams rendered with the dark theme. Mermaid treated generic `body`/`html` dark markers as equal
  to Gemini's higher-priority `.theme-host.light-theme`, so stale outer markers could override the
  active Gemini theme.
- **Rule:** Resolve `.theme-host` first, then generic page markers, and only then fall back to the
  browser preference.
- **Guard:** `src/pages/content/mermaid/__tests__/mermaid.test.ts` (`resolveMermaidTheme`).

## KaTeX radicals need their SVG layout preserved before export

- **Trap:** PDF/image exports rendered square-root radicals and fractions misaligned, especially for
  Gemini math such as `\sqrt{2} \approx 1.414`. Export rendering changed display/layout primitives
  around Gemini's KaTeX/SVG radical nodes. The live DOM looked acceptable, but the export clone lost
  enough layout information for radicals to shift.
- **Rule:** Preserve KaTeX layout primitives and inline radical SVG layout before PDF/image
  rendering.
- **Guard:** `src/features/export/services/__tests__/DOMContentExtractor.test.ts`
  `src/features/export/services/__tests__/PDFPrintService.test.ts`
  `src/features/export/services/__tests__/ImageRenderService.test.ts`
  `src/features/export/services/__tests__/PDFPrintService.test.ts` `bun run verify:katex-export`

## KaTeX image export does not follow the PDF path

- **Trap:** PDF export rendered square-root formulas correctly, but image export still misplaced
  radicals/fraction layout. It was easy to think the fix worked by only checking the PDF output. PDF
  and image exports use different render paths. The image path goes through `html-to-image`, which
  clones the target node and may scan the whole page's stylesheets. On Gemini, cross-origin
  stylesheets can trip `cssRules` access and KaTeX radicals/fractions depend on fragile `.vlist`,
  `.pstrut`, `.sqrt`, and stretchy SVG/image layout rules, not just the KaTeX font files.
- **Rule:** Use Fable 5's verified image-path fix: supply scoped KaTeX font CSS via `fontEmbedCSS`
  and inline the critical KaTeX layout primitives before capture. The verification harness must
  exercise `ImageRenderService.renderTargetToBlob`, not a direct `html-to-image` call or the PDF
  print flow.
- **Guard:** `src/features/export/services/__tests__/ImageRenderService.test.ts`
  `bun run verify:katex-export`

## Mermaid exports must prefer the rendered diagram over hidden source

- **Trap:** PDF and image exports showed Mermaid source code even when Voyager displayed a rendered
  diagram in the conversation. The Mermaid wrapper contains both the hidden `code-block` and the
  rendered SVG. The DOM extractor's generic nested-code-block branch matched the wrapper first,
  emitted `<pre><code>`, and skipped the diagram. The same shortcut could match a parent
  `response-element` or list before traversal reached the wrapper.
- **Rule:** For rich exports, emit a clean `.gv-export-mermaid` clone when the wrapper has a
  rendered SVG; preserve fenced source for text output and as the no-SVG fallback. Recurse through
  response and list wrappers so the Mermaid node is reached and text indentation survives. Rasterize
  only the export clone at 2x before PDF or whole-document PNG rendering, keep the rest as native
  text, and scale the diagram to one printable page. If rasterization fails, replace the raw SVG
  with a sanitized SVG data image.
- **Guard:** `src/features/export/services/__tests__/DOMContentExtractor.test.ts`
  `src/features/export/services/__tests__/PDFPrintService.test.ts`
  `src/features/export/services/__tests__/ImageRenderService.test.ts`
  `src/features/export/services/__tests__/ImageExportService.test.ts`

## ChatGPT KaTeX may omit MathML annotations

- **Trap:** Formula Copy showed its hover treatment on ChatGPT, but clicking a formula did not copy
  anything or show a toast. The same feature continued to work on Gemini. ChatGPT's client-side
  KaTeX layout stopped rendering the hidden MathML `annotation[encoding="application/x-tex"]` used
  by the original extractor. The raw TeX moved to `data-math-source` on the semantic wrapper outside
  `.katex-display`. Without the MathML node, display-mode detection also lost its old
  `math[display="block"]` signal.
- **Rule:** Read `data-math-source` from the nearest semantic wrapper before falling back to legacy
  annotations, and recognize `.katex-display` directly for block delimiters. Keep the annotation
  path for Claude and older ChatGPT markup.
- **Guard:** `src/features/formulaCopy/FormulaCopyService.test.ts`
  (`copies current ChatGPT block KaTeX from data-math-source without MathML` and
  `copies current ChatGPT inline KaTeX from data-math-source as inline LaTeX`).

## Zero-width sanitising must not strip the emoji joiner

- **Trap:** Mermaid diagram labels containing a composed emoji rendered as its separate glyphs --
  `👨‍👩‍👦` came out as `👨👩👦`, `🏳️‍🌈` as `🏳️🌈`. `normalizeWhitespace` strips zero-width
  characters so stray invisibles from model output cannot break the parser, and U+200D sat in that
  character class alongside U+200B and U+200C. But U+200D is the zero-width _joiner_: it is what
  holds an emoji sequence together, so removing every occurrence splits the sequence. The rule that
  surfaced it (`no-misleading-character-class`) had never been enabled under the old ESLint config,
  which extended no recommended set.
- **Rule:** Strip U+200D only when it is not joining two emoji, checking the neighbouring code
  points and skipping variation selectors and skin-tone modifiers on the way back. Walk the string
  with `Array.from`, never by UTF-16 index, so astral emoji stay in one piece. The other zero-width
  characters keep their unconditional removal.
- **Guard:** `src/pages/content/mermaid/__tests__/mermaid.test.ts`
  (`should keep the joiner that holds an emoji sequence together`,
  `should still remove a joiner that only touches an emoji on one side`, and the original
  `should remove zero-width joiner`, which pins the stray-joiner case that motivated the strip).

## Rendered prompt previews must escape angle-bracket text, not sanitize it away

- **Trap:** Prompt bodies render through `marked` + `DOMPurify`. With marked's HTML tokenizers left
  on, `Translate <text> into <language>.` reached the reader as `Translate ` — `<text>` is an
  SVG-namespaced name, so the sanitizer dropped the element together with the rest of the block.
  `<style>` and `<path>` behave the same way, and any other unknown tag such as `<YOUR_API_KEY>` is
  removed outright. Prompts are exactly where angle-bracket placeholders are common, and the defect
  is invisible: no console error, no fallback, just missing text.
- **Rule:** A prompt body is text destined for an LLM, not an HTML document. Disable both HTML
  tokenizers (`tokenizer: { html, tag }` returning `undefined`) so raw tags reach the text tokenizer
  and are escaped. Apply it in the shared loader so the hover preview and the list row agree.
- **Guard:** `src/features/prompt/model/__tests__/promptMarkdown.test.ts`
  (`keeps angle-bracket placeholders visible instead of letting them be sanitized away`,
  `pins the defect it fixes: the default pipeline eats the rest of the sentence`).

## A hidden popover still widens the page it overflows

- **Trap:** The plugin store's "how to open the popup" preview is `visibility: hidden` until
  hover, but an absolutely positioned hidden box still counts toward the scroll width. At 400px
  it pushed the page to 437px and every phone visitor could scroll the whole page sideways.
- **Rule:** A hover preview that can extend past the viewport switches to `position: fixed` on
  narrow screens (`docs/.vitepress/theme/components/PluginStore.vue`), or is constrained to the
  viewport. Check `scrollWidth` against `clientWidth` at 400px after adding one.
- **Guard:** Manual: open `/plugins` at 400px wide and compare
  `document.documentElement.scrollWidth` with `clientWidth`.
