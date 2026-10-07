/**
 * Nomad AI Studio - Local Sync Bridge
 * High-performance, zero-dependency HTTP & SSE local RPC bridge.
 * Governed by AGENTS.md Atomic Contract & Result Pattern.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { serveDashboard } = require('@nomad/dashboard');
const {
  ok,
  err,
  ErrorCodes,
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
  AgentRoster,
  TaskDispatcher,
  ApprovalGate,
  RecurringScheduler,
  TaskRunner,
  DEFAULT_DAEMON_PORT,
  resolveAuthToken,
  isLoopbackModelTarget,
  applyCorsHeaders,
  authorizeRequest,
  injectDashboardAuth,
  probeAllServices
} = require('@nomad/core');

class LocalSyncBridge {
  /**
   * @param {Object} [options]
   * @param {number} [options.port=8765] - Port to listen on (127.0.0.1)
   * @param {string} [options.host='127.0.0.1'] - Bind address
   * @param {Function} [options.getStatus] - Callback returning app status
   * @param {(req: { prompt: string, targets: string[] }) => Promise<unknown>} [options.onDispatchPrompt] - Callback for prompt injection
   * @param {Function} [options.onSetLayout] - Callback for layout changes
   * @param {Function} [options.onSetZoom] - Callback for zoom adjustments
   * @param {Function} [options.onToggleWindow] - Callback for window summon/hide
   * @param {import('./orchestrator').MultiAiOrchestrator | null} [options.orchestrator]
   * @param {string} [options.authToken] - Shared gateway token (defaults to ~/.nomad/daemon-token)
   * @param {Function} [options.onInspectPlatform] - Debug hook: inspect a platform webview
   * @param {Function} [options.onEvalScript] - Debug hook: run a script in a platform webview
   * @param {import('./session-manager').SessionManager | null} [options.sessionManager] - SessionManager for workspace/session routes
   * @param {number} [options.daemonPort=8765] - Daemon port to register with when running on another port
   * @param {import('@nomad/core').AgentRoster} [options.roster]
   * @param {import('@nomad/core').TaskDispatcher} [options.dispatcher]
   * @param {import('@nomad/core').RecurringScheduler} [options.scheduler]
   */
  constructor(options = {}) {
    this.port = options.port || 8765;
    this.host = options.host || '127.0.0.1';
    this.authToken = resolveAuthToken(options.authToken);
    this.getStatus = options.getStatus || (() => ({ status: 'ready' }));
    this.onDispatchPrompt = options.onDispatchPrompt || (async () => ({ dispatched: true }));
    this.onSetLayout = options.onSetLayout || (() => ({}));
    this.onSetZoom = options.onSetZoom || (() => ({}));
    this.onToggleWindow = options.onToggleWindow || (() => ({}));
    this.orchestrator = options.orchestrator || null;
    this.onInspectPlatform = options.onInspectPlatform || null;
    this.onEvalScript = options.onEvalScript || null;
    this.sessionManager = options.sessionManager || null;

    this.server = null;
    this.sseClients = new Set();
    this.heartbeatTimer = null;
    this.daemonPort = options.daemonPort || 8765;
    this.pipelineManager = new PipelineManager({ headroomEnabled: true, layaEnabled: true, autoEnhance: true });
    this.mcpGateway = new McpGateway();
    this.knowledgeBase = new KnowledgeBase();
    this.localModelClient = new LocalModelClient();
    this.pluginRuntime = new PluginRuntime();
    this.roster = options.roster || new AgentRoster();
    this.dispatcher = options.dispatcher || new TaskDispatcher({
      roster: this.roster,
      onTaskEvent: (/** @type {string} */ eventType, /** @type {unknown} */ task) => {
        this.broadcast(eventType, task);
      }
    });
    // Restore persisted tasks from disk
    this.dispatcher.loadFromDisk();
    this.approvalGate = ApprovalGate;
    this.taskRunner = new TaskRunner(this.dispatcher, {
      localModelClient: this.localModelClient,
      orchestratorDelegate: options.onDispatchPrompt ? async (/** @type {string} */ platform, /** @type {string} */ prompt) => {
        return this.onDispatchPrompt({ prompt, targets: [platform] });
      } : undefined,
    });
    this.scheduler = options.scheduler || new RecurringScheduler({
      dispatcher: this.dispatcher,
      taskRunner: this.taskRunner,
      onScheduleEvent: (/** @type {string} */ eventType, /** @type {unknown} */ data) => {
        this.broadcast(eventType, data);
      }
    });
    this.scheduler.loadFromDisk();
  }

  registerWithDaemon(daemonPort = this.daemonPort) {
    if (this.port === daemonPort) return;
    try {
      const payload = JSON.stringify({
        bridgePort: this.port,
        pid: process.pid,
        version: '1.4.0'
      });
      const req = http.request({
        hostname: '127.0.0.1',
        port: daemonPort,
        path: '/api/studio/register',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
          'Authorization': 'Bearer ' + this.authToken
        },
        timeout: 1000
      }, (res) => {
        if (res.statusCode === 200) {
          console.log('[Nomad Bridge] Studio registered with Daemon at port ' + daemonPort);
          this.startHeartbeat(daemonPort);
        }
      });
      req.on('error', () => {});
      req.write(payload);
      req.end();
    } catch {}
  }

  startHeartbeat(daemonPort = this.daemonPort) {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = setInterval(() => {
      try {
        const req = http.request({
          hostname: '127.0.0.1',
          port: daemonPort,
          path: '/api/studio/heartbeat',
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + this.authToken },
          timeout: 1000
        }, () => {});
        req.on('error', () => {});
        req.end('{}');
      } catch {}
    }, 10000);
  }

  unregisterFromDaemon(daemonPort = this.daemonPort) {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.port === daemonPort) return;
    try {
      const req = http.request({
        hostname: '127.0.0.1',
        port: daemonPort,
        path: '/api/studio/unregister',
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + this.authToken },
        timeout: 1000
      }, () => {});
      req.on('error', () => {});
      req.end('{}');
    } catch {}
  }

  /**
   * @param {import('./orchestrator').MultiAiOrchestrator} orchestrator
   */
  setOrchestrator(orchestrator) {
    this.orchestrator = orchestrator;
  }

  start() {
    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => this.handleRequest(req, res));

      const server = this.server;
      server.on('error', (/** @type {NodeJS.ErrnoException} */ err) => {
        if (err.code === 'EADDRINUSE') {
          console.warn(`[Nomad Bridge] Port ${this.port} in use, retrying on ${this.port + 1}...`);
          this.port += 1;
          server.listen(this.port, this.host);
        } else {
          reject(err);
        }
      });

      this.server.listen(this.port, this.host, () => {
        const url = `http://${this.host}:${this.port}`;
        console.log(`[Nomad Bridge] Local Sync Bridge listening at ${url}`);
        if (this.port !== this.daemonPort) {
          this.registerWithDaemon(this.daemonPort);
        }
        resolve({ port: this.port, host: this.host, url });
      });
    });
  }

  stop() {
    if (this.scheduler) this.scheduler.stop();
    this.unregisterFromDaemon(this.daemonPort);
    return /** @type {Promise<void>} */ (new Promise((resolve) => {
      for (const client of this.sseClients) {
        try {
          client.end();
        } catch (e) {}
      }
      this.sseClients.clear();

      if (this.server) {
        this.server.close(() => {
          this.server = null;
          resolve();
        });
      } else {
        resolve();
      }
    }));
  }

  /**
   * Sends a Server-Sent Event to every connected client.
   * @param {string} event
   * @param {unknown} data
   */
  broadcast(event, data) {
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const client of this.sseClients) {
      try {
        client.write(payload);
      } catch (e) {
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
    return pathname === '/api/probe' ||
      pathname === '/dashboard' || pathname === '/dashboard/' || pathname === '/dashboard/index.html';
  }

  /**
   * Applies CORS + auth. Returns true when the request has been fully answered.
   * @param {import('http').IncomingMessage} req
   * @param {import('http').ServerResponse} res
   * @param {URL} parsedUrl
   * @returns {boolean}
   */
  handleCors(req, res, parsedUrl) {
    const publicRoute = this.isPublicRoute(req.method, parsedUrl.pathname);
    applyCorsHeaders(req, res, publicRoute);

    const auth = authorizeRequest(req, parsedUrl, {
      token: this.authToken,
      boundHost: this.host,
      publicRoute
    });
    if (!auth.allowed) {
      const code = auth.status === 401 ? ErrorCodes.BRIDGE_UNAUTHORIZED_005 : ErrorCodes.BRIDGE_FORBIDDEN_006;
      this.sendJson(res, auth.status, err(code, auth.reason));
      return true;
    }

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return true;
    }
    return false;
  }

  /**
   * @param {import('http').ServerResponse} res
   * @param {number} statusCode
   * @param {unknown} body
   */
  sendJson(res, statusCode, body) {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.writeHead(statusCode);
    res.end(JSON.stringify(body));
  }

  /**
   * @param {import('http').IncomingMessage} req
   * @returns {Promise<any>} Parsed JSON body ({} when empty)
   */
  readJsonBody(req) {
    return new Promise((resolve, reject) => {
      let data = '';
      req.on('data', (/** @type {Buffer} */ chunk) => {
        data += chunk;
        if (data.length > 2 * 1024 * 1024) { // 2MB limit
          reject(new Error('PAYLOAD_TOO_LARGE'));
        }
      });
      req.on('end', () => {
        if (!data.trim()) {
          resolve({});
          return;
        }
        try {
          resolve(JSON.parse(data));
        } catch (err) {
          reject(err);
        }
      });
      req.on('error', reject);
    });
  }

  /**
   * @param {import('http').IncomingMessage} req
   * @param {import('http').ServerResponse} res
   */
  async handleRequest(req, res) {
    const parsedUrl = new URL(req.url || '/', `http://127.0.0.1:${this.port}`);
    if (this.handleCors(req, res, parsedUrl)) return;
    const pathname = parsedUrl.pathname;

    try {
      // 0. Dashboard static hosting
      if (pathname === '/dashboard' || pathname === '/dashboard/' || pathname === '/dashboard/index.html') {
        serveDashboard(req, res, (html) => injectDashboardAuth(html, this.authToken, [this.port, DEFAULT_DAEMON_PORT]));
        return;
      }

      // 0.1 Microservice health probe
      if (pathname === '/api/probe' && req.method === 'GET') {
        const timeoutMs = parseInt(parsedUrl.searchParams.get('timeout') || '350', 10);
        const probeRes = await probeAllServices(undefined, timeoutMs);
        return this.sendJson(res, 200, probeRes);
      }

      // 1. Health & Status
      if ((pathname === '/' || pathname === '/health' || pathname === '/api/status') && req.method === 'GET') {
        const appState = await Promise.resolve(this.getStatus());
        const orchStatus = this.orchestrator ? this.orchestrator.getStatus() : null;
        return this.sendJson(res, 200, {
          success: true,
          data: {
            app: 'Nomad AI Studio',
            version: '1.4.0',
            bridgePort: this.port,
            timestamp: new Date().toISOString(),
            orchestrator: orchStatus,
            ...appState,
          },
        });
      }

      // 2. Server-Sent Events stream for reactive updates
      if (pathname === '/api/events' && req.method === 'GET') {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        });
        res.write(`event: connected\ndata: ${JSON.stringify({ type: 'connected', time: Date.now() })}\n\n`);
        this.sseClients.add(res);

        req.on('close', () => {
          this.sseClients.delete(res);
        });
        return;
      }

      // 3. Prompt Dispatcher
      if (pathname === '/api/prompt' && req.method === 'POST') {
        const body = await this.readJsonBody(req);
        if (!body.prompt || typeof body.prompt !== 'string' || !body.prompt.trim()) {
          return this.sendJson(res, 400, {
            success: false,
            errorCode: 'BRIDGE_DISPATCH_EMPTY_PROMPT_001',
            message: 'Field "prompt" must be a non-empty string.',
          });
        }

        const targets = Array.isArray(body.targets) && body.targets.length > 0
          ? body.targets
          : ['claude', 'chatgpt', 'gemini', 'grok'];

        const dispatchResult = await Promise.resolve(
          this.onDispatchPrompt({ prompt: body.prompt.trim(), targets })
        );

        this.broadcast('prompt-dispatched', {
          targets,
          promptSnippet: body.prompt.slice(0, 40),
          timestamp: new Date().toISOString(),
        });

        return this.sendJson(res, 200, {
          success: true,
          data: {
            dispatched: true,
            targets,
            result: dispatchResult,
            timestamp: new Date().toISOString(),
          },
        });
      }

      // 4. Layout Remote Control
      if (pathname === '/api/layout' && req.method === 'POST') {
        const body = await this.readJsonBody(req);
        const result = await Promise.resolve(this.onSetLayout(body));
        this.broadcast('layout-changed', result);
        return this.sendJson(res, 200, { success: true, data: result });
      }

      // 5. Zoom Remote Control
      if (pathname === '/api/zoom' && req.method === 'POST') {
        const body = await this.readJsonBody(req);
        const result = await Promise.resolve(this.onSetZoom(body));
        this.broadcast('zoom-changed', result);
        return this.sendJson(res, 200, { success: true, data: result });
      }

      // 6. Window Visibility & Summon
      if (pathname === '/api/window' && req.method === 'POST') {
        const body = await this.readJsonBody(req);
        const action = body.action || 'toggle';
        const result = await Promise.resolve(this.onToggleWindow(action));
        this.broadcast('window-state', result);
        return this.sendJson(res, 200, { success: true, data: result });
      }

      // 7. Multi-AI Orchestration Endpoints
      if (pathname === '/api/orchestration/status' && req.method === 'GET') {
        if (!this.orchestrator) {
          return this.sendJson(res, 503, {
            success: false,
            errorCode: 'ORCHESTRATOR_UNAVAILABLE_503',
            message: 'Multi-AI Orchestrator is not initialized.',
          });
        }
        return this.sendJson(res, 200, {
          success: true,
          data: this.orchestrator.getStatus(),
        });
      }

      if (pathname === '/api/orchestration/start' && req.method === 'POST') {
        if (!this.orchestrator) {
          return this.sendJson(res, 503, {
            success: false,
            errorCode: 'ORCHESTRATOR_UNAVAILABLE_503',
            message: 'Multi-AI Orchestrator is not initialized.',
          });
        }
        const body = await this.readJsonBody(req);
        const startRes = await this.orchestrator.start(body);
        return this.sendJson(res, startRes.success ? 200 : 400, startRes);
      }

      if (pathname === '/api/orchestration/pause' && req.method === 'POST') {
        if (!this.orchestrator) {
          return this.sendJson(res, 503, { success: false, errorCode: 'ORCHESTRATOR_UNAVAILABLE_503' });
        }
        const resData = this.orchestrator.pause();
        return this.sendJson(res, 200, resData);
      }

      if (pathname === '/api/orchestration/resume' && req.method === 'POST') {
        if (!this.orchestrator) {
          return this.sendJson(res, 503, { success: false, errorCode: 'ORCHESTRATOR_UNAVAILABLE_503' });
        }
        const resData = this.orchestrator.resume();
        return this.sendJson(res, 200, resData);
      }

      if (pathname === '/api/orchestration/stop' && req.method === 'POST') {
        if (!this.orchestrator) {
          return this.sendJson(res, 503, { success: false, errorCode: 'ORCHESTRATOR_UNAVAILABLE_503' });
        }
        const resData = this.orchestrator.stop();
        return this.sendJson(res, 200, resData);
      }

            // 8. Diagnostics & Debug Endpoints
      if (pathname === '/api/debug/inspect-platform' && req.method === 'POST') {
        const body = await this.readJsonBody(req);
        if (!this.onInspectPlatform) {
          return this.sendJson(res, 501, { success: false, message: 'onInspectPlatform not implemented' });
        }
        const result = await Promise.resolve(this.onInspectPlatform(body.platform));
        return this.sendJson(res, 200, { success: true, data: result });
      }

      if (pathname === '/api/debug/eval' && req.method === 'POST') {
        const body = await this.readJsonBody(req);
        if (!this.onEvalScript) {
          return this.sendJson(res, 501, { success: false, message: 'onEvalScript not implemented' });
        }
        const result = await Promise.resolve(this.onEvalScript(body.platform, body.script));
        return this.sendJson(res, 200, { success: true, data: result });
      }

            // 9. Workspace & Session Management Endpoints
      if (pathname === "/api/workspaces/search") {
        if (!this.sessionManager) {
          return this.sendJson(res, 501, { success: false, errorCode: "BRIDGE_SESSION_MANAGER_NOT_CONFIGURED_001", message: "SessionManager not configured" });
        }
        let query = "";
        let type = "all";
        let mode = "all";
        let limit = 50;

        if (req.method === "GET") {
          const parsedUrl = new URL(req.url || '/', "http://127.0.0.1");
          query = parsedUrl.searchParams.get("q") || parsedUrl.searchParams.get("query") || "";
          type = parsedUrl.searchParams.get("type") || "all";
          mode = parsedUrl.searchParams.get("mode") || "all";
          if (parsedUrl.searchParams.get("limit")) {
            limit = parseInt(parsedUrl.searchParams.get("limit") || "", 10) || 50;
          }
        } else if (req.method === "POST") {
          const body = await this.readJsonBody(req);
          query = body.query || body.q || "";
          type = body.type || "all";
          mode = body.mode || "all";
          if (body.limit) limit = Number(body.limit) || 50;
        } else {
          return this.sendJson(res, 405, { success: false, errorCode: "METHOD_NOT_ALLOWED_001", message: "Method not allowed" });
        }

        const result = this.sessionManager.searchWorkspaces({ query, type, mode, limit });
        return this.sendJson(res, 200, result);
      }

      if (pathname === "/api/workspaces" && req.method === "GET") {
        const list = this.sessionManager ? this.sessionManager.getWorkspaces() : [];
        const activeId = this.sessionManager ? this.sessionManager.getActiveWorkspaceId() : null;
        return this.sendJson(res, 200, { success: true, data: { workspaces: list, activeId } });
      }

      if (pathname === "/api/workspaces/create" && req.method === "POST") {
        const body = await this.readJsonBody(req);
        if (!this.sessionManager) {
          return this.sendJson(res, 501, { success: false, message: "SessionManager not configured" });
        }
        const ws = this.sessionManager.createWorkspace(body);
        return this.sendJson(res, 200, { success: true, data: ws });
      }

      if (pathname === "/api/workspaces/switch" && req.method === "POST") {
        const body = await this.readJsonBody(req);
        if (!this.sessionManager) {
          return this.sendJson(res, 501, { success: false, message: "SessionManager not configured" });
        }
        const result = await this.sessionManager.switchWorkspace(body.id);
        return this.sendJson(res, result.success ? 200 : 404, result);
      }

      if (pathname === "/api/workspaces/rename" && req.method === "POST") {
        const body = await this.readJsonBody(req);
        if (!this.sessionManager) {
          return this.sendJson(res, 501, { success: false, message: "SessionManager not configured" });
        }
        const updated = this.sessionManager.updateWorkspace(body.id, { title: body.title });
        return this.sendJson(res, updated ? 200 : 404, { success: Boolean(updated), data: updated });
      }

      if (pathname === "/api/workspaces/delete" && req.method === "POST") {
        const body = await this.readJsonBody(req);
        if (!this.sessionManager) {
          return this.sendJson(res, 501, { success: false, message: "SessionManager not configured" });
        }
        const result = this.sessionManager.deleteWorkspace(body.id);
        return this.sendJson(res, 200, result);
      }


      if (pathname === "/api/workspaces/export" && req.method === "GET") {
        if (!this.sessionManager) {
          return this.sendJson(res, 501, { success: false, message: "SessionManager not configured" });
        }
        const parsedUrl = new URL(req.url || '/', "http://127.0.0.1");
        const id = parsedUrl.searchParams.get("id");
        if (id) {
          const json = this.sessionManager.exportWorkspaceAsJson(id);
          if (!json) return this.sendJson(res, 404, { success: false, message: "Workspace not found" });
          return this.sendJson(res, 200, { success: true, data: JSON.parse(json) });
        }
        const allJson = this.sessionManager.exportAllWorkspacesAsJson();
        return this.sendJson(res, 200, { success: true, data: JSON.parse(allJson) });
      }

      if (pathname === "/api/workspaces/import" && req.method === "POST") {
        const body = await this.readJsonBody(req);
        if (!this.sessionManager) {
          return this.sendJson(res, 501, { success: false, message: "SessionManager not configured" });
        }
        const result = this.sessionManager.importWorkspacesFromJson(body.data || body);
        return this.sendJson(res, result.success ? 200 : 400, result);
      }

      if (pathname === "/api/orchestration/export-markdown" && (req.method === "GET" || req.method === "POST")) {
        let history = [];
        let title = "協作任務對話報告";
        let mode = "relay";
        let sequence = ["claude", "chatgpt"];

        if (req.method === "POST") {
          const body = await this.readJsonBody(req);
          history = body.history || [];
          title = body.title || title;
          mode = body.mode || mode;
          sequence = body.sequence || sequence;
        } else if (this.orchestrator) {
          const status = this.orchestrator.getStatus();
          history = this.orchestrator.history || [];
          title = status.canonicalTitle || title;
          mode = status.mode || mode;
          sequence = status.sequence || sequence;
        }

        const mgr = this.sessionManager || new (require("./session-manager").SessionManager)();
        const markdown = mgr.exportOrchestrationHistoryAsMarkdown({ title, mode, sequence, history });
        return this.sendJson(res, 200, { success: true, data: { markdown, title } });
      }

      if (pathname === "/api/export-to-file" && req.method === "POST") {
        const body = await this.readJsonBody(req);
        const { type, content, filename } = body;
        const os = require("os");
        const pathMod = require("path");
        const exportDir = pathMod.join(os.homedir(), "Desktop", "Nomad_AI_Exports");
        if (!fs.existsSync(exportDir)) {
          fs.mkdirSync(exportDir, { recursive: true });
        }
        const safeName = (filename || ("nomad_export_" + Date.now())).replace(/[\\/:*?"<>|]/g, "_");
        const ext = type === "markdown" ? ".md" : ".json";
        const filePath = pathMod.join(exportDir, safeName + ext);
        fs.writeFileSync(filePath, typeof content === "string" ? content : JSON.stringify(content, null, 2), "utf8");
        return this.sendJson(res, 200, { success: true, filePath, exportDir });
      }

      // Task Control Plane & Agent Dispatcher Endpoints (Paperclip Native Integration)
      if (pathname === "/api/roster" && req.method === "GET") {
        return this.sendJson(res, 200, ok(this.roster.listAgents()));
      }

      if (pathname === "/api/roster" && req.method === "POST") {
        const body = await this.readJsonBody(req);
        const regRes = this.roster.registerAgent(body);
        return this.sendJson(res, regRes.success ? 200 : 400, regRes);
      }

      if (pathname === "/api/tasks" && req.method === "GET") {
        const filter = {
          query: parsedUrl.searchParams.get("query") || undefined,
          status: parsedUrl.searchParams.get("status") || undefined,
          assignee: parsedUrl.searchParams.get("assignee") || undefined,
          priority: parsedUrl.searchParams.get("priority") || undefined,
          parentGoal: parsedUrl.searchParams.get("parentGoal") || undefined,
        };
        return this.sendJson(res, 200, ok(this.dispatcher.listTasks(filter)));
      }

      if (pathname === "/api/tasks/graph" && req.method === "GET") {
        return this.sendJson(res, 200, ok(this.dispatcher.getTaskGraph()));
      }

      if (pathname === "/api/tasks/schedule" && req.method === "GET") {
        return this.sendJson(res, 200, ok(this.scheduler.listSchedules()));
      }

      if (pathname === "/api/tasks/schedule" && req.method === "POST") {
        const body = await this.readJsonBody(req);
        const addRes = this.scheduler.addSchedule(body);
        return this.sendJson(res, addRes.success ? 200 : 400, addRes);
      }

      if (pathname === "/api/tasks/schedule/toggle" && req.method === "POST") {
        const body = await this.readJsonBody(req);
        const toggleRes = this.scheduler.toggleSchedule(body.id, body.enabled);
        return this.sendJson(res, toggleRes.success ? 200 : 400, toggleRes);
      }

      if (pathname === "/api/tasks/schedule/trigger" && req.method === "POST") {
        const body = await this.readJsonBody(req);
        const trigRes = await this.scheduler.triggerSchedule(body.id);
        return this.sendJson(res, trigRes.success ? 200 : 400, trigRes);
      }

      if ((pathname === "/api/tasks/schedule" && req.method === "DELETE") ||
          (pathname === "/api/tasks/schedule/delete" && req.method === "POST")) {
        const body = req.method === "POST" ? await this.readJsonBody(req) : {};
        const id = parsedUrl.searchParams.get("id") || body.id;
        const remRes = this.scheduler.removeSchedule(id);
        return this.sendJson(res, remRes.success ? 200 : 400, remRes);
      }

      if (pathname === "/api/tasks" && req.method === "POST") {
        const body = await this.readJsonBody(req);
        const taskRes = this.dispatcher.createTask(body);
        return this.sendJson(res, taskRes.success ? 200 : 400, taskRes);
      }

      if ((pathname === "/api/tasks/detail" || pathname.startsWith("/api/tasks/detail")) && req.method === "GET") {
        const id = parsedUrl.searchParams.get("id");
        if (!id) {
          return this.sendJson(res, 400, err(ErrorCodes.TASK_INVALID_PAYLOAD_002, "Missing task id"));
        }
        const taskRes = this.dispatcher.getTask(id);
        return this.sendJson(res, taskRes.success ? 200 : 404, taskRes);
      }

      if (pathname === "/api/tasks/claim" && req.method === "POST") {
        const body = await this.readJsonBody(req);
        const claimRes = this.dispatcher.claimTask(body.taskId, body.agentId, body.leaseDurationMs);
        return this.sendJson(res, claimRes.success ? 200 : 400, claimRes);
      }

      if (pathname === "/api/tasks/heartbeat" && req.method === "POST") {
        const body = await this.readJsonBody(req);
        const hbRes = this.dispatcher.renewHeartbeat(body.taskId, body.agentId, body.extendMs);
        return this.sendJson(res, hbRes.success ? 200 : 400, hbRes);
      }

      if (pathname === "/api/tasks/review" && req.method === "POST") {
        const body = await this.readJsonBody(req);
        const revRes = this.approvalGate.submitForReview(this.dispatcher, body.taskId, body.agentId, body);
        return this.sendJson(res, revRes.success ? 200 : 400, revRes);
      }

      if (pathname === "/api/tasks/approval" && req.method === "POST") {
        const body = await this.readJsonBody(req);
        const appRes = this.approvalGate.decideApproval(this.dispatcher, body.taskId, body);
        return this.sendJson(res, appRes.success ? 200 : 400, appRes);
      }

      if (pathname === "/api/tasks/complete" && req.method === "POST") {
        const body = await this.readJsonBody(req);
        const compRes = this.dispatcher.completeTask(body.taskId, body.agentId, body.summary);
        return this.sendJson(res, compRes.success ? 200 : 400, compRes);
      }

      if (pathname === "/api/tasks/run" && req.method === "POST") {
        const body = await this.readJsonBody(req);
        const runRes = await this.taskRunner.dispatchAndRun(body.taskId, body.agentId, body.options || {});
        return this.sendJson(res, runRes.success ? 200 : 400, runRes);
      }

                  // Roadmap P1/P2/P3 Endpoints (Artifacts, Diff, LocalModel, MCP, RAG)
      if (pathname === '/api/artifacts/extract' && req.method === 'POST') {
        const body = await this.readJsonBody(req);
        const extractRes = ArtifactExtractor.extract(body.text || '');
        return this.sendJson(res, 200, extractRes);
      }

      if (pathname === '/api/artifacts/sandbox' && req.method === 'POST') {
        const body = await this.readJsonBody(req);
        const html = ArtifactExtractor.generateSandboxHtml(body.code || '', body.type || 'html', body.title || 'Sandbox');
        return this.sendJson(res, 200, ok({ html }));
      }

      if (pathname === '/api/diff' && req.method === 'POST') {
        const body = await this.readJsonBody(req);
        const diffRes = DiffEngine.diffLines(body.textA || '', body.textB || '');
        return this.sendJson(res, diffRes.success ? 200 : 400, diffRes);
      }

      if (pathname === '/api/local-model/probe' && req.method === 'GET') {
        const parsedUrl = new URL(req.url || '/', 'http://127.0.0.1');
        const port = Number(parsedUrl.searchParams.get('port') || 1234);
        const host = parsedUrl.searchParams.get('host') || '127.0.0.1';
        if (!isLoopbackModelTarget({ host })) {
          return this.sendJson(res, 400, err(ErrorCodes.BRIDGE_INVALID_BODY_002, 'Local model host must be a loopback address'));
        }
        const client = new LocalModelClient({ endpoint: 'http://' + host + ':' + port + '/v1' });
        const probeRes = await client.probe();
        if (probeRes.success) {
          return this.sendJson(res, 200, probeRes);
        } else {
          return this.sendJson(res, 200, ok({ online: false, port, host, error: probeRes.message }));
        }
      }

      if (pathname === '/api/local-model/chat' && req.method === 'POST') {
        const body = await this.readJsonBody(req);
        if (!isLoopbackModelTarget(body)) {
          return this.sendJson(res, 400, err(ErrorCodes.BRIDGE_INVALID_BODY_002, 'Local model host must be a loopback address'));
        }
        const client = new LocalModelClient({ port: body.port || 1234, host: body.host || '127.0.0.1' });
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
          return this.sendJson(res, 400, err(ErrorCodes.MCP_TOOL_EXECUTION_FAILED_002, 'Missing tool name'));
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
          const parsedUrl = new URL(req.url || '/', 'http://127.0.0.1');
          prompt = parsedUrl.searchParams.get('prompt') || parsedUrl.searchParams.get('q') || '';
          topK = Number(parsedUrl.searchParams.get('topK') || 3);
        } else {
          const body = await this.readJsonBody(req);
          prompt = body.prompt || body.q || '';
          topK = Number(body.topK || 3);
        }
        const retRes = this.knowledgeBase.retrieveContext(prompt, topK);
        return this.sendJson(res, 200, retRes);
      }

      // Pipeline & Drive Sync Endpoints
      if (pathname === '/api/pipeline/process' && req.method === 'POST') {
        const body = await this.readJsonBody(req);
        const resPipeline = this.pipelineManager.process(body);
        return this.sendJson(res, resPipeline.success ? 200 : 400, resPipeline);
      }

      if (pathname === '/api/pipeline/status' && req.method === 'GET') {
        return this.sendJson(res, 200, ok(this.pipelineManager.getStats()));
      }

      if (pathname === '/api/sync/drive/status' && req.method === 'GET') {
        const dir = parsedUrl.searchParams.get('dir');
        const resStatus = getSyncStatus(dir ? { targetDir: dir } : {});
        return this.sendJson(res, resStatus.success ? 200 : 400, resStatus);
      }

      if (pathname === '/api/sync/drive/push' && req.method === 'POST') {
        const body = await this.readJsonBody(req);
        const workspaces = this.sessionManager ? this.sessionManager.getWorkspaces() : (body.workspaces || []);
        const pushRes = exportToDrive({ workspaces, settings: body.settings, targetDir: body.targetDir });
        return this.sendJson(res, pushRes.success ? 200 : 400, pushRes);
      }

      if (pathname === '/api/sync/drive/pull' && req.method === 'POST') {
        const body = await this.readJsonBody(req);
        const currentWorkspaces = this.sessionManager ? this.sessionManager.getWorkspaces() : [];
        const pullRes = importFromDrive({
          sourceDir: body.sourceDir,
          currentWorkspaces,
          strategy: body.strategy || 'merge'
        });
        if (pullRes.success && this.sessionManager) {
          this.sessionManager.store.set('workspaces', pullRes.data.reconciledWorkspaces);
        }
        return this.sendJson(res, pullRes.success ? 200 : 400, pullRes);
      }

      // 404 Route Not Found
      return this.sendJson(res, 404, {
        success: false,
        errorCode: 'BRIDGE_ROUTER_NOT_FOUND_404',
        message: `Endpoint ${req.method} ${pathname} not found on Nomad Bridge.`,
      });
    } catch (err) {
      console.error('[Nomad Bridge] Request error:', err);
      return this.sendJson(res, 500, {
        success: false,
        errorCode: 'BRIDGE_INTERNAL_SERVER_ERROR_500',
        message: (err instanceof Error ? err.message : String(err)) || 'Internal bridge error',
      });
    }
  }
}

module.exports = {
  LocalSyncBridge,
};
