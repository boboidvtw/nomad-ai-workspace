/**
 * Nomad AI Studio - Local Sync Bridge
 * High-performance, zero-dependency HTTP & SSE local RPC bridge.
 * Governed by AGENTS.md Atomic Contract & Result Pattern.
 */

const http = require('http');

class LocalSyncBridge {
  /**
   * @param {Object} options
   * @param {number} [options.port=8765] - Port to listen on (127.0.0.1)
   * @param {string} [options.host='127.0.0.1'] - Bind address
   * @param {Function} [options.getStatus] - Callback returning app status
   * @param {Function} [options.onDispatchPrompt] - Callback for prompt injection
   * @param {Function} [options.onSetLayout] - Callback for layout changes
   * @param {Function} [options.onSetZoom] - Callback for zoom adjustments
   * @param {Function} [options.onToggleWindow] - Callback for window summon/hide
   * @param {Object} [options.orchestrator] - MultiAiOrchestrator instance
   */
  constructor(options = {}) {
    this.port = options.port || 8765;
    this.host = options.host || '127.0.0.1';
    this.getStatus = options.getStatus || (() => ({ status: 'ready' }));
    this.onDispatchPrompt = options.onDispatchPrompt || (async () => ({ dispatched: true }));
    this.onSetLayout = options.onSetLayout || (() => ({}));
    this.onSetZoom = options.onSetZoom || (() => ({}));
    this.onToggleWindow = options.onToggleWindow || (() => ({}));
    this.orchestrator = options.orchestrator || null;
    this.onInspectPlatform = options.onInspectPlatform || null;
    this.onEvalScript = options.onEvalScript || null;

    this.server = null;
    this.sseClients = new Set();
  }

  setOrchestrator(orchestrator) {
    this.orchestrator = orchestrator;
  }

  start() {
    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => this.handleRequest(req, res));

      this.server.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
          console.warn(`[Nomad Bridge] Port ${this.port} in use, retrying on ${this.port + 1}...`);
          this.port += 1;
          this.server.listen(this.port, this.host);
        } else {
          reject(err);
        }
      });

      this.server.listen(this.port, this.host, () => {
        const url = `http://${this.host}:${this.port}`;
        console.log(`[Nomad Bridge] Local Sync Bridge listening at ${url}`);
        resolve({ port: this.port, host: this.host, url });
      });
    });
  }

  stop() {
    return new Promise((resolve) => {
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
    });
  }

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

  handleCors(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return true;
    }
    return false;
  }

  sendJson(res, statusCode, body) {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.writeHead(statusCode);
    res.end(JSON.stringify(body));
  }

  readJsonBody(req) {
    return new Promise((resolve, reject) => {
      let data = '';
      req.on('data', (chunk) => {
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

  async handleRequest(req, res) {
    if (this.handleCors(req, res)) return;

    const parsedUrl = new URL(req.url, `http://${this.host}:${this.port}`);
    const pathname = parsedUrl.pathname;

    try {
      // 1. Health & Status
      if ((pathname === '/' || pathname === '/health' || pathname === '/api/status') && req.method === 'GET') {
        const appState = await Promise.resolve(this.getStatus());
        const orchStatus = this.orchestrator ? this.orchestrator.getStatus() : null;
        return this.sendJson(res, 200, {
          success: true,
          data: {
            app: 'Nomad AI Studio',
            version: '1.3.0',
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
          'Access-Control-Allow-Origin': '*',
        });
        res.write(`data: ${JSON.stringify({ type: 'connected', time: Date.now() })}\n\n`);
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
        message: err.message || 'Internal bridge error',
      });
    }
  }
}

module.exports = {
  LocalSyncBridge,
};
