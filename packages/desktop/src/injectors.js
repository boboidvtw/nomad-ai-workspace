/**
 * @typedef {Object} PromptAttachment
 * @property {string} [name]
 * @property {string} [type] - 'text' | 'image' | other
 * @property {string} [content]
 * @property {string} [language]
 * @property {string} [mimeType]
 * @property {boolean} [isText]
 * @property {boolean} [isImage]
 */

/**
 * @param {string} text
 * @param {PromptAttachment[]} [attachments]
 * @returns {string}
 */
function formatPromptWithAttachments(text, attachments = []) {
  if (!Array.isArray(attachments) || attachments.length === 0) {
    return text || '';
  }
  const parts = [];
  for (const att of attachments) {
    if (
      att.content &&
      (att.type === 'text' ||
        att.isText ||
        (att.name && att.name.match(/\.(txt|md|js|ts|py|json|html|css|yaml|yml)$/i)))
    ) {
      parts.push(
        `[附檔: ${att.name || 'document'}]\n\`\`\`${att.language || ''}\n${att.content}\n\`\`\``,
      );
    } else if (
      att.type === 'image' ||
      att.isImage ||
      (att.name && att.name.match(/\.(png|jpe?g|webp|gif|svg)$/i))
    ) {
      parts.push(`[圖片附件: ${att.name || 'image'} (${att.mimeType || 'image/png'})]`);
    } else {
      parts.push(`[附件: ${att.name || 'file'}]`);
    }
  }
  if (text) {
    parts.push(text);
  }
  return parts.join('\n\n');
}

/**
 * Nomad AI Studio - DOM Prompt Injectors
 * Cross-platform DOM injection scripts for AI chat interfaces.
 */

/**
 * Source of `sendAndConfirm(input, findSend, label, fallback?)` and `findButton(input, selectors)`,
 * spliced into injector scripts. findButton looks in the input's own form before the page and
 * skips the Voyager extension's controls (`gv-*`), whose save button is also type=submit.
 * It clicks the send button (or presses Enter) and resolves ok only once the page shows the
 * prompt left: the input box emptied or a stop button appeared. A click a page swallows (the
 * Gemini guide did that) must fail here, or the caller reads the previous reply as this one.
 */
const SEND_CONFIRM_SOURCE = `
      const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const waitFor = async (check, timeoutMs) => {
        const deadline = Date.now() + timeoutMs;
        for (;;) {
          if (check()) return true;
          if (Date.now() >= deadline) return false;
          await sleep(100);
        }
      };
      const isEnabled = (btn) => Boolean(btn && !btn.disabled && btn.getAttribute('aria-disabled') !== 'true');
      // The extension also tags <body> (gv-claude-page), so only elements below it count.
      const isExtensionControl = (el) => {
        for (; el && el !== document.body && el !== document.documentElement; el = el.parentElement) {
          if ([...el.classList].some((c) => c.startsWith('gv-'))) return true;
        }
        return false;
      };
      const findButton = (input, selectors) => {
        const scopes = [input.closest('form'), document].filter(Boolean);
        for (const scope of scopes) {
          for (const sel of selectors) {
            let found = [];
            try { found = scope.querySelectorAll(sel); } catch (e) { continue; }
            for (const b of found) {
              if (!isExtensionControl(b) && isEnabled(b)) return b;
            }
          }
        }
        return null;
      };
      const clickLikeUser = (btn) => {
        btn.focus();
        btn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
        btn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
        btn.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true }));
        btn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
        btn.click();
      };
      const sendAndConfirm = async (input, findSend, label, fallback) => {
        const leftover = () => String(input.value ?? input.innerText ?? input.textContent ?? '').trim();
        const isStreaming = () => Boolean(document.querySelector(
          'button[aria-label*="停止"], button[aria-label*="Stop"], button[data-testid="stop-button"]'));
        const wasSent = () => leftover().length === 0 || isStreaming();
        await waitFor(() => isEnabled(findSend()), 1500);
        const btn = findSend();
        if (isEnabled(btn)) {
          clickLikeUser(btn);
          if (await waitFor(wasSent, 2500)) return { ok: true, input: input.tagName, via: 'button' };
        }
        if (fallback && fallback() && await waitFor(wasSent, 1500)) {
          return { ok: true, input: input.tagName, via: 'fallback' };
        }
        input.focus();
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true }));
        input.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true }));
        if (await waitFor(wasSent, 1000)) return { ok: true, input: input.tagName, via: 'enter' };
        return { ok: false, error: label + ' did not send the prompt (it is still in the input box)' };
      };`;

