export type EvolverTargetPaths = {
    /**
     * - e.g. ~/.gemini/memory/experience-db/genes/evolver
     */
    experienceDbGenesDir: string;
    /**
     * - e.g. ~/.claude/rules/common/evolver-genes.md
     */
    claudeRulesFile: string;
    /**
     * - e.g. ~/.claude/hooks/evolver-guard-rules.json
     */
    claudeHooksFile: string;
    /**
     * - e.g. ~/Developer/claudecode_project/claude-config
     */
    claudeRepoDir?: string | undefined;
    /**
     * - e.g. ~/.gemini/memory/coding/dynamic_rules.md
     */
    geminiDynamicRulesFile: string;
};
export type GeneMutationType = "RULE" | "HOOK" | "SKILL_PATCH" | "HYBRID";
export type GeneStatus = "PENDING_APPROVAL" | "ACTIVE" | "REVERTED" | "ARCHIVED";
export type HarnessGene = {
    geneId: string;
    title: string;
    domain: string;
    sourceEngine: string;
    createdAt: string;
    triggerSymptom: string;
    mutationType: GeneMutationType;
    status: GeneStatus;
    ruleDirective: string;
    hookGuard: {
        targetTool: string;
        matchRegex: string;
        action: string;
    };
    verification: {
        evalScript: string;
        passRate: number;
        regressionPassed: number;
        regressionTotal: number;
        tokenDelta: number;
    };
    telemetry: {
        hitCount: number;
        savedErrors: number;
        distilledToWeights: boolean;
    };
    compiledTargets?: {
        experienceDbYaml: string;
        claudeConfigPatch: string;
        geminiConfigPatch: string;
    } | undefined;
};
export type SurgicalPatchItem = {
    patchId: string;
    filePath: string;
    changeType: "M" | "A" | "D";
    worktreeBranch: string;
    status: "PENDING" | "MERGED" | "REJECTED";
    summary: string;
    beforeCode: string;
    afterCode: string;
    diff: {
        lines: Array<{
            type: "equal" | "add" | "del";
            value: string;
            lineA?: number;
            lineB?: number;
        }>;
        stats: {
            added: number;
            deleted: number;
            unchanged: number;
            similarityRatio: number;
        };
    };
};
/**
 * @typedef {'RULE' | 'HOOK' | 'SKILL_PATCH' | 'HYBRID'} GeneMutationType
 */
/**
 * @typedef {'PENDING_APPROVAL' | 'ACTIVE' | 'REVERTED' | 'ARCHIVED'} GeneStatus
 */
/**
 * @typedef {Object} HarnessGene
 * @property {string} geneId
 * @property {string} title
 * @property {string} domain
 * @property {string} sourceEngine
 * @property {string} createdAt
 * @property {string} triggerSymptom
 * @property {GeneMutationType} mutationType
 * @property {GeneStatus} status
 * @property {string} ruleDirective
 * @property {{ targetTool: string, matchRegex: string, action: string }} hookGuard
 * @property {{ evalScript: string, passRate: number, regressionPassed: number, regressionTotal: number, tokenDelta: number }} verification
 * @property {{ hitCount: number, savedErrors: number, distilledToWeights: boolean }} telemetry
 * @property {{ experienceDbYaml: string, claudeConfigPatch: string, geminiConfigPatch: string }} [compiledTargets]
 */
/**
 * @typedef {Object} SurgicalPatchItem
 * @property {string} patchId
 * @property {string} filePath
 * @property {'M' | 'A' | 'D'} changeType
 * @property {string} worktreeBranch
 * @property {'PENDING' | 'MERGED' | 'REJECTED'} status
 * @property {string} summary
 * @property {string} beforeCode
 * @property {string} afterCode
 * @property {{ lines: Array<{ type: 'equal'|'add'|'del', value: string, lineA?: number, lineB?: number }>, stats: { added: number, deleted: number, unchanged: number, similarityRatio: number } }} diff
 */
export const DEFAULT_MAX_TOKEN_DELTA: 120;
export const EVOLVER_BLOCK_START: "<!-- BEGIN_NOMAD_EVOLVER_GENES -->";
export const EVOLVER_BLOCK_END: "<!-- END_NOMAD_EVOLVER_GENES -->";
/**
 * @typedef {Object} EvolverTargetPaths
 * @property {string} experienceDbGenesDir - e.g. ~/.gemini/memory/experience-db/genes/evolver
 * @property {string} claudeRulesFile - e.g. ~/.claude/rules/common/evolver-genes.md
 * @property {string} claudeHooksFile - e.g. ~/.claude/hooks/evolver-guard-rules.json
 * @property {string} [claudeRepoDir] - e.g. ~/Developer/claudecode_project/claude-config
 * @property {string} geminiDynamicRulesFile - e.g. ~/.gemini/memory/coding/dynamic_rules.md
 */
