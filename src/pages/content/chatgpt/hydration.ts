/**
 * ChatGPT is a server-rendered React app that hydrates the whole document. Touching `<body>`
 * (classes, attributes, an extra root) before hydration finishes makes React throw #418 and
 * the page stays on its pre-hydration placeholder (`#pending-home-input`) with a dead send
 * button. The composer editor only exists once the app is live, so wait for it first.
 */
const COMPOSER_SELECTOR = 'div.ProseMirror[contenteditable="true"], #prompt-textarea';

/**
 * Resolves true once ChatGPT's composer is mounted, or false after `timeoutMs` so the
 * extension still starts if the selector changes upstream.
 */
export function waitForChatGPTHydration(doc: Document, timeoutMs: number): Promise<boolean> {
  if (doc.querySelector(COMPOSER_SELECTOR)) return Promise.resolve(true);

  return new Promise((resolve) => {
    const finish = (ready: boolean) => {
      observer.disconnect();
      clearTimeout(timer);
      resolve(ready);
    };
    const observer = new MutationObserver(() => {
      if (doc.querySelector(COMPOSER_SELECTOR)) finish(true);
    });
    observer.observe(doc.documentElement, { childList: true, subtree: true });
    const timer = setTimeout(() => finish(false), timeoutMs);
  });
}
