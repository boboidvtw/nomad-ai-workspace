/**
 * Nomad Shared Core - Shipping store: ~/.nomad/shipping.json on disk
 * The daemon and the Studio each hold a ledger on this file, so the store tracks the mtime this
 * process last read or wrote and reports when another process changed it.
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { ok, err } = require('../result');
const { ErrorCodes } = require('../error-codes');
const { PRIVATE_DIR_MODE, PRIVATE_FILE_MODE } = require('../constants');
const M = require('./shipping-model');

/**
 * @typedef {Object} ShippingSnapshot
 * @property {import('./shipping-model').Feature[]} features
 * @property {import('./shipping-model').Friction[]} friction
 * @property {import('./shipping-model').Regression[]} regressions
 */

/** @param {any} f */
function isFeature(f) {
  return (
    f &&
    typeof f.id === 'string' &&
    typeof f.title === 'string' &&
    Object.values(M.SHIP_STATE).includes(f.state) &&
    ['invariants', 'squares', 'builders', 'events'].every((key) => Array.isArray(f[key]))
  );
}

/** @param {any} item */
function hasId(item) {
  return item && typeof item.id === 'string';
}

class ShippingStore {
  /**
   * @param {string | null} storagePath - null keeps everything in memory
   * @param {() => number} now
   */
  constructor(storagePath, now) {
    this.storagePath = storagePath;
    this.now = now;
    /** mtime of the file as this process last read or wrote it */
    this.syncedMtimeMs = /** @type {number | null} */ (null);
  }

  mtime() {
    if (!this.storagePath) return null;
    try {
      return fs.statSync(this.storagePath).mtimeMs;
    } catch {
      return null;
    }
  }

  /** True when another process wrote the file since this one last read or wrote it. */
  changed() {
    const mtime = this.mtime();
    return mtime !== null && mtime !== this.syncedMtimeMs;
  }

  /**
   * @param {ShippingSnapshot} snapshot
   * @returns {import('../result').UnitResult<boolean>}
   */
  write(snapshot) {
    if (!this.storagePath) return ok(false);
    try {
      fs.mkdirSync(path.dirname(this.storagePath), { recursive: true, mode: PRIVATE_DIR_MODE });
      const tmp = `${this.storagePath}.${process.pid}.${crypto.randomUUID().slice(0, 6)}.tmp`;
      const fd = fs.openSync(tmp, 'w', PRIVATE_FILE_MODE);
      try {
        fs.writeFileSync(fd, JSON.stringify({ version: 1, ...snapshot }, null, 2), 'utf8');
        // The rename keeps this mtime; reading it here avoids seeing another writer's file.
        this.syncedMtimeMs = fs.fstatSync(fd).mtimeMs;
      } finally {
        fs.closeSync(fd);
      }
      fs.renameSync(tmp, this.storagePath);
      return ok(true);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.warn('[ShippingStore] Failed to save:', message);
      return err(
        ErrorCodes.SHIPPING_STORAGE_FAILED_008,
        `Failed to save shipping ledger: ${message}`,
      );
    }
  }

  /**
   * Reads and validates the file. An unreadable file is copied aside first, so the next write
   * can replace it without losing what was there.
   * @returns {import('../result').UnitResult<ShippingSnapshot | null>} null when there is no file
   */
  read() {
    if (!this.storagePath || !fs.existsSync(this.storagePath)) return ok(null);
    try {
      const raw = JSON.parse(fs.readFileSync(this.storagePath, 'utf8'));
      this.syncedMtimeMs = this.mtime();
      return ok({
        features: Array.isArray(raw?.features) ? raw.features.filter(isFeature) : [],
        friction: Array.isArray(raw?.friction) ? raw.friction.filter(hasId) : [],
        regressions: Array.isArray(raw?.regressions) ? raw.regressions.filter(hasId) : [],
      });
    } catch (e) {
      this.backUpCorruptFile();
      return err(
        ErrorCodes.SHIPPING_STORAGE_FAILED_008,
        `Failed to load shipping ledger: ${e instanceof Error ? e.message : e}`,
      );
    }
  }

  backUpCorruptFile() {
    if (!this.storagePath) return;
    try {
      fs.copyFileSync(this.storagePath, `${this.storagePath}.corrupt-${this.now()}`);
    } catch {}
    this.syncedMtimeMs = this.mtime();
  }
}

module.exports = { ShippingStore };
