# ☁️ Google Drive 子目錄隔離備份與授權設定指南 (Google Drive Setup Guide)

> 本指南詳述如何配置 **Google Drive 方案 A（實體子目錄分離存放）** 同步機制，並引導您在 Google Cloud Console 中建立個人專屬的 OAuth 2.0 Client ID，達成 100% 自主控管、零伺服器中繼的私有雲端備份。

---

## 🧭 為什麼選擇「實體子目錄隔離備份」(Scheme A)？

市面上多數同步工具採用「單一 JSON 全量覆蓋」的方式，在高強度多 AI 平台情境下存在嚴重缺陷：
1. **多標籤頁/多平台寫入競爭 (Race Condition)**：當您在 Claude 分頁整理資料夾，同時又在 Gemini 分頁收藏訊息時，兩者回傳雲端會發生互相覆蓋，造成資料遺失。
2. **單點故障 (Single Point of Failure)**：單一檔案損壞將摧毀所有平台的分類與歷史資料。
3. **無透明度**：使用者無法在 Google Drive 中直接檢視或還原特定單一平台的對話結構。

### 📁 Nomad 雲端實體目錄結構
在 Nomad AI Workspace 方案 A 下，雲端硬碟將建立乾淨且嚴格隔離的目錄層級：

```text
📁 我的雲端硬碟 (My Drive)/
└── 📁 Nomad Workspace Data/                      <-- 專屬根目錄
    ├── 📄 nomad_manifest.json                   <-- 跨平台同步中繼資訊與時間戳記
    ├── 📁 Gemini/                                <-- Google Gemini 專屬隔離區
    │   ├── 📄 gemini_folders.json               <-- 階層資料夾與對話樹
    │   ├── 📄 gemini_starred.json               <-- 星標與重要訊息
    │   └── 📄 gemini_timeline.json              <-- 時間軸快取
    ├── 📁 Claude/                                <-- Anthropic Claude 專屬隔離區
    │   ├── 📄 claude_folders.json               <-- 對話分類資料夾
    │   └── 📄 claude_layout.json                <-- 自訂版面設定
    ├── 📁 ChatGPT/                               <-- OpenAI ChatGPT 專屬隔離區
    │   └── 📄 chatgpt_folders.json              <-- 對話分類結構
    ├── 📁 Grok/                                  <-- xAI Grok 專屬隔離區
    │   └── 📄 grok_folders.json                 <-- 對話分類結構
    └── 📁 Shared/                                <-- 跨平台通用共享區
        ├── 📄 universal_prompts.json             <-- 跨平台通用提示詞庫
        ├── 📄 custom_plugins.json                <-- 外掛與自訂腳本設定
        └── 📄 nomad_settings.json                <-- 全域偏好與快捷鍵配置
```

各平台獨立備份、互不干擾；通用提示詞與全域偏好放置於 `Shared/` 目錄下實現跨端同步。

---

## 🛠️ 逐步教學：建立個人 Google Cloud OAuth 2.0 憑證

Nomad AI Workspace 內建了預設 Client ID，但強烈建議高階使用者建立專屬憑證，享有完全不受配額限制且隱私絕對自主的連線通道。

