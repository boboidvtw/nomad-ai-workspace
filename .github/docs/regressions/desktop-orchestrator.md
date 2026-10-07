# Desktop multi-AI orchestrator

## Non-numeric turn delay collapsed to no delay

- **Trap:** `start()` used `Math.max(0, Number(turnDelayMs) ?? 2500)`. `Number()` never
  returns a nullish value, so an untyped IPC payload such as `"abc"` produced `NaN`
  and the relay fired turns back to back instead of waiting the default 2500 ms.
- **Rule:** Validate coerced numbers with `Number.isFinite` before falling back; `??`
  only guards `null` and `undefined`.
- **Guard:** `packages/desktop/src/__tests__/orchestrator.test.js` (run by
  `npm run test:monorepo`).
