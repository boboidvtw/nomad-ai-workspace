# 📦 Nomad AI Workspace 端對端安裝與編譯指南 (Installation Guide)

> 本指南引導開發者與進階使用者從原始碼編譯並安裝 **Nomad AI Workspace** 瀏覽器擴充套件，涵蓋 Google Chrome、Microsoft Edge、Mozilla Firefox 與 Apple Safari 四大主流瀏覽器。

---

## 💻 系統與環境需求 (Prerequisites)

- **作業系統**：macOS、Windows 或 Linux
- **Node.js 執行環境**：Node.js v20.0.0 以上（推薦 v22+ 或 v26 LTS）
- **套件管理工具**：[Bun](https://bun.sh/)（官方推薦，建置速度最快）或 `npm` / `pnpm`
- **Git**：用於下載原始碼版本庫

---

## 🛠️ 1. 取得原始碼與依賴安裝

```bash
# 1. 複製 GitHub 專案儲存庫
git clone https://github.com/boboidvtw/nomad-ai-workspace.git

# 2. 進入專案目錄
cd nomad-ai-workspace

# 3. 安裝專案依賴（本專案統一使用 npm，lockfile 為 package-lock.json）
npm install
```

> 本專案為 npm workspaces monorepo，請在**根目錄**執行 `npm install`，子套件（`packages/*`）不需要也不應該各自安裝或保留自己的 lockfile。
> 唯一例外是維護者工具 `npm run verify:katex-export`，它使用 `Bun.build`，需另外安裝 [Bun](https://bun.sh) 才能執行。

---

## 🏗️ 2. 多瀏覽器打包編譯 (Build Targets)

依據您的目標瀏覽器，執行相應的構建指令：

| 目標瀏覽器 | 構建指令 (Bun / npm) | 產物輸出目錄 | 核心架構 |
| :--- | :--- | :--- | :--- |
| **Google Chrome / Brave** | `npm run build:chrome` | `dist_chrome/` | Manifest V3 |
| **Microsoft Edge** | `npm run build:edge` | `dist_edge/` | Manifest V3 |
| **Mozilla Firefox** | `npm run build:firefox` | `dist_firefox/` | Manifest V3 / Gecko |
| **Apple Safari** | `npm run build:safari` | `dist_safari/` | WebKit Extension |
| **全平台一鍵編譯** | `npm run build:browsers` | 各平台目錄 | 全部構建 |

---

## 🚀 3. 各瀏覽器載入與安裝教學 (Browser Loading)

### 3.1 Google Chrome / Brave / Chromium 核心瀏覽器
1. 打開 Chrome 瀏覽器，在網址列輸入並前往：
   ```text
   chrome://extensions/
   ```
2. 在右上角開啟 **「開發者模式 (Developer mode)」** 切換開關。
3. 點擊左上角的 **「載入未打包項目 (Load unpacked)」** 按鈕。
4. 在檔案選取視窗中，選擇專案根目錄下的 **`dist_chrome`** 資料夾。
5. 安裝完成！擴充套件清單中將出現 **Nomad AI Workspace**。
6. 建議點擊瀏覽器工具列右上角的拼圖圖示（擴充功能管理），將 Nomad AI Workspace **固定 (Pin)** 至工具列。

### 3.2 Microsoft Edge
1. 打開 Edge 瀏覽器，前往：
   ```text
   edge://extensions/
   ```
2. 開啟左側側邊欄底部的 **「開發人員模式」**。
3. 點擊頂部的 **「載入解壓縮的擴充功能」** 按鈕。
4. 選擇專案目錄下的 **`dist_edge`**（或 `dist_chrome`）資料夾。

### 3.3 Mozilla Firefox
1. 打開 Firefox 瀏覽器，前往：
   ```text
   about:debugging#/runtime/this-firefox
   ```
2. 點擊 **「載入暫時的附加元件 (Load Temporary Add-on...)」** 按鈕。
3. 瀏覽至專案中的 **`dist_firefox`** 資料夾，選取裡面的 **`manifest.json`** 檔案開啟。
4. 附加元件將立即生效並注入相符的網頁中。

### 3.4 Apple Safari (macOS)
1. 打開 Safari 瀏覽器偏好設定（`Cmd + ,`）。
2. 切換至 **「進階」** 分頁，勾選 **「在選單列中顯示『開發』功能表」**。
3. 在上方選單列點擊 **「開發」> 勾選「允許未簽署的擴充功能 (Allow Unsigned Extensions)」**。
4. 透過 Xcode 開啟專案產生的 Safari Extension 專案檔或執行：
   ```bash
   npm run build:safari
   ```
5. 在 Safari 設定的 **「擴充功能」** 分頁中，勾選啟用 **Nomad AI Workspace** 並授予相關網域存取權限。

---

## 🔄 4. 本地開發與熱重載 (Local Development)

若您正在為 Nomad AI Workspace 開發新功能或除錯，可啟用熱重載開發伺服器：

```bash
# 啟動 Chrome 開發環境 (監聽檔案變更並自動重建)
npm run dev:chrome

# 啟動 Firefox 開發環境
npm run dev:firefox

# 啟動 Safari 開發環境
npm run dev:safari
```

---

## 🧪 5. 程式碼品質與單元測試 (Verification)

在提交任何 Pull Request 或發布前，請運行完整的自動化測試管線：

```bash
# 執行單元測試
npm run test

# 程式碼格式與 Lint 檢查 (使用高速 oxc 工具鏈)
npm run lint:check
npm run format:check

# TypeScript 型別校驗
npm run typecheck

# 執行全套 PR 檢驗管線
npm run verify:pr
```

---

## ❓ 常見安裝問題 (Troubleshooting)

- **錯誤：`Extension context invalidated`**：
  - 當您在開發過程中重新編譯擴充套件時，舊分頁的執行緒可能失效。請直接重新整理目前所在的 Gemini 或 Claude 分頁即可恢復。
- **側邊欄未出現？**：
  - 請確認造訪的網址符合支援的網域名稱（例如 `https://gemini.google.com/` 或 `https://claude.ai/`）。
  - 打開開發者工具（F12），在 Console 查看是否有標示 `[Nomad Workspace]` 的初始化日誌。

