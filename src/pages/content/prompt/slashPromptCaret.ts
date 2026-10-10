/**
 * Caret and text-offset helpers for the slash prompt picker. They work on both
 * textarea and contenteditable chat inputs and skip over inserted prompt tokens.
 */

/** Class on the inline token that stands in for an inserted prompt. */
export const TOKEN_CLASS = 'gv-pm-slash-token';

export function readText(input: HTMLElement): string {
  return input instanceof HTMLTextAreaElement
    ? input.value
    : input.innerText || input.textContent || '';
}

export function getCaretOffset(input: HTMLElement): {
  prefix: string;
  range: Range | null;
  baseOffset: number;
} {
  if (input instanceof HTMLTextAreaElement) {
    const end = input.selectionStart ?? input.value.length;
    return { prefix: input.value.slice(0, end), range: null, baseOffset: 0 };
  }

  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) {
    return { prefix: readText(input), range: null, baseOffset: 0 };
  }
  const selectionRange = selection.getRangeAt(0);
  if (!input.contains(selectionRange.commonAncestorContainer)) {
    return { prefix: readText(input), range: null, baseOffset: 0 };
  }

  const prefixRange = selectionRange.cloneRange();
  prefixRange.selectNodeContents(input);
  prefixRange.setEnd(selectionRange.endContainer, selectionRange.endOffset);
  const fullPrefix = prefixRange.toString();

  // An inserted token's real DOM text is the full prompt body. Slash parsing
  // must only inspect text typed after the last token, otherwise a URL or path
  // inside that hidden body could reopen completion immediately.
  const tokens = Array.from(input.querySelectorAll<HTMLElement>(`.${TOKEN_CLASS}`));
  for (let index = tokens.length - 1; index >= 0; index--) {
    const tokenRange = document.createRange();
    tokenRange.selectNode(tokens[index]);
    if (tokenRange.compareBoundaryPoints(Range.END_TO_END, selectionRange) > 0) continue;
    const suffixRange = selectionRange.cloneRange();
    suffixRange.setStartAfter(tokens[index]);
    const prefix = suffixRange.toString();
    return {
      prefix,
      range: selectionRange.cloneRange(),
      baseOffset: fullPrefix.length - prefix.length,
    };
  }

  return { prefix: fullPrefix, range: selectionRange.cloneRange(), baseOffset: 0 };
}

function allTextNodes(root: Node): Text[] {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  let current = walker.nextNode();
  while (current) {
    nodes.push(current as Text);
    current = walker.nextNode();
  }
  return nodes;
}

export function findTextBoundary(
  root: HTMLElement,
  offset: number,
): { node: Text; offset: number } | null {
  let remaining = Math.max(0, offset);
  for (const node of allTextNodes(root)) {
    if (remaining <= node.data.length) return { node, offset: remaining };
    remaining -= node.data.length;
  }
  const last = allTextNodes(root).at(-1);
  return last ? { node: last, offset: last.data.length } : null;
}

export function placeCaretAtTextOffset(input: HTMLElement, offset: number): void {
  if (input instanceof HTMLTextAreaElement) {
    input.focus();
    input.setSelectionRange(offset, offset);
    return;
  }

  const range = document.createRange();
  const boundary = findTextBoundary(input, offset);
  if (boundary) {
    range.setStart(boundary.node, boundary.offset);
    range.collapse(true);
  } else {
    range.selectNodeContents(input);
    range.collapse(true);
  }
  const selection = window.getSelection();
  if (!selection) return;
  input.focus();
  selection.removeAllRanges();
  selection.addRange(range);
}

export function placeCaretAtInputStart(input: HTMLElement): void {
  if (input instanceof HTMLTextAreaElement) {
    input.focus();
    input.setSelectionRange(0, 0);
    return;
  }

  const range = document.createRange();
  const firstToken = input.querySelector<HTMLElement>(`.${TOKEN_CLASS}`);
  if (firstToken) {
    const prefixRange = document.createRange();
    prefixRange.selectNodeContents(input);
    prefixRange.setEndBefore(firstToken);
    if (prefixRange.toString() === '') {
      range.setStartBefore(firstToken);
      range.collapse(true);
    } else {
      const boundary = findTextBoundary(input, 0);
      if (boundary) range.setStart(boundary.node, boundary.offset);
    }
  } else {
    const boundary = findTextBoundary(input, 0);
    if (boundary) range.setStart(boundary.node, boundary.offset);
  }
  range.collapse(true);

  const selection = window.getSelection();
  if (!selection) return;
  input.focus();
  selection.removeAllRanges();
  selection.addRange(range);
}

export function restoreCaretAfterInput(input: HTMLElement, offset: number): void {
  const prefix = readText(input).slice(0, offset);
  placeCaretAtTextOffset(input, offset);

  // Gemini can reconcile the editor in a microtask after handling `input` and
  // reset its selection to the end. Reapply only while this edit still owns
  // focus and the text before the deletion point is unchanged.
  queueMicrotask(() => {
    if (
      input.isConnected &&
      document.activeElement === input &&
      readText(input).slice(0, offset) === prefix
    ) {
      placeCaretAtTextOffset(input, offset);
    }
  });
}
