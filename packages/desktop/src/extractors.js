/**
 * Nomad AI Studio - DOM Response Extractors & Streaming Detectors
 * Extracts latest AI responses and detects completion status across platforms.
 */

/**
 * Defines readText(el, prepare?) inside an extractor script. KaTeX draws each formula twice
 * (MathML for screen readers, HTML for the eye), so innerText read it twice and garbled, and the
 * next platform's editor could reject that text. Formulas are read as their TeX source instead.
 * The copy sits off-screen in the page so innerText still sees the layout and keeps line breaks.
 */
const READ_TEXT_SOURCE = `
      const MATH_SELECTOR = '.math-block, .math-inline, .katex-display, .katex';
      const texOf = (el) => el.getAttribute('data-math') ||
        (el.querySelector('annotation[encoding="application/x-tex"]') || {}).textContent || '';
      const readText = (el, prepare) => {
        if (!prepare && !el.querySelector(MATH_SELECTOR)) return (el.innerText || el.textContent || '').trim();
        const copy = el.cloneNode(true);
        if (prepare) prepare(copy);
        for (const m of [...copy.querySelectorAll(MATH_SELECTOR)]) {
          const tex = copy.contains(m) ? texOf(m).trim() : '';
          if (!tex) continue;
          if (m.matches('.math-block, .katex-display')) {
            const block = document.createElement('div');
            block.textContent = '$$' + tex + '$$';
            m.replaceWith(block);
          } else {
            m.replaceWith(document.createTextNode('$' + tex + '$'));
          }
        }
        const host = document.createElement('div');
        host.style.cssText = 'position:fixed;left:-100000px;top:0;pointer-events:none;width:' + (el.clientWidth || 800) + 'px';
        host.appendChild(copy);
        document.body.appendChild(host);
        try {
          return (copy.innerText || copy.textContent || '').replace(/\\n{3,}/g, '\\n\\n').trim();
        } finally {
          host.remove();
        }
      };`;

/**
 * Defines isBaseline(target) inside an extractor script. The read taken before a send marks the
 * reply it found; later reads say whether the last reply is still that element. Platforms that
 * render older replies late (Perplexity) raise the reply count without a new reply, and only the
 * mark tells those apart.
 * @param {{ markBaseline?: boolean }} [options]
 */
const baselineSource = (options = {}) => `
      const isBaseline = (el) => {
        if (${Boolean(options.markBaseline)}) {
          document.querySelectorAll('[data-nomad-baseline]').forEach((m) => m.removeAttribute('data-nomad-baseline'));
          el.setAttribute('data-nomad-baseline', '');
        }
        return el.hasAttribute('data-nomad-baseline');
      };`;

