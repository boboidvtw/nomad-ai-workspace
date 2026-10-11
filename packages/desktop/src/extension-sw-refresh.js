/**
 * Electron keeps an unpacked extension's service-worker registration across launches and only
 * re-registers it when the manifest version changes. A rebuilt dist_chrome with the same version
 * therefore keeps running the previous background bundle. Before loading the extension, compare
 * a fingerprint of the background entry with the one recorded last launch and, if it changed,
 * drop the extension's service-worker registration so the new bundle is registered.
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

/**
 * Chromium's id for an unpacked extension: SHA-256 of the absolute path, first 16 bytes,
 * each hex digit mapped 0-f → a-p.
 * @param {string} extPath
 */
function unpackedExtensionId(extPath) {
  const hex = crypto.createHash('sha256').update(extPath).digest('hex').slice(0, 32);
  return [...hex].map((digit) => String.fromCharCode(97 + parseInt(digit, 16))).join('');
}

/**
 * Hash of the background service-worker entry. The vite loader imports the content-hashed
 * bundle, so it changes whenever the background code does.
 * @param {string} extPath
 */
function backgroundFingerprint(extPath) {
  const manifest = JSON.parse(fs.readFileSync(path.join(extPath, 'manifest.json'), 'utf8'));
  const entry = manifest?.background?.service_worker;
  if (typeof entry !== 'string') throw new Error('manifest has no background.service_worker');
  return crypto
    .createHash('sha256')
    .update(fs.readFileSync(path.join(extPath, entry)))
    .digest('hex');
}

/** @param {string} stateFile */
function readStoredFingerprint(stateFile) {
  try {
    return fs.readFileSync(stateFile, 'utf8').trim();
  } catch {
    return null;
  }
}

/**
 * @param {{
 *   session: { clearStorageData: (options: { origin: string, storages: Array<'serviceworkers'> }) => Promise<void> },
 *   extPath: string,
 *   stateFile: string,
 *   log?: { warn: (...args: unknown[]) => void },
 * }} options
 * @returns {Promise<boolean>} whether a stale registration was cleared.
 */
async function refreshStaleExtensionServiceWorker({ session, extPath, stateFile, log = console }) {
  try {
    const fingerprint = backgroundFingerprint(extPath);
    if (readStoredFingerprint(stateFile) === fingerprint) return false;

    await session.clearStorageData({
      origin: `chrome-extension://${unpackedExtensionId(extPath)}`,
      storages: ['serviceworkers'],
    });
    fs.mkdirSync(path.dirname(stateFile), { recursive: true });
    fs.writeFileSync(stateFile, fingerprint);
    return true;
  } catch (e) {
    log.warn(
      '[Nomad Desktop] Could not refresh the extension service worker:',
      e instanceof Error ? e.message : String(e),
    );
    return false;
  }
}

module.exports = { unpackedExtensionId, refreshStaleExtensionServiceWorker };
