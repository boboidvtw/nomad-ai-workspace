# 📝 版本變更日誌 (Changelog)

本專案遵循 [Semantic Versioning 2.0.0](https://semver.org/) 規範，並以 [Keep a Changelog](https://keepachangelog.com/) 格式維護版本變更。

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
