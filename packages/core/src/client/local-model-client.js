/**
 * Nomad Local Model Client (OpenAI Compatible)
 * Connects directly to LM Studio (1234), Ollama (11434), or vLLM.
 * Governed by AGENTS.md Section 6: Atomic Contract & Result Pattern.
 */

const http = require('http');
const { URL } = require('url');
const { ok, err } = require('../result');
const { ErrorCodes } = require('../error-codes');

class LocalModelClient {
  /**
   * @param {Object} [options]
   * @param {string} [options.endpoint='http://127.0.0.1:1234/v1'] - Full OpenAI-compatible base URL; wins over host/port
   * @param {string} [options.host='127.0.0.1'] - Used to build the endpoint when `endpoint` is not given
   * @param {number} [options.port=1234] - Used to build the endpoint when `endpoint` is not given
   * @param {string} [options.defaultModel='local-model']
   * @param {number} [options.timeoutMs=15000]
   */
  constructor(options = {}) {
    this.endpoint = options.endpoint ||
      'http://' + (options.host || '127.0.0.1') + ':' + (options.port || 1234) + '/v1';
    this.defaultModel = options.defaultModel || 'local-model';
    this.timeoutMs = options.timeoutMs || 15000;
  }

  /**
   * Probe if local inference server is online and list models
   * @param {string} [customEndpoint]
   * @returns {Promise<import('../result').UnitResult<{ online: boolean, endpoint: string, models: string[] }>>}
   */
  async probe(customEndpoint) {
    const ep = customEndpoint || this.endpoint;
    const url = new URL(`${ep}/models`);

    return new Promise((resolve) => {
      const req = http.request({
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        method: 'GET',
        timeout: 1000
      }, (res) => {
        let raw = '';
        res.on('data', chunk => raw += chunk);
        res.on('end', () => {
          if (res.statusCode !== undefined && res.statusCode >= 200 && res.statusCode < 300) {
            try {
              const data = JSON.parse(raw);
              const models = Array.isArray(data.data) ? data.data.map(m => m.id) : [];
              resolve(ok({ online: true, endpoint: ep, models }));
            } catch {
              resolve(ok({ online: true, endpoint: ep, models: [] }));
            }
          } else {
            resolve(err(ErrorCodes.LOCAL_MODEL_UNREACHABLE_001, `Server returned HTTP ${res.statusCode}`));
          }
        });
      });

      req.on('timeout', () => {
        req.destroy();
        resolve(err(ErrorCodes.LOCAL_MODEL_TIMEOUT_003, `Probe timed out on ${ep}`));
      });

      req.on('error', (e) => {
        resolve(err(ErrorCodes.LOCAL_MODEL_UNREACHABLE_001, `Connection refused on ${ep}: ${e.message}`));
      });

      req.end();
    });
  }

  /**
   * Dispatch chat completion request
   * @param {Object} [options]
   * @param {Array<{role: string, content: string}>} [options.messages] - Defaults to a single user turn built from `prompt`
   * @param {string} [options.prompt] - Shorthand for a single user message
   * @param {string} [options.endpoint] - Overrides the client endpoint for this call
   * @param {string} [options.model]
   * @param {number} [options.temperature=0.7]
   * @returns {Promise<import('../result').UnitResult<{ content: string, model: string, usage?: Object, latencyMs: number }>>}
   */
  async chatCompletion(options = {}) {
    const startTime = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const ep = options.endpoint || this.endpoint;
    const url = new URL(`${ep}/chat/completions`);
    const model = options.model || this.defaultModel;

    const payload = JSON.stringify({
      model,
      messages: options.messages || [{ role: 'user', content: options.prompt || '' }],
      temperature: options.temperature !== undefined ? options.temperature : 0.7,
      stream: false
    });

    return new Promise((resolve) => {
      const req = http.request({
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload)
        },
        timeout: this.timeoutMs
      }, (res) => {
        let raw = '';
        res.on('data', chunk => raw += chunk);
        res.on('end', () => {
          const endTime = typeof performance !== 'undefined' ? performance.now() : Date.now();
          const latencyMs = Number((endTime - startTime).toFixed(2));

          if (res.statusCode !== undefined && res.statusCode >= 200 && res.statusCode < 300) {
            try {
              const data = JSON.parse(raw);
              const message = data.choices?.[0]?.message?.content || '';
              resolve(ok({
                content: message,
                model: data.model || model,
                usage: data.usage || null,
                latencyMs
              }));
            } catch (e) {
              resolve(err(ErrorCodes.LOCAL_MODEL_INFERENCE_FAILED_002, 'JSON parse error: ' + e.message));
            }
          } else {
            resolve(err(ErrorCodes.LOCAL_MODEL_INFERENCE_FAILED_002, `Server error HTTP ${res.statusCode}: ${raw.slice(0, 100)}`));
          }
        });
      });

      req.on('timeout', () => {
        req.destroy();
        resolve(err(ErrorCodes.LOCAL_MODEL_TIMEOUT_003, `Inference timed out after ${this.timeoutMs}ms`));
      });

      req.on('error', (e) => {
        resolve(err(ErrorCodes.LOCAL_MODEL_UNREACHABLE_001, `Failed to connect to local model: ${e.message}`));
      });

      req.write(payload);
      req.end();
    });
  }
}

module.exports = {
  LocalModelClient
};
