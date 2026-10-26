/**
 * Nomad Shared Core - Agensh Swarm HTTP Routes (RFC-0002)
 * Shared handler mounted by both NomadDaemonServer and LocalSyncBridge so both
 * expose identical /api/agensh/* endpoints for decentralized worker coordination.
 * Governed by AGENTS.md Section 6 Result Pattern & Error Codes.
 */

const { ok, err } = require('../result');
const { ErrorCodes } = require('../error-codes');

/** @type {Record<string, number>} */
const STATUS_BY_CODE = {
  [ErrorCodes.ROSTER_AGENT_NOT_FOUND_001]: 404,
  [ErrorCodes.TASK_NOT_FOUND_001]: 404,
  [ErrorCodes.TASK_NO_MATCHING_TASK_013]: 404,
  [ErrorCodes.WORKTREE_NOT_FOUND_006]: 404,
  [ErrorCodes.P2P_CONTRACT_NOT_FOUND_004]: 404,
  [ErrorCodes.TASK_ALREADY_CLAIMED_003]: 409,
  [ErrorCodes.TASK_CLAIM_CONCURRENCY_LIMIT_012]: 409,
  [ErrorCodes.WORKTREE_CONCURRENCY_EXCEEDED_002]: 409,
  [ErrorCodes.WORKTREE_VERIFY_GATE_BLOCKED_004]: 409,
  [ErrorCodes.WORKTREE_MERGE_CONFLICT_005]: 409,
  [ErrorCodes.P2P_CONTRACT_CONFLICT_003]: 409,
};

/**
 * @typedef {Object} AgenshServices
 * @property {import('./dispatcher').TaskDispatcher} dispatcher
 * @property {import('./worktree-manager').WorktreeManager} worktreeManager
 * @property {import('./p2p-bus').P2PBus} p2pBus
 * @property {import('./shared-context-pool').SharedContextPool} sharedContext
 *
 * @typedef {Object} AgenshRequest
 * @property {string} method
 * @property {string} pathname
 * @property {URLSearchParams} searchParams
 * @property {() => Promise<any>} readBody
 * @property {AgenshServices} services
 *
 * @typedef {{ status: number, payload: any }} AgenshResponse
 */

/**
 * @param {any} result
 * @returns {AgenshResponse}
 */
function respond(result) {
  if (result && result.success) return { status: 200, payload: result };
  return { status: STATUS_BY_CODE[result?.errorCode] || 400, payload: result };
}

/**
 * @param {AgenshRequest} req
 * @returns {Promise<AgenshResponse | null>} null when the path is not an Agensh route
 */
async function handleAgenshRequest(req) {
  const { method, pathname, searchParams, readBody, services } = req;
  if (pathname !== '/api/agensh' && !pathname.startsWith('/api/agensh/')) {
    return null;
  }

  const { dispatcher, worktreeManager, p2pBus, sharedContext } = services;
  const parts = pathname.split('/').slice(3); // ['', 'api', 'agensh', ...rest]

  // GET /api/agensh/status
  if (parts.length === 1 && parts[0] === 'status' && method === 'GET') {
    const worktrees = worktreeManager ? worktreeManager.listWorktrees() : [];
    const contracts = p2pBus ? p2pBus.getContracts() : [];
    const recentMessages = p2pBus ? p2pBus.getMessages({ limit: 50 }) : [];
    const immunizations = sharedContext ? [...sharedContext.immunizations] : [];
    const findings = sharedContext ? [...sharedContext.findings] : [];

    return respond(
      ok({
        maxConcurrentWorktrees: worktreeManager ? worktreeManager.maxConcurrentWorktrees : 6,
        activeWorktreesCount: worktreeManager ? worktreeManager.getActiveCount() : 0,
        worktrees,
        contracts,
        immunizations,
        findings,
        recentMessages,
      }),
    );
  }

  // POST /api/agensh/claim
  if (parts.length === 1 && parts[0] === 'claim' && method === 'POST') {
    const body = (await readBody()) || {};
    return respond(dispatcher.claimNextTask(body));
  }

  // /api/agensh/worktrees/*
  if (parts[0] === 'worktrees') {
    if (parts.length === 1) {
      if (method === 'GET') return respond(ok(worktreeManager.listWorktrees()));
      if (method === 'POST') return respond(worktreeManager.createWorktree((await readBody()) || {}));
      return null;
    }
    if (parts[1] === 'verify' && method === 'POST') {
      return respond(worktreeManager.verifyWorktree((await readBody()) || {}));
    }
    if (parts[1] === 'merge' && method === 'POST') {
      return respond(worktreeManager.mergeWorktree((await readBody()) || {}));
    }
    if (parts[1] === 'cleanup' && method === 'POST') {
      const body = (await readBody()) || {};
      return respond(worktreeManager.cleanupWorktree(body.taskId, { force: Boolean(body.force) }));
    }
    if (parts.length === 2 && method === 'DELETE') {
      const taskId = decodeURIComponent(parts[1]);
      const force = searchParams.get('force') === 'true';
      return respond(worktreeManager.cleanupWorktree(taskId, { force }));
    }
    return null;
  }

  // /api/agensh/p2p/*
  if (parts[0] === 'p2p') {
    if (parts[1] === 'message' && method === 'POST') {
      return respond(p2pBus.sendDirectMessage((await readBody()) || {}));
    }
    if (parts[1] === 'messages' && method === 'GET') {
      const filter = {
        agentId: searchParams.get('agentId') || undefined,
        taskId: searchParams.get('taskId') || undefined,
        limit: Number(searchParams.get('limit') || 100),
      };
      return respond(ok(p2pBus.getMessages(filter)));
    }
    if (parts[1] === 'contracts') {
      if (parts.length === 2) {
        if (method === 'GET') return respond(ok(p2pBus.getContracts()));
        if (method === 'POST') return respond(p2pBus.lockInterfaceContract((await readBody()) || {}));
      }
      if (parts[2] === 'unlock' && method === 'POST') {
        return respond(p2pBus.unlockInterfaceContract((await readBody()) || {}));
      }
      if (parts[2] === 'validate' && method === 'POST') {
        return respond(p2pBus.validateAgainstContracts((await readBody()) || {}));
      }
    }
    return null;
  }

  // /api/agensh/context/*
  if (parts[0] === 'context') {
    if (parts[1] === 'findings' && method === 'POST') {
      return respond(sharedContext.publishFinding((await readBody()) || {}));
    }
    if (parts[1] === 'failures' && method === 'POST') {
      return respond(sharedContext.broadcastFailure((await readBody()) || {}));
    }
    if (parts[1] === 'gather') {
      if (method === 'GET') {
        const rawTags = searchParams.get('tags');
        const options = {
          agentId: searchParams.get('agentId') || undefined,
          taskId: searchParams.get('taskId') || undefined,
          domain: searchParams.get('domain') || undefined,
          tags: rawTags ? rawTags.split(',').map((t) => t.trim()) : undefined,
          maxTokenBudget: searchParams.get('maxTokenBudget')
            ? Number(searchParams.get('maxTokenBudget'))
            : undefined,
        };
        return respond(sharedContext.gatherContext(options));
      }
      if (method === 'POST') {
        return respond(sharedContext.gatherContext((await readBody()) || {}));
      }
    }
    return null;
  }

  return respond(err(ErrorCodes.BRIDGE_ROUTE_NOT_FOUND_001, `Unknown Agensh endpoint: ${pathname}`));
}

module.exports = {
  handleAgenshRequest,
};
