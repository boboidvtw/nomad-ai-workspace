/**
 * Nomad AI Studio - DOM Prompt Injectors
 * Cross-platform DOM injection scripts for AI chat interfaces.
 */

const PLATFORM_INJECTORS = {
  claude: (text) => `(function() {
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
      
      setTimeout(() => {
        const btn = document.querySelector('button[aria-label*="Send"]') ||
                    document.querySelector('button[aria-label*="發送"]') ||
                    document.querySelector('button[aria-label*="发送"]') ||
                    document.querySelector('button:has(svg.lucide-arrow-up)');
        if (btn && !btn.disabled) {
          btn.focus();
          btn.click();
        } else {
          input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
        }
      }, 300);
      return { ok: true, input: input.tagName };
    } catch(err) {
      return { ok: false, error: err.message };
    }
  })()`,

  chatgpt: (text) => `(function() {
    try {
      const text = ${JSON.stringify(text)};
      const input = document.querySelector('#prompt-textarea') ||
                    document.querySelector('div[contenteditable="true"][id*="prompt"]') ||
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
      
      setTimeout(() => {
        const btn = document.querySelector('button[data-testid="send-button"]') ||
                    document.querySelector('button[aria-label*="傳送"]') ||
                    document.querySelector('button[aria-label*="发送"]') ||
                    document.querySelector('button[aria-label*="Send"]');
        if (btn && !btn.disabled && btn.getAttribute('aria-disabled') !== 'true') {
          btn.focus();
          btn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
          btn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
          btn.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true }));
          btn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
          btn.click();
        }
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
      }, 350);
      return { ok: true, input: input.tagName };
    } catch(err) {
      return { ok: false, error: err.message };
    }
  })()`,

  gemini: (text) => `(function() {
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
      
      // 6. Submit trigger with retry loop for Angular button activation
      const clickSend = () => {
        let btn = document.querySelector('button[aria-label*="發送"]') ||
                  document.querySelector('button[aria-label*="发送"]') ||
                  document.querySelector('button[aria-label*="Send"]') ||
                  document.querySelector('button.send-button') ||
                  document.querySelector('button.mat-mdc-icon-button[aria-label*="prompt"]');
                  
        if (!btn) {
          const svgs = document.querySelectorAll('button mat-icon, button svg');
          for (const el of svgs) {
            btn = el.tagName.toLowerCase() === 'button' ? el : el.closest('button');
            if (btn && !btn.disabled && btn.getAttribute('aria-disabled') !== 'true') break;
          }
        }
        
        if (btn && !btn.disabled && btn.getAttribute('aria-disabled') !== 'true') {
          btn.focus();
          btn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
          btn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
          btn.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true }));
          btn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
          btn.click();
          return true;
        }
        return false;
      };
      
      setTimeout(() => {
        if (!clickSend()) {
          setTimeout(() => {
            if (!clickSend()) {
              setTimeout(() => {
                if (!clickSend()) {
                  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true }));
                  input.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true }));
                }
              }, 300);
            }
          }, 250);
        }
      }, 150);
      
      return { ok: true, input: input.tagName };
    } catch (err) {
      return { ok: false, error: err.message, stack: err.stack };
    }
  })()`,

  grok: (text) => `(function() {
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
      
      // 3. Submission logic (form submit, button click, or Enter key)
      const trySubmit = () => {
        const form = input.closest('form');
        
        const btnSelectors = [
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
        
        let sendBtn = null;
        for (const s of btnSelectors) {
          try {
            const b = document.querySelector(s);
            if (b && !b.disabled && b.getAttribute('aria-disabled') !== 'true') {
              sendBtn = b;
              break;
            }
          } catch(e) {}
        }
        
        if (sendBtn) {
          sendBtn.focus();
          sendBtn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
          sendBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
          sendBtn.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true }));
          sendBtn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
          sendBtn.click();
          return true;
        }
        
        if (form) {
          try {
            form.requestSubmit();
            return true;
          } catch(e) {}
        }
        
        return false;
      };
      
      setTimeout(() => {
        if (!trySubmit()) {
          setTimeout(() => {
            if (!trySubmit()) {
              setTimeout(() => {
                if (!trySubmit()) {
                  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true }));
                  input.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true }));
                }
              }, 300);
            }
          }, 250);
        }
      }, 150);
      
      return { ok: true, input: input.tagName };
    } catch (err) {
      return { ok: false, error: err.message, stack: err.stack };
    }
  })()`
};

module.exports = {
  PLATFORM_INJECTORS,
};
