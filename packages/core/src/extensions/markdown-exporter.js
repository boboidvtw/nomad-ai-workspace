/**
 * @nomad/core - Academic & Production Markdown Exporter
 * Governed by Result Pattern & Zero-Exception Protocol.
 */

const { ok, err } = require('../result');

/**
 * Formats a chat dialogue into standard Markdown document.
 * @param {Object} options
 * @param {string} options.title - Dialogue title
 * @param {string} [options.platform='Multi-AI'] - AI Platform name
 * @param {string} [options.model] - Specific model name if known
 * @param {string} [options.date] - ISO timestamp or formatted date
 * @param {Array<{ role: 'user'|'assistant'|'system', content: string, timestamp?: string }>} options.messages
 * @returns {{ success: true, data: { markdown: string, wordCount: number, messageCount: number } }}
 */
function formatChatToMarkdown(options = {}) {
  if (!options || typeof options !== 'object') {
    return err('CORE_EXPORT_INVALID_INPUT_001', 'Options object is required');
  }

  const title = options.title || '對話導出記錄';
  const platform = options.platform || 'Nomad Multi-AI';
  const date = options.date || new Date().toISOString();
  const messages = Array.isArray(options.messages) ? options.messages : [];

  const lines = [
    `# ${title}`,
    '',
    `> **來源平台**: ${platform} ${options.model ? `(${options.model})` : ''}  `,
    `> **匯出時間**: ${date}  `,
    `> **訊息總數**: ${messages.length} 則`,
    '',
    '---',
    ''
  ];

  let wordCount = 0;

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    const roleName = msg.role === 'user' ? '👤 使用者 (User)' :
                     msg.role === 'assistant' ? `🤖 ${platform} (Assistant)` :
                     '⚙️ 系統 (System)';
    
    const timeStr = msg.timestamp ? ` *(${msg.timestamp})*` : '';
    lines.push(`### ${roleName}${timeStr}`);
    lines.push('');
    const content = (msg.content || '').trim();
    lines.push(content);
    lines.push('');
    lines.push('---');
    lines.push('');

    wordCount += content.length;
  }

  const markdown = lines.join('\n');
  return ok({
    markdown,
    wordCount,
    messageCount: messages.length
  });
}

module.exports = {
  formatChatToMarkdown
};
