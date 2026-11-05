<p align="right">
  <b>繁體中文</b> | <a href="USER_GUIDE_EN.md">English</a>
</p>

# 📖 Nomad AI Workspace 使用者手冊與教學 (User Manual & Tutorial)

歡迎使用 **Nomad AI Workspace**！這是一套專為高強度多 AI 平台使用者量身打造的本地優先瀏覽器工作空間。本手冊將手把手帶領您熟悉各項核心功能與高效操作訣竅。

---

## 📑 目錄 (Table of Contents)

1. [多 AI 階層側邊欄樹狀視圖](#1-多-ai-階層側邊欄樹狀視圖-hierarchical-sidebar)
2. [通用提示詞管理器與 Super Orb](#2-通用提示詞管理器與-super-orb-prompt-manager)
3. [快捷鍵清單與 Vim 模式](#3-快捷鍵清單與-vim-模式-keyboard-shortcuts)
4. [對話時間軸與重點標記](#4-對話時間軸與重點標記-timeline--highlights)
5. [豐富排版渲染與一鍵匯出](#5-豐富排版渲染與一鍵匯出-export--rendering)
6. [跨平台同步與偏好自訂](#6-跨平台同步與偏好自訂-settings)
7. [更新後重新載入方式](#7-更新後重新載入方式-how-to-reload)

---

## 1. 🗂️ 多 AI 階層側邊欄樹狀視圖 (Hierarchical Sidebar)

Nomad AI Workspace 會自動注入至您造訪的各大 AI 平台（Google Gemini、Anthropic Claude、OpenAI ChatGPT、xAI Grok 等），提供統一的跨平台資料夾分類管理。

### 1.1 側邊欄展開與收合

- 在官方頁面側邊欄頂部，您可以看到 **Nomad Workspace** 樹狀圖控制列。
- 點擊平台名稱左側的摺疊箭頭（`▶` / `▼`），即可展開或收合該 AI 平台的對話目錄。
- 各平台皆配備官方品牌標誌與主色徽章：
  - 🔵 **Google Gemini**（湛藍色）
  - 🟠 **Anthropic Claude**（暖赤銅）
  - 🟢 **OpenAI ChatGPT**（翡翠綠）
  - ⚪ **xAI Grok**（晴空藍）

### 1.2 資料夾建立與多層巢狀管理

1. **建立新資料夾**：
   - 點擊平台區塊右上角的 **「+」** 或 **新增資料夾** 按鈕。
   - 輸入資料夾名稱（支援 Emoji，例如 `💻 架構設計`、`📝 論文研究`、`🎨 前端介面`）。
   - 可為資料夾選取專屬自訂代表色（紅、橙、黃、綠、藍、紫等），便於視覺快速掃描。
2. **多層巢狀分類 (Nested Folders)**：
   - 支援將子資料夾拖曳至父資料夾內，輕鬆建立多層樹狀結構。
3. **對話拖曳歸檔**：
   - 直接將官方側邊欄的任一對話標題**按住並拖曳**至目標資料夾中放開，對話即被分類歸檔。
   - 一個對話僅屬一個主分類，隨時可拖曳至其他資料夾重新歸類。

### 1.3 跨平台一鍵無縫跳轉

- **本平台跳轉**：若點擊的會話屬於當前開啟的 AI 平台，系統將透過無刷新 SPA 導航直接切換對話。
- **跨平台跳轉**：若點擊其他平台的會話（項目右側帶有 ↗️ 外部連結圖示），系統將自動開啟新分頁並直接導航至該 AI 對話頁面，告別手動切換書籤的繁瑣。

### 1.4 xAI Grok (grok.com) 側邊欄與對話管理教學

1. **自動啟用與精準側邊欄嵌入 (Sidebar Integration)**：
   - 造訪 [grok.com](https://grok.com/) 時，Nomad 會自動適配 Grok 的 Shadcn 側邊欄架構，將科技藍識別色（`#1D9BF0`）的 **Nomad 資料夾** 與 **Nomad Workspace** 樹狀清單精確嵌入於左側邊欄「專案」與「聊天 (Chats)」列表之間，絕不佔用頂部或擠壓主聊天區域。
   - 畫面右下角常駐專屬科技藍發光 Nomad Super Orb，支援額度監控與提示詞調用。
2. **對話歸檔與拖曳整理**：
   - 將滑鼠懸浮在 Grok 歷史列表的任一對話時，即會顯示 Nomad 專屬資料夾圖示按鈕，點擊可快速勾選移動至指定分類資料夾。
   - 亦支援 HTML5 原生拖曳（Drag & Drop）：直接將對話按住並拖入目標 Nomad 資料夾中即可完成分類。
3. **雲端備份與四大平台全域同步**：
   - 點擊 Nomad 資料夾頂部 ☁️ 圖示，可立即將 Grok 資料夾架構上傳至 Google Drive `Grok/grok-folders.json`。
   - 透過右上角擴充套件彈出面板（Popup）的「一鍵全平台同步 (All Platforms)」，更可同時進行 Gemini、Claude、ChatGPT 與 Grok 的四平台雙向合併同步。
4. **側邊欄折疊聯動相容性**：
   - 當您點擊 Grok 側邊欄頂部的折疊按鈕收合側邊欄時，Nomad 資料夾樹將隨之平滑收合，展開時自動復原，操作體驗完全自然流暢。

---

## 2. ⚡ 通用提示詞管理器與 Super Orb (Prompt Manager)

提示詞是 AI 工作流的核心資產。Nomad 提供跨平台通用的 Prompt 管理器，在 Claude 雕琢的最佳提示詞，切換到 Gemini 或 ChatGPT 輸入框即可一鍵喚出直接調用。

### 2.1 喚起方式

- **方式 A（Nomad Super Orb 浮動球）**：
  - 畫面右下角懸浮著發光的 **Nomad Super Orb**。
  - 點擊浮動球即可彈出精美的提示詞庫懸浮面板。
- **方式 B（輸入框旁觸發鈕）**：
  - 各 AI 官方輸入框旁皆配備 Nomad 羅盤圖示按鈕，點擊立即開啟。
- **方式 C（斜線快捷喚起 `/`）**：
  - 在任何對話輸入框中直接輸入 `/`，即可啟用即時搜尋選單。

### 2.2 斜線命令即時匹配 (Slash Prompts)

1. 在輸入框輸入 `/`，緊接著鍵入關鍵字（例如 `/code`、`/trans`、`/review`）。
2. 下拉清單將即時篩選出相符的提示詞。
3. 使用鍵盤 **上下方向鍵 (`↑` / `↓`)** 選取項目，按下 **`Enter`** 即可直接將提示詞填入輸入框。
4. 按下 **`Esc`** 可隨時取消並關閉選單。

### 2.3 動態變數模板填寫 (Variable Templates)

- 提示詞支援動態變數語法：`{{變數名稱}}`。
- **範例提示詞**：
  ```markdown
  請扮演專業的 {{角色}}，幫我針對以下內容進行 {{任務目標}}：
  {{待處理內容}}
  ```
- 當您選取此提示詞時，Nomad 會自動彈出 **「填寫變數」** 視窗，列出所有待填欄位。
- 填寫完畢點擊 **「插入」**，自動組合出完整文字並送入輸入框，省去手動尋找佔位符的困擾。

### 2.4 標籤分類與置頂釘選 (Pinning & Tags)

- **置頂 (Pin)**：將最高頻使用的提示詞點擊星標或圖釘，永遠固定在清單頂部。
- **標籤 (Tags)**：支援自訂標籤（如 `#代碼`、`#翻譯`、`#文案`、`#思考`），點擊上方標籤列可一秒篩選。

---

## 3. ⌨️ 快捷鍵清單與 Vim 模式 (Keyboard Shortcuts)

為了追求極致的操作流暢度，Nomad AI Workspace 內建全套鍵盤快捷鍵與 Vim 導航模式。

### 3.1 時間軸導航快捷鍵 (Timeline Navigation)

在對話瀏覽模式下（游標未處於文字輸入框時），可直接使用單鍵導航：

| 快捷鍵  | 功能說明                              | 備註                                           |
| :------ | :------------------------------------ | :--------------------------------------------- |
| `j`     | **跳至下一輪對話** (Next Message)     | 平滑滾動至下一個模型回答                       |
| `k`     | **跳至上一輪對話** (Previous Message) | 平滑滾動至前一個提問/回答                      |
| `g` `g` | **跳至對話起點** (First Message)      | 連按兩下 `g` 立即回到最頂部首輪                |
| `G` `G` | **跳至最新對話** (Last Message)       | 連按兩下大寫 `G`（或 `Shift + g`）滾動至最底部 |

> 💡 **防衝突保護**：當您的輸入焦點處於聊天框、表單或處於輸入法（IME）組字狀態時，單鍵導航會自動靜音，絕不干擾正常打字。

### 3.2 對話發送與編輯快捷鍵

- **`Cmd + Enter` (macOS) / `Ctrl + Enter` (Windows/Linux)**：
  - 立即發送當前輸入框內容（避免單純按下 `Enter` 誤送未完成的長文）。
  - 若正在上傳附件或圖片，系統會智慧等待上傳完成後才執行發送，杜絕空白訊息。
- **`Shift + Enter`**：在輸入框中換行。
- **`Esc`**：關閉目前開啟的提示詞選單、浮動彈窗或離開特定輸入焦點。

### 3.3 Vim 編輯模式 (Vim Input Mode)

- 可在擴充功能設定中開啟 **「聊天輸入框 Vim 模式」**。
- 支援標準 Vim 狀態切換：
  - `i` / `a`：進入 Insert 插入模式。
  - `Esc`：返回 Normal 一般模式。
  - Normal 模式下支援基本移動鍵 (`h`, `j`, `k`, `l`, `w`, `b`, `0`, `$`) 與刪除指令 (`dd`, `dw`, `x`)。

---

## 4. ⏱️ 對話時間軸與重點標記 (Timeline & Highlights)

長篇對話往往包含數十輪反覆推演，難以快速尋找關鍵論述。Nomad 提供了可視化時間軸與重點星標功能。

### 4.1 對話時間軸 (Timeline)

- 畫面邊緣常駐簡約的視覺時間軸導航點。
- 游標懸停在時間軸任一點上，可即時預覽該輪提問的精簡摘要。
- 點擊時間軸點可瞬間瞬移至該回答，省去無止境的滾輪翻找。

### 4.2 訊息星標與螢光筆標記 (Star & Highlights)

- 每一則 AI 回覆均提供快速操作工具列：
  - ⭐ **星標收藏**：將重要回答收錄至本機專屬收藏庫。
  - 🖍️ **選取文字高亮**：在 AI 回覆中反白文字，可即時加上彩色螢光標記並自動備份至雲端。
  - 📋 **一鍵複製 Markdown / 引用回覆**：快速提取格式完整的純文字或發起針對特定段落的引用提問。

---

## 5. 📊 豐富排版渲染與一鍵匯出 (Export & Rendering)

Nomad AI Workspace 內建多種現代圖表與科學計算排版引擎：

- **KaTeX / LaTeX 數學公式**：完美渲染多行矩陣、微積分與複雜物理公式，並支援一鍵複製 LaTeX 原始碼。
- **Mermaid 圖表**：即時解析流程圖 (Flowchart)、循序圖 (Sequence)、甘特圖 (Gantt)、Git Graph 與架構圖。
- **WaveDrom 數位邏輯時序圖**：硬體工程師專用時序波形即時可視化。
- **ECharts 資料圖表**：將 AI 輸出的 JSON 資料直接轉化為直觀的長條圖、折線圖或圓餅圖。
- **多元匯出**：
  - 匯出為精美的純 **Markdown (`.md`)** 文件（自動清理多餘的 DOM 樣式）。
  - 一鍵匯出為高畫質 **PNG 圖片** 或格式化 **PDF**。

---

## 6. ⚙️ 跨平台同步與偏好自訂 (Settings)

點擊瀏覽器工具列上的 Nomad AI Workspace 圖示，開啟控制面板：

- **Google Drive 四大平台獨立子目錄同步 (4-Platform Cloud Sync)**：
  - 登入個人 Google 帳號，一鍵啟用 Google Drive 實體子目錄物理隔離備份：
    - `Nomad Workspace Data/Gemini/gemini-folders.json`（Google Gemini）
    - `Nomad Workspace Data/Claude/claude-folders.json`（Anthropic Claude）
    - `Nomad Workspace Data/ChatGPT/chatgpt-folders.json`（OpenAI ChatGPT）
    - `Nomad Workspace Data/Grok/grok-folders.json`（xAI Grok）
  - 擴充套件 Options 與 Popup 控制面板提供 4 欄即時同步狀態總覽儀表板，獨立呈現各平台最新上傳與下載時間戳。
  - 點擊「一鍵全平台同步 (All Platforms)」即可自動並行執行四大平台之雲端資料拉取、雙向時間戳衝突消解與非破壞性增量合併。
- **零信任隱私架構 (Zero-Trust Privacy)**：
  - 本地優先設計，透過 OAuth 2.0 直接於本機瀏覽器與個人 Google Drive 溝通，無任何第三方伺服器中轉，確保會話與提示詞隱私絕對安全。
  - 支援設定自訂 Google Cloud OAuth Client ID（詳細步驟請見 [Google Drive 授權指南](GOOGLE_DRIVE_SETUP.md)）。
- **外觀與主題 (Appearance & Layout)**：
  - 支援跟隨系統深淺色模式或手動強制設定。
  - 可微調側邊欄寬度、文字行高與對話段落間距。
- **匯入與匯出 (Backup & Restore)**：
  - 隨時將本機所有四大平台資料夾結構、星標對話與自訂提示詞匯出為獨立 JSON 備份檔，並支援跨裝置一鍵導入復原。

---

---

## 7. 🖥️ Nomad AI Studio 獨立桌面超級工作站 (Standalone Desktop Workstation)

除了瀏覽器擴充功能外，Nomad AI Workspace 亦提供了基於 Electron 的原生獨立桌面應用程式——**Nomad AI Studio**，專為需要高頻在四大頂尖 AI 間進行同屏對比與並發提問的專業人士設計。

### 7.1 動態自訂分欄佈局與單欄專注啟動 (Dynamic Grid, Focus Startup & Lazy Loading)

點擊頂部導航列的版面按鈕或平臺晶片，即可瞬間切換或自由組合：

- **⚡ 預設 ChatGPT 單欄專注 (Focus 1-Column)**：全螢幕單一視窗，享受無干擾的深度推理工作流。工作站**預設以 ChatGPT 作為第一主頁面啟動**，大幅精簡開機時的系統記憶體與 CPU 佔用。
- **💤 智能延遲載入 (Lazy Loading)**：啟動時僅加載主引擎，其他平台（Claude、Gemini、Grok）採取按需延遲載入技術，僅在切換版面時才平滑喚醒，兼顧極致效能與資源節省。
- **四宮格競技 (Quad Grid)**：全螢幕同屏展示 Claude、ChatGPT、Gemini 與 Grok，四家模型回答即時橫向對比。
- **三欄對比 (Triple 3-Column)**：三等分並排顯示三家大模型，適合多視角綜合交叉驗證。
- **雙欄並排 (Dual 2-Column)**：精選兩大主流模型並排顯示，並支援 **4:6 / 5:5 / 6:4** 左右分割比例切換。
- **動態平臺晶片 (Platform Chips)**：頂部導航列支援自由點擊開關 Claude、ChatGPT、Gemini、Grok 任一平臺，彈性依工作需求自由組合。

### 7.2 各平臺獨立縮放控制 (Independent Zoom Controls)

- 點擊頂部 **「🔍 視圖縮放」** 展開縮放控制面板。
- 支援為 Claude、ChatGPT、Gemini、Grok 各自獨立設置縮放比例（50% ~ 200%），適配不同高 DPI 螢幕與字體偏好。
- 提供 `+`、`-` 精細步進調整、**「重置 100%」** 與 **「全域快速縮放 (85% / 100% / 115%)」** 預設值。
- 所有縮放比例與版面設定自動持久化於本機配置。

### 7.3 全域快捷喚醒與系統選單列 (Global Shortcut & Tray Resident)

- **⚡ 全域喚醒快捷鍵**：按下 `Cmd + Shift + Space`（Windows 為 `Ctrl + Shift + Space`），無論身處任何全螢幕應用程式或桌面，一鍵即刻喚出或隱藏工作台。
- **🍎 macOS 原生透明選單列圖標 (Apple HIG Template)**：全新採用純向量透明 Apple HIG 規範模板圖標（`trayTemplate.png` 與 `@2x` 高清 Retina 規格），完美自適應 macOS 系統「淺色模式」與「深色模式」動態反色，徹底告別實心方塊瑕疵。
- **右鍵快捷選單**：右鍵點擊選單列圖標即可快速切換版面（單欄專注 / 雙欄 / 三欄 / 四宮格）、調整全域縮放、查看本地中繼狀態、切換開機自動啟動或徹底退出。
- **後台常駐運行**：點擊視窗左上角關閉按鈕預設最小化隱藏至系統列，保持會話不中斷。

### 7.4 本地數據同步中繼通道 (Local Sync Bridge API)

Nomad AI Studio 內建輕量、高效的本地 HTTP RPC 與 SSE 串流服務，預設監聽 `http://127.0.0.1:8765`（僅限本地 Loopback 存取，極致安全）：

- **健康度與狀態**：`GET /api/status`（傳回版面、在線平臺、縮放、協作中樞與視窗狀態）。
- **遠端一鍵同步提問**：`POST /api/prompt`（傳入 `{"prompt": "...", "targets": ["claude", "chatgpt"]}`）。
- **遠端佈局與縮放切換**：`POST /api/layout`、`POST /api/zoom`。
- **視窗召喚控制**：`POST /api/window`（傳入 `{"action": "show"}`）。
- **跨 AI 協作控制端點**：`POST /api/orchestration/start`、`/pause`、`/resume`、`/stop`、`GET /api/orchestration/status`。
- **與 Nomad Dashboard 深度整合**：可在 Nomad Dashboard 直接掌握工作台運行狀態並一鍵遠端喚出。

### 7.5 跨 AI 圓桌協作、接力通話與任務指派 (Multi-AI Autonomous Orchestration)

Nomad AI Studio 領先業界實現**四大頂級 AI 互相對話、接力推理與分工指派**的自動化機制：

- **頂部一鍵開啟**：點擊頂部紫光徽章 **「🤝 AI 圓桌協作」**，即可展開右側專屬調度中樞抽屜。
- **三大經典協作模式**：
  - 🔄 **鏈式接力 (Sequential Relay)**：`Claude ➔ ChatGPT ➔ Gemini ➔ Grok`，每一位 AI 回應完成後，系統自動擷取其精華觀點，套用專業交接範本指派給下一位 AI 接續深化。
  - ⚔️ **交叉辯論與審計 (Debate & Review)**：方案產出後自動指派另一模型進行安全性審計、挑刺與漏洞挖掘，實現紅藍攻防與邏輯互校。
  - 👑 **主控指揮 (Master & Workers)**：協調大模型將複雜目標拆解為子模組，分發予專長模型實作後匯報。
- **自動化監控與防護**：
  - 內建各平臺 DOM 響應擷取器（Response Extractors）與流式生成檢測器（Streaming Detectors），自動於輸出穩態時精準交棒。
  - 支援最大輪數限制（1 ~ 5 輪）與即時暫停/終止，杜絕無窮迴圈與過度消耗。
  - 每一棒都會帶上你的原始問題；單棒最多等待 10 分鐘，某一棒沒有回覆時會標示「已略過」，下一棒沿用上一份有效回覆。
  - 即時顯示當前發言 AI、接棒狀態與完整的對話接力歷史日誌。

### 7.6 跨 AI 一鍵同步提問 (1-Click Concurrent Prompt Sync)

- **統一底部輸入列**：工作站底部常駐跨 AI 統一輸入框。
- **目標平台核選**：可自由勾選要派發提問的平台（Claude、ChatGPT、Gemini、Grok，預設全選）。
- **即時並發派發**：輸入問題後按下 `Enter`（或點擊 **「一鍵同步發送 🚀」**），系統會同時將 Prompt 填入各平台輸入框並自動觸發送出（支援換行 `Shift + Enter`）。

### 7.7 對話紀錄全文檢索與 8 大工程語義標籤過濾 (Full-Text Search & Semantic Tags)

工作區提供高效的歷史會話全文檢索與標籤多維度過濾系統：

- **🔍 即時模糊全文檢索**：支援不分大小寫即時匹配對話標題、正文歷史訊息、使用者 Prompt 與自訂標籤，快速調閱過往思考脈絡。
- **🏷️ 8 大工程語義標籤過濾**：緊密對齊工程規範標準（`功能`, `修復`, `設計`, `優化`, `文件`, `探索`, `研究`, `發布`），點擊即可一鍵多選過濾。
- **動態計數徽章**：即時呈現各標籤及搜尋結果之匹配會話數量，檢索結果一目了然。

### 7.8 帳號安全與會話持久化 (Session Persistence)

- **本地獨立存儲**：所有 Cookie 與登入憑證均隔離存放於本機 `~/Library/Application Support/Nomad AI Studio` 目錄（舊版名稱為 `nomad-desktop`）。
- **一次登入，永久記住**：四大 AI 帳號只需在工作站內登入一次，關閉程式或重新開機後仍完整保持登入狀態。
- **零中繼隱私**：直接與各官方站點建立安全 TLS 連線，無任何代理伺服器或第三方數據庫介入。

### 7.9 安裝與啟動方式 (Installation & Launch)

- **官方 GitHub Releases 下載各平台安裝包**：
  - 前往 [GitHub Releases 最新發布頁](https://github.com/boboidvtw/nomad-ai-workspace/releases/latest) 直接下載對應系統安裝包：
    - 🍏 **macOS**：下載 `Nomad-AI-Studio-1.4.0-arm64.dmg` 拖曳至 Applications 安裝（或下載綠色版 Zip）。
    - 🪟 **Windows**：下載 `Nomad-AI-Studio-Setup-1.4.0.exe` 雙擊自動引導安裝。
    - 🐧 **Linux**：下載 `Nomad-AI-Studio-1.4.0.AppImage`（賦予執行權限即可運行）或 `.deb` 安裝包。
- **本機已編譯 App**：已編譯為 `/Applications/Nomad AI Studio.app`，亦可在桌面雙擊 `Nomad AI Studio.app` 直接開啟。
- **開發者命令列啟動**：在專案目錄執行：
  ```bash
  npm run desktop
  ```
  若需調試開發者工具，可執行 `npm run desktop:dev`。

### 7.10 Bots：持久身分、永久對話與多 Bot 協作 (Bots)

Bot 就是 Agent Roster 裡的一位成員，多了身分（`@handle`、名稱、頭像、persona）和一個固定綁定的 AI 對話。設計與 API 細節見 [SPEC-AGENT-BOTS](https://github.com/boboidvtw/nomad-ai-workspace/blob/main/SPEC-AGENT-BOTS.md)。

**開啟方式**：Studio 頂部的 Dashboard 連結 →「🤖 Bots」分頁（或直接開 `http://127.0.0.1:8765/dashboard#bots`）。

| 功能               | 怎麼用                                                             | 說明                                                                                                                                                         |
| :----------------- | :----------------------------------------------------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 編輯身分           | 左側選 Bot → 修改顯示名稱、頭像、分組、persona →「儲存」           | 顯示名稱決定 `@handle`（例：`Research Buddy` → `@research-buddy`）；重複的 handle 會被拒絕                                                                   |
| 永久對話           | 不用設定                                                           | 第一次派工時自動開新對話、送出 persona 並綁定；之後都回到同一個對話。對話被刪掉時會自動改綁新對話，並寫入 timeline                                           |
| 狀態燈             | 看名單右側                                                         | `待命 / 工作中 / 需要你 / 完成 / 未知`。「需要你」代表撞到用量上限、被登出或 rate limit，Studio 右下角會跳出提示；處理完後工作會自動接著跑（最多等 15 分鐘） |
| Routines           | 在任務看板新增排程，指派給該 Bot                                   | 指派給網頁版 AI 的排程**預設關閉**，要手動開啟（避免違反平台條款或產生費用）；每次執行都會記在 Bot 的 timeline                                               |
| @mention 指派      | 在「用 @handle 指派」輸入 `@claude @research-buddy 比較這兩個方案` | 同時派給每個被 @ 的 Bot，各自回覆；不認得的 `@xxx` 會原樣保留並列出                                                                                          |
| 會議室             | 輸入名稱、勾選成員 →「建立會議室」→ 送出訊息                       | 成員依序發言，後發言者看得到前面的內容；發言中送出的訊息會排隊。`⏸ Stop` 暫停全部成員，`@member` 只叫一位，`@all` 全部恢復                                   |
| CLI agent（herdr） | 新增 Bot 時平台選 `herdr`                                          | 需先安裝 [herdr](https://github.com/herdrdev/herdr)，並把 herdr 裡的 agent 名稱設成跟 Bot 的 `@handle` 一樣                                                  |

**API 範例**（Token 位於 `~/.nomad/daemon-token`）：

```bash
curl -s -H "Authorization: Bearer $(cat ~/.nomad/daemon-token)" http://127.0.0.1:8765/api/bots
```

```bash
curl -s -X POST http://127.0.0.1:8765/api/bots/mentions -H "Authorization: Bearer $(cat ~/.nomad/daemon-token)" -H "Content-Type: application/json" -d '{"text":"@claude 幫我摘要今天的 release notes"}'
```

**存放位置與隱私**：

- `~/.nomad/roster.json`（Bot 設定）、`~/.nomad/rooms.json`（會議室逐字稿），只由 Studio 寫入。
- 推送到 Google Drive 時會多一個 `nomad-bots.json`，只含 persona 與設定，**不含**對話網址與執行狀態。
- AI 回覆一律當作資料處理：Bot 之間互傳訊息有 hop 上限（4）與 loop guard（5 分鐘最多 20 則），訊息內容不會觸發審批或其他操作。

**關閉 Bots**：在 Studio 設定檔（macOS 為 `~/Library/Application Support/Nomad AI Studio/nomad-studio-settings.json`）把 `bots.enabled` 設為 `false` 後重新啟動，即回到 Bots 之前的行為（任務仍會等到 AI 回覆才完成）。

### 7.11 Laya 決策引擎 (Laya Decision Engine)

Laya 把一段文字（State）和你定義的問題（Questions）丟進模型，一次算完就回傳結構化答案，不生成文字。適合分類、分流、判斷要不要做某件事，不適合寫作或聊天。

**專案裡有兩個 Laya，彼此無關**：

|           | Laya 服務（Dashboard 卡片） | 規則版 Laya（`packages/core`） |
| :-------- | :-------------------------- | :----------------------------- |
| 原理      | 神經網路模型                | 關鍵字比對 6 組規則            |
| 需要 8555 | 需要                        | 不需要                         |
| 問題      | 自訂問題與選項              | 固定 6 種意圖                  |
| 入口      | Laya 實驗室、⌘K 導流、API   | Studio 的管線測試框            |

以下都是 Laya 服務。

**啟動與停止**（服務不會自動啟動）：

```bash
~/.gemini/antigravity-ide/scratch/laya/start_service.sh
```

```bash
~/.gemini/antigravity-ide/scratch/laya/stop_service.sh
```

```bash
curl -s http://127.0.0.1:8555/health
```

`loaded` 列出三個模型就代表可用。啟動約 10 秒，常駐約 1.4 GB 記憶體，不用時可以停掉。

**在 Dashboard 操作**：

1. 開啟 Dashboard，到 Laya 卡片按「推論實驗室」（頂部的「Laya 實驗室」相同）。
2. 在「選擇評估範例」挑一題，修改狀態文本。範例決定問題與選項，頁面上不能改。
3. 按「發送推論請求」。第一次約 2 秒，之後約 15 毫秒。
4. 讀結果（見下表）。

**用 API 自訂問題**：

```bash
curl -s http://127.0.0.1:8555/v1/systemone -H 'content-type: application/json' -d '{"state":"用戶的信用卡被盜刷 3,500 元，要求立即停卡。","questions":{"分類":{"type":"choice","instructions":"這是哪一類客訴？","criteria":{"fraud":"盜刷或爭議款項","billing":"帳單查詢"}},"停卡":{"type":"noul","instructions":"是否需要立即停卡？","criteria":{"true":"需要","false":"不需要"}}}}'
```

| 問題類型 | 用途     | 結果看哪個欄位                                 |
| :------- | :------- | :--------------------------------------------- |
| `choice` | 多選一   | `choice` 是答案，`probabilities` 是各選項機率  |
| `noul`   | 是或否   | `noul`，越接近 1 越偏「是」                    |
| `score`  | 分級評分 | `score` 是 0 起算的級數，`legend` 對照級數意義 |

`answer_confidence` 是最高選項的機率；要依信心自動執行動作時，先用自己的資料確認門檻。`score` 對選項描述很敏感，描述寫得越具體，結果越穩定。

**常見問題**：

| 現象                             | 原因                        | 處理                                                                                                                       |
| :------------------------------- | :-------------------------- | :------------------------------------------------------------------------------------------------------------------------- |
| 卡片顯示 OFFLINE，`/health` 正常 | Dashboard 不是由 Nomad 開啟 | 從 Studio 或 `http://127.0.0.1:8765/dashboard` 開啟；Dashboard 經由 Nomad 的 `/api/laya/*` 呼叫 Laya，Laya 不需要設定 CORS |
| `/health` 連不上                 | 服務沒開或啟動失敗          | 執行 `start_service.sh`，再看同目錄的 `laya_serve.log`                                                                     |
| 選項超過 20 個時準確率下降       | 選項共用固定的 token 額度   | 拆成兩層問題，或改用 Jev                                                                                                   |

**和 TypeSafe Jev 的差別**：Laya 相容 Jev 的 `POST /v1/systemone` 協定，既有 Jev 客戶端改 `baseUrl` 就能用。Laya 是可自架的開源權重，資料不離開本機，沒有 API 費用；Jev 是閉源雲端服務，不必自備算力，選項很多時準確率較高。

### 7.12 Dashboard 一鍵啟動與關閉 (Service Controls)

每張卡片都有「▶ 啟動」「■ 關閉」按鈕和「📖 操作說明」。狀態由本機程式實際檢查，按下後會顯示「啟動中…」，完成後變成「執行中」或失敗原因。

| 卡片                 | 啟動                 | 關閉                  | 備註                                 |
| :------------------- | :------------------- | :-------------------- | :----------------------------------- |
| Laya                 | 啟動 8555 服務       | 停止服務              |                                      |
| LM Studio            | 開啟 1234 本機 API   | 只停 API              | 模型要另外載入                       |
| ComfyUI              | 啟動 8188            | 停止該程序            |                                      |
| Hermes Web           | 啟動 9119 管理介面   | 停止                  | 第一次要建置                         |
| Hermes Telegram 閘道 | 連上 Telegram        | 中斷連線              | 會開始回覆訊息，所以啟動前會詢問     |
| MAIH                 | 建置並啟動全部容器   | `docker compose down` | 第一次需要幾分鐘，資料保留在 volume  |
| PostgreSQL           | 啟動資料庫           | `docker compose down` | 關閉時 Adminer 一起停，資料保留      |
| Redis                | 啟動 Redis           | `docker compose down` | 資料保留                             |
| Adminer              | 連同 PostgreSQL 啟動 | 只停 Adminer          |                                      |
| Obsidian             | 開啟 App             | 結束 App              |                                      |
| Nomad AI Studio      | 開啟 App             | 結束 App              | 會連 Dashboard 一起關，所以會詢問    |
| Claude Code、Codex   | 開新的終端機視窗     | 不提供                | 請在終端機結束，以免中斷其他工作階段 |

Docker 類服務會先自動開啟 OrbStack。OrbStack 啟動時，其他設定自動重啟的容器（例如 cumora）也會一起起來。關閉服務不會關閉 OrbStack，不用時請自行關閉。如果 OrbStack 在啟動途中重啟（例如自動更新），會自動再試一次；仍失敗才顯示「請再試一次」。

**安全設計**：

- 按鈕只送服務 ID。指令寫死在 `packages/core/src/services/service-registry.js`，請求內容不會變成指令。
- API 需要 `~/.nomad/daemon-token`，並檢查 Host 與 Origin。
- 不經過 shell 執行，也不會加上刪除資料的參數。
- 關閉前會核對程序指令列，不符就拒絕，不會誤關其他程式。程式 10 秒內沒有結束時，會再核對一次指令列，相符才強制結束（SIGKILL）。

**執行紀錄**：`~/.nomad/service-logs/<服務 ID>.log`。按鈕顯示失敗時先看這裡。

**API**（Token 位於 `~/.nomad/daemon-token`）：

```bash
curl -s -H "Authorization: Bearer $(cat ~/.nomad/daemon-token)" http://127.0.0.1:8765/api/services
```

```bash
curl -s -X POST -H "Authorization: Bearer $(cat ~/.nomad/daemon-token)" http://127.0.0.1:8765/api/services/comfyui/start
```

---

### 7.13 排程行事曆 (Schedule Calendar)

Dashboard 的「📅 排程行事曆」分頁用月曆顯示定時排程，日期依你電腦的時區切分：

| 標記    | 意思                      | 資料來源                                                  |
| :------ | :------------------------ | :-------------------------------------------------------- |
| 預計 ×N | 這天排程預計執行 N 次     | 用排程的下次執行時間和間隔往後推算；停用的排程不顯示      |
| 已跑 ×N | 這天排程已經建立 N 個任務 | 任務的 `metadata.triggeredByScheduleId`；有失敗時標成紅色 |
| 回讀    | 交付功能的回讀到期        | 見 7.14                                                   |
| 目標    | 交付功能的目標日          | 見 7.14                                                   |

時區優先用瀏覽器回報的 IANA 時區，跨夏令時間也會切對日期。點一天看明細：第一次執行時間、指派給誰、各狀態的任務數。太密集的排程（例如每秒一次）只推算前 10 萬次，畫面會提示。

```bash
curl -s -H "Authorization: Bearer $(cat ~/.nomad/daemon-token)" \
  "http://127.0.0.1:8765/api/calendar?from=2026-11-01T00:00:00Z&to=2026-12-01T00:00:00Z&tz=-480"
```

`timeZone` 是 IANA 時區（可省略）；`tz` 是 `Date#getTimezoneOffset()`（台北是 -480，範圍 ±1440），沒有 `timeZone` 時才用。一次最多查 62 天。

### 7.14 交付生命週期 (Shipping)

「🚢 交付」分頁把一個功能從構想追到上線後確認有效，每一關要有證據才放行。流程借鏡 [Cumora](https://github.com/yetone/cumora) 的 SHIPPING.md（MIT）：

`草稿 → 契約 → 建造中 → 驗證中 → 就緒 → 發布中 → 觀察中 → 已學到`，另有「暫停」與「封存」。

| 進入   | 需要                                                               |
| :----- | :----------------------------------------------------------------- |
| 契約   | 問題、期望結果、契約                                               |
| 建造中 | 至少一位建造者、一條不變條件                                       |
| 驗證中 | 每條必要不變條件都有證據方格涵蓋；每個必要方格都有負責人           |
| 就緒   | 必要方格全部通過，而且有通過的 user-path、trace、release-note 方格 |
| 發布中 | 發布說明、回滾方式、可量測的基準、核准者                           |
| 觀察中 | 冒煙測試通過；回讀在 24 小時後到期                                 |
| 已學到 | 回讀通過，而且這個功能沒有失敗中的回歸項目                         |

**規則**：

- 方格要有證據才能標成通過或失敗。建造者不能讓自己的方格通過，也不能核准自己的發布；核准只能由核准者本人記錄。
- 進入建造中後建造者名單就固定；就緒後不能再加方格，把方格改回未通過會退回驗證中。每一關都會重新檢查前面所有關卡。
- 回讀要等到期（冒煙測試通過 24 小時後）才能記為通過；失敗隨時可以記。
- 身分（actor）由呼叫端自己填，本機只有一把 token，所以分權是提醒用的規則，不是權限控管。
- 方格失敗會自動建立一筆「摩擦」和一個失敗中的「回歸項目」；同一個方格再失敗只更新原本那筆，不會重複新增。
- 冒煙測試或回讀失敗會退回建造中，方格全部重開；回讀失敗記為 critical 摩擦。
- 回讀超過到期時間還沒記錄，會標成逾期並建立一筆 medium 摩擦（每分鐘檢查一次）。
- 方格可以「連結任務」：該任務在任務派遣中心的 review gate 被核准，方格就自動通過，退回則失敗；證據會寫入核准者與回饋。
- 每次變更都寫進只增不改的事件紀錄。資料存在 `~/.nomad/shipping.json`（權限 0600）；daemon 與 Studio 共用這個檔案，一邊寫入後另一邊會自動重讀。

**API**：`/api/shipping`（清單、建立）、`/api/shipping/<id>`（讀取、PATCH 契約）、`/api/shipping/<id>/{advance,pause,resume,archive,invariants,squares,release,smoke,readback,regressions}`、`/api/shipping/<id>/squares/<方格 id>`（記錄結果）、`.../link`（連結任務）、`/api/shipping/friction`、`/api/shipping/regressions/<id>`。關卡沒過會回 409，`details.missing` 列出缺什麼。

### 7.15 本機模型操作桌面 App (Desktop Agent)

用 LM Studio 上的本機模型，透過 [agent-desktop](https://github.com/vercel-labs/agent-desktop)（Apache-2.0）讀取 macOS App 的輔助使用樹、點擊與輸入文字。模型與畫面內容都不離開這台電腦。

**事前準備**：

| 項目               | 做法                                                                                                                                                  |
| :----------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------- |
| 安裝 agent-desktop | `npm i -g agent-desktop`；Studio 會在 PATH、`~/.local/bin`、`/opt/homebrew/bin`、`/usr/local/bin` 找它，也可用環境變數 `NOMAD_AGENT_DESKTOP_BIN` 指定 |
| 輔助使用權限       | 系統設定 → 隱私權與安全性 → 輔助使用，加入 **Nomad AI Studio**（執行 `agent-desktop permissions --guide` 會帶你過去）                                 |
| 本機模型           | LM Studio 載入支援 tool calling 的模型並啟動 server（`lms server start`），實測 `qwen3.8-27b-uncensored-mlx` 可用                                     |

**使用方式**：側邊欄「⚙️ 設定」分頁 →「🖥️ 本機模型操作桌面 App」（在「本機大模型雙軌引擎」下方）。填 App 名稱（例 `Finder`）、模型（空白＝server 上第一個模型）、步數上限（預設 8，最多 20）與任務 →「▶ 執行」。每一步的工具呼叫與結果會即時列出，最後顯示答案；「■ 中止」會在目前這一步結束後停止。端點沿用上方「本機推論端點」的主機與埠，只接受本機位址。

**模型能做的事只有四個**：`snapshot`（讀畫面）、`click`、`type`、`done`。沒有快捷鍵、開關 App、刪除或存檔，所以要先自己把 App 和視窗打開。

| 現象                                                           | 說明                                                                         |
| :------------------------------------------------------------- | :--------------------------------------------------------------------------- |
| 點擊結果「unknown」                                            | macOS 常回報「結果不確定」但其實成功，模型會被要求重新讀畫面確認，而不是重點 |
| 文字區點擊被拒（`POLICY_DENIED`）                              | TextEdit 等文字區常見；直接 `type` 即可，模型通常會自己改用                  |
| 立刻結束：`WINDOW_NOT_FOUND` / `APP_NOT_FOUND` / `PERM_DENIED` | App 沒開視窗、沒在執行或沒有輔助使用權限；模型無法自行處理，先手動排除       |
| 多個視窗                                                       | 自動挑目前焦點（或第一個可見）的視窗                                         |
| 速度                                                           | 27B 模型每步約 10–30 秒；實測 Finder 4 步約 90 秒、TextEdit 5 步約 40 秒     |

**隱私**：畫面內容只送到本機模型，Studio 的 log 只記工具名稱與成功與否。agent-desktop 會把 snapshot 紀錄存在 `~/.agent-desktop/`，不需要時可以刪掉。

## 8. 🔄 更新後重新載入方式 (How to Reload)

1. 開啟 Chrome 擴充功能管理頁面：`chrome://extensions/`。
2. 找到 **Nomad AI Workspace** 並點擊卡片右下角的 **「重新載入 (🔄)」** 圖示。
3. 回到 [grok.com](https://grok.com/)、[claude.ai](https://claude.ai/)、[chatgpt.com](https://chatgpt.com/) 或 [gemini.google.com](https://gemini.google.com/) 重新整理頁面（`Cmd + R` 或 `F5`）。
4. 即可立即享受最新功能與完美的側邊欄整合體驗！
