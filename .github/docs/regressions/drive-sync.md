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
