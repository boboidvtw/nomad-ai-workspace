export type ChatMessage = {
    role: "user" | "assistant" | "system";
    content: string;
    timestamp?: string | undefined;
};
export type ChatExportOptions = {
    /**
     * - Dialogue title
     */
    title: string;
    /**
     * - AI Platform name
     */
    platform?: string | undefined;
    /**
     * - Specific model name if known
     */
    model?: string | undefined;
    /**
     * - ISO timestamp or formatted date
     */
    date?: string | undefined;
    messages: ChatMessage[];
};
/**
 * @typedef {Object} ChatMessage
 * @property {'user'|'assistant'|'system'} role
 * @property {string} content
 * @property {string} [timestamp]
 */
/**
 * @typedef {Object} ChatExportOptions
 * @property {string} title - Dialogue title
 * @property {string} [platform='Multi-AI'] - AI Platform name
 * @property {string} [model] - Specific model name if known
 * @property {string} [date] - ISO timestamp or formatted date
 * @property {ChatMessage[]} messages
 */
/**
 * Formats a chat dialogue into standard Markdown document.
 * @param {Partial<ChatExportOptions>} [options] - `title` and `messages` are validated at runtime
 * @returns {import('../result').UnitResult<{ markdown: string, wordCount: number, messageCount: number }>}
 */
export function formatChatToMarkdown(options?: Partial<ChatExportOptions>): import("../result").UnitResult<{
    markdown: string;
    wordCount: number;
    messageCount: number;
}>;
