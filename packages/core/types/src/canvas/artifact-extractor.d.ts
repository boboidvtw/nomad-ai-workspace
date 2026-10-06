/**
 * Supported artifact types
 */
export const ARTIFACT_TYPES: Readonly<{
    HTML: "html";
    SVG: "svg";
    MERMAID: "mermaid";
    CODE: "code";
    MARKDOWN: "markdown";
    REACT: "react";
}>;
/**
 * Extract artifacts from markdown or plain text
 * @param {string} text - Raw model response text
 * @param {Object} [options]
 * @param {string} [options.sourceSpeaker] - AI speaker (claude, chatgpt, etc.)
 * @returns {import('../result').UnitResult<Array<{ id: string, type: string, title: string, language: string, content: string, speaker: string, timestamp: string }>>}
 */
export function extractArtifacts(text: string, options?: {
    sourceSpeaker?: string | undefined;
}): import("../result").UnitResult<Array<{
    id: string;
    type: string;
    title: string;
    language: string;
    content: string;
    speaker: string;
    timestamp: string;
}>>;
/**
 * Generate a complete standalone HTML document for sandboxed rendering.
 * Accepts either an artifact object or (content, type, title) positional arguments.
 * @param {{ content: string, type: string, title?: string } | string} artifact
 * @param {string} [maybeType] - Artifact type when `artifact` is a content string
 * @param {string} [maybeTitle] - Artifact title when `artifact` is a content string
 * @returns {string} Fully self-contained HTML document
 */
export function generateSandboxHtml(artifact: {
    content: string;
    type: string;
    title?: string;
} | string, maybeType?: string, maybeTitle?: string): string;
