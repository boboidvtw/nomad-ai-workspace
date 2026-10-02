# 📝 版本變更日誌 (Changelog)

本專案遵循 [Semantic Versioning 2.0.0](https://semver.org/) 規範，並以 [Keep a Changelog](https://keepachangelog.com/) 格式維護版本變更。

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
