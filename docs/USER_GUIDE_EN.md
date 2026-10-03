<p align="right">
  <a href="USER_GUIDE.md">繁體中文</a> | <b>English</b>
</p>

# 📖 Nomad AI Workspace User Guide & Tutorial

Welcome to **Nomad AI Workspace**! A local-first, zero-trust browser enhancement suite purpose-built for intensive multi-AI users. This guide walks you through every core capability and power-user workflow step-by-step.

---

## 📑 Table of Contents

1. [Hierarchical Multi-AI Sidebar](#1-hierarchical-multi-ai-sidebar)
2. [Universal Prompt Manager & Nomad Super Orb](#2-universal-prompt-manager--nomad-super-orb)
3. [Keyboard Shortcuts & Vim Mode](#3-keyboard-shortcuts--vim-mode)
4. [Conversation Timeline & Highlights](#4-conversation-timeline--highlights)
5. [Rich Typography, Diagram Rendering & One-Click Export](#5-rich-typography-diagram-rendering--one-click-export)
6. [Cross-Platform Cloud Sync & Preferences](#6-cross-platform-cloud-sync--preferences)
7. [How to Reload After Updates](#7-how-to-reload-after-updates)

---

## 1. 🗂️ Hierarchical Multi-AI Sidebar

Nomad AI Workspace automatically mounts into the native web interfaces of your frontier AI platforms (**Google Gemini**, **Anthropic Claude**, **OpenAI ChatGPT**, and **xAI Grok**), delivering a unified cross-platform folder categorization tree.

### 1.1 Sidebar Expansion & Collapse
- At the top of each platform native sidebar, you will find the **Nomad Workspace** tree navigation header.
- Click the collapse toggle (`▶` / `▼`) next to each platform name to expand or collapse its conversation tree.
- Each supported platform is equipped with its official brand color badge and logo:
  - 🔵 **Google Gemini** (`#1a73e8` Classic Azure)
  - 🟠 **Anthropic Claude** (`#cc785c` Warm Terracotta)
  - 🟢 **OpenAI ChatGPT** (`#10a37f` Emerald Green)
  - ⚪ **xAI Grok** (`#1D9BF0` Sky Tech Blue)
  - 🟣 **DeepSeek** (`#4d6bfe` Indigo Blue — in planning)

### 1.2 Folder Creation & Nested Organization
1. **Create New Folders**:
   - Click the **"+"** button or **Add Folder** action in the folder manager header.
   - Enter a descriptive folder name (Emoji friendly, e.g. `💻 Architecture`, `📝 Research`, `🎨 UI Design`).
   - Assign custom color accents (Red, Orange, Yellow, Green, Blue, Purple, Zinc) for rapid visual scanning.
2. **Multi-Level Nested Tree**:
   - Organize complex projects into deep hierarchies by dragging subfolders inside parent folders.
3. **Drag-and-Drop Archiving**:
   - Hold and drag any conversation item from the native history list directly into a target folder.
   - Each conversation belongs to an organized category while retaining instant drag-and-drop relocation.

### 1.3 Zero-Latency Cross-Platform Navigation
- **In-Platform Switching**: Clicking a conversation from the active platform performs instant client-side SPA navigation without full page reloads.
- **Cross-Platform Jump**: Clicking a conversation belonging to another AI platform (indicated by the ↗️ external link icon) automatically opens or focuses that conversation in a dedicated browser tab.

### 1.4 xAI Grok (grok.com) Integration & Layout Guide
1. **Automatic Injection & Precise Sidebar Anchoring**:
   - Visiting [grok.com](https://grok.com/) automatically injects the tech-blue (`#1D9BF0`) **Nomad Folders** and **Nomad Workspace** tree into Grok native Shadcn sidebar, nestled neatly between "Projects" and "Chats".
   - The root DOM container is strictly isolated with fixed zero-dimension coordinates (`position: fixed; width: 0; height: 0; pointer-events: none;`), ensuring it never overflows, stretches across the top of the viewport, or pushes the Grok chat interface down.
2. **Conversation Archiving**:
   - Hovering over any conversation in Grok chat history reveals Nomad folder icon button. Click to assign to any folder, or use native HTML5 drag-and-drop.
3. **Cloud Backup & 4-Platform Sync**:
   - Click the ☁️ icon in the Nomad header to instantly upload Grok folder tree to Google Drive (`Nomad Workspace Data/Grok/grok-folders.json`).
   - Use the extension popup **Sync All Platforms** button to perform concurrent bidirectional sync across Gemini, Claude, ChatGPT, and Grok.
4. **Sidebar Collapse Coordination**:
   - Toggling Grok sidebar collapse button smoothly folds Nomad folders alongside the native navigation.

---

## 2. ⚡ Universal Prompt Manager & Nomad Super Orb

Prompts represent the crown jewels of high-leverage AI workflows. Nomad provides a universal, cross-platform prompt vault: craft a prompt once on Claude, and recall it instantly on Gemini, ChatGPT, or Grok.

### 2.1 Trigger Methods
- **Method A (Nomad Super Orb)**:
  - The flagship floating orb hovers in the bottom-right corner with concentric activity rings displaying 5-hour and 7-day quota usage countdowns.
  - Click the orb to summon the prompt manager overlay.
- **Method B (Composer Anchor Button)**:
  - Injected directly beside the native chat composer input.
- **Method C (Slash Command `/`)**:
  - Simply type `/` into any chat input to trigger live autocomplete.

### 2.2 Live Slash Command Matching (`/`)
1. Type `/` in the composer, followed by any keyword (e.g., `/code`, `/trans`, `/review`).
2. The dropdown immediately filters matching prompts from your personal library.
3. Use the **Up/Down arrow keys (`↑` / `↓`)** to navigate and press **`Enter`** to insert.
4. Press **`Esc`** at any time to dismiss the menu.

### 2.3 Dynamic Variable Templates (`{{variable}}`)
- Prompts support mustache template syntax: `{{variable_name}}`.
- **Example Prompt**:
  ```markdown
  Act as a senior {{role}}. Please analyze the following {{task_objective}}:
  {{content_to_analyze}}
  ```
- Selecting this prompt displays an interactive **Variable Fill-In Modal**, listing all required inputs with auto-focus.
- Click **Insert** to generate the finalized prompt directly into the chat input.

### 2.4 Tags & Pinning
- **Pinning (📌)**: Pin mission-critical prompts to always keep them at the top of your quick-recall list.
- **Tags (#)**: Organize templates with custom tags (e.g., `#dev`, `#writing`, `#audit`, `#reasoning`). Click any tag in the header filter bar for instant filtering.

---

## 3. ⌨️ Keyboard Shortcuts & Vim Mode

Nomad AI Workspace includes a full suite of keyboard shortcuts and optional Vim navigation.

### 3.1 Timeline Navigation Shortcuts
When browsing conversations (cursor outside text inputs):

| Shortcut | Description | Remarks |
| :--- | :--- | :--- |
| `j` | **Next Message** | Smoothly scrolls to the next response |
| `k` | **Previous Message** | Smoothly scrolls to the previous turn |
| `g` `g` | **First Message** | Double-press `g` to return to top |
| `G` `G` | **Latest Message** | Double-press `G` (or `Shift + g`) to scroll to the latest reply |

> 💡 **Input Protection**: When focused inside textareas, input fields, or during IME composition, single-key navigation is automatically suppressed to protect regular typing.

### 3.2 Submission & Editing Shortcuts
- **`Cmd + Enter` (macOS) / `Ctrl + Enter` (Windows/Linux)**:
  - Sends the message immediately. If images or files are actively uploading, Nomad waits until upload completion before dispatching, preventing blank messages.
- **`Shift + Enter`**: Inserts a newline inside the composer.
- **`Esc`**: Dismisses active modals, slash command menus, or leaves input focus.

### 3.3 Vim Input Mode
- Enable **"Chat Input Vim Mode"** in extension settings.
- Supports standard modal transitions:
  - `i` / `a`: Enter Insert mode.
  - `Esc`: Return to Normal mode.
  - Normal mode motions: `h`, `j`, `k`, `l`, `w`, `b`, `0`, `$`, and operators `dd`, `dw`, `x`.

---

## 4. ⏱️ Conversation Timeline & Highlights

Deep exploratory sessions often span dozens of turns. Nomad provides visual timeline navigation and highlight annotations.

### 4.1 Visual Timeline
- Minimalist visual dots along the screen margin represent each conversation turn.
- Hover over any dot to preview a tooltip summary of that turn prompt.
- Click any dot to smoothly teleport to that response.

### 4.2 Starred Bookmarks & Highlighter
- Every AI response features a micro-action toolbar:
  - ⭐ **Star Message**: Save crucial responses into your local starred vault.
  - 🖍️ **Text Highlighter**: Highlight selections inside AI responses with color-coded markers, backed up to Google Drive.
  - 📋 **Copy Markdown / Quote Reply**: Extract clean markdown or initiate targeted blockquotes.

---

## 5. 📊 Rich Typography, Diagram Rendering & One-Click Export

Nomad AI Workspace bundles client-side scientific typography and diagram visualization engines:

- **KaTeX / LaTeX Math**: Renders multi-line matrices, calculus derivations, and quantum equations with one-click LaTeX source copying.
- **Mermaid Diagrams**: Renders interactive Flowcharts, Sequence Diagrams, Gantt charts, Git Graphs, and C4 Architecture models in real-time.
- **WaveDrom Digital Timing**: Hardware engineer timing wave visualization directly in chat.
- **ECharts Interactive Visuals**: Automatically renders AI-generated JSON data as bar, line, and pie charts.
- **Versatile Export Formats**:
  - Export clean **Markdown (`.md`)** files stripped of DOM clutter.
  - One-click export to high-resolution **PNG images** or formatted **PDFs**.

---

## 6. ⚙️ Cross-Platform Cloud Sync & Preferences

Open the Nomad control center via the extension icon in your browser toolbar:

- **Google Drive 4-Platform Sync**:
  - Connect your personal Google account to enable physical subdirectory segregation:
    - `Nomad Workspace Data/Gemini/gemini-folders.json`
    - `Nomad Workspace Data/Claude/claude-folders.json`
    - `Nomad Workspace Data/ChatGPT/chatgpt-folders.json`
    - `Nomad Workspace Data/Grok/grok-folders.json`
  - Real-time 4-column dashboard displays exact upload and download timestamps for each platform.
- **Zero-Trust Privacy**:
  - Data synchronizes strictly between your local browser and your personal Google Drive via OAuth 2.0 without intermediary servers.
- **Appearance & Layout**:
  - Toggle between dark, light, or system themes.
  - Adjust sidebar width, line height, and bubble spacing.
- **Backup & Restore**:
  - Export a full standalone JSON backup file encompassing all 4 platforms, starred messages, and custom prompts at any time.

---


---

## 7. 🖥️ Nomad AI Studio Standalone Desktop Workstation

Beyond browser extensions, Nomad AI Workspace offers a native standalone desktop application built on Electron 40 — **Nomad AI Studio**, engineered for professionals requiring high-frequency multi-AI concurrent prompt dispatching and side-by-side comparison.

### 7.1 Dynamic Multi-View Layouts
Toggle between layouts or customize visible engines with header controls and chips:
- **Quad (4-Split Grid)**: Displays Claude, ChatGPT, Gemini, and Grok on a single screen simultaneously.
- **Triple (3-Column Split)**: Three equal columns for tripartite cross-checking.
- **Dual (2-Column Side-by-Side)**: Side-by-side comparison, supporting **4:6 / 5:5 / 6:4** split ratios.
- **Focus (Single Column)**: Full-width view dedicated to one AI engine for distraction-free deep work.
- **Dynamic Platform Chips**: Freely toggle Claude, ChatGPT, Gemini, and Grok chips on/off to customize active panels.

### 7.2 Independent Per-Platform Zoom Controls
- Click **"🔍 Zoom"** in the top bar to open the zoom control popover.
- Individually set zoom factor (50% ~ 200%) for Claude, ChatGPT, Gemini, and Grok.
- Provides `+`, `-` fine adjustments, **"Reset 100%"**, and **"Global Quick Zoom (85% / 100% / 115%)"**.
- Zoom preferences are automatically persisted locally.

### 7.3 Global Shortcut & System Tray Resident
- **⚡ Global Summon Shortcut**: Press `Cmd + Shift + Space` (Windows: `Ctrl + Shift + Space`) to summon or hide the workstation from any app or workspace.
- **🍎 System Tray Menu**: Resident icon in macOS Menu Bar and Windows System Tray with quick layout switching, zoom presets, launch at login, and quit options.
- **Background Resident**: Closing the window minimizes to tray, keeping your sessions alive.

### 7.4 Local Sync Bridge API
Built-in zero-dependency local HTTP RPC & SSE streaming bridge listening on `http://127.0.0.1:8765` (loopback only):
- **Health & Status**: `GET /api/status` (layout, active platforms, zoom factors, window state).
- **Remote Prompt Dispatch**: `POST /api/prompt` (`{"prompt": "...", "targets": ["claude", "chatgpt"]}`).
- **Remote Layout & Zoom**: `POST /api/layout`, `POST /api/zoom`.
- **Window Summon**: `POST /api/window` (`{"action": "show"}`).
- **Nomad Dashboard Integration**: Seamlessly monitored and triggered via Nomad Dashboard.

### 7.5 1-Click Concurrent Prompt Dispatcher
- **Unified Global Input Bar**: Persistent composer at the bottom of the workstation.
- **Target Selection**: Check or uncheck target AI engines (Claude, ChatGPT, Gemini, Grok — all selected by default).
- **Simultaneous Submission**: Press `Enter` (or click **"Dispatch All 🚀"**) to populate the prompt into all selected AI inputs and automatically trigger submission (use `Shift + Enter` for newlines).

### 7.3 Zero-Trust Security & Session Persistence
- **Local Isolated Storage**: All cookies and authentication credentials are saved locally in `~/Library/Application Support/nomad-desktop`.
- **Persistent Logins**: Log in once to each AI service; sessions persist across application restarts.
- **Direct Official Connection**: All traffic routes directly to official AI endpoints via TLS with zero proxy or intermediary telemetry servers.

### 7.4 Installation & Quick Launch
- **Official GitHub Releases Multi-Platform Packages**:
  - Visit the [GitHub Releases Latest Page](https://github.com/boboidvtw/nomad-ai-workspace/releases/latest) to download binaries for your OS:
    - 🍏 **macOS**: Download `Nomad-AI-Studio-1.3.0-arm64.dmg` and drag into Applications (or use the portable zip).
    - 🪟 **Windows**: Download `Nomad-AI-Studio-Setup-1.3.0.exe` and double-click to install.
    - 🐧 **Linux**: Download `Nomad-AI-Studio-1.3.0.AppImage` (chmod +x to run) or the `.deb` package.
- **Local Pre-installed App**: Available in `/Applications/Nomad AI Studio.app` and on your Desktop.
- **Command Line Launch**:
  ```bash
  npm run desktop
  ```
  For development with DevTools enabled, run `npm run desktop:dev`.

---

## 8. 🔄 How to Reload After Updates

1. Open Chrome extension management page at `chrome://extensions/`.
2. Locate **Nomad AI Workspace** and click the **Reload (🔄)** icon in the bottom-right corner.
3. Refresh [grok.com](https://grok.com/), [claude.ai](https://claude.ai/), [chatgpt.com](https://chatgpt.com/), or [gemini.google.com](https://gemini.google.com/).
4. Enjoy a seamless, unified multi-AI workspace experience!
