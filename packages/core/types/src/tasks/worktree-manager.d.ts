export type WorktreeRecord = {
    taskId: string;
    agentId: string;
    branchName: string;
    baseBranch: string;
    worktreePath: string;
    status: "active" | "verified" | "verification_failed" | "merged" | "conflict" | "removed";
    verified: boolean;
    lastVerification: {
        passed: boolean;
        command?: string;
        output?: string;
        verifiedAt: string;
    } | null;
    createdAt: string;
    updatedAt: string;
};
export const DEFAULT_MAX_CONCURRENT_WORKTREES: 6;
/**
 * @typedef {Object} WorktreeRecord
 * @property {string} taskId
 * @property {string} agentId
 * @property {string} branchName
 * @property {string} baseBranch
 * @property {string} worktreePath
 * @property {'active' | 'verified' | 'verification_failed' | 'merged' | 'conflict' | 'removed'} status
 * @property {boolean} verified
 * @property {{ passed: boolean, command?: string, output?: string, verifiedAt: string } | null} lastVerification
 * @property {string} createdAt
 * @property {string} updatedAt
 */
export class WorktreeManager {
    /**
     * @param {Object} [options]
     * @param {string} [options.repoRoot]
     * @param {string} [options.worktreeBaseDir]
     * @param {number} [options.maxConcurrentWorktrees=6]
     * @param {Function} [options.onEvent] - (eventType: string, payload: any) => void
     */
    constructor(options?: {
        repoRoot?: string | undefined;
        worktreeBaseDir?: string | undefined;
        maxConcurrentWorktrees?: number | undefined;
        onEvent?: Function | undefined;
    });
    repoRoot: string;
    worktreeBaseDir: string;
    maxConcurrentWorktrees: number;
    onEvent: Function | null;
    /** @type {Map<string, WorktreeRecord>} */
    worktrees: Map<string, WorktreeRecord>;
    /**
     * @param {string} eventType
     * @param {any} payload
     */
    _emit(eventType: string, payload: any): void;
    /**
     * Sanitizes a taskId into a safe directory and git branch slug
     * @param {string} raw
     * @returns {string}
     */
    _sanitizeSlug(raw: string): string;
    /**
     * Counts currently active (unmerged, unremoved) worktrees
     * @returns {number}
     */
    getActiveCount(): number;
    /**
     * Creates an isolated Git worktree for a worker agent claiming a task
     * @param {Object} input
     * @param {string} input.taskId
     * @param {string} input.agentId
     * @param {string} [input.baseBranch='HEAD']
     * @param {string} [input.branchPrefix='task']
     * @returns {import('../result').UnitResult<WorktreeRecord>}
     */
    createWorktree(input: {
        taskId: string;
        agentId: string;
        baseBranch?: string | undefined;
        branchPrefix?: string | undefined;
    }): import("../result").UnitResult<WorktreeRecord>;
    /**
     * Retrieves a tracked worktree by taskId
     * @param {string} taskId
     * @returns {import('../result').UnitResult<WorktreeRecord>}
     */
    getWorktree(taskId: string): import("../result").UnitResult<WorktreeRecord>;
    /**
     * Lists all tracked worktree records
     * @returns {WorktreeRecord[]}
     */
    listWorktrees(): WorktreeRecord[];
    /**
     * Runs the Verify Gate inside the isolated worktree sandbox.
     * Accepts either a shell `testCommand` or a custom synchronous/check function `verifyFn`.
     * @param {Object} input
     * @param {string} input.taskId
     * @param {string} [input.testCommand]
     * @param {Function} [input.verifyFn] - (wt: WorktreeRecord) => { passed: boolean, summary?: string } | boolean
     * @returns {import('../result').UnitResult<WorktreeRecord>}
     */
    verifyWorktree(input: {
        taskId: string;
        testCommand?: string | undefined;
        verifyFn?: Function | undefined;
    }): import("../result").UnitResult<WorktreeRecord>;
    /**
     * Merges a verified worktree branch back into the target branch on repoRoot.
     * Enforces the Verify Gate (`requireVerification = true` by default).
     * @param {Object} input
     * @param {string} input.taskId
     * @param {string} [input.targetBranch]
     * @param {boolean} [input.requireVerification=true]
     * @param {boolean} [input.cleanupAfterMerge=true]
     * @returns {import('../result').UnitResult<{ taskId: string, branchName: string, targetBranch: string, merged: boolean, cleanedUp: boolean }>}
     */
    mergeWorktree(input: {
        taskId: string;
        targetBranch?: string | undefined;
        requireVerification?: boolean | undefined;
        cleanupAfterMerge?: boolean | undefined;
    }): import("../result").UnitResult<{
        taskId: string;
        branchName: string;
        targetBranch: string;
        merged: boolean;
        cleanedUp: boolean;
    }>;
    /**
     * Removes an isolated worktree directory and optionally deletes its temporary branch
     * @param {string} taskId
     * @param {Object} [options]
     * @param {boolean} [options.force=false]
     * @returns {import('../result').UnitResult<{ taskId: string, removed: boolean }>}
     */
    cleanupWorktree(taskId: string, options?: {
        force?: boolean | undefined;
    }): import("../result").UnitResult<{
        taskId: string;
        removed: boolean;
    }>;
}
