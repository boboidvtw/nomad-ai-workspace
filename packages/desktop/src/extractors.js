/**
 * Nomad AI Studio - DOM Response Extractors & Streaming Detectors
 * Extracts latest AI responses and detects completion status across platforms.
 */

const PLATFORM_EXTRACTORS = {
  claude: {
    getLatestResponse: () => `(function() {
      try {
        const selectors = [
          '.font-claude-message',
          '[data-testid="assistant-message"]',
          'div[data-message-author-role="assistant"]',
          '.standard-markdown',
          'div.grid:has(.font-claude-message)'
        ];
        let target = null;
        for (const sel of selectors) {
          const els = document.querySelectorAll(sel);
          if (els.length > 0) {
            target = els[els.length - 1];
            break;
          }
        }
        if (!target) return { ok: false, error: 'No Claude assistant response found' };
        const text = (target.innerText || target.textContent || '').trim();
        return { ok: true, text, length: text.length };
      } catch (err) {
        return { ok: false, error: err.message };
      }
    })()`,

    checkStatus: () => `(function() {
      try {
        const stopBtn = document.querySelector('button[aria-label*="Stop"], button[aria-label*="停止"], button:has(svg.lucide-square)');
        const isStreaming = Boolean(stopBtn && !stopBtn.disabled && (stopBtn.offsetParent !== null || stopBtn.getBoundingClientRect().height > 0));
        return { ok: true, isStreaming };
      } catch (err) {
        return { ok: false, isStreaming: false, error: err.message };
      }
    })()`,
  },

  chatgpt: {
    getLatestResponse: () => `(function() {
      try {
        const selectors = [
          '[data-message-author-role="assistant"]',
          'article[data-turn="assistant"]',
          'div[class*="agent-turn"]',
          '.markdown'
        ];
        let target = null;
        for (const sel of selectors) {
          const els = document.querySelectorAll(sel);
          if (els.length > 0) {
            target = els[els.length - 1];
            break;
          }
        }
        if (!target) return { ok: false, error: 'No ChatGPT assistant response found' };
        const text = (target.innerText || target.textContent || '').trim();
        return { ok: true, text, length: text.length };
      } catch (err) {
        return { ok: false, error: err.message };
      }
    })()`,

    checkStatus: () => `(function() {
      try {
        const stopBtn = document.querySelector('button[data-testid="stop-button"], button[aria-label*="Stop"], button[aria-label*="停止"]');
        const isStreaming = Boolean(stopBtn && (stopBtn.offsetParent !== null || stopBtn.getBoundingClientRect().height > 0));
        return { ok: true, isStreaming };
      } catch (err) {
        return { ok: false, isStreaming: false, error: err.message };
      }
    })()`,
  },

  gemini: {
    getLatestResponse: () => `(function() {
      try {
        const selectors = [
          'message-content',
          'model-response',
          '.model-response',
          '[data-message-author-role="model"]',
          '[aria-label="Gemini response"]',
          '.presented-response-container'
        ];
        let target = null;
        for (const sel of selectors) {
          const els = document.querySelectorAll(sel);
          if (els.length > 0) {
            target = els[els.length - 1];
            break;
          }
        }
        if (!target) return { ok: false, error: 'No Gemini model response found' };
        const text = (target.innerText || target.textContent || '').trim();
        return { ok: true, text, length: text.length };
      } catch (err) {
        return { ok: false, error: err.message };
      }
    })()`,

    checkStatus: () => `(function() {
      try {
        const stopBtn = document.querySelector('button[aria-label*="停止"], button[aria-label*="Stop"], .stop-button, button.mat-mdc-button-base:has(mat-icon[fonticon="stop"])');
        const isStreaming = Boolean(stopBtn && (stopBtn.offsetParent !== null || stopBtn.getBoundingClientRect().height > 0));
        return { ok: true, isStreaming };
      } catch (err) {
        return { ok: false, isStreaming: false, error: err.message };
      }
    })()`,
  },

  grok: {
    getLatestResponse: () => `(function() {
      try {
        const selectors = [
          'div[data-testid*="response"]',
          '.message-bubble:not(:has(textarea))',
          'div[class*="response"]',
          '.prose'
        ];
        let target = null;
        for (const sel of selectors) {
          const els = document.querySelectorAll(sel);
          if (els.length > 0) {
            target = els[els.length - 1];
            break;
          }
        }
        if (!target) {
          const bubbles = document.querySelectorAll('div[class*="bubble"], div[role="listitem"]');
          if (bubbles.length > 0) target = bubbles[bubbles.length - 1];
        }
        if (!target) return { ok: false, error: 'No Grok response found' };
        const text = (target.innerText || target.textContent || '').trim();
        return { ok: true, text, length: text.length };
      } catch (err) {
        return { ok: false, error: err.message };
      }
    })()`,

    checkStatus: () => `(function() {
      try {
        const stopBtn = document.querySelector('button[aria-label*="Stop"], button[aria-label*="停止"], button:has(svg.lucide-square)');
        const isStreaming = Boolean(stopBtn && (stopBtn.offsetParent !== null || stopBtn.getBoundingClientRect().height > 0));
        return { ok: true, isStreaming };
      } catch (err) {
        return { ok: false, isStreaming: false, error: err.message };
      }
    })()`,
  },
};

module.exports = {
  PLATFORM_EXTRACTORS,
};
