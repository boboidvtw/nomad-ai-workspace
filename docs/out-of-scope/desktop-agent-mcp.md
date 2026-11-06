# Switching the Desktop Agent to `agent-desktop mcp`

**Decision (2026-11-06):** The Desktop Agent keeps calling the `agent-desktop` CLI with its own
four-tool loop (`snapshot`, `click`, `type`, `done`). It does not switch to `agent-desktop mcp`.

## Why

- `agent-desktop mcp` (server 1.2.0, checked 2026-11-06) exposes 67 tools, including
  `desktop_launch`, `desktop_close_app`, `desktop_press`, `desktop_key_down`, `desktop_drag`,
  `desktop_clipboard_set` and window move/resize. Our safety rule is that a local model can only
  read, click and type; using the MCP server would need a filtering proxy that re-implements
  today's whitelist, so nothing is saved.
- 67 tool schemas cost thousands of prompt tokens on every step. The local 27B model already
  needs 10–30 seconds per step and loses track of long tasks.
- The CLI path is covered by unit tests that fake `agent-desktop`; an MCP session adds a
  long-lived child process whose refs and sessions must be managed.

## Reconsider when

- `agent-desktop mcp` can start with a tool allow-list (so the whitelist lives in the server), or
- the loop needs a command the CLI does not offer one call at a time (for example `batch`), or
- the local model handles large tool lists reliably.
