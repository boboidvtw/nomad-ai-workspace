/**
 * Nomad Artifacts & Canvas Extractor
 * Extracts HTML, SVG, Mermaid, Code and Markdown artifacts from AI responses.
 * Governed by AGENTS.md Section 6: Atomic Contract & Zero Exception Protocol.
 */

const { ok, err } = require('../result');
const { ErrorCodes } = require('../error-codes');

/**
 * Supported artifact types
 */
const ARTIFACT_TYPES = Object.freeze({
  HTML: 'html',
  SVG: 'svg',
  MERMAID: 'mermaid',
  CODE: 'code',
  MARKDOWN: 'markdown',
  REACT: 'react'
});

/**
 * Extract artifacts from markdown or plain text
 * @param {string} text - Raw model response text
 * @param {Object} [options]
 * @param {string} [options.sourceSpeaker] - AI speaker (claude, chatgpt, etc.)
 * @returns {import('../result').UnitResult<Array<{ id: string, type: string, title: string, language: string, content: string, speaker: string, timestamp: string }>>}
 */
function extractArtifacts(text, options = {}) {
  try {
    if (typeof text !== 'string') {
      return err(ErrorCodes.PIPELINE_INVALID_INPUT_003, 'Artifact extractor input must be a string');
    }

    if (!text.trim()) {
      return ok([]);
    }

    const speaker = options.sourceSpeaker || 'AI';
    const artifacts = [];
    let counter = 1;

    // 1. Match code blocks: ```lang ... ```
    const codeBlockRegex = /```([a-zA-Z0-9_-]+)?\s*\n([\s\S]*?)```/g;
    let match;

    while ((match = codeBlockRegex.exec(text)) !== null) {
      const rawLang = (match[1] || '').trim().toLowerCase();
      const content = match[2].trim();

      if (!content) continue;

      /** @type {string} */
      let type = ARTIFACT_TYPES.CODE;
      let title = `代碼片段 #${counter}`;

      if (rawLang === 'html' || rawLang === 'htm') {
        type = ARTIFACT_TYPES.HTML;
        title = `HTML 互動原型 #${counter}`;
      } else if (rawLang === 'svg' || content.startsWith('<svg')) {
        type = ARTIFACT_TYPES.SVG;
        title = `SVG 向量圖形 #${counter}`;
      } else if (rawLang === 'mermaid') {
        type = ARTIFACT_TYPES.MERMAID;
        title = `Mermaid 拓撲架構圖 #${counter}`;
      } else if (rawLang === 'jsx' || rawLang === 'tsx' || rawLang === 'react') {
        type = ARTIFACT_TYPES.REACT;
        title = `React 元件原型 #${counter}`;
      } else if (rawLang === 'markdown' || rawLang === 'md') {
        type = ARTIFACT_TYPES.MARKDOWN;
        title = `結構化報告 #${counter}`;
      } else if (rawLang) {
        title = `${rawLang.toUpperCase()} 程式模組 #${counter}`;
      }

      artifacts.push({
        id: `art-${Date.now()}-${counter}`,
        type,
        title,
        language: rawLang || 'plaintext',
        content,
        speaker,
        timestamp: new Date().toISOString()
      });

      counter++;
    }

    // 2. Standalone SVG detection outside code fences
    const standaloneSvgRegex = /(<svg[\s\S]*?<\/svg>)/gi;
    let svgMatch;
    while ((svgMatch = standaloneSvgRegex.exec(text)) !== null) {
      const svgContent = svgMatch[1].trim();
      // Ensure it wasn't already caught inside a code block
      if (!artifacts.some(a => a.content.includes(svgContent))) {
        artifacts.push({
          id: `art-${Date.now()}-${counter}`,
          type: ARTIFACT_TYPES.SVG,
          title: `SVG 獨立畫布 #${counter}`,
          language: 'svg',
          content: svgContent,
          speaker,
          timestamp: new Date().toISOString()
        });
        counter++;
      }
    }

    return ok(artifacts);
  } catch (e) {
    return err(
      ErrorCodes.BRIDGE_EXECUTION_FAILED_003,
      'Artifact extraction failed: ' + (e instanceof Error ? e.message : String(e))
    );
  }
}

/**
 * Generate a complete standalone HTML document for sandboxed rendering.
 * Accepts either an artifact object or (content, type, title) positional arguments.
 * @param {{ content: string, type: string, title?: string } | string} artifact
 * @param {string} [maybeType] - Artifact type when `artifact` is a content string
 * @param {string} [maybeTitle] - Artifact title when `artifact` is a content string
 * @returns {string} Fully self-contained HTML document
 */
function generateSandboxHtml(artifact, maybeType, maybeTitle) {
  if (typeof artifact === 'string') {
    artifact = { content: artifact, type: maybeType || 'html', title: maybeTitle || 'Artifact' };
  }
  if (!artifact || typeof artifact.content !== 'string') {
    return '<!DOCTYPE html><html><body><p>無效的 Artifact 內容</p></body></html>';
  }

  const { type, content, title } = artifact;

  if (type === ARTIFACT_TYPES.HTML) {
    // If it's already a full HTML document
    if (content.includes('<html') || content.includes('<!DOCTYPE')) {
      return content;
    }
    return `<!DOCTYPE html>
<html lang="zh-Hant">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title || 'Artifact Preview'}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      margin: 16px;
      color: #0f172a;
      background: #ffffff;
    }
  </style>
</head>
<body>
  ${content}
</body>
</html>`;
  }

  if (type === ARTIFACT_TYPES.SVG) {
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body {
      margin: 0;
      padding: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #0f172a;
      min-height: 80vh;
    }
    svg {
      max-width: 100%;
      height: auto;
      filter: drop-shadow(0 4px 12px rgba(0,0,0,0.4));
    }
  </style>
</head>
<body>
  ${content}
</body>
</html>`;
  }

  if (type === ARTIFACT_TYPES.MERMAID) {
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>
  <style>
    body {
      margin: 0;
      padding: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #0b0f19;
      color: #f8fafc;
      font-family: sans-serif;
      min-height: 80vh;
    }
    .mermaid {
      width: 100%;
      max-width: 900px;
    }
  </style>
</head>
<body>
  <div class="mermaid">
${content}
  </div>
  <script>
    mermaid.initialize({ startOnLoad: true, theme: 'dark' });
  </script>
</body>
</html>`;
  }

  // Fallback for code and markdown
  const safeContent = content.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body {
      margin: 16px;
      background: #0b0f19;
      color: #e2e8f0;
      font-family: ui-monospace, Menlo, Monaco, Consolas, monospace;
      font-size: 13px;
      line-height: 1.6;
    }
    pre {
      margin: 0;
      white-space: pre-wrap;
      word-break: break-all;
    }
  </style>
</head>
<body>
  <pre>${safeContent}</pre>
</body>
</html>`;
}

module.exports = {
  ARTIFACT_TYPES,
  extractArtifacts,
  generateSandboxHtml
};