/**
 * Resolves the physical filesystem paths for the 3-Repo Self-Evolving Harness.
 * @param {Partial<EvolverTargetPaths>} [customPaths]
 * @param {string} [homeDir]
 * @returns {EvolverTargetPaths}
 */
export function resolveEvolverPaths(customPaths?: Partial<EvolverTargetPaths>, homeDir?: string): EvolverTargetPaths;
/**
 * Pure compiler that transforms a HarnessGene into the 3-repo target payloads.
 * @param {HarnessGene} gene
 * @returns {import('../result').UnitResult<{ experienceDbYaml: string, experienceDbJson: Record<string, any>, claudeConfigPatch: string, geminiConfigPatch: string }>}
 */
export function compileGeneToThreeRepos(gene: HarnessGene): import("../result").UnitResult<{
    experienceDbYaml: string;
    experienceDbJson: Record<string, any>;
    claudeConfigPatch: string;
    geminiConfigPatch: string;
}>;
/**
 * Synchronizes all genes to the 3 physical repositories on disk:
 * 1. antigravity-experience-db (`genes/evolver/<geneId>.yaml` + `.json`)
 * 2. claude-config (`~/.claude/rules/common/evolver-genes.md` + `~/.claude/hooks/evolver-guard-rules.json`)
 * 3. MacStudio-gemini-config (`~/.gemini/memory/coding/dynamic_rules.md`)
 *
 * @param {HarnessGene[]} genes
 * @param {Partial<EvolverTargetPaths>} [customPaths]
 * @returns {import('../result').UnitResult<{ writtenFiles: string[], activeCount: number, syncedAt: string, paths: EvolverTargetPaths }>}
 */
export function syncGenesToThreeRepos(genes: HarnessGene[], customPaths?: Partial<EvolverTargetPaths>): import("../result").UnitResult<{
    writtenFiles: string[];
    activeCount: number;
    syncedAt: string;
    paths: EvolverTargetPaths;
}>;
/**
 * Validates a candidate gene against the Shadow Sandbox regression & token budget gate.
 * @param {Partial<HarnessGene>} gene
 * @param {{ maxTokenDelta?: number }} [options]
 * @returns {import('../result').UnitResult<{ passed: boolean, tokenDelta: number, passRate: number }>}
 */
export function verifyGeneInShadowSandbox(gene: Partial<HarnessGene>, options?: {
    maxTokenDelta?: number;
}): import("../result").UnitResult<{
    passed: boolean;
    tokenDelta: number;
    passRate: number;
}>;
/**
 * Creates the initial seed genes derived from the user's real lessons_learned-ZH.md.
 * @returns {HarnessGene[]}
 */
export function createDefaultGenes(): HarnessGene[];
/**
 * Creates initial surgical patches in the Shadow Worktree for the IDE Workbench.
 * @returns {SurgicalPatchItem[]}
 */
