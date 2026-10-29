# GitHub 私人 Repo 同步設定指南

除了 Google Drive 與 iCloud，雲端同步也可以把資料存在**你自己的私人 GitHub repo**。檔案結構與 Google Drive 相同；每次內容有變更就是一個 commit，所以 git 歷史就是版本紀錄，任何舊版本都能還原。

| 項目                   | Google Drive        | GitHub                                                                            |
| :--------------------- | :------------------ | :-------------------------------------------------------------------------------- |
| 版本紀錄               | 無（覆蓋寫入）      | 每次變更一個 commit                                                               |
| 授權方式               | Google OAuth        | Fine-grained Personal Access Token                                                |
| 其他 AI 工具能否直接讀 | 需另外接 Drive      | Claude Code、Codex、Gemini CLI 讀本機 clone；ChatGPT / Claude 用 GitHub connector |
| 刪除                   | 網頁刪除 + 刪除標記 | 刪除標記，需要時用 git 還原                                                       |

兩種方式並存，可以隨時在「雲端同步 → 同步方式」切換回 Google Drive。

---

## 1. 建立私人 repo

1. 到 [github.com/new](https://github.com/new) 建立一個 repo，例如 `nomad-sync-data`。
2. **Visibility 選 Private**。擴充套件會檢查，公開 repo 一律拒絕連線，避免同步資料外流。
3. 勾選「Add a README file」或不勾都可以；連線成功時，擴充套件會在 repo 沒有 `README.md` 的情況下自動寫入一份說明檔案結構的 README。

## 2. 建立 Fine-grained Token

1. 開啟 [Settings → Developer settings → Fine-grained tokens](https://github.com/settings/personal-access-tokens/new)。
2. **Repository access** 選「Only select repositories」，只勾剛建立的 repo。
3. **Repository permissions → Contents** 設為 **Read and write**，其他權限都不用開。
4. 設定到期日（建議 90 天內），按 Generate，複製 token。

> Token 只存在這台瀏覽器的擴充套件本機儲存（`chrome.storage.local`，未加密），不會寫進同步檔案，也不會在設定畫面回顯。請只授權這一個 repo，到期後重新產生即可。

## 3. 在擴充套件中連線

1. 開啟擴充套件 Popup → **雲端同步**。
2. 「同步方式」選 **GitHub**，「同步模式」選 **手動**。
3. 填入擁有者（你的 GitHub 帳號或組織）、Repository、分支（預設 `main`）、Token。
4. 按 **儲存並測試**。瀏覽器會要求允許存取 `api.github.com`，請按允許。
5. 顯示「已連線到 owner/repo」即完成。之後要換 token，只要填新 token 再儲存；其他欄位留著即可。「移除 Token」會清掉本機 token，repo 內容不受影響。

## 4. 從 Google Drive 搬家

不需要另外的匯入工具，用本機資料當中繼：

1. 在 **Google Drive** 方式下按 **從雲端還原 → 合併**，再按 **全部同步**，確保本機已有雲端的最新資料。
2. 切換到 **GitHub** 方式並完成第 3 步。
3. 按 **立即備份** 與 **全部同步**，資料就會寫進 repo。
4. 到 GitHub 確認 repo 內出現 `gemini-voyager-*.json` 與 `Claude/`、`ChatGPT/`、`Gemini/`、`Grok/`、`Shared/` 資料夾。
5. 確認沒問題後，可以到 Google Drive 刪除 `Nomad Workspace Data/`，或保留作為備份。

## 5. 刪除標記（所有同步方式都適用）

合併還原是把兩邊資料取聯集，舊版沒有記錄「刪除」，所以在 A 裝置刪掉的資料夾或提示詞，會在下次合併時從雲端或 B 裝置被補回來。現在：

- 擴充套件會在本機記錄每一筆被刪除的資料夾、對話歸屬、提示詞與星標（存在 `nomadSyncTombstones`）。
- 每次同步會把刪除標記合併後上傳到 `Shared/sync-tombstones.json`，其他裝置同步時就會一起刪除。
- 刪除之後又編輯或重新加入（時間較新）的項目會保留，不會被誤刪。
- 標記保留 180 天後自動清除。
- 「從雲端還原 → 覆蓋」是把本機換成雲端版本，不會產生刪除標記。
- 一次把 10 筆以上的資料清空（例如重置或資料遷移）視為重置，不會產生刪除標記，避免誤刪擴散到其他裝置。

## 6. 讓其他 AI 工具讀取同一份資料

repo 根目錄的 `README.md` 說明每個檔案的內容與安全的修改方式，AI 工具讀到它就知道怎麼用。

| 工具                             | 方式                                                                                                   |
| :------------------------------- | :----------------------------------------------------------------------------------------------------- |
| Claude Code / Codex / Gemini CLI | `git clone` 這個 repo 到本機，在該資料夾開 session，請它讀 `README.md` 後查詢或修改；改完 commit、push |
| ChatGPT                          | 設定 → Connectors → GitHub，授權這個 repo 後即可在對話中引用                                           |
| Claude.ai                        | 專案或對話中加入 GitHub integration，選這個 repo                                                       |

手動或請 AI 修改時：

- 修改項目要一併提高 `updatedAt`（毫秒），其他裝置合併時才會採用新版本。
- 刪除項目要同時在 `Shared/sync-tombstones.json` 對應的資料集下加上 id 與目前時間，否則其他裝置會把它補回來。
- 擴充套件會在下一次「從雲端還原 → 合併」或「全部同步」時讀到這些修改。

## 常見問題

| 錯誤訊息                                   | 原因與處理                                                          |
| :----------------------------------------- | :------------------------------------------------------------------ |
| `The sync repository must be private`      | repo 是公開的。改成 Private，或另建私人 repo                        |
| `The token needs write access`             | Token 沒有 Contents 寫入權限，重新產生 token                        |
| `401 (token invalid or expired)`           | Token 過期或被撤銷，填入新 token 再儲存                             |
| `404 (repository or branch not found)`     | 擁有者、repo 名稱或分支打錯，或 token 沒有授權這個 repo             |
| `403 (token lacks access or rate limited)` | Token 權限不足，或短時間內請求太多（每小時 5,000 次上限），稍後再試 |
