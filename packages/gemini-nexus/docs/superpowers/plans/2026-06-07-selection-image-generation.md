# Selection Image Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add one-click image generation from selected text in the floating selection toolbar.

**Architecture:** Extend the existing selection toolbar rather than introducing a new UI surface. The new button dispatches a `generate_image` action to `ToolbarActions`, which builds a dedicated text-to-image prompt and sends it through the existing `QUICK_ASK` streaming/rendering path.

**Tech Stack:** Plain JavaScript content scripts, Chrome extension runtime messaging, Vitest/JSDOM tests.

---

### Task 1: Add Selection Toolbar Entry

**Files:**

- Modify: `content/toolbar/templates.js`
- Modify: `content/toolbar/view/index.js`
- Modify: `content/toolbar/events.js`
- Test: `content/toolbar/templates.test.js`
- Test: `content/toolbar/events.test.js`

- [x] Write failing tests that expect `#btn-generate-image` to render and dispatch `generate_image`.
- [x] Add the button to the selection toolbar using an icon-only control with localized title text.
- [x] Cache the button and bind it through `TOOLBAR_ACTIONS`.
- [x] Run the targeted template and event tests.

### Task 2: Add Generation Action

**Files:**

- Modify: `content/toolbar/actions.js`
- Modify: `content/toolbar/dispatch.js`
- Test: `content/toolbar/actions.test.js`
- Test: `content/toolbar/dispatch.test.js`

- [x] Write failing tests that expect selected text to route to `handleGenerateImage`.
- [x] Build a text-to-image prompt from selected text and send `QUICK_ASK` with the selected provider/model.
- [x] Show the ask window, loading state, and input label immediately.
- [x] Run the targeted action and dispatcher tests.

### Task 3: Add Localized Strings

**Files:**

- Modify: `content/toolbar/i18n.js`

- [x] Add Chinese and English labels, titles, inputs, loading text, and prompt builder.
- [x] Run targeted toolbar tests and the project format check.
