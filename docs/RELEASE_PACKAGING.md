# 🚀 Nomad AI Workspace 發布與打包指南 (Release & Packaging Guide)

> 本指南詳述 **Nomad AI Workspace** 的正式版本打包流程、Chrome Web Store 上架審查文案、權限申報依據、隱私權規範以及 GitHub Release 自動化發布標準。

---

## 📋 發布前檢查清單 (Pre-Release Checklist)

在進行版本發布或提交應用商店審核前，必須依序完成以下檢查：

- [ ] **自動化測試全數通過**：執行 `npm run test`（確保全套單元測試與 Google Drive 同步測試通過）。
- [ ] **靜態型別與 Lint 通過**：執行 `npm run typecheck` 與 `npm run lint:check`。
- [ ] **版本號升級對齊**：`package.json`、`manifest.json` 與變更日誌版本號一致。
- [ ] **敏感資訊與隱私零洩漏檢查**：執行 `node scripts/verify-release-privacy.mjs`。
- [ ] **套件大小基準合規**：執行 `npm run filesize:check`。

---

## 🛠️ 1. 版本號提升與打包指令 (Build & Package)

### 1.1 版本號自動升級

專案內建版本提升腳本，自動同步 `package.json` 與各瀏覽器 Manifest：

```bash
# 提升修訂版本 (Patch: 1.0.0 -> 1.0.1)
npm run bump patch

# 提升次要版本 (Minor: 1.0.0 -> 1.1.0)
npm run bump minor
```

### 1.2 編譯正式發布產物

```bash
# 編譯 Chrome 正式版
npm run build:chrome

# 執行發布包隱私與金鑰安全掃描 (防範本機路徑或 Token 誤打包)
node scripts/verify-release-privacy.mjs dist_chrome
```

### 1.3 產出發布 ZIP 壓縮包

```bash
# 將 dist_chrome 壓縮為可上傳至 Chrome Web Store 的 ZIP
cd dist_chrome && zip -r ../nomad-ai-workspace-chrome.zip . && cd ..
```

---

## 🏪 2. Chrome Web Store 上架審查規範 (Store Submission)

為確保通過 Google Chrome Web Store 嚴格的擴充功能審查，以下提供經過優化的標準申報文案：

### 2.1 商店基本資料 (Store Metadata)

- **擴充功能名稱 (Extension Name)**：
  - `Nomad AI Workspace — All-in-One Multi-AI Hub`
- **繁體中文短簡介 (Summary / Short Description - 132 字元內)**：
  - `專為 Gemini、Claude、ChatGPT、Grok 打造的本地優先跨 AI 工作空間：多層側邊欄資料夾、通用提示詞庫與 Google Drive 私有隔離備份。`
- **英文短簡介 (English Summary)**：
  - `Unified local-first workspace for Gemini, Claude, ChatGPT, and Grok with hierarchical multi-AI sidebar and segregated Google Drive sync.`
- **分類 (Category)**：生產力工具 (Productivity) / 開發人員工具 (Developer Tools)

### 2.2 單一用途說明 (Single Purpose Statement)

> _Google 審查條款要求擴充套件必須具有明確且集中的單一用途。_

```text
Nomad AI Workspace serves the single purpose of providing a unified, local-first conversational organization and productivity workspace across modern AI chat interfaces (Google Gemini, Anthropic Claude, OpenAI ChatGPT, and xAI Grok). It organizes user conversations into multi-level folders, provides universal prompt management, and offers zero-trust cloud backup directly to the user's private Google Drive.
```

### 2.3 權限申報依據 (Permissions Justification)

在 Developer Dashboard 提交時，需針對各權限提供合理解釋：

