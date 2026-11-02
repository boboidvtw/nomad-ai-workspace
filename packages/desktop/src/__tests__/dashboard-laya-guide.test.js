const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

const HTML = fs.readFileSync(
  path.join(__dirname, "../../../dashboard/index.html"),
  "utf8",
);
const LAYA_DIR = "~/.gemini/antigravity-ide/scratch/laya";

test("Laya commands: every start command uses the script that exists in the Laya repo", () => {
  assert.ok(
    !HTML.includes("app.main:app"),
    "the Laya repo has no app/ package",
  );
  const copied = HTML.match(/copyText\(\s*'[^']*start_service\.sh'/g) || [];
  assert.strictEqual(
    copied.length,
    2,
    "card and ops drawer each copy the start command",
  );
  assert.ok(
    HTML.includes(`cmd: '${LAYA_DIR}/start_service.sh'`),
    "command palette entry",
  );
  assert.ok(
    HTML.includes(`copyText('${LAYA_DIR}/stop_service.sh')`),
    "stop command on the card",
  );
});

test("Laya commands: the verification command runs inside the Laya virtualenv", () => {
  assert.ok(
    !HTML.includes("python3 -m pytest tests/"),
    "system python has no laya or pytest",
  );
  assert.ok(
    HTML.includes(`cd ${LAYA_DIR} && .venv/bin/python3 test_decision.py`),
  );
});

test("Laya lab: the how-to is collapsed by default and covers start, run and reading results", () => {
  const { document } = new JSDOM(HTML).window;
  const guide = document.querySelector(".drawer-body #laya-guide");
  assert.ok(guide, "guide lives in the Laya lab drawer");
  assert.strictEqual(guide.tagName, "DETAILS");
  assert.ok(!guide.hasAttribute("open"));
  const text = guide.textContent;
  for (const word of [
    "OFFLINE",
    "快捷管線",
    "刷新探測",
    "choice",
    "score",
    "noul",
  ]) {
    assert.ok(text.includes(word), `guide mentions ${word}`);
  }
});
