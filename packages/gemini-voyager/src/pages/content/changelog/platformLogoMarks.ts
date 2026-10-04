/**
 * Turn `:gemini:`-style markers in the rendered changelog into the platform's
 * own mark, drawn at the size of the text around it.
 *
 * Built from DOM nodes rather than markup on purpose. The note is bundled, so
 * nothing untrusted reaches this body, but the sanitiser that guards it allows
 * neither `<svg>` nor `<path>` — and a decorative icon is not a good reason to
 * widen an allow-list. Building the nodes here never goes through innerHTML.
 */
import { PLATFORM_LOGOS, type PlatformLogo, type PlatformLogoId } from '@/core/icons/platformLogos';

const SVG_NS = 'http://www.w3.org/2000/svg';
const MARK_CLASS = 'gv-changelog-logo';
/**
 * The marker swallows the space written after it. The note reads `:deepseek:
 * DeepSeek` for the sake of whoever edits it, but the mark carries its own
 * gap — leaving the space too puts twice the intended distance between the
 * mark and the name.
 */
const MARKER = new RegExp(`:(${Object.keys(PLATFORM_LOGOS).join('|')}): ?`, 'g');

function createMark(doc: Document, id: PlatformLogoId): SVGSVGElement {
  // Widened to the interface: the const map narrows each entry to its own
  // literal shape, where an absent `brand` is absent rather than optional.
  const logo: PlatformLogo = PLATFORM_LOGOS[id];
  const svg = doc.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', MARK_CLASS);
  svg.setAttribute('viewBox', logo.viewBox);
  // Its own colour where the mark has one that reads on either scheme.
  svg.setAttribute('fill', logo.brand ?? 'currentColor');
  // Decorative: the platform's name sits right beside it in the same sentence.
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  for (const d of logo.paths) {
    const path = doc.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', d);
    svg.appendChild(path);
  }
  return svg;
}

function expand(text: Text): void {
  const value = text.nodeValue ?? '';
  const doc = text.ownerDocument;
  const fragment = doc.createDocumentFragment();
  let cursor = 0;
  MARKER.lastIndex = 0;
  for (let match = MARKER.exec(value); match; match = MARKER.exec(value)) {
    if (match.index > cursor) {
      fragment.appendChild(doc.createTextNode(value.slice(cursor, match.index)));
    }
    fragment.appendChild(createMark(doc, match[1] as PlatformLogoId));
    cursor = match.index + match[0].length;
  }
  if (cursor < value.length) fragment.appendChild(doc.createTextNode(value.slice(cursor)));
  text.replaceWith(fragment);
}

/** Replace every marker under `root` in place. Safe to call on a body with none. */
export function renderPlatformLogoMarks(root: HTMLElement): void {
  const doc = root.ownerDocument;
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const pending: Text[] = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    MARKER.lastIndex = 0;
    if (MARKER.test(node.nodeValue ?? '')) pending.push(node as Text);
  }
  // Collected first: replacing a node while walking invalidates the walker.
  for (const text of pending) expand(text);
}
