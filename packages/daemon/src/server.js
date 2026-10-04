/**
 * Nomad Core Daemon - Unified Gateway Server
 * Governed by AGENTS.md Atomic Contract & Result Pattern.
 */

const http = require('http');
const {
  ok,
  err,
  ErrorCodes,
  DEFAULT_DAEMON_PORT,
  DEFAULT_DAEMON_HOST
} = require('../../core');
const { probeAllServices } = require('./prober');
const { serveDashboard } = require('./static-handler');

class NomadDaemonServer {
  constructor(options = {}) {
    this.port = Number(options.port || process.env.NOMAD_PORT || DEFAULT_DAEMON_PORT);
    this.host = options.host || DEFAULT_DAEMON_HOST;

    this.getStatus = options.getStatus || (() => ({
      app: 'Nomad Daemon Gateway',
      mode: 'headless',
      status: 'ready'
    }));

    this.onDispatchPrompt = options.onDispatchPrompt || (async () => ({ dispatched: false, reason: 'studio_not_attached' }));
    this.onSetLayout = options.onSetLayout || (() => ({ applied: false }));
    this.onSetZoom = options.onSetZoom || (() => ({ applied: false }));
    this.onToggleWindow = options.onToggleWindow || (() => ({ applied: false }));
    this.orchestrator = options.orchestrator || null;
    this.sessionManager = options.sessionManager || null;

    this.server = null;
    this.sseClients = new Set();
  }

  setStudioHandlers(handlers = {}) {
    if (handlers.getStatus) this.getStatus = handlers.getStatus;
    if (handlers.onDispatchPrompt) this.onDispatchPrompt = handlers.onDispatchPrompt;
    if (handlers.onSetLayout) this.onSetLayout = handlers.onSetLayout;
    if (handlers.onSetZoom) this.onSetZoom = handlers.onSetZoom;
    if (handlers.onToggleWindow) this.onToggleWindow = handlers.onToggleWindow;
    if (handlers.orchestrator) this.orchestrator = handlers.orchestrator;
    if (handlers.sessionManager) this.sessionManager = handlers.sessionManager;
  }

  start() {
    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => this.handleRequest(req, res));

      this.server.on('error', (error) => {
        if (error.code === 'EADDRINUSE') {
          console.warn('[Nomad Daemon] Port ' + this.port + ' is already occupied.');
          reject(err(ErrorCodes.DAEMON_SERVER_PORT_IN_USE_001, 'Port ' + this.port + ' is already in use', { port: this.port }));
        } else {
          reject(err(ErrorCodes.DAEMON_SERVER_START_FAILED_002, error.message, { error }));
        }
      });

