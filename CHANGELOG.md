# 📝 版本變更日誌 (Changelog)

本專案遵循 [Semantic Versioning 2.0.0](https://semver.org/) 規範，並以 [Keep a Changelog](https://keepachangelog.com/) 格式維護版本變更。

---

## [Unreleased]

### 🔒 安全性 (Security)
- **Daemon (:8765) 與 Studio Bridge 本地閘道驗證**：所有 `/api/*` 端點改為需要 Bearer Token（`Authorization: Bearer`、`X-Nomad-Token` 或 SSE 用的 `?token=`）。Token 首次啟動時產生於 `~/.nomad/daemon-token`（權限 0600），可用 `NOMAD_DAEMON_TOKEN` / `NOMAD_DAEMON_TOKEN_FILE` 覆寫。
- **移除 `Access-Control-Allow-Origin: *`**：僅反射 loopback 來源（`127.0.0.1` / `localhost` / `[::1]`），外部網站來源一律 403，杜絕任意網頁跨站呼叫本地 API。
- **DNS Rebinding 防護**：檢查 `Host` 標頭，非 loopback 主機名稱一律拒絕。
- **Local Model SSRF 防護**：`/api/local-model/probe|chat` 的 `host` / `endpoint` 參數限制為 loopback 位址。
- Dashboard 由閘道提供時自動注入 Token，`fetch` / `EventSource` 呼叫無需修改；`/api/probe` 與 `/dashboard` 維持免驗證。
- 命令列呼叫範例：`curl -H "Authorization: Bearer $(cat ~/.nomad/daemon-token)" http://127.0.0.1:8765/api/status`

### 🐛 修復 (Fixed)
- **Dashboard 任務看板整段腳本無法執行**：43 行 HTML 字串遺失跳脫字元（`\'` / `\"`）導致 SyntaxError，任務卡片、詳情 Modal 與排程清單全部失效；新增 inline script 語法回歸測試。

- **Desktop Bridge 任務 API 全部 500**：`GET /api/tasks` 等 3 條路由使用未定義的 `url` 變數，桌面版獨立模式的任務看板無法載入。
- **Daemon `/api/local-model/chat` 永遠 500**：呼叫了不存在的 `client.chat()`（應為 `chatCompletion()`）；`LocalModelClient` 也忽略呼叫端傳入的 `host` / `port`，現在會依此組出 endpoint。
- **Desktop 抽屜切換 `ReferenceError`**：`onToggleDrawer` 使用未宣告的 `drawerOpen` 變數。
- **指派給 local-model（LM Studio）Agent 的任務一律失敗**：`TaskRunner` 呼叫不存在的 `localModelClient.chat()`（應為 `chatCompletion()`），token 數也讀錯欄位。
- **桌面版指派給網頁版 AI（Claude、ChatGPT…）的任務一律失敗**：Bridge 以 `(platform, prompt)` 呼叫 `onDispatchPrompt`，但 main.js 預期 `{ prompt, targets }`，導致 `targets.join` 丟出 `TypeError`。
- **桌面版 IPC 在 SessionManager 初始化前被呼叫時崩潰**：drive-sync push / pull 改為回傳 `SESSION_MANAGER_NOT_READY`。
- **以 `{ text }` 物件派發提示詞時，網頁版 AI 收到 `[object Object]`**；工作區摘要更新誤寫入不存在的 `prompt` 欄位（應為 `promptSnippet`）。
- **空的 Agent 名單時 `findBestAgentForSkills` 回傳空物件**：改為回傳 `ROSTER_AGENT_NOT_FOUND_001`。
- **CLI `nomad-daemon probe` 失敗時崩潰**、`/api/status` 在探測失敗時回傳 `microservices: undefined`。
- **根目錄 4 個失敗測試**：上游 Voyager 的 CI / release 測試改為依其實際讀取的檔案（`pr-gate.yml`、`release.yml`、`deploy-docs.yml`、`sponsors.yml`）決定是否執行，不再因本專案有自己的 `.github/workflows` 而誤跑；腳本邏輯測試照常執行。

### ♻️ 重構 (Changed)
- **`@nomad/core` 型別合約改為自動產生**：移除漂移嚴重的手寫 `index.d.ts`（59 個 export 中 24 個、67 個錯誤碼中 29 個缺漏），改以 JS 原始碼的 JSDoc 為唯一來源，由 `tsc` 產生 `packages/core/types/`。daemon、desktop、dashboard 以 `checkJs` + `strictNullChecks` 對其做型別檢查；CI 新增 `typecheck:packages` 與 `types:check`（產生結果與 commit 內容不一致即失敗）。
- **Dashboard 單一來源**：移除 `packages/desktop/src/dashboard-fallback.html` 重複副本與兩份重複的 static handler，Daemon 與 Desktop Bridge 統一透過 `@nomad/dashboard` 套件（`serveDashboard` / `findDashboardPath`）提供頁面；Electron 打包時隨 `node_modules/@nomad` 一併收錄。

- **統一使用 npm 作為套件管理器**：`packageManager` 由 `bun@1.3.12` 改為 `npm@11.19.1`（與 lockfile、CI、文件一致；electron-builder 打包亦改以 npm 解析 workspace 依賴）。原本以 bun 執行的 npm scripts 改用 `node` / `npm run`，TS 維護腳本（`plugin:check`、`plugin:new`、`catalog:build`）改用新增的 `tsx` devDependency 執行；僅 `verify:katex-export`（使用 `Bun.build`）仍需 Bun。移除子套件中無效的 `desktop/package-lock.json`、`gemini-nexus/package-lock.json`、`claude-voyager/yarn.lock`。

- **型別檢查收緊為 `strict`**：`@nomad/core`、`@nomad/daemon`、`@nomad/dashboard`、desktop 全部開啟完整 `strict`（含 `noImplicitAny`）；desktop 新增 `Workspace`、`WorkspaceTurn`、`PromptAttachment`、`OrchestrationTurn` 等型別。新增 `Task`、`Agent`、`Schedule`、`ServiceProbeResult` 等實體型別，產生的型別中 `any` 由 92 處降至 5 處、`Object` 清零。
- **微服務探針單一來源**：`packages/daemon/src/prober.js` 與 `packages/desktop/src/prober.js` 兩份完全相同的副本合併為 `@nomad/core` 的 `probePort` / `probeAllServices`；`@nomad/daemon` 對外的同名 export 不變（改由 core 轉出）。

### 🗑️ 移除 (Removed)
- **`packages/gemini-voyager` 上游快照**：此為上游 Voyager v1.9.0（+17 commits）的未修改快照，根目錄 `src/` 已是其超集且無任何建置 / 測試使用（35MB、1688 檔、約 33 萬行）。改以 `voyager-upstream` git remote 追蹤上游，同步方式見 `docs/ARCHITECTURE.md`；subtree 匯入歷史仍保留於 git log。
- **根目錄 vitest 不再掃描 `.claude/**`**：該處的 agent / 編輯器 worktree 是整份 repo 的副本，會被重複收集而產生假失敗。
- **根目錄 vitest 不再掃描 `packages/**`**：子套件各有自己的測試執行器，先前被根目錄 vitest 誤收而產生 76 個假失敗檔案。

---

## [1.4.0] - 2026-10-03

### 🤖 專案里程碑：對話紀錄全文檢索與語義標籤過濾、ChatGPT 專注模式預設與 macOS 原生透明選單列圖標 (Full-Text Search, Focus Startup & macOS Transparent Tray)
全新推出工作區歷史對話內容全文搜尋與 8 大工程語義標籤過濾系統，預設啟用 ChatGPT 單欄專注模式並採用延遲載入技術顯著降低系統開銷，並重構 macOS 狀態列圖標符合 Apple HIG 模板遮罩規範。

### 🚀 新增功能 (Added)
- **對話紀錄全文檢索與標籤多維度過濾系統 (`SessionManager.searchWorkspaces`)**：
  - **即時模糊全文搜尋**：支援對話標題、正文歷史訊息、使用者問答與標籤的即時不分大小寫全文比對。
  - **8 大工程語義標籤過濾**：嚴格對齊工程分類標準（`功能`, `修復`, `設計`, `優化`, `文件`, `探索`, `研究`, `發布`），支援快速點擊按鈕多選篩選與會話計數徽章。
  - **高亮匹配與計數反饋**：搜尋欄即時呈現搜尋匹配筆數與無結果友善指引。
- **ChatGPT 預設第一主頁面與單欄專注低負載啟動 (`Focus Mode & Lazy Loading`)**：
  - 應用程式啟動時預設以 **ChatGPT 單欄專注 (Focus)** 模式呈現，避免一次性初始化四大引擎造成的記憶體與 CPU 突波。
  - 其他平台（Claude、Gemini、Grok）實施**延遲按需載入 (Lazy Loading)**，於使用者主動切換版面時才平滑喚醒，啟動時間與資源消耗減少超過 60%。
- **macOS 選單列原生透明鏤空羅盤圖標與 Retina @2x 支援 (`trayTemplate.png`)**：
  - 採用 Apple Human Interface Guidelines 規範的 `trayTemplate.png` (22×22 pt) 與 `trayTemplate@2x.png` (44×44 px)。
  - 徹底解決原先 100% 不透明點陣圖被 macOS 反白為實心純白色塊（■）的缺陷，支援深色模式與淺色模式自動反色與平滑抗鋸齒。
  - 自動納入 `electron-builder` 的打包資源配置，確保發布版本完備無缺。

---

## [1.3.0] - 2026-10-03

### 🤖 專案里程碑：Nomad AI Studio 獨立桌面超級工作站與四大 AI 同屏同步提問 (Nomad AI Studio Workstation & 4-AI Prompt Sync)
全新推出基於 Electron 40 的獨立桌面端（`packages/desktop`），正式實現 Google Gemini、Anthropic Claude、OpenAI ChatGPT 與 xAI Grok 四大 AI 的全螢幕同屏聚合工作台與跨平台一鍵並發同步提問。

### 🚀 新增功能 (Added)
- **Nomad AI Studio 獨立桌面超級工作站 (`packages/desktop`)**：
  - 基於 Electron 40 與現代 `WebContentsView` 構建高性能同屏聚合工作站，打破多標籤頁手動切換的認知負擔。
  - **動態多視窗版面**：支援 Quad（四分割九宮格對比）、Dual（雙欄並排對話）與 Focus（單欄專注）三大版面秒級無縫切換。
  - **跨 AI 一鍵並發同步提問 (Concurrent Prompt Dispatcher)**：底部全域統一輸入框，選取目標 AI 引擎（預設全選），一鍵將同一題目同步派發並自動觸發提交。
  - **四大 AI 專屬注入適配器 (Platform Injector Pipeline)**：
    - **Claude**：ProseMirror 富文本游標定位與發送按鈕觸發。
    - **ChatGPT**：`#prompt-textarea` 聚焦、PointerEvent/MouseEvent 組合事件序列與 Enter 鍵發送。
    - **Google Gemini**：突破 Google CSP **Trusted Types (`TrustedHTML`)** 限制，全原生 DOM 節點工廠安全注入；精確鎖定 Quill `<p>` 游標，配合 Angular 變更檢測階梯式重試（150ms/400ms/700ms）。
    - **xAI Grok**：適配繁中語系 Placeholder、多面積可視區域智能鎖定主輸入框，調用 React 18 原生原型鏈 Setter（`HTMLTextAreaElement.prototype.value`）與 `setRangeText`，支援 Form `requestSubmit` 與動態 Lucide 發送箭頭按鈕點擊。
  - **零信任本地會話持久化**：獨立本地 Session 存儲於 `~/Library/Application Support/nomad-desktop`，一次登入永久保持，完全無中繼伺服器介入。
  - **macOS 原生應用程式與 Retina 圖示**：已安裝雙重本地原生 App（`/Applications/Nomad AI Studio.app` 及 `~/Desktop/Nomad AI Studio.app`），並可於專案根目錄執行 `npm run desktop` 或 `npm run desktop:dev` 開發模式。

---

## [1.2.0] - 2026-10-02

### 🤖 專案里程碑：xAI Grok 官方深度適配與四大 AI 雲端同步中樞 (Grok Platform Support & 4-Platform Sync)
正式將 xAI Grok (`grok.com` / `x.com/i/grok`) 納入一級旗艦核心支援平台，達成 Google Gemini、Anthropic Claude、OpenAI ChatGPT 與 xAI Grok 四大 AI 的全方位階層樹狀管理與 Google Drive 雲端雙向同步。

### 🚀 新增功能 (Added)
- **xAI Grok 專屬側邊欄資料夾管理中樞 (`GrokFolderManager`)**：
  - 自動偵測並掛載於 Grok 官方歷史紀錄導航欄頂端，支援新增資料夾、重命名、刪除與樹狀展開。
  - 對話列表項目自動注入專屬科技藍 (`#1D9BF0`) 資料夾歸檔按鈕，並支援 HTML5 原生拖曳（Drag-and-Drop）歸檔。
  - 自動攔截 Grok SPA 路由切換（`popstate` / `pushState` / `replaceState`）與 `/chat/` / `/c/` 對話識別碼解析。
- **Grok 專屬科技藍 Nomad Super Orb (`GrokFloatBall`)**：
  - 於 Grok 頁面掛載科技藍浮動中樞，支援任意拖曳位置記憶與輸入框自適應錨定。
  - 整合通用提示詞庫中樞與 `/` 斜線命令動態變數填寫。
- **Multi-AI 跨平台總覽樹正式支援 Grok (`MultiAISidebarTree`)**：
  - 將 Grok 節點由規劃中正式升格為實時動態樹狀節點，即時統計 Grok 歸檔會話數量。
  - 支援同平台快速跳轉與跨分頁跳轉喚起。
- **Google Drive 四大平台雲端雙向同步中樞 (`GoogleDriveSyncService`)**：
  - 實作 Grok 獨立子目錄隔離同步：`Nomad Workspace Data/Grok/grok-folders.json`。
  - 新增 `nomad.sync.uploadGrok` 與 `nomad.sync.downloadGrok` 背景通訊端點。
  - 升級 `nomad.sync.syncAll` 總控路由，實現四大平台（Gemini / Claude / ChatGPT / Grok）雲端資料並行下載與合併。
  - 在 Options / Popup 雲端同步設定介面打造 4 欄位即時狀態總覽儀表板，獨立呈現各平台最新上傳與下載時間戳。
- **品質加固與排版修復 (Quality & Bug Fixes)**：
  - **Grok 側邊欄排版防腐與佈局隔離加固 (Grok Sidebar Layout Stabilization)**：
    - 修復 `GrokFolderManager` 在側邊欄尚未就緒時回退渲染至 `document.body` 導致頁面頂部 100% 寬度橫幅錯位的問題，建立嚴格 `if (!portalContainer) return null;` 門禁防線。
    - 升級 `findGrokNav` 支援 Shadcn UI 核心架構（`[data-sidebar="sidebar"]`、`[data-sidebar="content"]`）與多語言側邊欄語意標籤偵測（`聊天`、`Chats`、`對話`、`專案`）。
    - 增加 `offsetWidth <= 420px` 側邊欄寬度嚴格約束，排除任何全幅頂部導航列被誤判為注入錨點。
    - 精確錨定於 Grok 側邊欄「聊天 (Chats)」列表正上方，與上方「專案」及下方「歷史對話」自然無縫嵌合。
    - 在 `grok/style.css` 中將 `#nomad-grok-root` 設置為 `position: fixed; width: 0; height: 0; pointer-events: none; overflow: visible;`，徹底物理隔離，杜絕任何主畫面版面流擠壓。
  - 修正 `GoogleDriveSyncService` 中 ChatGPT 與 Gemini 上傳時狀態時間戳寫入的 key 鍵值問題。
  - 增補 Grok 專屬單元測試與雙向合併測試，全專案 416 個測試檔案（4,130 項測試 100% 通過）。

---

## [1.1.0] - 2026-10-01

### 🤖 專案里程碑：OpenAI ChatGPT 官方深度適配 (ChatGPT Platform Support)
正式將 OpenAI ChatGPT (`chatgpt.com` / `chat.openai.com`) 升級為 Nomad AI Workspace 的一級核心支援平台，達成 Gemini、Claude、ChatGPT 三大主流 AI 的無界遊牧體驗。

### 🚀 新增功能 (Added)
- **ChatGPT 側邊欄樹狀資料夾 (`ChatGPTFolderManager`)**：
  - 支援在 ChatGPT 官方歷史導航欄掛載 Nomad 資料夾系統，支援建立、命名、刪除與層級展開。
  - 對話列表項目自動注入歸檔按鈕，並全面支援 HTML5 原生拖曳（Drag-and-Drop）歸檔。
  - 自動偵測系統與頁面深色/淺色主題 (`html.dark`)。
- **ChatGPT 專屬翡翠綠 Nomad Super Orb (`ChatGPTFloatBall`)**：
  - 右下角懸浮中樞採用 OpenAI 官方翡翠綠微光 (`#10A37F`)，支援任意拖曳位置記憶。
  - 左鍵一鍵喚起通用提示詞庫中樞與 `/` 斜線命令。
  - 右鍵或設定鈕展開多平台工作空間總覽彈窗。
- **Multi-AI 總覽樹實時聯動 (`MultiAISidebarTree`)**：
  - ChatGPT 節點由展示佔位符正式升級為實時動態樹狀節點。
  - 顯示當前歸檔對話統計、即時折疊/展開，並於 ChatGPT 頁面自動顯示「目前」標籤。
- **Google Drive 雲端同步擴充 (`GoogleDriveSyncService`)**：
  - 支援將 ChatGPT 資料夾同步至 Google Drive `Nomad Workspace Data/ChatGPT/chatgpt-folders.json`。
  - 新增 `nomad.sync.uploadChatGPT` 與 `nomad.sync.downloadChatGPT` 背景通訊端點。

---

## [1.0.0] - 2026-09-30

### 🧭 專案里程碑：Nomad AI Workspace 正式發布 (Official Release)
首個正式全方位跨 AI 平台增強套件，無縫整合 Google Gemini、Anthropic Claude、OpenAI ChatGPT 與 xAI Grok，落實「遊牧無界，安全歸巢 (Roam Freely, Nest Safely)」的本地優先哲學。

### 🚀 新增功能 (Added)
- **多 AI 階層側邊欄樹狀視圖 (`MultiAISidebarTree`)**：
  - 支援在 Gemini 與 Claude 官方頁面中掛載跨平台樹狀視圖。
  - 具備各平台官方代表色彩徽章（Gemini 藍、Claude 赤銅、ChatGPT 綠、Grok 天藍、DeepSeek 靛藍）。
  - 支援資料夾自訂顏色、多層巢狀階層以及對話拖曳歸檔。
  - 支援同平台 SPA 無刷新快速跳轉與跨平台帶標籤（↗️）新分頁一鍵導航。
- **Google Drive 方案 A 實體子目錄分離備份 (`GoogleDriveSyncService`)**：
  - 建立專屬雲端根目錄 `Nomad Workspace Data/`。
  - 實作實體子目錄分區隔離：`Gemini/`、`Claude/`、`ChatGPT/`、`Shared/`。
  - 支援單一 OAuth 2.0 Client ID 跨端雙向同步，徹底解決多標籤頁併發寫入覆蓋問題。
  - 提供「智能合併 (Merge)」與「覆蓋還原 (Overwrite)」雙重同步機制。
  - 支援自訂 Google Cloud OAuth Client ID，達成零信任隱私與私有直連。
- **跨平台通用提示詞庫 (Universal Prompt Manager)**：
  - 內建輸入框 `/` 斜線命令觸發器 (Slash Prompts)，即時模糊搜尋提示詞。
  - 支援動態模板變數填寫彈窗 (`{{變數名稱}}`)。
  - 支援提示詞置頂釘選 (Pinning)、星標收藏與多標籤分類 (Tags)。
  - 整合單一多功能浮動球 **Nomad Super Orb**，一鍵喚起提示詞面板與工具列。
- **對話時間軸與極速快捷鍵 (Timeline & Shortcuts)**：
  - 內建 Vim 風格單鍵導航：`j`（下一輪）、`k`（上一輪）、`gg`（開頭）、`GG`（結尾）。
  - 對話發送防呆：`Cmd/Ctrl + Enter` 發送，支援等待檔案上傳完畢自動發送。
  - 聊天輸入框支援可選之 Vim 輸入模式。
- **現代科研排版與多重格式匯出**：
  - 完美渲染 KaTeX / LaTeX 數學公式。
  - 內建 Mermaid 流程圖、WaveDrom 數位邏輯時序圖與 ECharts 互動圖表。
  - 支援一鍵將對話乾淨匯出為純 Markdown (`.md`)、PNG 圖片或高解析度 PDF。

### 🛡️ 效能與穩定性 (Performance & Stability)
- **擴充套件上下文失效防護**：優化 `folderViewHarness` 與 `usageObserverLoader`，在套件重新載入或熱更新時優雅抑制 `Extension context invalidated` 錯誤。
- **主題色彩對比強化**：修正深淺色模式切換時標籤文字對比不足與淺色主題外洩問題。
- **多瀏覽器原生建置管線**：支援 Chrome、Edge、Firefox 與 Safari (含 macOS iCloud Drive 備份支援) 的全套自動化編譯指令。

---

> 如需查看更早期的開發歷程，請參閱各版本詳細筆記：[版本歷史筆記清單](src/pages/content/changelog/notes/)。
