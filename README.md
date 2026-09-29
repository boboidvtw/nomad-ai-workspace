# 🧭 Nomad AI Workspace

> **全方位跨 AI 平台工作空間 (All-in-One Multi-AI Workspace Browser Extension)**  
> 專為 Google Gemini、Anthropic Claude、OpenAI ChatGPT 與 xAI Grok 打造的本地優先、開源瀏覽器增強套件。在各官方 AI 側邊欄呈現階層存放樹狀圖，並由個人 Google Drive 實體子目錄安全存放。

[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](LICENSE)
[![GitHub Stars](https://img.shields.io/github/stars/boboidvtw/nomad-ai-workspace?style=social)](https://github.com/boboidvtw/nomad-ai-workspace)
[![PayPal Sponsor](https://img.shields.io/badge/Sponsor-PayPal-00457C.svg?logo=paypal&logoColor=white)](https://www.paypal.me/boboidvtw)

---

## 📖 關於本專案 (About)

在日常研發與知識工作中，我們經常需要在多個頂尖 AI 平台之間穿梭——用 **Claude** 進行深度編程與 Artifacts 架構推演、用 **Gemini** 進行大規模上下文分析與多模態研究、用 **ChatGPT** 或 **Grok** 探索最新推理與即時資訊。

然而，現有的多 AI 工作流面臨兩大核心痛點：
1. **資料孤島與碎片化**：每個 AI 的對話分類、資料夾與提示詞各自割裂，無法統一檢視與檢索。
2. **商業閉源工具的隱私危機**：市面上的多合一外掛多屬閉源商業訂閱制（每月 5~15 美元），且強制將使用者敏感的對話與 Prompt 轉發至第三方專有伺服器。

**Nomad AI Workspace** 秉持 **「遊牧無界，安全歸巢 (Roam Freely, Nest Safely)」** 的核心哲學，打造一套完全開源、本地優先 (Local-First) 且零信任隱私的瀏覽器擴充套件：
- **實體分離存放**：各平台的會話資料與資料夾在個人 Google Drive 建立獨立子目錄，資料互不干擾、權屬絕對自有。
- **側邊欄階層整合**：無論打開哪個 AI 官方首頁，側邊欄均呈現統一的多 AI 階層清單，標示鮮明的 AI 品牌徽章。
- **通用提示詞庫**：一次維護，在各大 AI 頁面一鍵點選喚起與即時插入。

---

## ✨ 核心特性 (Key Features)

### 1. 🗂️ 多 AI 官方側邊欄階層清單 (Hierarchical Tree View)
- 直接注入各大 AI 官方頁面（Gemini、Claude、ChatGPT、Grok 等）原生側邊欄。
- 頂層為 AI 平台根節點（🔵 **Google Gemini** / 🟠 **Anthropic Claude** / 🟢 **OpenAI ChatGPT** / ⚪ **xAI Grok**），展開後為各資料夾與會話。
- 支援當前平台會話快速導航，以及跨平台會話帶標籤（↗️）新分頁一鍵跳轉。

### 2. ☁️ Google Drive 方案 A：實體子目錄分離存放 (Subdirectory Isolation)
- 雲端備份採用實體目錄結構，嚴格劃分命名空間：
  ```
  📁 Google Drive/
  └── 📁 Nomad Workspace/
      ├── 📁 Gemini/       <-- Gemini 階層資料夾、星標訊息與設定
      ├── 📁 Claude/       <-- Claude 側邊欄資料夾與自訂版面
      ├── 📁 ChatGPT/      <-- (預留擴充)
      ├── 📁 Grok/         <-- (預留擴充)
      └── 📁 Shared/       <-- 通用提示詞庫 (universal_prompts.json)
  ```
- **單一憑證**：只需在個人 Google Cloud Console 配置一組 OAuth Client ID，一鍵授權雙端受益。
- **高容錯性**：單一平台的同步波動絕不影響其他平台的備份完整性。

### 3. 🔒 本地優先與零信任隱私 (Local-First & Zero-Trust Privacy)
- 100% Client-Side 運作，完全不存在任何中繼伺服器（No Backend / No Middleman）。
- 資料僅在瀏覽器本機快取（`chrome.storage.local`）與您授權的個人 Google Drive 之間直連傳輸。

### 4. 📝 跨平台通用提示詞庫 (Universal Prompt Library)
- 提示詞支援標籤分類與跨平台共享。
- 在 Claude 雕琢的最佳提示詞，切換到 Gemini 或 ChatGPT 輸入框即可一鍵喚出直接調用。

### 5. 🧩 隨插即用平台架構 (Pluggable AI Registry)
- 核心抽象化 `AIPlatformConfig` 與適配器介面，新增任何新興 AI（如 DeepSeek、Kimi 等）僅需實作輕量 DOM 注入器，無需重寫雲端同步與存儲邏輯。

---

## 🎯 發展目標與路線圖 (Roadmap & Goals)

- [x] **Phase 0：開源專案立項與前置架構設計**
  - 全網與 GitHub 類似開源項目調研與專案定位確認
  - Google Drive 方案 A 實體子目錄分離存放規範確立
  - 多 AI 階層側邊欄 (Hierarchical Tree) 概念模型定義
- [ ] **Phase 1：雙引擎核心整合與動態分流 (Gemini & Claude)**
  - 整合 Gemini Voyager 與 Claude Voyager 核心模組
  - 實作 MV3 單一 Manifest 雙入口 Content Script 動態感知分流
  - 統一本機存儲模型與 Prompt 雙向相容層
- [ ] **Phase 2：Google Drive 方案 A 實體子目錄同步實作**
  - 升級 `GoogleDriveSyncService` 支援 `Nomad Workspace/` 實體子目錄建立與分區讀寫
  - 整合自訂 Google OAuth 2.0 Client ID 授權流程
- [ ] **Phase 3：多 AI 階層側邊欄元件 (Hierarchical Sidebar Component)**
  - 開發注入式多 AI 樹狀視圖元件，支援即時摺疊、展開與跨平台會話跳轉
  - 整合品牌色彩徽章（🔵 / 🟠 / 🟢 / ⚪）與搜尋過濾
- [ ] **Phase 4：生態系擴充與更多 AI 接入**
  - 開放 `AIPlatformRegistry` 規範，接入 OpenAI ChatGPT 與 xAI Grok 適配器

---

## 🏗️ 技術棧 (Tech Stack)

- **核心架構**：TypeScript, React 19, Chrome Extensions MV3
- **構建系統**：Vite 6+, `@crxjs/vite-plugin`, Bun
- **樣式系統**：Tailwind CSS v4, Lucide Icons
- **雲端同步**：Google Drive REST API v3 (Direct Client Flow / AppData)
- **多國語系**：i18next (內建繁體中文、English 等)

---

## 📜 開源許可與致謝 (License & Attributions)

本專案採用 **[GNU General Public License v3.0 (GPL-3.0)](LICENSE)** 開源授權。

### 開源前鋒致謝 (Attributions)
Nomad AI Workspace 的誕生受益於開源社群先鋒項目的啟發與基礎建設，在此向以下卓越專案深表謝意：
- **[voyager-crew/voyager](https://github.com/voyager-crew/voyager)**：由 Jesse Zhang 等貢獻者發起的優秀 Gemini/AI 工作空間增強套件（採用 GPL-3.0 授權）。
- **[Qiuner/claude-nexus](https://github.com/Qiuner/claude-nexus)**：專為 Claude.ai 設計的對話分類與資料夾管理套件（採用 MIT 授權）。

詳細第三方依賴與授權聲明請參閱 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

---

## ❤️ 贊助與支持 (Sponsor & Support)

如果您覺得 **Nomad AI Workspace** 對您的多 AI 開發與工作效率有所助益，歡迎透過 PayPal 贊助支持本專案的持續維護與新功能演進：

[![PayPal.Me Sponsor](https://img.shields.io/badge/贊助作者-PayPal.Me-00457C.svg?style=for-the-badge&logo=paypal&logoColor=white)](https://www.paypal.me/boboidvtw)

您的支持是開源專案持續成長與維護的最佳動力！