      this.server.listen(this.port, this.host, () => {
        console.log('[Nomad Daemon] Gateway listening at http://' + this.host + ':' + this.port);
        console.log('[Nomad Daemon] Dashboard available at http://' + this.host + ':' + this.port + '/dashboard');
        resolve(ok({ port: this.port, host: this.host }));
      });
    });
  }

  stop() {
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
          resolve(ok({ stopped: true }));
        });
      } else {
        resolve(ok({ stopped: true }));
      }
    });
  }

  broadcast(event, data) {
    if (this.sseClients.size === 0) return;
    const payload = ['event: ' + event, 'data: ' + JSON.stringify(data), '', ''].join(String.fromCharCode(10));
    for (const client of this.sseClients) {
      try {
        client.write(payload);
      } catch {
        this.sseClients.delete(client);
      }
    }
  }

  setCORSHeaders(res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  }

  sendJson(res, statusCode, payload) {
    this.setCORSHeaders(res);
    res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(payload));
  }

  async readJsonBody(req) {
    return new Promise((resolve, reject) => {
      let body = '';
      req.on('data', chunk => {
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
          reject(err(ErrorCodes.BRIDGE_INVALID_BODY_002, 'Invalid JSON body: ' + e.message));
        }
      });
      req.on('error', (e) => reject(err(ErrorCodes.BRIDGE_INVALID_BODY_002, e.message)));
    });
  }

  async handleRequest(req, res) {
    this.setCORSHeaders(res);

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url, 'http://' + req.headers.host);
    const pathname = url.pathname;

    try {
      // 1. Dashboard static routes
      if (pathname === '/dashboard' || pathname === '/dashboard/' || pathname === '/dashboard/index.html') {
        serveDashboard(req, res);
        return;
      }

      if (pathname === '/') {
        res.writeHead(302, { 'Location': '/dashboard' });
        res.end();
        return;
      }

      // 2. SSE events
      if (pathname === '/api/events' && req.method === 'GET') {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive'
        });
        const connectMsg = ['event: connected', 'data: ' + JSON.stringify({ timestamp: new Date().toISOString() }), '', ''].join(String.fromCharCode(10));
        res.write(connectMsg);
        this.sseClients.add(res);

        req.on('close', () => {
          this.sseClients.delete(res);
        });
        return;
      }

      // 3. Status API
      if (pathname === '/api/status' && req.method === 'GET') {
        const appStatus = await this.getStatus();
        const probeResult = await probeAllServices();
        const orchestratorStatus = this.orchestrator ? this.orchestrator.getStatus() : null;

        return this.sendJson(res, 200, ok({
          daemon: {
            name: 'Nomad Core Daemon',
            version: '1.4.0',
            port: this.port,
            host: this.host,
            sseClients: this.sseClients.size,
            uptimeSeconds: Math.floor(process.uptime())
          },
          studio: appStatus,
          orchestrator: orchestratorStatus,
          microservices: probeResult.data
        }));
      }

      // 4. Microservices Probe API
      if (pathname === '/api/probe' && req.method === 'GET') {
        const timeoutMs = parseInt(url.searchParams.get('timeout') || '350', 10);
        const probeResult = await probeAllServices(undefined, timeoutMs);
        return this.sendJson(res, 200, probeResult);
      }

      // 5. Prompt dispatch API
      if (pathname === '/api/prompt' && req.method === 'POST') {
        const body = await this.readJsonBody(req);
        if (!body.prompt || typeof body.prompt !== 'string') {
          return this.sendJson(res, 400, err(ErrorCodes.BRIDGE_INVALID_BODY_002, 'Missing or invalid prompt string'));
        }
        const result = await this.onDispatchPrompt(body.prompt, body.targetPlatforms || null);
        return this.sendJson(res, 200, ok(result));
      }

      // 6. Layout API
      if (pathname === '/api/layout' && req.method === 'POST') {
        const body = await this.readJsonBody(req);
        const result = await this.onSetLayout(body.mode, body.options || {});
        return this.sendJson(res, 200, ok(result));
      }

      // 7. Zoom API
      if (pathname === '/api/zoom' && req.method === 'POST') {
        const body = await this.readJsonBody(req);
        const result = await this.onSetZoom(body.platform, body.factor);
        return this.sendJson(res, 200, ok(result));
      }

      // 8. Window summon API
      if (pathname === '/api/window' && req.method === 'POST') {
        const body = await this.readJsonBody(req);
        const result = await this.onToggleWindow(body.action || 'toggle');
        return this.sendJson(res, 200, ok(result));
      }

      // 9. Orchestrate API
      if (pathname === '/api/orchestrate' && req.method === 'POST') {
        const body = await this.readJsonBody(req);
        if (!this.orchestrator) {
          return this.sendJson(res, 400, err(ErrorCodes.ORCHESTRATOR_RUN_FAILED_002, 'Orchestrator not available'));
        }

        const action = body.action || 'status';
        if (action === 'start') {
          const runRes = await this.orchestrator.start(body.taskTopic, {
            mode: body.mode || 'relay',
            sequence: body.sequence,
            maxRounds: body.maxRounds
          });
          return this.sendJson(res, runRes.success ? 200 : 400, runRes);
        } else if (action === 'pause') {
          return this.sendJson(res, 200, this.orchestrator.pause());
        } else if (action === 'resume') {
          return this.sendJson(res, 200, this.orchestrator.resume());
        } else if (action === 'stop') {
          return this.sendJson(res, 200, this.orchestrator.stop());
        } else {
          return this.sendJson(res, 200, ok(this.orchestrator.getStatus()));
        }
      }

      // 10. Sessions API
      if (pathname === '/api/sessions') {
        if (!this.sessionManager) {
          return this.sendJson(res, 200, ok({ workspaces: [], activeWorkspaceId: null }));
        }
        if (req.method === 'GET') {
          return this.sendJson(res, 200, ok({
            workspaces: this.sessionManager.workspaces || [],
            activeWorkspaceId: this.sessionManager.activeWorkspaceId
          }));
        } else if (req.method === 'POST') {
          const body = await this.readJsonBody(req);
          const title = body.title || '新工作區';
          const ws = this.sessionManager.createWorkspace(title, body.platforms, body.type);
          return this.sendJson(res, 200, ok(ws));
        }
      }

      return this.sendJson(res, 404, err(
        ErrorCodes.BRIDGE_ROUTE_NOT_FOUND_001,
        'Endpoint not found: ' + req.method + ' ' + pathname
      ));

    } catch (e) {
      return this.sendJson(res, 500, err(
        ErrorCodes.BRIDGE_EXECUTION_FAILED_003,
        'Internal Gateway error: ' + (e instanceof Error ? e.message : String(e))
      ));
    }
  }
}

module.exports = {
  NomadDaemonServer
};
