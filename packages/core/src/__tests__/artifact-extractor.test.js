const { test } = require('node:test');
const assert = require('node:assert');
const {
  extractArtifacts,
  generateSandboxHtml,
  ARTIFACT_TYPES
} = require('../canvas/artifact-extractor');
const { isOk } = require('../result');

test('ArtifactExtractor: extracts HTML, SVG and Mermaid blocks accurately', () => {
  const markdown = `
Here is an interactive mockup:
\`\`\`html
<div class="card"><h1>Hello World</h1></div>
\`\`\`

Here is a system architecture diagram:
\`\`\`mermaid
graph TD;
  A[Client] --> B[Daemon];
  B --> C[Postgres];
\`\`\`

And a custom icon:
\`\`\`svg
<svg width="24" height="24"><circle cx="12" cy="12" r="10" fill="red"/></svg>
\`\`\`
`;

  const res = extractArtifacts(markdown, { sourceSpeaker: 'claude' });
  assert.strictEqual(isOk(res), true);
  const artifacts = res.data;
  assert.strictEqual(artifacts.length, 3);

  assert.strictEqual(artifacts[0].type, ARTIFACT_TYPES.HTML);
  assert.ok(artifacts[0].content.includes('Hello World'));

  assert.strictEqual(artifacts[1].type, ARTIFACT_TYPES.MERMAID);
  assert.ok(artifacts[1].content.includes('graph TD'));

  assert.strictEqual(artifacts[2].type, ARTIFACT_TYPES.SVG);
  assert.ok(artifacts[2].content.includes('<circle'));
});

test('ArtifactExtractor: generates valid sandboxed HTML for iframe rendering', () => {
  const htmlArtifact = {
    type: ARTIFACT_TYPES.HTML,
    content: '<button>Click Me</button>',
    title: 'Button Component'
  };

  const sandboxedHtml = generateSandboxHtml(htmlArtifact);
  assert.ok(sandboxedHtml.includes('<!DOCTYPE html>'));
  assert.ok(sandboxedHtml.includes('<button>Click Me</button>'));

  const mermaidArtifact = {
    type: ARTIFACT_TYPES.MERMAID,
    content: 'graph LR; A --> B;',
    title: 'Flowchart'
  };

  const sandboxedMermaid = generateSandboxHtml(mermaidArtifact);
  assert.ok(sandboxedMermaid.includes('mermaid.min.js'));
  assert.ok(sandboxedMermaid.includes('graph LR; A --> B;'));
});
