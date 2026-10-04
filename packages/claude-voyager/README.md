# Claude-Voyager 自用安全加固版 🛸

`Claude-Voyager` 是一個專為 [claude.ai](https://claude.ai) 網頁版首頁設計的瀏覽器擴充功能。本專案以開源的 `Qiuner/claude-nexus` 為基礎進行了命名客製與**隱私安全加固**，確保 100% 在本地運行，無任何外部遙測 (Telemetry)、資料外流或第三方追蹤請求。

---

## ✨ 核心功能 (Features)

*   **📂 對話資料夾管理 (Folder Organization)**：藉由拖放 (Drag & Drop) 整理並收合您的歷史對話。資料夾結構完全加密並儲存於本機。
*   **📍 雙向時間軸導航 (Timeline Navigation)**：在右側面板展示對話的視覺化樹狀節點，點擊可快速跳轉，滑鼠懸停可即時預覽訊息內容。
*   **💡 提示詞庫管理 (Prompt Library)**：內建個人提示詞庫，支援匯入 `gemini-voyager` 導出的 JSON 提示詞，支援一鍵插入輸入框。
*   **💾 聊天記錄匯出 (Chat Export)**：支援將聊天紀錄一鍵導出為 Markdown 或 JSON 檔案。
*   **📐 寬度調整與自定義 (Chat Width Control)**：可自由調整對話區寬度（38rem 至 90rem）。
*   **🌐 完整雙語介面**：支援繁體中文（zh-TW）、簡體中文與英文。

---

## 🔒 隱私與安全加固說明 (Security & Privacy Hardening)

本版本為「自用加固版」，特別針對隱私安全進行了以下最佳化：
1.  **零遙測與第三方連線**：截斷了所有潛在的外部統計與追蹤服務，擴充功能僅向官方 `claude.ai` 域名發送必要的第一方組織量限制 API 查詢。
2.  **完全本機化儲存**：所有的資料夾結構、Prompt 庫皆儲存在瀏覽器本機的 `chrome.storage.local`，不進行任何雲端上傳。
3.  **自動化網路稽核**：專案內置 Playwright 網路行為審查腳本，每次編譯後皆能一鍵測試是否產生異常的外部請求。

---

## 📥 本機開發與編譯安裝 (Installation & Setup)

由於本專案為自用加固版，您需要先在本機進行編譯，再將產物載入至瀏覽器中：

### 1. 安裝環境與依賴
專案使用 Node.js (推薦 v20 以上) 進行管理。您可以使用隨附的 `yarn` 執行安裝：
```bash
# 使用 npx 來執行 yarn 安裝依賴
npx yarn install
```

### 2. 編譯擴充功能
編譯完成後，會在專案根目錄下產生 `dist_chrome` 目錄，這就是瀏覽器的側載產物：
```bash
# 編譯 Chrome 版本
npx yarn build:chrome
```

### 3. 開發模式自動編譯（可選）
如果您想對代碼進行修改，可以啟動開發監聽模式：
```bash
npx yarn dev:chrome
```

---

## 🧪 自動化網路安全審查 (Security Audit)

為了確保擴充功能在運行時絕對安全，我們整合了自動化 Playwright 測試與網路攔截稽核：

```bash
# 執行自動化測試與網路審查
node scripts/automated_audit.js
```

**該腳本將會自動：**
1. 啟動一個載入了 `dist_chrome` 擴充功能的 Chromium 沙盒實例。
2. 導航至 `claude.ai`、Popup 設定視窗與 Options 設定頁。
3. 攔截並稽核所有的外發 (Outgoing) 網路請求。
4. 於 `scratch/` 下生成截圖並輸出 `audit_report.json` 安全報告，確保懸掛或異常請求數為 0。

---

## 💾 如何在 Chrome 瀏覽器中啟用

1. 開啟 Chrome 瀏覽器，在網址列輸入 `chrome://extensions/` 並進入。
2. 開啟右上角的 **「開發人員模式 (Developer mode)」** 切換開關。
3. 點選左上角的 **「載入未封裝項目 (Load unpacked)」** 按鈕。
4. 選擇以下編譯產物目錄：
   `[您的專案路徑]/claude-voyager/dist_chrome`
5. 重新整理 `https://claude.ai/` 首頁即可開始使用！

---

## 🤝 鳴謝 (Credits)

*   本專案核心實作基於 **[Qiuner/claude-nexus](https://github.com/Qiuner/claude-nexus)**。
*   設計哲學與靈感源自 **[gemini-voyager](https://github.com/Nagi-ovo/gemini-voyager)** (By Nagi-ovo)。

---

## 📄 授權條款 (License)

MIT License © 2026
