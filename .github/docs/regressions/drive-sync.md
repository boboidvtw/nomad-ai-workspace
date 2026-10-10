# Google Drive sync

## Sync All dropped Gemini conversation membership

- **Trap:** `syncAllPlatformFolders` uploaded Gemini with
  `uploadGeminiFolders(gemini.folders, …)`, so `Nomad Workspace/Gemini/gemini-folders.json`
  only held the folder list. On the next download `toFolderData` saw a bare array and
  wrapped it with `folderContents: {}`, so which conversations live in which folder
  never reached other devices.
- **Rule:** Upload the full `FolderData` (`folders` + `folderContents`) for Gemini.
  Readers must still accept a bare folder array, because files uploaded before the fix
  have that shape.
- **Guard:** `src/pages/background/__tests__/multiPlatformFolderSync.test.ts`

## Popup and background accepted different sync data

- **Trap:** The popup and the background worker each kept their own copy of the
  folder, prompt and starred-message guards. The popup copies were looser (no check
  that `folderContents` / `messages` values are arrays, no finite-number check on
  prompt timestamps), so the popup could merge or upload data the background then
  rejected.
- **Rule:** Both sides import the guards from `src/core/utils/syncDataGuards.ts`;
  do not add a local copy in either entry point.
- **Guard:** `src/core/utils/__tests__/syncDataGuards.test.ts`
