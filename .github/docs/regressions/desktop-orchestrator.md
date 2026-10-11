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

## The extension background died halfway inside Studio

- **Trap:** `src/pages/background/index.ts` called `chrome.permissions.onAdded.addListener` at the
  top level. Electron has no `chrome.permissions`, so module evaluation threw there and every
  later statement, including the runtime message router, never ran inside Nomad AI Studio.
- **Rule:** Top-level listeners on APIs Electron lacks (permissions, contextMenus, commands,
  alarms, notifications, downloads, identity, sidePanel) use optional chaining.
- **Guard:** `src/pages/background/__tests__/electronApiGuards.test.ts`
