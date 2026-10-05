# SPEC-TASK-CONTROL-PLANE: Nomad Native Agent Task Management & Dispatching Engine

## 1. Problem Statement & Motivation
Users need Paperclip's core capability—**"管理和分派任務給多個 Agent" (Manage & Dispatch Tasks to Multiple Agents)**—integrated natively into **Nomad AI Studio**. 
Existing Nomad AI Studio capabilities (`MultiAiOrchestrator`) focus on immediate chat-layer interactions (DOM prompt injection, relay, debate). It lacks asynchronous ticket-driven task management, atomic check-out locks (heartbeat leases), role-based agent rosters (Org Roster), human-in-the-loop approval gates, and artifact tracking.
By adopting **方案 A 原生整合 (Native In-Process Integration)**, Nomad AI Studio gains a native, lightweight, zero-external-database Task Control Plane inside `@nomad/core`, fully exposed through `@nomad/daemon` and visualized in `@nomad/desktop`.

---

## 2. Assumptions
**ASSUMPTIONS I'M MAKING:**
1. **Zero External Database**: In-memory state with JSON file persistence (`~/.nomad-tasks.json` or within `store.js`), eliminating heavy PostgreSQL/Docker requirements.
2. **Multi-Platform Agent Affinity**: Agents in the roster can target both Webview platforms (`claude`, `chatgpt`, `gemini`, `grok`) and local models (`local-model` via Port 1234 LM Studio).
3. **Atomic Contract Compliance**: All functions adhere to `AGENTS.md` Section 6 Result Pattern (`{ success: true, data } | { success: false, error: { code, message } }`) and namespaced error codes.
4. **Execution Dual Mode**: Tasks can be executed interactively via Desktop webviews or programmatically in background via local model client or mock runners.

---

## 3. Capability Map & Build Order

```
[M1: Task Model] ───► [M3: Dispatcher & Lease] ───► [M5: Task Runner] ───► [M6: Daemon API]
         ▲                     ▲                          ▲                    ▲
         │                     │                          │                    │
[M2: Agent Roster] ────────────┘                          │                    │
                                                          │                    │
[M4: Approval Gate] ──────────────────────────────────────┘                    │
                                                                               │
[M7: Desktop Bridge & IPC] ◄───────────────────────────────────────────────────┘
         │
         ▼
[M8: Visual Dispatcher Board (HUD & Dashboard)]
```

| Mod | Responsibility                 | Dependencies   | Order |
| :-- | :----------------------------- | :------------- | :---- |
| M1  | Task entity & state machine    | Core Result    | 1     |
| M2  | Agent roster & skill profiles  | Core Result    | 2     |
| M3  | Dispatcher, locks & heartbeat  | M1, M2         | 3     |
| M4  | Approval gates & review queue  | M1, M3         | 4     |
| M5  | Runner, artifacts & execution  | M1, M2, M3, M4 | 5     |
| M6  | Daemon REST endpoints          | M1-M5          | 6     |
| M7  | Desktop Bridge & IPC Handlers  | M1-M6          | 7     |
| M8  | Visual Kanban & Task UI        | M7             | 8     |

---

## 4. State Machine & Lifecycle Transitions

```
[todo] ──(claim/dispatch)──► [in_progress] ──(submit_review)──► [review]
  │                                │                              │   │
  │                                ├──(complete)──► [completed]   │   │
  │                                │                              │   │
  │                                └──(fail)──────► [failed]      │   │
  │                                                               │   │
  │                                  (approve) ───────────────────┘   │
  │                                  (reject + feedback) ─────────────┘
  └──(cancel)──► [cancelled]
```

---

## 5. Verification & Acceptance Criteria
1. **Core Unit Tests**: 100% test pass for task creation, state transitions, lease acquisition, heartbeat timeout, dependency blocking, approval gate, and execution flow.
2. **Daemon Integration Tests**: All `/api/tasks` and `/api/roster` REST endpoints pass end-to-end HTTP tests.
3. **Desktop Bridge Tests**: Local Sync Bridge correctly handles task creation, dispatching, and status retrieval.
4. **Visual UI**: Dashboard contains a fully styled, functional Kanban task board with agent roster cards and approval modals.
5. **No Regressions**: All 74 existing Monorepo tests continue to pass 100% green.
