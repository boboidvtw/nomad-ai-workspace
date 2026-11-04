# Splitting the AI Studio account scope out of `AIStudioFolderManager`

**Decision (2026-11-04):** The account-scope code in `src/pages/content/folder/aistudio.ts`
(`loadAccountIsolationSetting`, `refreshAccountScope`, `handleAccountIsolationToggle`,
`setupAccountContextPoller`, `refreshScopedDataOnAccountContextChange` and the legacy-data
migration) stays in the manager. #68 and #70 split everything else that was self-contained,
and the file is now about 1500 lines.

## Why

- These methods own the account-switch guards: `accountScopeRequest`, the per-account
  `FolderDataSession` map, and the checks that drop an awaited result once the account
  changed. Cloud upload/sync, import and `replaceData` read the same state, so a separate
  module would have to expose most of the manager's fields through callbacks.
- That would move code without making it simpler, while the guards are where a mistake
  loses or mixes up a user's folders.

## Reconsider when

- Another platform needs the same account-switch handling (then extract one shared
  account-scope controller for both), or
- a bug fix in this area is hard to test because of the manager's size.