| 宣告權限                                                                             | 審查用途說明 (Justification for Web Store Reviewers)                                                                                                              |
| :----------------------------------------------------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `storage`                                                                            | Required to store user-created conversation folders, custom tags, pinned prompt templates, and UI preferences locally in the browser sandbox.                     |
| `identity`                                                                           | Required to authenticate directly with Google OAuth 2.0 and access the user's personal Google Drive via client-side REST API for optional cloud backup.           |
| `scripting`                                                                          | Required to inject the hierarchical sidebar navigation tree, floating Super Orb, and prompt slash-command listeners into supported AI platform pages.             |
| `alarms`                                                                             | Required to schedule periodic, low-overhead synchronization of local folder structures and verify Drive token validity in the background worker.                  |
| `activeTab`                                                                          | Required to read the current tab URL to detect the active AI platform (e.g., Gemini vs Claude) and provide one-click prompt injection into the active chat field. |
| `host_permissions`<br/>(`gemini.google.com`, `claude.ai`, `chatgpt.com`, `grok.com`) | Required to observe DOM mutation trees for chat threads, mount the custom multi-level folder sidebar, and insert prompt templates into the official input areas.  |

### 2.4 隱私權政策保證 (Privacy Policy Compliance)

- **零數據收集**：擴充套件不包含任何第三方追蹤分析（如 Google Analytics、Mixpanel）、不收集使用者的瀏覽歷史、不收集對話文字內容。
- **無中繼伺服器**：100% Client-Side 運作，雲端備份直連使用者授權的個人 Google Drive，開發團隊無法取得任何使用者資料。
- **資料販售禁止**：不向任何廣告商、資料經紀人或第三方出售使用者資料。

---

## 🐙 3. GitHub Release 發布規範 (GitHub Publishing)

當新版本驗證完成並準備推送到 GitHub 時，請遵循以下流程：

### 3.1 建立 Git 標籤 (Tagging)

```bash
# 確保位於 main 分支且工作區乾淨
git checkout main
git pull origin main

# 建立帶簽名的版本 Tag
git tag -a v1.0.0 -m "release: Nomad AI Workspace v1.0.0 official release"

# 推送標籤至遠端
git push origin v1.0.0
```

### 3.2 GitHub Release 內容範本 (Release Notes Template)

在 GitHub 倉庫的 Releases 頁面中，以如下結構建立發布說明：

```markdown
## 🧭 Nomad AI Workspace v1.0.0 正式發布 (Official Release)

我們非常自豪地宣布 **Nomad AI Workspace v1.0.0** 正式發布！這是一款專為 Google Gemini、Anthropic Claude、OpenAI ChatGPT 與 xAI Grok 設計的本地優先跨 AI 平台增強套件。

### ✨ 主要亮點 (Key Highlights)

- 🗂️ **多 AI 階層側邊欄樹狀視圖**：整合 Gemini、Claude、ChatGPT 與 Grok 的資料夾分類與一鍵跳轉。
- ☁️ **Google Drive 方案 A 實體子目錄隔離備份**：採用獨立子目錄（`Gemini/`、`Claude/`、`ChatGPT/`、`Shared/`），杜絕資料覆蓋，保障隱私。
- ⚡ **通用提示詞管理器與 Super Orb**：支援 `/` 斜線命令、變數模板（`{{var}}`）、釘選與跨平台即時插入。
- ⌨️ **Vim 導航與對話時間軸**：內建 `j`/`k`、`gg`/`GG` 極速跳轉與訊息星標。
- 📊 **多維視覺化與匯出**：內建 LaTeX、Mermaid、WaveDrom 與 ECharts 渲染，支援 Markdown 與 PDF 匯出。

### 📦 下載與安裝 (Assets)

- `nomad-ai-workspace-chrome-v1.0.0.zip`：Chrome / Edge / Brave 擴充功能安裝包
- `nomad-ai-workspace-firefox-v1.0.0.zip`：Firefox 附加元件包
- 原始碼：`Source code (zip)` 與 `Source code (tar.gz)`

### 📖 快速指南

- [使用者手冊與教學 (User Manual)](docs/USER_GUIDE.md)
- [Google Drive 授權設定 (Google Drive Setup)](docs/GOOGLE_DRIVE_SETUP.md)
- [端對端安裝教學 (Installation Guide)](docs/INSTALLATION.md)
```
