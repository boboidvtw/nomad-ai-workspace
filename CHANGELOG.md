# 📝 版本變更日誌 (Changelog)

本專案遵循 [Semantic Versioning 2.0.0](https://semver.org/) 規範，並以 [Keep a Changelog](https://keepachangelog.com/) 格式維護版本變更。

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
