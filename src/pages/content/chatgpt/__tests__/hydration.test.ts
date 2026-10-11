import { afterEach, describe, expect, it, vi } from 'vitest';

import { waitForChatGPTHydration } from '../hydration';

afterEach(() => {
  document.body.innerHTML = '';
  vi.useRealTimers();
});

describe('waitForChatGPTHydration', () => {
  it('resolves at once when the composer editor is already mounted', async () => {
    document.body.innerHTML = '<div class="ProseMirror" contenteditable="true"></div>';
    await expect(waitForChatGPTHydration(document, 1000)).resolves.toBe(true);
  });

  it('keeps waiting while only the pre-hydration placeholder textarea exists', async () => {
    document.body.innerHTML = '<textarea id="pending-home-input"></textarea>';
    let settled = false;
    const waiting = waitForChatGPTHydration(document, 1000).then((ready) => {
      settled = true;
      return ready;
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(settled).toBe(false);

    const editor = document.createElement('div');
    editor.className = 'ProseMirror';
    editor.setAttribute('contenteditable', 'true');
    document.body.appendChild(editor);
    await expect(waiting).resolves.toBe(true);
  });

  it('accepts the #prompt-textarea composer', async () => {
    document.body.innerHTML = '<div id="prompt-textarea" contenteditable="true"></div>';
    await expect(waitForChatGPTHydration(document, 1000)).resolves.toBe(true);
  });

  it('gives up after the timeout so the extension still mounts', async () => {
    vi.useFakeTimers();
    const waiting = waitForChatGPTHydration(document, 5000);
    await vi.advanceTimersByTimeAsync(5000);
    await expect(waiting).resolves.toBe(false);
  });
});
