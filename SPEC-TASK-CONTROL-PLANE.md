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

| Mod | Responsibility                | Dependencies   | Order |
| :-- | :---------------------------- | :------------- | :---- |
| M1  | Task entity & state machine   | Core Result    | 1     |
| M2  | Agent roster & skill profiles | Core Result    | 2     |
| M3  | Dispatcher, locks & heartbeat | M1, M2         | 3     |
| M4  | Approval gates & review queue | M1, M3         | 4     |
| M5  | Runner, artifacts & execution | M1, M2, M3, M4 | 5     |
| M6  | Daemon REST endpoints         | M1-M5          | 6     |
| M7  | Desktop Bridge & IPC Handlers | M1-M6          | 7     |
| M8  | Visual Kanban & Task UI       | M7             | 8     |

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

## 6. Schedule Calendar & Shipping Lifecycle (2026-11-04)

### 6.1 Schedule calendar

`buildScheduleCalendar` (`packages/core/src/tasks/schedule-calendar.js`) turns schedules into day buckets without running the scheduler loop:

- **Planned**: occurrences start at `max(nextRunAt, now)`, because an overdue schedule fires on the next poll, then repeat every `intervalMs`. Disabled schedules have no plan. `cronExpr` is stored but never evaluated by the scheduler, so the calendar ignores it too.
- **Ran**: tasks whose `metadata.triggeredByScheduleId` names the schedule, counted per status.
- **Extras**: dated entries from other modules (shipping readbacks and targets).
- Days are keyed in the viewer's IANA `timeZone` (DST-aware), or by `tzOffsetMinutes` (`Date#getTimezoneOffset()`, within ±1440) when no zone is given; a range covers at most 62 days and each schedule at most 100,000 occurrences (`truncated` lists the ones cut).

### 6.2 Shipping lifecycle (borrowed from Cumora SHIPPING.md, MIT)

`ShippingLedger` (`packages/core/src/shipping/`) owns every gate; the routes and the Dashboard cannot bypass it. Gate contents and side rules are listed in USER_GUIDE §7.14. Local adaptations:

| Cumora                                                        | Nomad                                                                      |
| :------------------------------------------------------------ | :------------------------------------------------------------------------- |
| Postgres constraints for builder/verifier separation          | checked in `updateSquare` and `planRelease`                                |
| Staging/canary/production releases, digest-pinned GKE rollout | one release plan + smoke check per feature                                 |
| Multi-replica maintenance worker for overdue readbacks        | `markOverdue` on a 60 s timer in the daemon and the Studio                 |
| Agents run `cumora ship ...` commands from their prompt       | not ported; agents settle squares through linked tasks and the review gate |
| Tenant-owned links validated server side                      | single user; square `covers` must name the feature's invariants            |

**Review gate link**: `TaskDispatcher` `onTaskEvent` forwards `task:approved` / `task:rejected` to `ShippingLedger.onTaskEvent`. A linked square passes (approved) or fails (rejected) with the reviewer and feedback as evidence; an approval by one of the feature's builders is refused and logged as `task-link-refused`.

**Gates are cumulative**: the gate into a state re-runs every earlier gate, the builder list freezes at building, and squares cannot be added once ready, so a later edit cannot slip past a passed gate.

**Separation is advisory**: the caller states `actor`, and the machine has one API token, so builder/verifier separation catches mistakes rather than enforcing access. An approval must be recorded by the approver (`approvedBy` equals the caller's actor).

**Two writers**: the daemon and the Studio each hold a ledger on `~/.nomad/shipping.json`. Every entry point reloads the file when its mtime differs from the one this process last wrote (taken with `fstat` before the rename) or read. Writes are atomic (temp file + rename); two writes within the same instant can still race, which is acceptable for one person. An unreadable file is copied to `shipping.json.corrupt-<ms>` before the next write replaces it; failed writes return `SHIPPING_STORAGE_FAILED_008`.

---

## 5. Verification & Acceptance Criteria

1. **Core Unit Tests**: 100% test pass for task creation, state transitions, lease acquisition, heartbeat timeout, dependency blocking, approval gate, and execution flow.
2. **Daemon Integration Tests**: All `/api/tasks` and `/api/roster` REST endpoints pass end-to-end HTTP tests.
3. **Desktop Bridge Tests**: Local Sync Bridge correctly handles task creation, dispatching, and status retrieval.
4. **Visual UI**: Dashboard contains a fully styled, functional Kanban task board with agent roster cards and approval modals.
5. **No Regressions**: All 74 existing Monorepo tests continue to pass 100% green.