export function createDefaultSurgicalPatches(): SurgicalPatchItem[];
export class EvolverWorkbench {
    /**
     * @param {Object} [options]
     * @param {HarnessGene[]} [options.initialGenes]
     * @param {SurgicalPatchItem[]} [options.initialPatches]
     * @param {number} [options.maxTokenDelta]
     * @param {boolean} [options.persistToDisk]
     * @param {Partial<EvolverTargetPaths>} [options.targetPaths]
     */
    constructor(options?: {
        initialGenes?: HarnessGene[] | undefined;
        initialPatches?: SurgicalPatchItem[] | undefined;
        maxTokenDelta?: number | undefined;
        persistToDisk?: boolean | undefined;
        targetPaths?: Partial<EvolverTargetPaths> | undefined;
    });
    maxTokenDelta: number;
    persistToDisk: boolean;
    targetPaths: EvolverTargetPaths;
    /** @type {HarnessGene[]} */
    genes: HarnessGene[];
    /** @type {SurgicalPatchItem[]} */
    patches: SurgicalPatchItem[];
    activeProject: string;
    worktreeBranch: string;
    syncHistory: {
        syncId: string;
        timestamp: string;
        repos: string[];
        geneId: string;
    }[];
    /**
     * Explicitly synchronizes current genes to all 3 target repositories on disk.
     */
    syncToThreeRepos(): import("../result").UnitResult<{
        writtenFiles: string[];
        activeCount: number;
        syncedAt: string;
        paths: EvolverTargetPaths;
    }, string>;
    /**
     * Returns a snapshot of the entire Evolver IDE Workbench & Evolution HUD state.
     */
    getWorkbenchState(): import("../result").UnitSuccess<{
        activeProject: string;
        worktreeBranch: string;
        autonomyMode: string;
        persistToDisk: boolean;
        targetPaths: EvolverTargetPaths;
        contextBudget: {
            usedTokens: number;
            budgetTokens: number;
            activeRuleTokens: number;
            ruleBudgetCap: number;
            savedByHeadroomPct: number;
        };
        projects: {
            id: string;
            name: string;
            path: string;
            branch: string;
            worktree: string;
        }[];
        fileTree: {
            path: string;
            status: string;
            folder: string;
        }[];
        surgicalPatches: SurgicalPatchItem[];
        pendingGenes: HarnessGene[];
        activeGenes: HarnessGene[];
        revertedGenes: HarnessGene[];
        syncHistory: {
            syncId: string;
            timestamp: string;
            repos: string[];
            geneId: string;
        }[];
        telemetrySummary: {
            totalActiveGenes: number;
            pendingApprovalCount: number;
            totalSavedErrors: number;
            distilledCount: number;
        };
    }>;
    /**
     * Synthesizes a new candidate gene from an Error -> Fix trajectory or user correction,
     * runs it through the Shadow Sandbox verifier, and places it in the Auto-Guarded queue.
     * @param {Object} input
     * @param {string} [input.geneId]
     * @param {string} [input.title]
     * @param {string} [input.domain]
     * @param {string} input.triggerSymptom
     * @param {string} input.ruleDirective
     * @param {GeneMutationType} [input.mutationType]
     * @param {string} [input.targetTool]
     * @param {string} [input.matchRegex]
     * @param {number} [input.passRate]
     */
    synthesizeCandidateGene(input: {
        geneId?: string | undefined;
        title?: string | undefined;
        domain?: string | undefined;
        triggerSymptom: string;
        ruleDirective: string;
        mutationType?: GeneMutationType | undefined;
        targetTool?: string | undefined;
        matchRegex?: string | undefined;
        passRate?: number | undefined;
    }): import("../result").UnitFailure<string> | import("../result").UnitSuccess<{
        gene: HarnessGene;
        sandboxVerification: {
            passed: boolean;
            tokenDelta: number;
            passRate: number;
        };
        filesystemSync: {
            writtenFiles: string[];
            activeCount: number;
            syncedAt: string;
            paths: EvolverTargetPaths;
        } | null;
    }>;
    /**
     * Auto-Guarded Approval Gate: approves a pending gene and compiles it to the 3 repositories.
     * @param {string} geneId
     */
    approveGene(geneId: string): import("../result").UnitFailure<string> | import("../result").UnitSuccess<{
        gene: HarnessGene;
        compiledTargets: {
            experienceDbYaml: string;
            experienceDbJson: Record<string, any>;
            claudeConfigPatch: string;
            geminiConfigPatch: string;
        };
        syncRecord: {
            syncId: string;
            timestamp: string;
            repos: string[];
            geneId: string;
            writtenFilesCount: number;
        };
        filesystemSync: {
            writtenFiles: string[];
            activeCount: number;
            syncedAt: string;
            paths: EvolverTargetPaths;
        } | null;
    }>;
    /**
     * 1-Click Rollback: reverts an active gene and restores previous Harness state across all 3 repos.
     * @param {string} geneId
     */
    revertGene(geneId: string): import("../result").UnitFailure<string> | import("../result").UnitSuccess<{
        gene: HarnessGene;
        revertedAt: string;
        filesystemSync: {
            writtenFiles: string[];
            activeCount: number;
            syncedAt: string;
            paths: EvolverTargetPaths;
        } | null;
    }>;
    /**
     * Applies or rejects a surgical diff patch from the Shadow Worktree.
     * @param {string} patchId
     * @param {'MERGE' | 'REJECT'} action
     */
    resolveSurgicalPatch(patchId: string, action?: "MERGE" | "REJECT"): import("../result").UnitFailure<"EVOLVER_PATCH_TARGET_INVALID_004"> | import("../result").UnitSuccess<{
        patch: SurgicalPatchItem;
        resolvedAt: string;
    }>;
}
