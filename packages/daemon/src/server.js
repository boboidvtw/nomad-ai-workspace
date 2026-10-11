/**
 * Nomad Core Daemon - HTTP Server, Handshake Protocol & Static Gateway
 */

const http = require('node:http');
const { URL } = require('node:url');
const {
  ok,
  err,
  ErrorCodes,
  DEFAULT_DAEMON_PORT,
  DEFAULT_DAEMON_HOST,
  PipelineManager,
  getSyncStatus,
  exportToDrive,
  importFromDrive,
  ArtifactExtractor,
  DiffEngine,
  LocalModelClient,
  McpGateway,
  KnowledgeBase,
  PluginRuntime,
  BotRoster,
  DEFAULT_ROSTER_PATH,
  handleBotRequest,
  TaskDispatcher,
  ApprovalGate,
  RecurringScheduler,
  TaskRunner,
  resolveAuthToken,
  isLoopbackModelTarget,
  applyCorsHeaders,
  authorizeRequest,
  injectDashboardAuth,
  probeAllServices,
} = require('@nomad/core');
const { serveDashboard } = require('./static-handler');

/**
 * A Nomad AI Studio bridge that registered itself with this daemon.
 * @typedef {Object} StudioRegistration
 * @property {number} bridgePort
 * @property {number|null} pid
 * @property {string} version
 * @property {string} registeredAt
 * @property {number} lastHeartbeat
 */

/** @typedef {import('http').IncomingMessage} IncomingMessage */
/** @typedef {import('http').ServerResponse} ServerResponse */

class NomadDaemonServer {
  /**
   * @param {Object} [options]
   * @param {number} [options.port] - Defaults to $NOMAD_PORT or 8765
   * @param {string} [options.host] - Defaults to $NOMAD_HOST or 127.0.0.1
   * @param {string} [options.authToken] - Shared gateway token (defaults to ~/.nomad/daemon-token)
   * @param {() => any} [options.getStatus] - Studio status fallback when no Studio is registered
   * @param {Function} [options.onDispatchPrompt]
   * @param {Function} [options.onSetLayout]
   * @param {Function} [options.onSetZoom]
   * @param {Function} [options.onToggleWindow]
   * @param {{ getStatus(): unknown } | null} [options.orchestrator]
   * @param {import('@nomad/core').BotRoster} [options.roster]
   * @param {string} [options.rosterPath] - roster.json to read (defaults to ~/.nomad/roster.json)
   * @param {Object | null} [options.sessionManager]
   * @param {import('@nomad/core').TaskDispatcher} [options.dispatcher]
   * @param {import('@nomad/core').RecurringScheduler} [options.scheduler]
   */
  constructor(options = {}) {
    this.port = Number(options.port || process.env.NOMAD_PORT || DEFAULT_DAEMON_PORT);
    this.host = options.host || process.env.NOMAD_HOST || DEFAULT_DAEMON_HOST;
    this.authToken = resolveAuthToken(options.authToken);

    this.getStatus = options.getStatus || (() => ({ status: 'ready' }));
    this.onDispatchPrompt = options.onDispatchPrompt || null;
    this.onSetLayout = options.onSetLayout || null;
    this.onSetZoom = options.onSetZoom || null;
    this.onToggleWindow = options.onToggleWindow || null;
    this.orchestrator = options.orchestrator || null;
    this.sessionManager = options.sessionManager || null;

    this.server = null;
    this.sseClients = new Set();
    /** @type {StudioRegistration | null} */
    this.activeStudio = null;
    this.pipelineManager = new PipelineManager({
      headroomEnabled: true,
      layaEnabled: true,
      autoEnhance: true,
      compressionLevel: 'balanced',
    });
    this.mcpGateway = new McpGateway();
    this.knowledgeBase = new KnowledgeBase();
    this.localModelClient = new LocalModelClient();
    this.pluginRuntime = new PluginRuntime();
    // The Studio owns roster.json; the daemon reads it but never writes it.
    this.roster = options.roster || new BotRoster();
    if (!options.roster) {
      this.roster.loadFromDisk(options.rosterPath || DEFAULT_ROSTER_PATH, { quarantine: false });
    }
    /** @type {import('@nomad/core').BotServices} */
    this.botServices = { roster: this.roster, router: null, rooms: null, scheduler: null };
    this.dispatcher =
      options.dispatcher ||
      new TaskDispatcher({
        roster: this.roster,
        onTaskEvent: (/** @type {string} */ eventType, /** @type {unknown} */ task) => {
          this.broadcast(eventType, task);
        },
      });
    // Restore persisted tasks from disk
    this.dispatcher.loadFromDisk();
    this.approvalGate = ApprovalGate;
    this.taskRunner = new TaskRunner(this.dispatcher, {
      localModelClient: this.localModelClient,
    });
    this.scheduler =
      options.scheduler ||
      new RecurringScheduler({
        dispatcher: this.dispatcher,
        taskRunner: this.taskRunner,
        onScheduleEvent: (/** @type {string} */ eventType, /** @type {unknown} */ data) => {
          this.broadcast(eventType, data);
        },
      });
    this.scheduler.loadFromDisk();
    this.botServices.scheduler = this.scheduler;
  }

