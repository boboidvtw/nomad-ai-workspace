const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const vm = require('node:vm');
const { composeDashboard, DASHBOARD_HTML_PATH, BOTS_PANEL_PATH } = require('@nomad/dashboard');

test('the served dashboard inlines the Bots panel at its marker', () => {
  const html = composeDashboard(fs.readFileSync(DASHBOARD_HTML_PATH, 'utf-8'));

  assert.ok(!html.includes('<!-- @nomad:bots-panel -->'));
  assert.ok(html.includes('id="bots-section"'));
  assert.ok(html.includes("filterCategory('bots')"));
});

test('the Bots panel script parses and never assigns API text to innerHTML', () => {
  const panel = fs.readFileSync(BOTS_PANEL_PATH, 'utf-8');
  const script = panel.slice(panel.lastIndexOf('<script>') + 8, panel.lastIndexOf('</script>'));

  assert.doesNotThrow(() => new vm.Script(script));
  assert.ok(!/innerHTML\s*=/.test(script), 'render with textContent / DOM nodes only');
});

/** Minimal DOM: enough for the panel's $ / el / click handlers. */
function fakeDocument() {
  /** @type {Map<string, any>} */
  const byId = new Map();
  const makeNode = (/** @type {string} */ tag) => {
    /** @type {Record<string, Function[]>} */
    const handlers = {};
    const node = {
      tagName: tag,
      textContent: '',
      value: '',
      checked: false,
      disabled: false,
      className: '',
      /** @type {any[]} */
      children: [],
      setAttribute() {},
      querySelectorAll: () => [],
      addEventListener: (/** @type {string} */ type, /** @type {Function} */ fn) => {
        (handlers[type] ||= []).push(fn);
      },
      appendChild: (/** @type {any} */ child) => node.children.push(child),
      replaceChildren: () => {
        node.children = [];
      },
      click: () => Promise.all((handlers.click || []).map((fn) => fn({}))),
    };
    return node;
  };
  return {
    createElement: makeNode,
    getElementById: (/** @type {string} */ id) => {
      if (!byId.has(id)) byId.set(id, makeNode('div'));
      return byId.get(id);
    },
  };
}

test('deleting a room keeps the "deleted" note after the room list reloads', async () => {
  const panel = fs.readFileSync(BOTS_PANEL_PATH, 'utf-8');
  const script = panel.slice(panel.lastIndexOf('<script>') + 8, panel.lastIndexOf('</script>'));
  let rooms = [{ id: 'r1', name: 'live-test', memberIds: [], status: 'idle', log: [] }];
  const json = (/** @type {number} */ status, /** @type {any} */ body) => ({
    status,
    json: async () => body,
  });
  const fetch = async (/** @type {string} */ path, /** @type {any} */ opts) => {
    if (path === '/api/bots') return json(200, { success: true, data: [] });
    if (path === '/api/bots/rooms') return json(200, { success: true, data: rooms });
    if (path === '/api/bots/rooms/r1' && opts.method === 'DELETE') {
      rooms = [];
      return json(200, { success: true, data: { removed: 'r1' } });
    }
    return json(404, { success: false, message: 'unexpected ' + path });
  };
  const document = fakeDocument();
  /** @type {any} */
  const window = { confirm: () => true };
  /** @type {Record<string, Function>} */
  const sse = {};
  class EventSource {
    addEventListener(/** @type {string} */ type, /** @type {Function} */ fn) {
      sse[type] = fn;
    }
  }
  vm.runInNewContext(script, { window, document, fetch, setTimeout, EventSource });
  window.NomadBots.show();
  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
  await settle();
  await settle();

  const row = document.getElementById('bots-rooms').children[0];
  await row.click();
  await document.getElementById('bots-room-delete').click();
  // The server's room:removed event can arrive after the DELETE response.
  sse['room:removed']();
  await settle();

  assert.deepStrictEqual(rooms, []);
  assert.strictEqual(document.getElementById('bots-room-status').textContent, '已刪除會議室');
});
