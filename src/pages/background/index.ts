import { googleDriveSyncService } from '@src/services/GoogleDriveSyncService';
import type { SyncMessage, SyncMode } from '@src/types/sync';

console.log('background script loaded');

chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
  if (!message || typeof message !== 'object') return;
  const syncMessage = message as SyncMessage;

  if (syncMessage.type && syncMessage.type.startsWith('cv.sync.')) {
    // Return true to indicate asynchronous response
    const handleMessage = async () => {
      try {
        switch (syncMessage.type) {
          case 'cv.sync.authenticate': {
            const interactive = syncMessage.payload?.interactive !== false;
            const success = await googleDriveSyncService.authenticate(interactive);
            sendResponse({ ok: success, state: await googleDriveSyncService.getState() });
            break;
          }
          case 'cv.sync.signOut': {
            await googleDriveSyncService.signOut();
            sendResponse({ ok: true, state: await googleDriveSyncService.getState() });
            break;
          }
          case 'cv.sync.upload': {
            const folders = syncMessage.payload?.folders || [];
            const prompts = syncMessage.payload?.prompts || [];
            const interactive = syncMessage.payload?.interactive !== false;
            const success = await googleDriveSyncService.upload(folders, prompts, interactive);
            sendResponse({ ok: success, state: await googleDriveSyncService.getState() });
            break;
          }
          case 'cv.sync.download': {
            const interactive = syncMessage.payload?.interactive !== false;
            const data = await googleDriveSyncService.download(interactive);
            sendResponse({
              ok: data !== null,
              data: data || undefined,
              state: await googleDriveSyncService.getState(),
            });
            break;
          }
          case 'cv.sync.getState': {
            sendResponse({ ok: true, state: await googleDriveSyncService.getState() });
            break;
          }
          case 'cv.sync.setMode': {
            const mode = syncMessage.payload?.mode as SyncMode;
            if (mode) {
              await googleDriveSyncService.setMode(mode);
            }
            sendResponse({ ok: true, state: await googleDriveSyncService.getState() });
            break;
          }
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        sendResponse({ ok: false, error: msg });
      }
    };
    void handleMessage();
    return true;
  }
});
