/**
 * Nomad Shared Core - Physical Git Worktree Sandbox Manager (Agensh RFC-0002 Module 2)
 * Provides isolated Git worktrees for concurrent worker agents, enforces local concurrency caps,
 * gates merges on 100% test verification (Verify Gate), and aborts cleanly on merge conflicts.
 * Governed by AGENTS.md Section 6 Result Pattern & Error Codes.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync, execSync } = require('child_process');
const { ok, err } = require('../result');
const { ErrorCodes } = require('../error-codes');
const { PRIVATE_DIR_MODE } = require('../constants');

const DEFAULT_MAX_CONCURRENT_WORKTREES = 6;

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

class WorktreeManager {
  /**
   * @param {Object} [options]
   * @param {string} [options.repoRoot]
   * @param {string} [options.worktreeBaseDir]
   * @param {number} [options.maxConcurrentWorktrees=6]
   * @param {Function} [options.onEvent] - (eventType: string, payload: any) => void
   */
  constructor(options = {}) {
    this.repoRoot = options.repoRoot || process.cwd();
    this.worktreeBaseDir =
      options.worktreeBaseDir || path.join(os.homedir(), '.nomad', 'worktrees');
    this.maxConcurrentWorktrees =
      typeof options.maxConcurrentWorktrees === 'number' && options.maxConcurrentWorktrees > 0
        ? options.maxConcurrentWorktrees
        : DEFAULT_MAX_CONCURRENT_WORKTREES;
    this.onEvent = typeof options.onEvent === 'function' ? options.onEvent : null;
    /** @type {Map<string, WorktreeRecord>} */
    this.worktrees = new Map();
  }

  /**
   * @param {string} eventType
   * @param {any} payload
   */
  _emit(eventType, payload) {
    if (this.onEvent) {
      try {
        this.onEvent(eventType, payload);
      } catch {}
    }
  }

  /**
   * Sanitizes a taskId into a safe directory and git branch slug
   * @param {string} raw
   * @returns {string}
   */
  _sanitizeSlug(raw) {
    return String(raw || '')
      .trim()
      .replace(/[^a-zA-Z0-9._-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }

  /**
   * Counts currently active (unmerged, unremoved) worktrees
   * @returns {number}
   */
  getActiveCount() {
    let count = 0;
    for (const wt of this.worktrees.values()) {
      if (wt.status !== 'merged' && wt.status !== 'removed') {
        count += 1;
      }
    }
    return count;
  }

  /**
   * Creates an isolated Git worktree for a worker agent claiming a task
   * @param {Object} input
   * @param {string} input.taskId
   * @param {string} input.agentId
   * @param {string} [input.baseBranch='HEAD']
   * @param {string} [input.branchPrefix='task']
   * @returns {import('../result').UnitResult<WorktreeRecord>}
   */
  createWorktree(input) {
    if (!input || typeof input !== 'object') {
      return err(ErrorCodes.WORKTREE_INVALID_INPUT_001, 'Worktree input must be an object');
    }
    const taskId = String(input.taskId || '').trim();
    const agentId = String(input.agentId || '').trim();
    if (!taskId || !agentId) {
      return err(
        ErrorCodes.WORKTREE_INVALID_INPUT_001,
        'Both taskId and agentId are required to create a worktree',
      );
    }

    const existing = this.worktrees.get(taskId);
    if (existing && existing.status !== 'removed' && existing.status !== 'merged') {
      return ok({ ...existing });
    }

    if (this.getActiveCount() >= this.maxConcurrentWorktrees) {
      return err(
        ErrorCodes.WORKTREE_CONCURRENCY_EXCEEDED_002,
        `Active worktree limit (${this.maxConcurrentWorktrees}) reached. Merge or clean up existing worktrees first.`,
      );
    }

    const slug = this._sanitizeSlug(taskId);
    const branchPrefix = this._sanitizeSlug(input.branchPrefix || 'task') || 'task';
    const branchName = `${branchPrefix}/${slug}`;
    const baseBranch = String(input.baseBranch || 'HEAD').trim();
    const worktreePath = path.join(this.worktreeBaseDir, slug);

    try {
      if (!fs.existsSync(this.worktreeBaseDir)) {
        fs.mkdirSync(this.worktreeBaseDir, { recursive: true, mode: PRIVATE_DIR_MODE });
      }
      if (fs.existsSync(worktreePath)) {
        try {
          execFileSync('git', ['worktree', 'remove', '--force', worktreePath], {
            cwd: this.repoRoot,
            stdio: 'pipe',
          });
        } catch {
          fs.rmSync(worktreePath, { recursive: true, force: true });
        }
      }
      try {
        execFileSync('git', ['branch', '-D', branchName], {
          cwd: this.repoRoot,
          stdio: 'pipe',
        });
      } catch {}

      execFileSync('git', ['worktree', 'add', '-b', branchName, worktreePath, baseBranch], {
        cwd: this.repoRoot,
        stdio: 'pipe',
      });

      const now = new Date().toISOString();
      /** @type {WorktreeRecord} */
      const record = {
        taskId,
        agentId,
        branchName,
        baseBranch,
        worktreePath,
        status: 'active',
        verified: false,
        lastVerification: null,
        createdAt: now,
        updatedAt: now,
      };

      this.worktrees.set(taskId, record);
      this._emit('worktree:created', { ...record });
      return ok({ ...record });
    } catch (e) {
      return err(
        ErrorCodes.WORKTREE_GIT_COMMAND_FAILED_003,
        `Failed to create Git worktree for task '${taskId}': ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  /**
   * Retrieves a tracked worktree by taskId
   * @param {string} taskId
   * @returns {import('../result').UnitResult<WorktreeRecord>}
   */
  getWorktree(taskId) {
    const wt = this.worktrees.get(String(taskId || ''));
    if (!wt) {
      return err(ErrorCodes.WORKTREE_NOT_FOUND_006, `Worktree for task '${taskId}' not found`);
    }
    return ok({ ...wt });
  }

  /**
   * Lists all tracked worktree records
   * @returns {WorktreeRecord[]}
   */
  listWorktrees() {
    return Array.from(this.worktrees.values()).map((wt) => ({ ...wt }));
  }

  /**
   * Runs the Verify Gate inside the isolated worktree sandbox.
   * Accepts either a shell `testCommand` or a custom synchronous/check function `verifyFn`.
   * @param {Object} input
   * @param {string} input.taskId
   * @param {string} [input.testCommand]
   * @param {Function} [input.verifyFn] - (wt: WorktreeRecord) => { passed: boolean, summary?: string } | boolean
   * @returns {import('../result').UnitResult<WorktreeRecord>}
   */
  verifyWorktree(input) {
    if (!input || typeof input !== 'object' || !input.taskId) {
      return err(ErrorCodes.WORKTREE_INVALID_INPUT_001, 'taskId is required to verify worktree');
    }

    const wt = this.worktrees.get(String(input.taskId));
    if (!wt || wt.status === 'removed') {
      return err(
        ErrorCodes.WORKTREE_NOT_FOUND_006,
        `Active worktree for task '${input.taskId}' not found`,
      );
    }

    const now = new Date().toISOString();
    try {
      if (typeof input.verifyFn === 'function') {
        const res = input.verifyFn({ ...wt });
        const passed = typeof res === 'boolean' ? res : Boolean(res && res.passed);
        const output =
          typeof res === 'object' && res && res.summary
            ? String(res.summary)
            : passed
              ? 'Custom verifyFn passed'
              : 'Custom verifyFn failed';

        wt.verified = passed;
        wt.status = passed ? 'verified' : 'verification_failed';
        wt.lastVerification = { passed, command: 'verifyFn', output, verifiedAt: now };
        wt.updatedAt = now;

        this._emit(passed ? 'worktree:verified' : 'worktree:verification_failed', { ...wt });
        if (!passed) {
          return err(ErrorCodes.WORKTREE_VERIFY_GATE_BLOCKED_004, `Verification failed: ${output}`);
        }
        return ok({ ...wt });
      }

      const cmd = String(input.testCommand || 'npm test').trim();
      const stdout = execSync(cmd, {
        cwd: wt.worktreePath,
        encoding: 'utf8',
        stdio: 'pipe',
        timeout: 60000,
      });

      wt.verified = true;
      wt.status = 'verified';
      wt.lastVerification = {
        passed: true,
        command: cmd,
        output: String(stdout || '').slice(0, 2000),
        verifiedAt: now,
      };
      wt.updatedAt = now;
      this._emit('worktree:verified', { ...wt });
      return ok({ ...wt });
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);
      wt.verified = false;
      wt.status = 'verification_failed';
      wt.lastVerification = {
        passed: false,
        command: String(input.testCommand || 'verify'),
        output: errMsg.slice(0, 2000),
        verifiedAt: now,
      };
      wt.updatedAt = now;
      this._emit('worktree:verification_failed', { ...wt });
      return err(
        ErrorCodes.WORKTREE_VERIFY_GATE_BLOCKED_004,
        `Worktree test verification failed for task '${input.taskId}': ${errMsg}`,
      );
    }
  }

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
  mergeWorktree(input) {
    if (!input || typeof input !== 'object' || !input.taskId) {
      return err(ErrorCodes.WORKTREE_INVALID_INPUT_001, 'taskId is required to merge worktree');
    }

    const taskId = String(input.taskId);
    const wt = this.worktrees.get(taskId);
    if (!wt || wt.status === 'removed') {
      return err(
        ErrorCodes.WORKTREE_NOT_FOUND_006,
        `Active worktree for task '${taskId}' not found`,
      );
    }

    const requireVerification =
      input.requireVerification !== undefined ? Boolean(input.requireVerification) : true;

    if (requireVerification && !wt.verified) {
      return err(
        ErrorCodes.WORKTREE_VERIFY_GATE_BLOCKED_004,
        `Cannot merge unverified worktree '${taskId}': Verify Gate requires passing verification before merge`,
      );
    }

    const targetBranch = String(input.targetBranch || '').trim();
    const cleanupAfterMerge =
      input.cleanupAfterMerge !== undefined ? Boolean(input.cleanupAfterMerge) : true;

    try {
      if (targetBranch) {
        execFileSync('git', ['checkout', targetBranch], {
          cwd: this.repoRoot,
          stdio: 'pipe',
        });
      }

      execFileSync(
        'git',
        ['merge', '--no-ff', '-m', `feat(agensh): merge verified task ${taskId}`, wt.branchName],
        {
          cwd: this.repoRoot,
          stdio: 'pipe',
        },
      );

      wt.status = 'merged';
      wt.updatedAt = new Date().toISOString();
      this._emit('worktree:merged', { ...wt });

      let cleanedUp = false;
      if (cleanupAfterMerge) {
        const cleanRes = this.cleanupWorktree(taskId, { force: true });
        cleanedUp = cleanRes.success;
      }

      return ok({
        taskId,
        branchName: wt.branchName,
        targetBranch: targetBranch || 'HEAD',
        merged: true,
        cleanedUp,
      });
    } catch (e) {
      // Abort any partial merge to keep repoRoot clean
      try {
        execFileSync('git', ['merge', '--abort'], { cwd: this.repoRoot, stdio: 'pipe' });
      } catch {}

      wt.status = 'conflict';
      wt.updatedAt = new Date().toISOString();
      const errMsg = e instanceof Error ? e.message : String(e);
      this._emit('worktree:merge_conflict', {
        ...wt,
        error: errMsg,
      });

      return err(
        ErrorCodes.WORKTREE_MERGE_CONFLICT_005,
        `Merge conflict detected while merging '${wt.branchName}' for task '${taskId}': ${errMsg}`,
      );
    }
  }

  /**
   * Removes an isolated worktree directory and optionally deletes its temporary branch
   * @param {string} taskId
   * @param {Object} [options]
   * @param {boolean} [options.force=false]
   * @returns {import('../result').UnitResult<{ taskId: string, removed: boolean }>}
   */
  cleanupWorktree(taskId, options = {}) {
    const wt = this.worktrees.get(String(taskId || ''));
    if (!wt) {
      return err(ErrorCodes.WORKTREE_NOT_FOUND_006, `Worktree for task '${taskId}' not found`);
    }

    const force = Boolean(options.force);
    try {
      const args = ['worktree', 'remove'];
      if (force) args.push('--force');
      args.push(wt.worktreePath);

      if (fs.existsSync(wt.worktreePath)) {
        try {
          execFileSync('git', args, { cwd: this.repoRoot, stdio: 'pipe' });
        } catch {
          fs.rmSync(wt.worktreePath, { recursive: true, force: true });
          execFileSync('git', ['worktree', 'prune'], { cwd: this.repoRoot, stdio: 'pipe' });
        }
      }

      try {
        execFileSync('git', ['branch', force ? '-D' : '-d', wt.branchName], {
          cwd: this.repoRoot,
          stdio: 'pipe',
        });
      } catch {}

      wt.status = 'removed';
      wt.updatedAt = new Date().toISOString();
      this._emit('worktree:removed', { ...wt });
      return ok({ taskId: wt.taskId, removed: true });
    } catch (e) {
      return err(
        ErrorCodes.WORKTREE_GIT_COMMAND_FAILED_003,
        `Failed to cleanup worktree '${taskId}': ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }
}

module.exports = {
  DEFAULT_MAX_CONCURRENT_WORKTREES,
  WorktreeManager,
};
