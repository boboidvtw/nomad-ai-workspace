# Desktop multi-AI orchestrator

## Non-numeric turn delay collapsed to no delay

- **Trap:** `start()` used `Math.max(0, Number(turnDelayMs) ?? 2500)`. `Number()` never
  returns a nullish value, so an untyped IPC payload such as `"abc"` produced `NaN`
  and the relay fired turns back to back instead of waiting the default 2500 ms.
- **Rule:** Validate coerced numbers with `Number.isFinite` before falling back; `??`
  only guards `null` and `undefined`.
- **Guard:** `packages/desktop/src/__tests__/orchestrator.test.js` (run by
  `npm run test:monorepo`).

## Webview tasks completed with a fake deliverable

- **Trap:** `TaskRunner` read `orchRes?.text` from the webview delegate, but the desktop
  delegate forwarded `dispatchPromptToTargets()`, which returns a per-platform delivery
  map (`{ claude: { ok, data } }`) and never waits for the reply. Every webview task
  completed with the artifact `"Delegated to webview"`. The bridge test mocked the
  delegate as `{ text }`, so the mismatch never failed.
- **Rule:** Run webview tasks through `createWebviewTaskRunner` (inject, then
  `orchestrator.awaitSettled`) and return a Result. A failed or empty Result fails the
  task; mocks must mirror the real `dispatchPromptToTargets` shape.
- **Guard:** `packages/core/src/__tests__/task-runner-webview.test.js`

## A failed inject looked like a successful one

- **Trap:** Injector scripts report failure by returning `{ ok: false, error }` (for example
  `ChatGPT input not found`), but `dispatchPromptToTargets` wrapped every resolved
  `executeJavaScript` as `{ ok: true, data }`. The webview runner then waited the full
  180-second reply budget for a message that was never sent.
- **Rule:** Map injector results with `toDeliveryResult`; only a thrown error or an explicit
  `ok: false` is a failure, and it must reach the runner as one.
- **Guard:** `packages/desktop/src/__tests__/injectors.test.js`

## Claude's zh-Hant send button was not recognised

- **Trap:** The Claude injector looked for send buttons labelled `Send`, `發送` or `发送`. The
  zh-Hant UI labels it `傳送訊息`, so the injector fell back to a synthetic Enter key that
  ProseMirror ignores: the text sat in the box and the run timed out.
- **Rule:** Match `傳送` alongside the other labels, and cover each UI locale's label with a
  DOM test built from the real page structure.
- **Guard:** `packages/desktop/src/__tests__/injectors.test.js`

## Studio kept running the previous background bundle after a rebuild

- **Trap:** Electron keeps an unpacked extension's service-worker registration across
  launches and only re-registers it when the manifest version changes. Rebuilding
  `dist_chrome` at the same version left Studio on the old background bundle, so fixes
  such as the `storage.sync` fallback never reached it.
- **Rule:** Call `refreshStaleExtensionServiceWorker` before `loadExtension`; it clears the
  extension's service-worker registration whenever the background entry's fingerprint
  changes. When checking a background fix in Studio, confirm the logged
  `assets/index.ts-*.js` name matches the one in `dist_chrome/assets`.
- **Guard:** `packages/desktop/src/__tests__/extension-sw-refresh.test.js`

## chrome.permissions crashed the background in Electron

- **Trap:** Electron does not implement `chrome.permissions`. The background registered
  `chrome.permissions.onAdded.addListener` at the top level, so the service worker threw
  at startup and every top-level registration after it never ran in Studio.
- **Rule:** Register extension events that Electron may lack through a guard that skips
  missing APIs (`addPermissionChangeListeners`), never by bare top-level access.
- **Guard:** `src/pages/background/__tests__/permissionEvents.test.ts`

## An open extension guide swallowed every Gemini bot send

- **Trap:** While a coachmark guide is open, the extension cancels page clicks in the capture
  phase so a stray click cannot trigger unrelated controls. Nobody dismisses a guide in an
  unattended Studio webview, so the Gemini injector's `click()` on the send button was
  cancelled every time. The injector still reported `ok`, the text stayed in the input box,
  and the bot read the previous reply as the new one (capture check: 1/10, the rest
  `mismatch`).
- **Rule:** The guide only swallows trusted (person) clicks (`isUserClick`). An injector
  confirms the prompt left the input box (or a stop button appeared) before reporting
  `ok`, and returns `{ ok: false }` otherwise, so the run fails fast instead of capturing a
  stale reply.
- **Guard:** `src/pages/content/coachmark/__tests__/coachmark.test.ts`,
  `packages/desktop/src/__tests__/injectors.test.js`

## Perplexity replies carried source chip text

- **Trap:** The Perplexity extractor read `innerText` of the last `.prose`, which includes
  the inline source chips perplexity.ai renders after each sentence. Bot replies came back
  as "…重新訓練。\ndatabricks\n+1".
- **Rule:** Read the reply from an off-screen copy with `[data-pplx-citation]` removed;
  never edit the live page, and keep reading `innerText` so paragraph breaks survive.
- **Guard:** `packages/desktop/src/__tests__/extractors.test.js`

## A new layout button wrapped every top-bar label into vertical text

- **Trap:** The top bar is one flex row whose children could shrink and wrap. Adding the
  🧬 自進化 IDE layout button pushed the row past the window width at every size, so the
  layout buttons and the brand wrapped into one character per line, even at 1800px, and
  the bar still overflowed below 1440px. jsdom has no layout, so no unit test saw it.
- **Rule:** Top-bar controls never wrap or shrink (`white-space: nowrap; flex-shrink: 0`).
  Narrow windows drop labels in width tiers instead (layout buttons 單欄專注 -> 單欄 -> 單,
  platform chips keep a dot, pills keep an icon), each with a tooltip. When a control is
  added to the top bar, re-run the width sweep and retune the tier thresholds.
- **Guard:** `packages/desktop/src/__tests__/top-bar-labels.test.js` (structure),
  `npx electron packages/desktop/scripts/measure-top-bar.js` (real layout, 960-2400px,
  exits 1 on overflow or wrap)
