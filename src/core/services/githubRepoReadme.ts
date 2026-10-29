/**
 * README committed to a new sync repo, so people and AI tools that read the
 * repo (Claude Code, Codex, Gemini CLI, ChatGPT / Claude GitHub connectors)
 * know what each file holds and how to edit it safely.
 */
export const GITHUB_SYNC_README_PATH = 'README.md';

export const GITHUB_SYNC_README = `# Nomad AI Workspace sync data

This private repository is written by the Nomad AI Workspace extension.
Every sync that changes a file is one commit, so \`git log\` is the version
history and any earlier version can be restored with git.

## Layout

| Path | Contents |
|------|----------|
| \`gemini-voyager-folders.json\` | Gemini folder tree and conversation membership |
| \`gemini-voyager-aistudio-folders.json\` | AI Studio folder tree |
| \`gemini-voyager-prompts*.json\` | Prompt library (\`items\`) |
| \`gemini-voyager-starred*.json\` | Starred messages |
| \`gemini-voyager-settings.json\`, \`gemini-voyager-plugins.json\` | Settings and plugin state |
| \`gemini-voyager-forks*.json\`, \`gemini-voyager-timeline-hierarchy*.json\`, \`gemini-voyager-highlights*.json\` | Fork nodes, timeline hierarchy, highlights |
| \`Claude/claude-folders.json\` | Claude folders (\`data\`) |
| \`ChatGPT/chatgpt-folders.json\` | ChatGPT folders (\`data\`) |
| \`Gemini/gemini-folders.json\` | Gemini folders for "Sync all" (\`data\`) |
| \`Grok/grok-folders.json\` | Grok folders (\`data\`) |
| \`Shared/sync-tombstones.json\` | Deletion marks: item id → deletion time (ms) |

Files whose name contains \`.acct-<hash>\` belong to one signed-in account.

## Editing by hand or with an AI tool

- Keep the JSON valid and keep the outer \`format\` / \`version\` fields.
- To change an item, edit it and raise its \`updatedAt\` (milliseconds since
  epoch) so it wins over older copies on other devices.
- To delete an item, remove it **and** add its id to
  \`Shared/sync-tombstones.json\` under the matching dataset, with the current
  time. Without the mark another device's next merge brings it back.
  Ids: \`folder:<id>\`, \`conv:<folderId>/<conversationId>\`, \`prompt:<id>\`,
  \`star:<conversationId>/<turnId>\`.
- The extension picks up changes on the next "Restore from cloud (merge)" or
  "Sync all".
`;