  start() {
    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => this.handleRequest(req, res));

      this.server.on('error', (/** @type {NodeJS.ErrnoException} */ e) => {
        if (e.code === 'EADDRINUSE') {
          reject(
            err(
              ErrorCodes.DAEMON_SERVER_PORT_IN_USE_001,
              'Port ' + this.port + ' is already in use',
              { port: this.port },
            ),
          );
        } else {
          reject(err(ErrorCodes.DAEMON_SERVER_START_FAILED_002, e.message, e));
        }
      });

      this.scheduler.start();
      this.server.listen(this.port, this.host, () => {
        console.log('[Nomad Daemon] Gateway listening at http://' + this.host + ':' + this.port);
        console.log(
          '[Nomad Daemon] Dashboard available at http://' +
            this.host +
            ':' +
            this.port +
            '/dashboard',
        );
        resolve(ok({ port: this.port, host: this.host }));
      });
    });
  }

  stop() {
    if (this.scheduler) this.scheduler.stop();
    return new Promise((resolve) => {
      for (const client of this.sseClients) {
        try {
          client.end();
        } catch {}
      }
      this.sseClients.clear();

      if (this.server) {
        this.server.close(() => {
          this.server = null;
          this.activeStudio = null;
          resolve(ok({ stopped: true }));
        });
      } else {
        this.activeStudio = null;
        resolve(ok({ stopped: true }));
      }
    });
  }

  /**
   * Sends a Server-Sent Event to every connected client.
   * @param {string} event
   * @param {unknown} data
   */
  broadcast(event, data) {
    if (this.sseClients.size === 0) return;
    const payload = ['event: ' + event, 'data: ' + JSON.stringify(data), '', ''].join(
      String.fromCharCode(10),
    );
    for (const client of this.sseClients) {
      try {
        client.write(payload);
      } catch {
        this.sseClients.delete(client);
      }
    }
  }

  /**
   * @param {string | undefined} method
   * @param {string} pathname
   * @returns {boolean}
   */
  isPublicRoute(method, pathname) {
    if (method !== 'GET' && method !== 'HEAD') return false;
    return (
      pathname === '/' ||
      pathname === '/api/probe' ||
      pathname === '/dashboard' ||
      pathname === '/dashboard/' ||
      pathname === '/dashboard/index.html'
    );
  }

  /**
   * @param {ServerResponse} res
   * @param {number} statusCode
   * @param {unknown} payload
   */
  sendJson(res, statusCode, payload) {
    res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(payload));
  }

  /**
   * @param {IncomingMessage} req
   * @returns {Promise<any>} Parsed JSON body ({} when empty)
   */
  async readJsonBody(req) {
    return new Promise((resolve, reject) => {
      let body = '';
      req.on('data', (/** @type {Buffer} */ chunk) => {
        body += chunk;
        if (body.length > 5 * 1024 * 1024) {
          req.destroy();
          reject(err(ErrorCodes.BRIDGE_INVALID_BODY_002, 'Payload too large (max 5MB)'));
        }
      });
      req.on('end', () => {
        if (!body.trim()) return resolve({});
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          reject(
            err(
              ErrorCodes.BRIDGE_INVALID_BODY_002,
              'Invalid JSON body: ' + (e instanceof Error ? e.message : String(e)),
            ),
          );
        }
      });
      req.on('error', (e) => reject(err(ErrorCodes.BRIDGE_INVALID_BODY_002, e.message)));
    });
  }

  /**
   * @param {IncomingMessage} req
   * @param {ServerResponse} res
   * @param {number} targetPort
   */
  proxyToStudio(req, res, targetPort) {
    const options = {
      hostname: '127.0.0.1',
      port: targetPort,
      path: req.url,
      method: req.method,
      headers: {
        ...req.headers,
        host: '127.0.0.1:' + targetPort,
        'x-forwarded-by': 'nomad-daemon',
      },
    };

    const proxyReq = http.request(options, (proxyRes) => {
      res.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
      proxyRes.pipe(res);
    });

    proxyReq.on('error', (e) => {
      this.activeStudio = null;
      return this.sendJson(
        res,
        502,
        err(
          ErrorCodes.DAEMON_STUDIO_OFFLINE_001,
          'Failed to forward request to Nomad AI Studio on port ' + targetPort + ': ' + e.message,
        ),
      );
    });

    req.pipe(proxyReq);
  }

  /**
   * @returns {this is { activeStudio: StudioRegistration }}
   */
  isStudioAlive() {
    if (!this.activeStudio) return false;
    // Considered alive if heartbeat received within 30 seconds
    const diff = Date.now() - (this.activeStudio.lastHeartbeat || 0);
    return diff < 30000;
  }

  /**
   * @param {IncomingMessage} req
   * @param {ServerResponse} res
   */
  async handleRequest(req, res) {
    const url = new URL(req.url || '/', 'http://127.0.0.1:' + this.port);
    const pathname = url.pathname;
    const publicRoute = this.isPublicRoute(req.method, pathname);
    applyCorsHeaders(req, res, publicRoute);

    const auth = authorizeRequest(req, url, {
      token: this.authToken,
      boundHost: this.host,
      publicRoute,
    });
    if (!auth.allowed) {
      const code =
        auth.status === 401 ? ErrorCodes.BRIDGE_UNAUTHORIZED_005 : ErrorCodes.BRIDGE_FORBIDDEN_006;
      return this.sendJson(res, auth.status, err(code, auth.reason));
    }

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    try {
      // 1. Dashboard static routes
      if (
        pathname === '/dashboard' ||
        pathname === '/dashboard/' ||
        pathname === '/dashboard/index.html'
      ) {
        serveDashboard(req, res, (html) =>
          injectDashboardAuth(html, this.authToken, [this.port, DEFAULT_DAEMON_PORT]),
        );
        return;
      }

      if (pathname === '/') {
        res.writeHead(302, { Location: '/dashboard' });
        res.end();
        return;
      }

      // 2. SSE events
      if (pathname === '/api/events' && req.method === 'GET') {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        });
        const connectMsg = [
          'event: connected',
          'data: ' + JSON.stringify({ timestamp: new Date().toISOString() }),
          '',
          '',
        ].join(String.fromCharCode(10));
        res.write(connectMsg);
        this.sseClients.add(res);

        req.on('close', () => {
          this.sseClients.delete(res);
        });
        return;
      }

      // 3. Studio Handshake & Registration endpoints
      if (pathname === '/api/studio/register' && req.method === 'POST') {
        const body = await this.readJsonBody(req);
        if (!body.bridgePort || typeof body.bridgePort !== 'number') {
          return this.sendJson(
            res,
            400,
            err(ErrorCodes.STUDIO_REGISTRATION_FAILED_001, 'Missing or invalid bridgePort number'),
          );
        }
        this.activeStudio = {
          bridgePort: body.bridgePort,
          pid: body.pid || null,
          version: body.version || '1.4.0',
          registeredAt: new Date().toISOString(),
          lastHeartbeat: Date.now(),
        };
        console.log(
          '[Nomad Daemon] Studio registered on bridge port:',
          body.bridgePort,
          '(PID:',
          body.pid + ')',
        );
        return this.sendJson(
          res,
          200,
          ok({ status: 'registered', activeStudio: this.activeStudio }),
        );
      }

      if (pathname === '/api/studio/heartbeat' && req.method === 'POST') {
        if (this.activeStudio) {
          this.activeStudio.lastHeartbeat = Date.now();
        }
        return this.sendJson(res, 200, ok({ status: 'alive' }));
      }

      if (pathname === '/api/studio/unregister' && req.method === 'POST') {
        this.activeStudio = null;
        console.log('[Nomad Daemon] Studio unregistered cleanly.');
        return this.sendJson(res, 200, ok({ status: 'unregistered' }));
      }

      if (pathname === '/api/studio/status' && req.method === 'GET') {
        return this.sendJson(
          res,
          200,
          ok({
            online: this.isStudioAlive(),
            activeStudio: this.activeStudio,
          }),
        );
      }

      // 3.5. Pipeline (Headroom & Laya) & Drive Sync Endpoints
      if (pathname === '/api/pipeline/process' && req.method === 'POST') {
        const body = await this.readJsonBody(req);
        const resPipeline = this.pipelineManager.process(body);
        return this.sendJson(res, resPipeline.success ? 200 : 400, resPipeline);
      }

      if (pathname === '/api/pipeline/status' && req.method === 'GET') {
        return this.sendJson(res, 200, ok(this.pipelineManager.getStats()));
      }

      // Drive sync folder is auto-detected only, never taken from the request.
      if (pathname === '/api/sync/drive/status' && req.method === 'GET') {
        const resStatus = getSyncStatus();
        return this.sendJson(res, resStatus.success ? 200 : 400, resStatus);
      }

      if (pathname === '/api/sync/drive/push' && req.method === 'POST') {
        if (this.isStudioAlive()) {
          return this.proxyToStudio(req, res, this.activeStudio.bridgePort);
        }
        const body = await this.readJsonBody(req);
        const pushRes = exportToDrive({ workspaces: body.workspaces, settings: body.settings });
        return this.sendJson(res, pushRes.success ? 200 : 400, pushRes);
      }

      if (pathname === '/api/sync/drive/pull' && req.method === 'POST') {
        if (this.isStudioAlive()) {
          return this.proxyToStudio(req, res, this.activeStudio.bridgePort);
        }
        const body = await this.readJsonBody(req);
        const pullRes = importFromDrive({
          currentWorkspaces: body.currentWorkspaces,
          strategy: body.strategy,
        });
        return this.sendJson(res, pullRes.success ? 200 : 400, pullRes);
      }

      // 3.8. Roadmap P1/P2/P3 Endpoints (Artifacts, Diff, Local Model, MCP, RAG)
      if (pathname === '/api/artifacts/extract' && req.method === 'POST') {
        const body = await this.readJsonBody(req);
        const extractRes = ArtifactExtractor.extract(body.text || '');
        return this.sendJson(res, 200, extractRes);
      }

      if (pathname === '/api/artifacts/sandbox' && req.method === 'POST') {
        const body = await this.readJsonBody(req);
        const html = ArtifactExtractor.generateSandboxHtml(
          body.code || '',
          body.type || 'html',
          body.title || 'Sandbox',
        );
        return this.sendJson(res, 200, ok({ html }));
      }

      if (pathname === '/api/diff' && req.method === 'POST') {
        const body = await this.readJsonBody(req);
        const diffRes = DiffEngine.diffLines(body.textA || '', body.textB || '');
        return this.sendJson(res, diffRes.success ? 200 : 400, diffRes);
      }

      if (pathname === '/api/local-model/probe' && req.method === 'GET') {
        const port = Number(url.searchParams.get('port') || 1234);
        const host = url.searchParams.get('host') || '127.0.0.1';
        if (!isLoopbackModelTarget({ host })) {
          return this.sendJson(
            res,
            400,
            err(ErrorCodes.BRIDGE_INVALID_BODY_002, 'Local model host must be a loopback address'),
          );
        }
        const client = new LocalModelClient({ endpoint: 'http://' + host + ':' + port + '/v1' });
        const probeRes = await client.probe();
        if (probeRes.success) {
          return this.sendJson(res, 200, probeRes);
        } else {
          return this.sendJson(
            res,
            200,
            ok({ online: false, port, host, error: probeRes.message }),
          );
        }
      }

      if (pathname === '/api/local-model/chat' && req.method === 'POST') {
        const body = await this.readJsonBody(req);
        if (!isLoopbackModelTarget(body)) {
          return this.sendJson(
            res,
            400,
            err(ErrorCodes.BRIDGE_INVALID_BODY_002, 'Local model host must be a loopback address'),
          );
        }
        const client = new LocalModelClient({
          port: body.port || 1234,
          host: body.host || '127.0.0.1',
        });
        const chatRes = await client.chatCompletion(body);
        return this.sendJson(res, chatRes.success ? 200 : 502, chatRes);
      }

      if (pathname === '/api/mcp/tools' && req.method === 'GET') {
        const toolsRes = this.mcpGateway.listTools();
        return this.sendJson(res, 200, toolsRes);
      }

      if (pathname === '/api/mcp/call' && req.method === 'POST') {
        const body = await this.readJsonBody(req);
        if (!body.name) {
          return this.sendJson(
            res,
            400,
            err(ErrorCodes.MCP_TOOL_EXECUTION_FAILED_002, 'Missing tool name'),
          );
        }
        const callRes = await this.mcpGateway.callTool(body.name, body.args || {});
        return this.sendJson(res, callRes.success ? 200 : 400, callRes);
      }

      if (pathname === '/api/rag/ingest' && req.method === 'POST') {
        const body = await this.readJsonBody(req);
        const ingestRes = this.knowledgeBase.addDocument(body);
        return this.sendJson(res, ingestRes.success ? 200 : 400, ingestRes);
      }

      if (pathname === '/api/rag/retrieve' && (req.method === 'GET' || req.method === 'POST')) {
        let prompt = '';
        let topK = 3;
        if (req.method === 'GET') {
          prompt = url.searchParams.get('prompt') || url.searchParams.get('q') || '';
          topK = Number(url.searchParams.get('topK') || 3);
        } else {
          const body = await this.readJsonBody(req);
          prompt = body.prompt || body.q || '';
          topK = Number(body.topK || 3);
        }
        const retRes = this.knowledgeBase.retrieveContext(prompt, topK);
        return this.sendJson(res, 200, retRes);
      }

      // Bots (SPEC-AGENT-BOTS): /api/bots/*
      const botRes = await handleBotRequest({
        method: req.method || 'GET',
        pathname,
        searchParams: url.searchParams,
        readBody: () => this.readJsonBody(req),
        services: this.botServices,
      });
      if (botRes) return this.sendJson(res, botRes.status, botRes.payload);

      // 3.9. Task Control Plane & Agent Dispatcher Endpoints (Paperclip Native Integration)
      if (pathname === '/api/roster' && req.method === 'GET') {
        return this.sendJson(res, 200, ok(this.roster.listAgents()));
      }

      if (pathname === '/api/roster' && req.method === 'POST') {
        const body = await this.readJsonBody(req);
        const regRes = this.roster.registerAgent(body);
        return this.sendJson(res, regRes.success ? 200 : 400, regRes);
      }

      if (pathname === '/api/tasks' && req.method === 'GET') {
        const filter = {
          query: url.searchParams.get('query') || undefined,
          status: url.searchParams.get('status') || undefined,
          assignee: url.searchParams.get('assignee') || undefined,
          priority: url.searchParams.get('priority') || undefined,
          parentGoal: url.searchParams.get('parentGoal') || undefined,
        };
        return this.sendJson(res, 200, ok(this.dispatcher.listTasks(filter)));
      }

      if (pathname === '/api/tasks/graph' && req.method === 'GET') {
        return this.sendJson(res, 200, ok(this.dispatcher.getTaskGraph()));
      }

      if (pathname === '/api/tasks/schedule' && req.method === 'GET') {
        return this.sendJson(res, 200, ok(this.scheduler.listSchedules()));
      }

      if (pathname === '/api/tasks/schedule' && req.method === 'POST') {
        const body = await this.readJsonBody(req);
        const addRes = this.scheduler.addSchedule(body);
        return this.sendJson(res, addRes.success ? 200 : 400, addRes);
      }

      if (pathname === '/api/tasks/schedule/toggle' && req.method === 'POST') {
        const body = await this.readJsonBody(req);
        const toggleRes = this.scheduler.toggleSchedule(body.id, body.enabled);
        return this.sendJson(res, toggleRes.success ? 200 : 400, toggleRes);
      }

      if (pathname === '/api/tasks/schedule/trigger' && req.method === 'POST') {
        const body = await this.readJsonBody(req);
        const trigRes = await this.scheduler.triggerSchedule(body.id);
        return this.sendJson(res, trigRes.success ? 200 : 400, trigRes);
      }

      if (
        (pathname === '/api/tasks/schedule' && req.method === 'DELETE') ||
        (pathname === '/api/tasks/schedule/delete' && req.method === 'POST')
      ) {
        const body = req.method === 'POST' ? await this.readJsonBody(req) : {};
        const id = url.searchParams.get('id') || body.id;
        const remRes = this.scheduler.removeSchedule(id);
        return this.sendJson(res, remRes.success ? 200 : 400, remRes);
      }

      if (pathname === '/api/tasks' && req.method === 'POST') {
        const body = await this.readJsonBody(req);
        const taskRes = this.dispatcher.createTask(body);
        return this.sendJson(res, taskRes.success ? 200 : 400, taskRes);
      }

      if (
        (pathname === '/api/tasks/detail' || pathname.startsWith('/api/tasks/detail')) &&
        req.method === 'GET'
      ) {
        const id = url.searchParams.get('id');
        if (!id) {
          return this.sendJson(
            res,
            400,
            err(ErrorCodes.TASK_INVALID_PAYLOAD_002, 'Missing task id'),
          );
        }
        const taskRes = this.dispatcher.getTask(id);
        return this.sendJson(res, taskRes.success ? 200 : 404, taskRes);
      }

      if (pathname === '/api/tasks/claim' && req.method === 'POST') {
        const body = await this.readJsonBody(req);
        const claimRes = this.dispatcher.claimTask(body.taskId, body.agentId, body.leaseDurationMs);
        return this.sendJson(res, claimRes.success ? 200 : 400, claimRes);
      }

      if (pathname === '/api/tasks/heartbeat' && req.method === 'POST') {
        const body = await this.readJsonBody(req);
        const hbRes = this.dispatcher.renewHeartbeat(body.taskId, body.agentId, body.extendMs);
        return this.sendJson(res, hbRes.success ? 200 : 400, hbRes);
      }

      if (pathname === '/api/tasks/review' && req.method === 'POST') {
        const body = await this.readJsonBody(req);
        const revRes = this.approvalGate.submitForReview(
          this.dispatcher,
          body.taskId,
          body.agentId,
          body,
        );
        return this.sendJson(res, revRes.success ? 200 : 400, revRes);
      }

      if (pathname === '/api/tasks/approval' && req.method === 'POST') {
        const body = await this.readJsonBody(req);
        const appRes = this.approvalGate.decideApproval(this.dispatcher, body.taskId, body);
        return this.sendJson(res, appRes.success ? 200 : 400, appRes);
      }

      if (pathname === '/api/tasks/complete' && req.method === 'POST') {
        const body = await this.readJsonBody(req);
        const compRes = this.dispatcher.completeTask(body.taskId, body.agentId, body.summary);
        return this.sendJson(res, compRes.success ? 200 : 400, compRes);
      }

      if (pathname === '/api/tasks/run' && req.method === 'POST') {
        const body = await this.readJsonBody(req);
        const runRes = await this.taskRunner.dispatchAndRun(
          body.taskId,
          body.agentId,
          body.options || {},
        );
        return this.sendJson(res, runRes.success ? 200 : 400, runRes);
      }

      // 4. Status API
      if (pathname === '/api/status' && req.method === 'GET') {
        const probeResult = await probeAllServices();
        /** @type {Record<string, unknown>} */
        let studioInfo = { status: 'offline' };

        if (this.isStudioAlive()) {
          studioInfo = {
            status: 'online',
            pid: this.activeStudio.pid,
            bridgePort: this.activeStudio.bridgePort,
            version: this.activeStudio.version,
          };
        } else if (typeof this.getStatus === 'function') {
          const directStatus = await this.getStatus();
          if (directStatus && directStatus.status) {
            studioInfo = directStatus;
          }
        }

        const orchestratorStatus = this.orchestrator ? this.orchestrator.getStatus() : null;

        return this.sendJson(
          res,
          200,
          ok({
            daemon: {
              name: 'Nomad Core Daemon',
              version: '1.4.0',
              port: this.port,
              host: this.host,
              sseClients: this.sseClients.size,
              uptimeSeconds: Math.floor(process.uptime()),
            },
            studio: studioInfo,
            orchestrator: orchestratorStatus,
            microservices: probeResult.success ? probeResult.data : null,
          }),
        );
      }

      // 5. Microservices Probe API
      if (pathname === '/api/probe' && req.method === 'GET') {
        const timeoutMs = parseInt(url.searchParams.get('timeout') || '350', 10);
        const probeResult = await probeAllServices(undefined, timeoutMs);
        return this.sendJson(res, 200, probeResult);
      }

      // 6. Action Endpoints (Proxy to Active Studio if present)
      const isStudioAction =
        pathname === '/api/prompt' ||
        pathname === '/api/dispatch' ||
        pathname === '/api/layout' ||
        pathname === '/api/zoom' ||
        pathname === '/api/window' ||
        pathname === '/api/orchestrate' ||
        pathname.startsWith('/api/orchestrator') ||
        pathname.startsWith('/api/sessions') ||
        pathname.startsWith('/api/workspaces') ||
        pathname.startsWith('/api/export') ||
        pathname.startsWith('/api/import');

      if (isStudioAction) {
        if (this.isStudioAlive()) {
          return this.proxyToStudio(req, res, this.activeStudio.bridgePort);
        }

        // Fallback for standalone/mock handlers
        if (pathname === '/api/prompt' && typeof this.onDispatchPrompt === 'function') {
          const body = await this.readJsonBody(req);
          if (!body.prompt || typeof body.prompt !== 'string') {
            return this.sendJson(
              res,
              400,
              err(ErrorCodes.BRIDGE_INVALID_BODY_002, 'Missing or invalid prompt string'),
            );
          }
          const result = await this.onDispatchPrompt(body.prompt, body.targetPlatforms || null);
          return this.sendJson(res, 200, ok(result));
        }

        if (pathname === '/api/layout' && typeof this.onSetLayout === 'function') {
          const body = await this.readJsonBody(req);
          const result = await this.onSetLayout(body.mode, body.options || {});
          return this.sendJson(res, 200, ok(result));
        }

        if (pathname === '/api/zoom' && typeof this.onSetZoom === 'function') {
          const body = await this.readJsonBody(req);
          const result = await this.onSetZoom(body.platform, body.factor);
          return this.sendJson(res, 200, ok(result));
        }

        if (pathname === '/api/window' && typeof this.onToggleWindow === 'function') {
          const body = await this.readJsonBody(req);
          const result = await this.onToggleWindow(body.action || 'toggle');
          return this.sendJson(res, 200, ok(result));
        }

        return this.sendJson(
          res,
          503,
          err(
            ErrorCodes.DAEMON_STUDIO_OFFLINE_001,
            'Nomad AI Studio is not currently running. Launch Studio to execute desktop actions.',
          ),
        );
      }

      return this.sendJson(
        res,
        404,
        err(
          ErrorCodes.BRIDGE_ROUTE_NOT_FOUND_001,
          'Endpoint not found: ' + req.method + ' ' + pathname,
        ),
      );
    } catch (e) {
      return this.sendJson(
        res,
        500,
        err(
          ErrorCodes.BRIDGE_EXECUTION_FAILED_003,
          'Internal Gateway error: ' + (e instanceof Error ? e.message : String(e)),
        ),
      );
    }
  }
}

module.exports = {
  NomadDaemonServer,
};
