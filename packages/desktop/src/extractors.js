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
          'div.grid:has(.font-claude-message)',
          'div[class*="font-claude"]'
        ];
        let target = null;
        for (const sel of selectors) {
          const els = document.querySelectorAll(sel);
          if (els.length > 0) {
            target = els[els.length - 1];
            break;
          }
        }
        if (!target) return { ok: false, error: "No Claude assistant response found" };
        const text = (target.innerText || target.textContent || "").trim();
        return { ok: true, text, length: text.length };
      } catch (err) {
        return { ok: false, error: err.message };
      }
    })()`,

    checkStatus: () => `(function() {
      try {
        const stopBtn = document.querySelector('button[aria-label*="Stop"], button[aria-label*="停止"], button:has(svg.lucide-square)');
        const isStopVisible = Boolean(stopBtn && !stopBtn.disabled && (stopBtn.offsetParent !== null || stopBtn.getBoundingClientRect().height > 0));
        
        const sendBtn = document.querySelector('button[aria-label*="Send"], button[aria-label*="發送"], button[aria-label*="发送"], button:has(svg.lucide-arrow-up)');
        const isSendActive = Boolean(sendBtn && !sendBtn.disabled && (sendBtn.offsetParent !== null || sendBtn.getBoundingClientRect().height > 0));

        if (isSendActive && !isStopVisible) {
          return { ok: true, isStreaming: false };
        }
        return { ok: true, isStreaming: isStopVisible };
      } catch (err) {
        return { ok: false, isStreaming: false, error: err.message };
      }
    })()`,
  },

  chatgpt: {
    getLatestResponse: () => `(function() {
      try {
        // Modern ChatGPT selectors (2025/2026): assistant-message, MarkdownRoot, search-unit-key
        const selectors = [
          '[data-markdown-text-style="assistant-message"]',
          'div[class*="MarkdownRoot"]',
          '[data-content-search-unit-key*="assistant"]',
          '[data-chatgpt-search-unit-key*="assistant"]',
          '[data-message-author-role="assistant"]',
          '.markdown',
          'article[data-testid*="conversation-turn"]'
        ];
        let target = null;
        for (const sel of selectors) {
          const els = document.querySelectorAll(sel);
          if (els.length > 0) {
            target = els[els.length - 1];
            break;
          }
        }
        if (!target) return { ok: false, error: "No ChatGPT assistant response found" };
        const text = (target.innerText || target.textContent || "").trim();
        return { ok: true, text, length: text.length };
      } catch (err) {
        return { ok: false, error: err.message };
      }
    })()`,

    checkStatus: () => `(function() {
      try {
        const stopBtn = document.querySelector('button[aria-label*="停止"], button[aria-label*="Stop"], button[data-testid="stop-button"]');
        const isStopVisible = Boolean(stopBtn && !stopBtn.disabled && (stopBtn.offsetParent !== null || stopBtn.getBoundingClientRect().height > 0));

        const sendBtn = document.querySelector('button[aria-label*="傳送"], button[aria-label*="Send"], button[aria-label*="发送"], button[data-testid="send-button"]');
        const isSendVisible = Boolean(sendBtn && (sendBtn.offsetParent !== null || sendBtn.getBoundingClientRect().height > 0));

        if (isSendVisible && !isStopVisible) {
          return { ok: true, isStreaming: false };
        }
        return { ok: true, isStreaming: isStopVisible };
      } catch (err) {
        return { ok: false, isStreaming: false, error: err.message };
      }
    })()`,
  },

  gemini: {
    getLatestResponse: () => `(function() {
      try {
        const selectors = [
          'div.markdown.markdown-main-panel',
          'message-content',
          'structured-content-container.model-response-text',
          'model-response-content',
          'div.response-content',
          'div.response-container-content',
          '.response-container',
          'model-response',
          '.model-response'
        ];
        let target = null;
        for (const sel of selectors) {
          const els = document.querySelectorAll(sel);
          if (els.length > 0) {
            target = els[els.length - 1];
            break;
          }
        }
        if (!target) return { ok: false, error: "No Gemini model response found" };
        const text = (target.innerText || target.textContent || "").trim();
        return { ok: true, text, length: text.length };
      } catch (err) {
        return { ok: false, error: err.message };
      }
    })()`,

    checkStatus: () => `(function() {
      try {
        const stopBtn = document.querySelector('button[aria-label*="停止"], button[aria-label*="Stop"], .stop-button, button.mat-mdc-button-base:has(mat-icon[fonticon="stop"])');
        const isStopVisible = Boolean(stopBtn && !stopBtn.disabled && (stopBtn.offsetParent !== null || stopBtn.getBoundingClientRect().height > 0));

        const sendBtn = document.querySelector('button[aria-label*="傳送"], button[aria-label*="發送"], button[aria-label*="发送"], button[aria-label*="Send"], button.send-button');
        const isSendActive = Boolean(sendBtn && !sendBtn.disabled && sendBtn.getAttribute("aria-disabled") !== "true" && (sendBtn.offsetParent !== null || sendBtn.getBoundingClientRect().height > 0));

        if (isSendActive && !isStopVisible) {
          return { ok: true, isStreaming: false };
        }

        return { ok: true, isStreaming: isStopVisible };
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
          '.prose',
          'div.response-content'
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
        if (!target) return { ok: false, error: "No Grok response found" };
        const text = (target.innerText || target.textContent || "").trim();
        return { ok: true, text, length: text.length };
      } catch (err) {
        return { ok: false, error: err.message };
      }
    })()`,

    checkStatus: () => `(function() {
      try {
        const stopBtn = document.querySelector('button[aria-label*="Stop"], button[aria-label*="停止"], button:has(svg.lucide-square)');
        const isStopVisible = Boolean(stopBtn && !stopBtn.disabled && (stopBtn.offsetParent !== null || stopBtn.getBoundingClientRect().height > 0));
        
        const sendBtn = document.querySelector('button[aria-label*="Send"], button[aria-label*="傳送"], button[data-testid*="send"]');
        const isSendVisible = Boolean(sendBtn && !sendBtn.disabled && (sendBtn.offsetParent !== null || sendBtn.getBoundingClientRect().height > 0));

        if (isSendVisible && !isStopVisible) {
          return { ok: true, isStreaming: false };
        }

        return { ok: true, isStreaming: isStopVisible };
      } catch (err) {
        return { ok: false, isStreaming: false, error: err.message };
      }
    })()`,
  },

  deepseek: {
    getLatestResponse: () => `(function() {
      try {
        const selectors = [
          '.ds-markdown',
          '.ds-message--assistant',
          'div[class*="message-assistant"]',
          '.markdown',
          'div.chat-message:has(.ds-markdown)'
        ];
        let target = null;
        for (const sel of selectors) {
          const els = document.querySelectorAll(sel);
          if (els.length > 0) {
            target = els[els.length - 1];
            break;
          }
        }
        if (!target) return { ok: false, error: "No DeepSeek response found" };
        const text = (target.innerText || target.textContent || "").trim();
        return { ok: true, text, length: text.length };
      } catch (err) {
        return { ok: false, error: err.message };
      }
    })()`,

    checkStatus: () => `(function() {
      try {
        const stopBtn = document.querySelector('button[aria-label*="Stop"], button[aria-label*="停止"], div[class*="stop"]');
        const isStopVisible = Boolean(stopBtn && !stopBtn.disabled && (stopBtn.offsetParent !== null || stopBtn.getBoundingClientRect().height > 0));

        const sendBtn = document.querySelector('div[class*="send-button"], button[type="submit"]');
        const isSendActive = Boolean(sendBtn && !sendBtn.disabled && (sendBtn.offsetParent !== null || sendBtn.getBoundingClientRect().height > 0));

        if (isSendActive && !isStopVisible) {
          return { ok: true, isStreaming: false };
        }
        return { ok: true, isStreaming: isStopVisible };
      } catch (err) {
        return { ok: false, isStreaming: false, error: err.message };
      }
    })()`,
  },

  perplexity: {
    getLatestResponse: () => `(function() {
      try {
        const selectors = [
          '.prose',
          'div[class*="answer"]',
          'div[dir="auto"].text-textOff',
          '.markdown',
          'div.break-words'
        ];
        let target = null;
        for (const sel of selectors) {
          const els = document.querySelectorAll(sel);
          if (els.length > 0) {
            target = els[els.length - 1];
            break;
          }
        }
        if (!target) return { ok: false, error: "No Perplexity response found" };
        const text = (target.innerText || target.textContent || "").trim();
        return { ok: true, text, length: text.length };
      } catch (err) {
        return { ok: false, error: err.message };
      }
    })()`,

    checkStatus: () => `(function() {
      try {
        const stopBtn = document.querySelector('button[aria-label*="Stop"], button:has(svg.lucide-square)');
        const isStopVisible = Boolean(stopBtn && !stopBtn.disabled && (stopBtn.offsetParent !== null || stopBtn.getBoundingClientRect().height > 0));

        const submitBtn = document.querySelector('button[aria-label*="Submit"], button[aria-label*="Send"]');
        const isSubmitActive = Boolean(submitBtn && !submitBtn.disabled && (submitBtn.offsetParent !== null || submitBtn.getBoundingClientRect().height > 0));

        if (isSubmitActive && !isStopVisible) {
          return { ok: true, isStreaming: false };
        }
        return { ok: true, isStreaming: isStopVisible };
      } catch (err) {
        return { ok: false, isStreaming: false, error: err.message };
      }
    })()`,
  },
};

module.exports = {
  PLATFORM_EXTRACTORS,
};