### 步驟 1：建立 Google Cloud 專案
1. 開啟 [Google Cloud Console](https://console.cloud.google.com/)。
2. 點擊左上角專案下拉選單，點選 **「新增專案 (New Project)」**。
3. 專案名稱輸入 `Nomad-AI-Workspace`（或您喜好的名稱），點擊 **「建立」**。

### 步驟 2：啟用 Google Drive API
1. 進入剛建立的專案，在頂部搜尋列輸入 `Google Drive API`。
2. 點選搜尋結果中的 **Google Drive API**，點擊 **「啟用 (Enable)」** 按鈕。

### 步驟 3：設定 OAuth 同意畫面 (OAuth Consent Screen)
1. 點擊左側導覽選單的 **「API 和服務」>「OAuth 同意畫面」**。
2. **User Type (使用者類型)**：選擇 **「外部 (External)」**，點擊 **「建立」**。
3. **應用程式資訊**：
   - **應用程式名稱**：輸入 `Nomad AI Workspace`。
   - **使用者支援電子郵件**：選擇您自己的 Gmail 信箱。
   - **開發人員聯絡資訊**：填寫您的 Gmail 信箱。
   - 其餘欄位可留空，點擊 **「儲存並繼續」**。
4. **範圍 (Scopes)**：
   - 點擊 **「新增或移除範圍」**。
   - 搜尋或勾選：
     `https://www.googleapis.com/auth/drive.file`
   - > 🔒 **安全保證**：此 Scope 僅允許應用程式讀取與修改由本應用程式自身建立的檔案，**完全無法存取您雲端硬碟中的任何既有照片、文件或私人檔案**，且不需要通過繁瑣耗時的 Google 官方安全驗證審查。
   - 點擊 **「更新」**，接著點擊 **「儲存並繼續」**。
5. **測試使用者 (Test Users)**：
   - 點擊 **「+ ADD USERS」**。
   - 輸入您要登入使用的個人 Google 帳號電子郵件。
   - 點擊 **「新增」**，接著點擊 **「儲存並繼續」**。

### 步驟 4：建立 OAuth 2.0 Client ID (用戶端 ID)
1. 點擊左側導覽選單的 **「憑證 (Credentials)」**。
2. 點擊頂部 **「+ 建立憑證 (+ CREATE CREDENTIALS)」>「OAuth 用戶端 ID」**。
3. **應用程式類型 (Application type)**：
   - **Chrome 擴充功能方案 (推薦用於 Chromium/Edge)**：
     - 選擇 **「Chrome 擴充功能 (Chrome Extension)」**。
     - **項目 ID (Item ID)**：填入 Nomad 擴充功能的 ID。
       > 💡 如何查詢 Extension ID？開啟瀏覽器網址列輸入 `chrome://extensions/`，找到 Nomad AI Workspace，下方顯示的一長串英文字母（例如 `abcdefghijklmnop...`）即是 ID。
   - **Web 應用程式方案 (通用於 Firefox / Safari 等平台)**：
     - 選擇 **「網頁應用程式 (Web application)」**。
     - 在「已授權的重新導向 URI (Authorized redirect URIs)」中，加入擴充功能的重定向網址：
       `https://<您的Extension-ID>.chromiumapp.org/`
4. 點擊 **「建立」**，彈出的視窗中將顯示您的 **用戶端 ID (Client ID)**，請複製此字串。

---

## 📱 在 Nomad AI Workspace 中啟用同步

1. 點擊瀏覽器工具列中的 **Nomad AI Workspace** 圖示開啟彈窗，或右鍵點選圖示進入 **「選項」**。
2. 切換至 **「雲端同步 (Cloud Sync)」** 分頁。
3. 點擊 **「進階設定 (Advanced Settings)」**：
   - 在 **「自訂 Google OAuth Client ID」** 欄位中，貼上剛剛複製的 Client ID。
   - 若不填寫，將使用擴充套件內建的預設 Client ID。
4. 點擊 **「連結 Google Drive (Connect Google Drive)」** 按鈕。
5. 瀏覽器將彈出 Google 官方授權視窗，選取您在步驟 3 加入為測試使用者的 Google 帳號，點擊 **「允許」**。
6. 授權成功後，同步狀態將顯示為 🟢 **已連線 (Connected)**，並呈現最近一次備份時間戳記。

---

## 🔄 同步策略與資料還原 (Sync Modes)

在雲端同步介面中，您可以隨時進行手動觸發或依需求選擇還原模式：

- **立即備份至雲端 (Backup Now)**：將本機當前最新的資料夾分類、星標與通用提示詞上傳至對應的雲端子目錄。
- **從雲端還原 (Restore from Cloud)**：
  - **模式 A：智能合併 (Merge, 推薦)**：
    - 將雲端目錄與本機資料進行雙向智能比對。
    - 保留兩端所有新增的資料夾與提示詞，若遇到同名衝突則保留較新版本，絕不抹除本機新資料。
  - **模式 B：覆蓋還原 (Overwrite)**：
    - 適用於更換新電腦或想要將本機狀態完全重置為雲端歷史鏡像的情境。
    - 本機資料將被雲端目錄中的資料完整替換。

---

## 🍏 Apple Safari 使用者：iCloud 備份方案

若您在 macOS 上使用 Safari 瀏覽器，Nomad AI Workspace 原生整合了 **Apple iCloud Drive** 備份：
- 系統自動偵測 Safari 執行環境，在「雲端同步」設定中提供 **「iCloud 備份」** 選項。
- 免除 Google API 配置手續，直接透過 macOS 原生帳號安全隔離存放。

---

## ❓ 常見問題與除錯 (FAQ & Troubleshooting)

### Q1: 出現 `redirect_uri_mismatch` 錯誤？
- **原因**：OAuth Client ID 設定中的 Extension ID 與當前瀏覽器執行的擴充套件 ID 不相符。
- **解法**：請前往 `chrome://extensions/` 重新確認 ID，並回到 GCP Console 憑證設定更新項目 ID。

### Q2: 出現 `403 access_denied` 或「此應用程式尚未通過 Google 驗證」警告？
- **原因**：專案處於測試階段（Testing），且登入的 Google 帳號尚未列入「測試使用者」清單中。
- **解法**：前往 GCP Console > OAuth 同意畫面 >「測試使用者」，確認您的 Google 信箱已被正確加入。

### Q3: 我的個人 Google Drive 容量會被佔滿嗎？
- **解答**：完全不會。Nomad 備份的純 JSON 結構極度輕量，即便存放上萬條對話與提示詞，檔案總容量通常僅佔數百 KB 至數 MB，對 Google Drive 的 15GB 免費空間影響微乎其微。

