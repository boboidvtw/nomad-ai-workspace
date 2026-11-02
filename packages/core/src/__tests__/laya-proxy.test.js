const test = require('node:test');
const assert = require('node:assert');
const { handleLayaRequest, LAYA_SYSTEMONE_URL } = require('../services/laya-proxy');

function fakeFetch(response) {
  const calls = [];
  const impl = async (url, init) => {
    calls.push({ url, init });
    if (response instanceof Error) throw response;
    return response;
  };
  return { calls, impl };
}

function jsonResponse(status, body) {
  return { status, ok: status < 400, text: async () => JSON.stringify(body) };
}

test('laya proxy: forwards the JSON body to the fixed local Laya endpoint', async () => {
  const fetch = fakeFetch(jsonResponse(200, { answers: { a: { choice: 'x' } } }));
  const res = await handleLayaRequest({
    method: 'POST',
    pathname: '/api/laya/systemone',
    readBody: async () => ({ state: 's', questions: {} }),
    fetchImpl: fetch.impl,
  });
  assert.strictEqual(LAYA_SYSTEMONE_URL, 'http://127.0.0.1:8555/v1/systemone');
  assert.strictEqual(fetch.calls[0].url, LAYA_SYSTEMONE_URL);
  assert.strictEqual(fetch.calls[0].init.method, 'POST');
  assert.deepStrictEqual(JSON.parse(fetch.calls[0].init.body), { state: 's', questions: {} });
  assert.strictEqual(res.status, 200);
  assert.deepStrictEqual(res.body, { answers: { a: { choice: 'x' } } });
});

test('laya proxy: passes Laya errors through with their status', async () => {
  const fetch = fakeFetch(jsonResponse(422, { detail: 'bad questions' }));
  const res = await handleLayaRequest({
    method: 'POST',
    pathname: '/api/laya/systemone',
    readBody: async () => ({}),
    fetchImpl: fetch.impl,
  });
  assert.strictEqual(res.status, 422);
  assert.deepStrictEqual(res.body, { detail: 'bad questions' });
});

test('laya proxy: an offline Laya answers 502 with a readable message', async () => {
  const fetch = fakeFetch(new Error('connect ECONNREFUSED'));
  const res = await handleLayaRequest({
    method: 'POST',
    pathname: '/api/laya/systemone',
    readBody: async () => ({}),
    fetchImpl: fetch.impl,
  });
  assert.strictEqual(res.status, 502);
  assert.strictEqual(res.body.success, false);
  assert.strictEqual(res.body.errorCode, 'SERVICE_LAYA_UNREACHABLE_005');
  assert.ok(res.body.message.includes('8555'));
});

test('laya proxy: health is a GET to the fixed Laya health URL', async () => {
  const fetch = fakeFetch(jsonResponse(200, { loaded: ['english'] }));
  const res = await handleLayaRequest({
    method: 'GET',
    pathname: '/api/laya/health',
    readBody: async () => assert.fail('GET reads no body'),
    fetchImpl: fetch.impl,
  });
  assert.strictEqual(fetch.calls[0].url, 'http://127.0.0.1:8555/health');
  assert.strictEqual(fetch.calls[0].init.method, 'GET');
  assert.deepStrictEqual(res.body, { loaded: ['english'] });
});

test('laya proxy: other paths and methods are not handled', async () => {
  const fetch = fakeFetch(jsonResponse(200, {}));
  const readBody = async () => ({});
  for (const [method, pathname] of [
    ['GET', '/api/laya/systemone'],
    ['POST', '/api/laya/health'],
    ['POST', '/api/laya/systemone/../admin'],
    ['GET', '/api/laya/constructor'],
    ['GET', '/api/laya/__proto__'],
    ['POST', '/api/services'],
  ]) {
    assert.strictEqual(
      await handleLayaRequest({ method, pathname, readBody, fetchImpl: fetch.impl }),
      null,
    );
  }
  assert.strictEqual(fetch.calls.length, 0);
});
