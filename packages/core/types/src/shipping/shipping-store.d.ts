export type ShippingSnapshot = {
    features: import("./shipping-model").Feature[];
    friction: import("./shipping-model").Friction[];
    regressions: import("./shipping-model").Regression[];
};
export class ShippingStore {
    /**
     * @param {string | null} storagePath - null keeps everything in memory
     * @param {() => number} now
     */
    constructor(storagePath: string | null, now: () => number);
    storagePath: string | null;
    now: () => number;
    /** mtime of the file as this process last read or wrote it */
    syncedMtimeMs: number | null;
    mtime(): number | null;
    /** True when another process wrote the file since this one last read or wrote it. */
    changed(): boolean;
    /**
     * @param {ShippingSnapshot} snapshot
     * @returns {import('../result').UnitResult<boolean>}
     */
    write(snapshot: ShippingSnapshot): import("../result").UnitResult<boolean>;
    /**
     * Reads and validates the file. An unreadable file is copied aside first, so the next write
     * can replace it without losing what was there.
     * @returns {import('../result').UnitResult<ShippingSnapshot | null>} null when there is no file
     */
    read(): import("../result").UnitResult<ShippingSnapshot | null>;
    backUpCorruptFile(): void;
}