/** @type {Record<string, { getLatestResponse: (options?: { markBaseline?: boolean }) => string, checkStatus: () => string }>} Script builders run inside each platform webview */
const PLATFORM_EXTRACTORS = {
  claude: {
    getLatestResponse: (options) => `(function() {
      try {
${READ_TEXT_SOURCE}${baselineSource(options)}
        const selectors = [
          '.font-claude-message',
          '[data-testid="assistant-message"]',
          'div[data-message-author-role="assistant"]',
          '.standard-markdown',
          'div.grid:has(.font-claude-message)',
          'div[class*="font-claude"]'
        ];
        let target = null;
        let count = 0;
        let countOf = null;
        for (const sel of selectors) {
          const els = document.querySelectorAll(sel);
          if (els.length > 0) {
            target = els[els.length - 1];
            count = els.length;
            countOf = sel;
            break;
          }
        }
        if (!target) return { ok: false, error: "No Claude assistant response found" };
        // While Claude thinks the row holds only the thinking summary and its timer, no reply yet.
        const isThinking = target.closest('[data-is-streaming="true"]') && !target.querySelector('.standard-markdown') && !target.matches('.standard-markdown');
        if (isThinking) return { ok: true, text: "", length: 0, count, countOf, isBaseline: isBaseline(target) };
        // A message row also holds a screen-reader label and the action bar; read its markdown.
        const blocks = target.matches('.standard-markdown')
          ? [target]
          : [...target.querySelectorAll('.standard-markdown')];
        const parts = (blocks.length ? blocks : [target]).map((el) => readText(el));
        const text = parts.filter(Boolean).join("\\n\\n");
        return { ok: true, text, length: text.length, count, countOf, isBaseline: isBaseline(target) };
      } catch (err) {
        return { ok: false, error: err.message };
      }
    })()`,

    checkStatus: () => `(function() {
      try {
        // The reply row's own flag stays on through thinking and tool runs and cannot stick.
        if (document.querySelector('[data-is-streaming="true"]')) {
          return { ok: true, isStreaming: true, certain: true };
        }

        const stopBtn = document.querySelector('button[aria-label*="Stop"], button[aria-label*="停止"], button:has(svg.lucide-square)');
        const isStopVisible = Boolean(stopBtn && !stopBtn.disabled && (stopBtn.offsetParent !== null || stopBtn.getBoundingClientRect().height > 0));
        
        const sendBtn = document.querySelector('button[aria-label*="Send"], button[aria-label*="傳送"], button[aria-label*="發送"], button[aria-label*="发送"], button:has(svg.lucide-arrow-up)');
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
    getLatestResponse: (options) => `(function() {
      try {
${READ_TEXT_SOURCE}${baselineSource(options)}
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
        let count = 0;
        let countOf = null;
        for (const sel of selectors) {
          const els = [...document.querySelectorAll(sel)];
          if (els.length > 0) {
            // The page also holds hidden copies of other replies, sometimes after the real one.
            const shown = els.filter((el) => el.getBoundingClientRect().height > 0);
            target = shown[shown.length - 1] || els[els.length - 1];
            count = els.length;
            countOf = sel;
            break;
          }
        }
        if (!target) return { ok: false, error: "No ChatGPT assistant response found" };
        const text = readText(target);
        return { ok: true, text, length: text.length, count, countOf, isBaseline: isBaseline(target) };
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
    getLatestResponse: (options) => `(function() {
      try {
${READ_TEXT_SOURCE}${baselineSource(options)}
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
        let count = 0;
        let countOf = null;
        for (const sel of selectors) {
          const els = document.querySelectorAll(sel);
          if (els.length > 0) {
            target = els[els.length - 1];
            count = els.length;
            countOf = sel;
            break;
          }
        }
        if (!target) return { ok: false, error: "No Gemini model response found" };
        const text = readText(target);
        return { ok: true, text, length: text.length, count, countOf, isBaseline: isBaseline(target) };
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
    getLatestResponse: (options) => `(function() {
      try {
${READ_TEXT_SOURCE}${baselineSource(options)}
        const selectors = [
          // The bubble around it holds the "Grok" header and the run time, not the reply.
          '[data-testid="assistant-message"] .response-content-markdown',
          'div[data-testid*="response"]',
          '.message-bubble:not(:has(textarea))',
          'div[class*="response"]',
          '.prose',
          'div.response-content'
        ];
        let target = null;
        let count = 0;
        let countOf = null;
        for (const sel of selectors) {
          const els = document.querySelectorAll(sel);
          if (els.length > 0) {
            target = els[els.length - 1];
            count = els.length;
            countOf = sel;
            break;
          }
        }
        if (!target) {
          const bubbles = document.querySelectorAll('div[class*="bubble"], div[role="listitem"]');
          if (bubbles.length > 0) {
            target = bubbles[bubbles.length - 1];
            count = bubbles.length;
            countOf = 'bubble';
          }
        }
        if (!target) return { ok: false, error: "No Grok response found" };
        const text = readText(target);
        return { ok: true, text, length: text.length, count, countOf, isBaseline: isBaseline(target) };
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

  copilot: {
    getLatestResponse: (options) => `(function() {
      try {
${READ_TEXT_SOURCE}${baselineSource(options)}
        const replies = document.querySelectorAll('[data-testid="markdown-reply"]');
        const target = replies[replies.length - 1];
        if (!target) return { ok: false, error: "No Copilot response found" };
        const text = readText(target).replace(/[\\u200b-\\u200d\\ufeff]/g, "").trim();
        return { ok: true, text, length: text.length, count: replies.length, countOf: 'markdown-reply', isBaseline: isBaseline(target) };
      } catch (err) {
        return { ok: false, error: err.message };
      }
    })()`,

    checkStatus: () => `(function() {
      try {
        const stopBtn = document.querySelector('button[aria-label*="停止"], button[aria-label*="Stop"]');
        const isStopVisible = Boolean(stopBtn && !stopBtn.disabled && (stopBtn.offsetParent !== null || stopBtn.getBoundingClientRect().height > 0));
        return { ok: true, isStreaming: isStopVisible };
      } catch (err) {
        return { ok: false, isStreaming: false, error: err.message };
      }
    })()`,
  },

  perplexity: {
    getLatestResponse: (options) => `(function() {
      try {
${READ_TEXT_SOURCE}${baselineSource(options)}
        const selectors = [
          '.prose',
          'div[class*="answer"]',
          'div[dir="auto"].text-textOff',
          '.markdown',
        ];
        // The follow-up box also matches the fallbacks (its class holds "answer"); a block with
        // an input in it is page chrome, never a reply.
        const isChrome = (el) => Boolean(el.querySelector('[contenteditable="true"], textarea'));
        let target = null;
        let count = 0;
        let countOf = null;
        for (const sel of selectors) {
          const els = [...document.querySelectorAll(sel)].filter((el) => !isChrome(el));
          if (els.length > 0) {
            target = els[els.length - 1];
            count = els.length;
            countOf = sel;
            break;
          }
        }
        if (!target) return { ok: false, error: "No Perplexity response found" };
        // Sources render as inline chips ("databricks +1"); read a copy without them.
        const text = readText(target, (copy) => {
          copy.querySelectorAll('[data-pplx-citation], .citation').forEach((el) => el.remove());
        });
        return { ok: true, text, length: text.length, count, countOf, isBaseline: isBaseline(target) };
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