/** @type {Record<string, (text: string) => string>} Returns a script to run in the platform webview */
const RAW_PLATFORM_INJECTORS = {
  claude: (/** @type {string} */ text) => `(function() {
    try {
      const text = ${JSON.stringify(text)};
      const input = document.querySelector('div.ProseMirror[contenteditable="true"]') ||
                    document.querySelector('div[contenteditable="true"]');
      if (!input) return { ok: false, error: 'Claude input not found' };
      input.focus();
      const sel = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(input);
      range.collapse(false);
      if (sel) { sel.removeAllRanges(); sel.addRange(range); }
      let ok = false;
      try { ok = document.execCommand('insertText', false, text); } catch(e) {}
      if (!ok) {
        while (input.firstChild) { input.removeChild(input.firstChild); }
        const p = document.createElement('p');
        p.textContent = text;
        input.appendChild(p);
      }
      input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
${SEND_CONFIRM_SOURCE}
      const findSend = () => findButton(input, [
        'button[aria-label*="Send"]',
        'button[aria-label*="傳送"]',
        'button[aria-label*="發送"]',
        'button[aria-label*="发送"]',
        'button:has(svg.lucide-arrow-up)',
      ]);
      return sendAndConfirm(input, findSend, 'Claude');
    } catch(err) {
      return { ok: false, error: err.message };
    }
  })()`,

  chatgpt: (/** @type {string} */ text) => `(function() {
    try {
      const text = ${JSON.stringify(text)};
      const input = document.querySelector('div.ProseMirror[contenteditable="true"]') ||
                    document.querySelector('#prompt-textarea') ||
                    document.querySelector('div[contenteditable="true"][role="textbox"]') ||
                    document.querySelector('div[contenteditable="true"]');
      if (!input) return { ok: false, error: 'ChatGPT input not found' };
      input.focus();

      const sel = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(input);
      range.collapse(false);
      if (sel) { sel.removeAllRanges(); sel.addRange(range); }
      let ok = false;
      try { ok = document.execCommand('insertText', false, text); } catch(e) {}
      if (!ok) {
        const p = input.querySelector('p');
        if (p) p.textContent = text;
        else {
          const newP = document.createElement('p');
          newP.textContent = text;
          input.appendChild(newP);
        }
      }
      input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
      
${SEND_CONFIRM_SOURCE}
      const findSend = () => findButton(input, [
        'button[data-testid="send-button"]',
        'button[aria-label*="傳送"]',
        'button[aria-label*="发送"]',
        'button[aria-label*="Send"]',
      ]);
      return sendAndConfirm(input, findSend, 'ChatGPT');
    } catch(err) {
      return { ok: false, error: err.message };
    }
  })()`,

  gemini: (/** @type {string} */ text) => `(function() {
    try {
      const text = ${JSON.stringify(text)};
      
      // 1. Locate editable element
      let input = null;
      const selectors = [
        'rich-textarea .ql-editor[contenteditable="true"]',
        'rich-textarea [contenteditable="true"]',
        'rich-textarea > div[contenteditable="true"]',
        'div.ql-editor[contenteditable="true"]',
        'rich-textarea div[role="textbox"]',
        '.text-input-field [contenteditable="true"]',
        'div[contenteditable="true"][role="textbox"]',
        '[contenteditable="true"][aria-label*="提示"]',
        '[contenteditable="true"][aria-label*="prompt"]'
      ];
      
      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el && (el.getBoundingClientRect().height > 0 || el.offsetParent !== null)) {
          input = el;
          break;
        }
      }
      
      if (!input) {
        const rich = document.querySelector('rich-textarea');
        if (rich) {
          rich.click();
          input = rich.querySelector('[contenteditable="true"]') || rich.querySelector('.ql-editor') || rich.querySelector('p')?.parentElement;
        }
      }
      
      if (!input) {
        return { ok: false, error: 'Gemini input element not found' };
      }
      
      input.focus();
      input.click();
      input.classList.remove('ql-blank');
      
      // 2. Clear placeholder content and prepare selection inside <p>
      const targetNode = input.querySelector('p') || input;
      const sel = window.getSelection();
      if (sel) {
        const range = document.createRange();
        range.selectNodeContents(targetNode);
        range.collapse(false);
        sel.removeAllRanges();
        sel.addRange(range);
      }
      
      // 3. Insert text using execCommand (Quill-friendly)
      let ok = false;
      try {
        ok = document.execCommand('insertText', false, text);
      } catch (e) {}
      
      // 4. Safe DOM fallback without violating Google Trusted Types (never set innerHTML!)
      if (!ok) {
        let p = input.querySelector('p');
        if (!p) {
          p = document.createElement('p');
          input.appendChild(p);
        }
        p.textContent = text;
      }
      
      // 5. Fire synthetic input and change events
      input.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true, inputType: 'insertText', data: text }));
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      
      // 6. Submit, then confirm Gemini took the prompt. A click can be swallowed (an extension
      // guide left open in an unattended webview did exactly that), and reporting ok anyway
      // made the caller read the previous reply as this one.
      const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const findSend = () => document.querySelector('button[aria-label*="傳送"]') ||
                             document.querySelector('button[aria-label*="發送"]') ||
                             document.querySelector('button[aria-label*="发送"]') ||
                             document.querySelector('button[aria-label*="Send"]') ||
                             document.querySelector('button.send-button');
      const isEnabled = (btn) => Boolean(btn && !btn.disabled && btn.getAttribute('aria-disabled') !== 'true');
      const wasSent = () => (input.innerText || input.textContent || '').trim().length === 0 ||
        Boolean(document.querySelector('button[aria-label*="停止"], button[aria-label*="Stop"]'));
      const waitFor = async (check, timeoutMs) => {
        const deadline = Date.now() + timeoutMs;
        for (;;) {
          if (check()) return true;
          if (Date.now() >= deadline) return false;
          await sleep(100);
        }
      };

      return (async () => {
        await waitFor(() => isEnabled(findSend()), 1500);
        const btn = findSend();
        if (isEnabled(btn)) {
          btn.focus();
          btn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
          btn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
          btn.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true }));
          btn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
          btn.click();
          if (await waitFor(wasSent, 2500)) return { ok: true, input: input.tagName, via: 'button' };
        }
        input.focus();
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true }));
        input.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true }));
        if (await waitFor(wasSent, 1000)) return { ok: true, input: input.tagName, via: 'enter' };
        return { ok: false, error: 'Gemini did not send the prompt (it is still in the input box)' };
      })();
    } catch (err) {
      return { ok: false, error: err.message, stack: err.stack };
    }
  })()`,

  grok: (/** @type {string} */ text) => `(function() {
    try {
      const text = ${JSON.stringify(text)};
      
      // 1. Locate Grok chat input (textarea or contenteditable)
      const inputCandidates = [
        'form textarea',
        'textarea[placeholder*="斜線"]',
        'textarea[placeholder*="命令"]',
        'textarea[placeholder*="Ask"]',
        'textarea[placeholder*="Grok"]',
        'textarea',
        'form [contenteditable="true"]',
        '[contenteditable="true"][role="textbox"]',
        '[contenteditable="true"]',
        '[data-testid*="input"]'
      ];
      
      let input = null;
      const visibleMatches = [];
      for (const sel of inputCandidates) {
        const els = document.querySelectorAll(sel);
        for (const el of els) {
          if (el instanceof HTMLElement) {
            const rect = el.getBoundingClientRect();
            if (rect.width > 60 && rect.height > 20) {
              visibleMatches.push({ el, area: rect.width * rect.height });
            }
          }
        }
      }
      
      if (visibleMatches.length > 0) {
        visibleMatches.sort((a, b) => b.area - a.area);
        input = visibleMatches[0].el;
      } else {
        input = document.querySelector('textarea, [contenteditable="true"]');
      }
      
      if (!input) {
        return { ok: false, error: 'Grok input element not found' };
      }
      
      input.focus();
      input.click();
      
      // 2. Set text based on element type
      if (input.tagName.toLowerCase() === 'textarea') {
        const ta = input;
        const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
        if (nativeSetter) {
          nativeSetter.call(ta, text);
        } else {
          ta.value = text;
        }
        
        try {
          if (typeof ta.setRangeText === 'function') {
            ta.setRangeText(text, 0, ta.value.length, 'end');
          }
        } catch(e) {}
        
        ta.dispatchEvent(new Event('input', { bubbles: true }));
        ta.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true, inputType: 'insertText', data: text }));
        ta.dispatchEvent(new Event('change', { bubbles: true }));
      } else {
        // Contenteditable element
        const sel = window.getSelection();
        if (sel) {
          const range = document.createRange();
          range.selectNodeContents(input);
          range.collapse(false);
          sel.removeAllRanges();
          sel.addRange(range);
        }
        let ok = false;
        try {
          ok = document.execCommand('insertText', false, text);
        } catch(e) {}
        if (!ok) {
          input.textContent = text;
        }
        input.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true, inputType: 'insertText', data: text }));
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
      
      // 3. Submit with the first enabled send button, else submit the form, then confirm.
${SEND_CONFIRM_SOURCE}
      const btnSelectors = [
        'button[aria-label="提交"]',
        'button[type="submit"]',
        'button[aria-label*="Submit"]',
        'button[aria-label*="Send"]',
        'button[aria-label*="傳送"]',
        'button[aria-label*="送出"]',
        'button[data-testid*="send"]',
        'button[data-testid*="submit"]',
        'button:has(svg.lucide-arrow-up)',
        'button:has(svg[data-icon="arrow-up"])',
        'form button:last-of-type'
      ];
      const findSend = () => findButton(input, btnSelectors);
      const submitForm = () => {
        const form = input.closest('form');
        if (!form) return false;
        try { form.requestSubmit(); return true; } catch(e) { return false; }
      };
      return sendAndConfirm(input, findSend, 'Grok', submitForm);
    } catch (err) {
      return { ok: false, error: err.message, stack: err.stack };
    }
  })()`,

  // Microsoft 365 Copilot Chat (m365.cloud.microsoft/chat): a Lexical editor whose text keeps
  // zero-width characters and clears late, so a send is confirmed by a new question bubble or
  // the stop button rather than by an empty input box.
  copilot: (/** @type {string} */ text) => `(async function() {
    try {
      const text = ${JSON.stringify(text)};
      const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const input = document.querySelector('#m365-chat-editor-target-element') ||
                    document.querySelector('[data-lexical-editor="true"][contenteditable="true"]');
      if (!input) return { ok: false, error: 'Copilot input not found' };

      const questionCount = () => document.querySelectorAll('[data-testid="chatQuestion"]').length;
      const before = questionCount();
      const isStreaming = () => Boolean(document.querySelector('button[aria-label*="停止"], button[aria-label*="Stop"]'));
      const wasSent = () => questionCount() > before || isStreaming();
      const waitFor = async (check, timeoutMs) => {
        const deadline = Date.now() + timeoutMs;
        for (;;) {
          if (check()) return true;
          if (Date.now() >= deadline) return false;
          await sleep(100);
        }
      };

      // Replace anything left in the box. Lexical only honours the selection after it has seen
      // the selectionchange, and otherwise restores its own state over the inserted text.
      const squash = (value) => String(value || '').replace(/[\\u200b-\\u200d\\ufeff\\s]/g, '');
      input.focus();
      await sleep(100);
      document.execCommand('selectAll');
      await sleep(150);
      document.execCommand('insertText', false, text);
      await sleep(150);
      if (squash(input.innerText) !== squash(text)) {
        return { ok: false, error: 'Copilot input did not take the prompt' };
      }

      const findSend = () => document.querySelector('button[aria-label="傳送"], button[aria-label="Send"], button[aria-label="发送"]');
      const isEnabled = (btn) => Boolean(btn && !btn.disabled && btn.getAttribute('aria-disabled') !== 'true');
      await waitFor(() => isEnabled(findSend()), 1500);
      const btn = findSend();
      if (isEnabled(btn)) {
        btn.click();
        if (await waitFor(wasSent, 3000)) return { ok: true, input: input.tagName, via: 'button' };
      }
      input.focus();
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true }));
      if (await waitFor(wasSent, 1500)) return { ok: true, input: input.tagName, via: 'enter' };
      return { ok: false, error: 'Copilot did not send the prompt' };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  })()`,

  perplexity: (/** @type {string} */ text) => `(function() {
    try {
      const text = ${JSON.stringify(text)};
      const input = document.querySelector('textarea[placeholder*="Ask"], textarea[placeholder*="搜尋"], textarea');
      if (!input) return { ok: false, error: 'Perplexity input not found' };

      input.focus();
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
      if (nativeSetter) {
        nativeSetter.call(input, text);
      } else {
        input.value = text;
      }
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));

${SEND_CONFIRM_SOURCE}
      const findSend = () => findButton(input, [
        'button[aria-label*="Submit"]',
        'button[aria-label*="Send"]',
        'button:has(svg.lucide-arrow-right)',
        'button[type="submit"]',
      ]);
      return sendAndConfirm(input, findSend, 'Perplexity');
    } catch (err) {
      return { ok: false, error: err.message };
    }
  })()`,
};

