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
  PluginRuntime
} = require('@nomad/core');
const { probeAllServices } = require('./prober');
const { serveDashboard } = require('./static-handler');

class NomadDaemonServer {
  constructor(options = {}) {
    this.port = Number(options.port || process.env.NOMAD_PORT || DEFAULT_DAEMON_PORT);
    this.host = options.host || process.env.NOMAD_HOST || DEFAULT_DAEMON_HOST;

    this.getStatus = options.getStatus || (() => ({ status: 'ready' }));
    this.onDispatchPrompt = options.onDispatchPrompt || null;
    this.onSetLayout = options.onSetLayout || null;
    this.onSetZoom = options.onSetZoom || null;
    this.onToggleWindow = options.onToggleWindow || null;
    this.orchestrator = options.orchestrator || null;
    this.sessionManager = options.sessionManager || null;

    this.server = null;
    this.sseClients = new Set();
    this.activeStudio = null; // { bridgePort: number, pid: number, version: string, registeredAt: string, lastHeartbeat: number }
    this.pipelineManager = new PipelineManager({
      headroomEnabled: true,
      layaEnabled: true,
      autoEnhance: true,
      compressionLevel: 'balanced'
    });
    this.mcpGateway = new McpGateway();
    this.knowledgeBase = new KnowledgeBase();
    this.localModelClient = new LocalModelClient();
    this.pluginRuntime = new PluginRuntime();
  }

  start() {
    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => this.handleRequest(req, res));

      this.server.on('error', (e) => {
        if (e.code === 'EADDRINUSE') {
          reject(err(ErrorCodes.DAEMON_SERVER_PORT_IN_USE_001, 'Port ' + this.port + ' is already in use', { port: this.port }));
        } else {
          reject(err(ErrorCodes.DAEMON_SERVER_START_FAILED_002, e.message, e));
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
          this.activeStudio = null;
          resolve(ok({ stopped: true }));
        });
      } else {
        this.activeStudio = null;
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

  proxyToStudio(req, res, targetPort) {
    const options = {
      hostname: '127.0.0.1',
      port: targetPort,
      path: req.url,
      method: req.method,
      headers: {
        ...req.headers,
        host: '127.0.0.1:' + targetPort,
        'x-forwarded-by': 'nomad-daemon'
      }
    };

    const proxyReq = http.request(options, (proxyRes) => {
      this.setCORSHeaders(res);
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(res);
    });

    proxyReq.on('error', (e) => {
      this.activeStudio = null;
      return this.sendJson(res, 502, err(
        ErrorCodes.DAEMON_STUDIO_OFFLINE_001,
        'Failed to forward request to Nomad AI Studio on port ' + targetPort + ': ' + e.message
      ));
    });

    req.pipe(proxyReq);
  }

  isStudioAlive() {
    if (!this.activeStudio) return false;
    // Considered alive if heartbeat received within 30 seconds
    const diff = Date.now() - (this.activeStudio.lastHeartbeat || 0);
    return diff < 30000;
  }

  async handleRequest(req, res) {
    this.setCORSHeaders(res);

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url, 'http://' + (req.headers.host || '127.0.0.1:' + this.port));
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

      // 3. Studio Handshake & Registration endpoints
      if (pathname === '/api/studio/register' && req.method === 'POST') {
        const body = await this.readJsonBody(req);
        if (!body.bridgePort || typeof body.bridgePort !== 'number') {
          return this.sendJson(res, 400, err(ErrorCodes.STUDIO_REGISTRATION_FAILED_001, 'Missing or invalid bridgePort number'));
        }
        this.activeStudio = {
          bridgePort: body.bridgePort,
          pid: body.pid || null,
          version: body.version || '1.4.0',
          registeredAt: new Date().toISOString(),
          lastHeartbeat: Date.now()
        };
        console.log('[Nomad Daemon] Studio registered on bridge port:', body.bridgePort, '(PID:', body.pid + ')');
        return this.sendJson(res, 200, ok({ status: 'registered', activeStudio: this.activeStudio }));
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
        return this.sendJson(res, 200, ok({
          online: this.isStudioAlive(),
          activeStudio: this.activeStudio
        }));
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

      if (pathname === '/api/sync/drive/status' && req.method === 'GET') {
        const dir = url.searchParams.get('dir');
        const resStatus = getSyncStatus(dir ? { targetDir: dir } : {});
        return this.sendJson(res, resStatus.success ? 200 : 400, resStatus);
      }

      if (pathname === '/api/sync/drive/push' && req.method === 'POST') {
        if (this.isStudioAlive()) {
          return this.proxyToStudio(req, res, this.activeStudio.bridgePort);
        }
        const body = await this.readJsonBody(req);
        const pushRes = exportToDrive(body);
        return this.sendJson(res, pushRes.success ? 200 : 400, pushRes);
      }

      if (pathname === '/api/sync/drive/pull' && req.method === 'POST') {
        if (this.isStudioAlive()) {
          return this.proxyToStudio(req, res, this.activeStudio.bridgePort);
        }
        const body = await this.readJsonBody(req);
        const pullRes = importFromDrive(body);
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
        const html = ArtifactExtractor.generateSandboxHtml(body.code || '', body.type || 'html', body.title || 'Sandbox');
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
        const client = new LocalModelClient({ port: body.port || 1234, host: body.host || '127.0.0.1' });
        const chatRes = await client.chat(body);
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

      // 4. Status API
      if (pathname === '/api/status' && req.method === 'GET') {
        const probeResult = await probeAllServices();
        let studioInfo = { status: 'offline' };

        if (this.isStudioAlive()) {
          studioInfo = {
            status: 'online',
            pid: this.activeStudio.pid,
            bridgePort: this.activeStudio.bridgePort,
            version: this.activeStudio.version
          };
        } else if (typeof this.getStatus === 'function') {
          const directStatus = await this.getStatus();
          if (directStatus && directStatus.status) {
            studioInfo = directStatus;
          }
        }

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
          studio: studioInfo,
          orchestrator: orchestratorStatus,
          microservices: probeResult.data
        }));
      }

      // 5. Microservices Probe API
      if (pathname === '/api/probe' && req.method === 'GET') {
        const timeoutMs = parseInt(url.searchParams.get('timeout') || '350', 10);
        const probeResult = await probeAllServices(undefined, timeoutMs);
        return this.sendJson(res, 200, probeResult);
      }

      // 6. Action Endpoints (Proxy to Active Studio if present)
      const isStudioAction = (
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
        pathname.startsWith('/api/import')
      );

      if (isStudioAction) {
        if (this.isStudioAlive()) {
          return this.proxyToStudio(req, res, this.activeStudio.bridgePort);
        }

        // Fallback for standalone/mock handlers
        if (pathname === '/api/prompt' && typeof this.onDispatchPrompt === 'function') {
          const body = await this.readJsonBody(req);
          if (!body.prompt || typeof body.prompt !== 'string') {
            return this.sendJson(res, 400, err(ErrorCodes.BRIDGE_INVALID_BODY_002, 'Missing or invalid prompt string'));
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

        return this.sendJson(res, 503, err(
          ErrorCodes.DAEMON_STUDIO_OFFLINE_001,
          'Nomad AI Studio is not currently running. Launch Studio to execute desktop actions.'
        ));
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
