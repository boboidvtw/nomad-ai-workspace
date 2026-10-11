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