/** @typedef {(input: string | { text: string, attachments?: PromptAttachment[] }) => string} PlatformInjector */

// The Proxy widens each builder to also accept `{ text, attachments }`, which the
// target's own type cannot express, hence the cast.
const PLATFORM_INJECTORS = /** @type {Record<string, PlatformInjector>} */ (
  /** @type {unknown} */ (
    new Proxy(RAW_PLATFORM_INJECTORS, {
      get(target, prop) {
        const rawFn = target[String(prop)];
        if (typeof rawFn !== 'function') return rawFn;
        return (
          /** @type {string | { text: string, attachments?: PromptAttachment[] }} */ input,
        ) => {
          const text =
            typeof input === 'object' && input !== null
              ? formatPromptWithAttachments(input.text, input.attachments)
              : input;
          return rawFn(text);
        };
      },
    })
  )
);

/**
 * Maps an injector script's return value to a delivery result. Injectors report failure by
 * returning `{ ok: false, error }` rather than throwing, so that must stay a failure.
 * @param {unknown} res
 * @returns {{ ok: true, data: unknown } | { ok: false, error: string }}
 */
function toDeliveryResult(res) {
  const r = /** @type {{ ok?: unknown, error?: unknown } | null | undefined} */ (res);
  if (r && typeof r === 'object' && r.ok === false) {
    return { ok: false, error: String(r.error || 'Injector reported failure') };
  }
  return { ok: true, data: res };
}

module.exports = {
  toDeliveryResult,
  PLATFORM_INJECTORS,
  formatPromptWithAttachments,
};
