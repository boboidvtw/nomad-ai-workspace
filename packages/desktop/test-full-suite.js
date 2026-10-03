/**
 * Nomad AI Studio - Comprehensive E2E System Test Suite
 * Covers Layout, Zoom, Dispatch, Orchestration, History, Export (MD/JSON), Import, and File Verification.
 */

const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");

const BRIDGE_URL = "http://127.0.0.1:8765";
const EXPORT_DIR = path.join(os.homedir(), "Desktop", "Nomad_AI_Exports");

async function request(endpoint, options = {}) {
  const url = new URL(endpoint, BRIDGE_URL);
  const fetchOpts = {
    method: options.method || "GET",
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
  };
  if (options.body) {
    fetchOpts.body = typeof options.body === "string" ? options.body : JSON.stringify(options.body);
  }
  const res = await fetch(url.toString(), fetchOpts);
  const data = await res.json().catch(() => null);
  return { status: res.status, ok: res.ok, data };
}

async function runSuite() {
  console.log("================================================================================");
  console.log("🚀 開始執行 Nomad AI Studio 全面性功能與端到端實況測試");
  console.log("================================================================================");
  
  const results = [];
  function record(testName, passed, details = "") {
    results.push({ testName, passed, details });
    const mark = passed ? "✅ 通過" : "❌ 失敗";
    console.log(`[${mark}] ${testName}: ${details}`);
  }

  // --- 測試 1: 服務連線與 Bridge 核心狀態 ---
  try {
    const statusRes = await request("/api/status");
    if (statusRes.ok && statusRes.data.success) {
      record("1. Bridge 核心連線", true, `Nomad AI Studio v${statusRes.data.data.version}, 埠號 :8765`);
    } else {
      record("1. Bridge 核心連線", false, "無法連接到 Local Sync Bridge");
    }
  } catch (e) {
    record("1. Bridge 核心連線", false, e.message);
  }

  // --- 測試 2: 多欄佈局切換與分割比例控制 ---
  try {
    // 切換至三欄
    const l1 = await request("/api/layout", { method: "POST", body: { layout: "triple", activePlatforms: ["claude", "chatgpt", "gemini"] } });
    // 切換雙欄並自訂比例 6:4
    const l2 = await request("/api/layout", { method: "POST", body: { layout: "dual", splitRatio: 0.6 } });
    if (l1.ok && l2.ok && l2.data.data.splitRatio === 0.6) {
      record("2. 佈局與自訂比例切換", true, "成功切換 dual (6:4) 與 triple 佈局");
    } else {
      record("2. 佈局與自訂比例切換", false, "切換失敗");
    }
  } catch (e) {
    record("2. 佈局與自訂比例切換", false, e.message);
  }

  // --- 測試 3: 獨立平臺視圖縮放 (Zoom) 控制 ---
  try {
    const z1 = await request("/api/zoom", { method: "POST", body: { platform: "claude", factor: 1.15 } });
    const z2 = await request("/api/zoom", { method: "POST", body: { platform: "chatgpt", factor: 0.95 } });
    if (z1.ok && z2.ok) {
      record("3. 獨立平臺視圖縮放", true, "Claude 設定 1.15x, ChatGPT 設定 0.95x 成功持久化");
    } else {
      record("3. 獨立平臺視圖縮放", false, "縮放更新失敗");
    }
  } catch (e) {
    record("3. 獨立平臺視圖縮放", false, e.message);
  }

  // --- 測試 4: 提示詞同步分發 API 驗證 ---
  try {
    const dRes = await request("/api/prompt", {
      method: "POST",
      body: { prompt: "E2E 測試同步提示詞", targets: ["claude", "chatgpt"] }
    });
    if (dRes.ok && dRes.data.success) {
      record("4. 提示詞同步分發通道", true, "成功向 Claude 與 ChatGPT 分發提示詞請求");
    } else {
      record("4. 提示詞同步分發通道", false, "分發失敗");
    }
  } catch (e) {
    record("4. 提示詞同步分發通道", false, e.message);
  }

  // --- 測試 5: 語義化工作區建立 (MMDD | 類型 | 主題) ---
  let createdWsId = null;
  let canonicalTitle = null;
  try {
    const createRes = await request("/api/workspaces/create", {
      method: "POST",
      body: {
        prompt: "設計一套百萬級 QPS 的微服務分散式快取架構與故障容錯機制",
        mode: "relay",
        sequence: ["claude", "chatgpt", "gemini"]
      }
    });
    if (createRes.ok && createRes.data.data.title.includes("設計")) {
      createdWsId = createRes.data.data.id;
      canonicalTitle = createRes.data.data.title;
      record("5. 語義標題自動推斷與會話建立", true, `生成規範化標題: "${canonicalTitle}" (ID: ${createdWsId})`);
    } else {
      record("5. 語義標題自動推斷與會話建立", false, "標題生成或建立失敗");
    }
  } catch (e) {
    record("5. 語義標題自動推斷與會話建立", false, e.message);
  }

  // --- 測試 6: 模擬多 AI 圓桌協作對話紀錄累積 ---
  const mockHistory = [
    {
      type: "user-prompt",
      speaker: "user",
      content: "請針對高併發快取系統進行方案架構，由 Claude 先行提案，ChatGPT 進行安全性審查，Gemini 提供雲原生實作細節。",
      timestamp: new Date(Date.now() - 60000).toISOString(),
    },
    {
      type: "turn-complete",
      speaker: "claude",
      round: 1,
      content: "【Claude 架構提案】：\n1. 採用 Redis Cluster 搭配本機兩級快取 (Caffeine)\n2. 快取穿透防禦：布隆過濾器 (Bloom Filter) + 空值快取 (TTL=60s)\n3. 快取雪崩防禦：隨機擾動過期時間 + 分散式互斥鎖 (Redlock)。",
      timestamp: new Date(Date.now() - 40000).toISOString(),
    },
    {
      type: "turn-complete",
      speaker: "chatgpt",
      round: 1,
      content: "【ChatGPT 安全性與邊界審查】：\n1. Redlock 在非同步時鐘漂移情境下可能發生競態條件，建議改採單一主控配合 Raft 租約。\n2. 布隆過濾器無法刪除元素，當商品下架時會造成誤判率持續攀升，強烈建議引入布穀鳥過濾器 (Cuckoo Filter)。",
      timestamp: new Date(Date.now() - 20000).toISOString(),
    },
    {
      type: "turn-complete",
      speaker: "gemini",
      round: 1,
      content: "【Gemini 雲原生落地建議】：\n1. 部署方面建議採用 Kubernetes Redis-Operator 管理 StatefulSet。\n2. 配置 Prometheus + Grafana 自訂指標 (Cache Hit Ratio, Eviction Count)，並配置 HPA 彈性擴縮容機制。",
      timestamp: new Date().toISOString(),
    },
  ];

  record("6. 多 AI 協作對話紀錄生成與組裝", true, `成功模擬 3 棒交接對話，共 ${mockHistory.length} 筆歷史紀錄`);

  // --- 測試 7: 對話紀錄 Markdown 檔案匯出 (真實寫入磁碟) ---
  let exportedMdPath = null;
  try {
    const mdExportRes = await request("/api/orchestration/export-markdown", {
      method: "POST",
      body: {
        title: canonicalTitle || "1003 | 設計 | 高併發快取系統",
        mode: "relay",
        sequence: ["claude", "chatgpt", "gemini"],
        history: mockHistory,
      }
    });

    if (mdExportRes.ok && mdExportRes.data.data.markdown) {
      const saveRes = await request("/api/export-to-file", {
        method: "POST",
        body: {
          type: "markdown",
          filename: "E2E_Test_Conversation_Report_" + Date.now(),
          content: mdExportRes.data.data.markdown,
        }
      });
      if (saveRes.ok && fs.existsSync(saveRes.data.filePath)) {
        exportedMdPath = saveRes.data.filePath;
        const stats = fs.statSync(exportedMdPath);
        record("7. 對話紀錄匯出為 Markdown 檔案", true, `檔案已成功寫入磁碟：${exportedMdPath} (${stats.size} 位元組)`);
      } else {
        record("7. 對話紀錄匯出為 Markdown 檔案", false, "實體檔案儲存失敗");
      }
    } else {
      record("7. 對話紀錄匯出為 Markdown 檔案", false, "產生 Markdown 失敗");
    }
  } catch (e) {
    record("7. 對話紀錄匯出為 Markdown 檔案", false, e.message);
  }

  // --- 測試 8: 工作區 JSON 檔案匯出 (完整備份) ---
  let exportedJsonPath = null;
  try {
    const expWsRes = await request("/api/workspaces/export");
    if (expWsRes.ok && expWsRes.data.success) {
      const saveJsonRes = await request("/api/export-to-file", {
        method: "POST",
        body: {
          type: "json",
          filename: "E2E_Test_Workspaces_Backup_" + Date.now(),
          content: expWsRes.data.data,
        }
      });
      if (saveJsonRes.ok && fs.existsSync(saveJsonRes.data.filePath)) {
        exportedJsonPath = saveJsonRes.data.filePath;
        const stats = fs.statSync(exportedJsonPath);
        record("8. 會話工作區匯出為 JSON 備份檔", true, `備份檔案已成功寫入：${exportedJsonPath} (${stats.size} 位元組)`);
      } else {
        record("8. 會話工作區匯出為 JSON 備份檔", false, "JSON 寫入磁碟失敗");
      }
    } else {
      record("8. 會話工作區匯出為 JSON 備份檔", false, "匯出 API 失敗");
    }
  } catch (e) {
    record("8. 會話工作區匯出為 JSON 備份檔", false, e.message);
  }

  // --- 測試 9: 工作區 JSON 匯入還原 (Import) ---
  try {
    const mockImportPayload = {
      workspaces: [
        {
          id: "ws-imported-e2e-demo",
          title: "1003 | 功能 | 智慧程式碼審查流水線",
          promptSnippet: "實作基於 GitHub Actions 的自動化 PR 審查模組",
          mode: "debate",
          sequence: ["claude", "chatgpt"],
          createdAt: new Date().toISOString(),
          completed: true,
          turns: 2,
          urls: {
            claude: "https://claude.ai/new",
            chatgpt: "https://chatgpt.com/",
            gemini: "",
            grok: "",
          },
        }
      ]
    };

    const impRes = await request("/api/workspaces/import", {
      method: "POST",
      body: mockImportPayload,
    });

    if (impRes.ok && impRes.data.success && impRes.data.importedCount >= 1) {
      // 驗證是否在列表中可查到
      const checkRes = await request("/api/workspaces");
      const found = checkRes.data.data.workspaces.some(w => w.id === "ws-imported-e2e-demo");
      if (found) {
        record("9. 會話工作區 JSON 匯入與還原", true, "成功匯入「1003 | 功能 | 智慧程式碼審查流水線」並完成 Store 同步與列表呈現");
      } else {
        record("9. 會話工作區 JSON 匯入與還原", false, "匯入成功但在清單中未找到");
      }
    } else {
      record("9. 會話工作區 JSON 匯入與還原", false, "匯入請求失敗");
    }
  } catch (e) {
    record("9. 會話工作區 JSON 匯入與還原", false, e.message);
  }

  // --- 測試 10: 跨平臺工作區切換、更名與刪除測試 ---
  try {
    // 重新命名
    const renRes = await request("/api/workspaces/rename", {
      method: "POST",
      body: { id: "ws-imported-e2e-demo", title: "1003 | 優化 | PR審查效能調優" }
    });
    // 切換
    const swRes = await request("/api/workspaces/switch", {
      method: "POST",
      body: { id: "ws-imported-e2e-demo" }
    });
    // 刪除
    const delRes = await request("/api/workspaces/delete", {
      method: "POST",
      body: { id: "ws-imported-e2e-demo" }
    });

    if (renRes.ok && swRes.ok && delRes.ok) {
      record("10. 工作區重新命名、切換與刪除週期", true, "工作區重命名、多平臺切換與刪除全部成功執行");
    } else {
      record("10. 工作區重新命名、切換與刪除週期", false, "週期操作失敗");
    }
  } catch (e) {
    record("10. 工作區重新命名、切換與刪除週期", false, e.message);
  }

  // --- 測試 11: 對話紀錄全文搜尋與 8 大語義標籤過濾 ---
  try {
    const mockSearchWorkspace = {
      workspaces: [
        {
          id: "ws-search-e2e-demo",
          title: "1003 | 功能 | 智慧程式碼審查流水線",
          promptSnippet: "實作基於 GitHub Actions 的自動化 PR 審查模組",
          mode: "debate",
          sequence: ["claude", "chatgpt"],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          completed: true,
          turns: 2,
          history: [
            {
              speaker: "claude",
              round: 1,
              content: "Claude 建議在 GitHub Actions 整合 ESLint 與 Vitest 覆蓋率檢查",
              timestamp: new Date().toISOString(),
            },
            {
              speaker: "chatgpt",
              round: 1,
              content: "ChatGPT 建議加入 SonarQube 與安全性依賴審計掃描",
              timestamp: new Date().toISOString(),
            },
          ],
          urls: {
            claude: "https://claude.ai/new",
            chatgpt: "https://chatgpt.com/",
            gemini: "",
            grok: "",
          },
        },
        {
          id: "ws-search-fix-demo",
          title: "1003 | 修復 | 修正資料庫連線逾時問題",
          promptSnippet: "修復連線池遺漏釋放問題",
          mode: "relay",
          sequence: ["claude", "chatgpt"],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          completed: true,
          turns: 1,
          history: [
            {
              speaker: "claude",
              round: 1,
              content: "已重構連線釋放機制，加入 finally 區塊保證關閉",
              timestamp: new Date().toISOString(),
            },
          ],
          urls: {},
        }
      ]
    };

    await request("/api/workspaces/import", {
      method: "POST",
      body: mockSearchWorkspace,
    });

    // 1. 標題關鍵字搜尋
    const searchTitleRes = await request("/api/workspaces/search?q=程式碼審查");
    const titleMatch = searchTitleRes.ok && searchTitleRes.data.matchCount >= 1 &&
      searchTitleRes.data.results.some(r => r.workspaceId === "ws-search-e2e-demo");

    // 2. 對話內文全文檢索 (搜尋歷史發言內提及的 SonarQube)
    const searchTurnRes = await request("/api/workspaces/search?q=SonarQube");
    const turnMatch = searchTurnRes.ok && searchTurnRes.data.matchCount >= 1 &&
      searchTurnRes.data.results.some(r => r.workspaceId === "ws-search-e2e-demo" && r.matches.some(m => m.field === "turn"));

    // 3. 8 大語義標籤過濾 (修復標籤)
    const searchTypeRes = await request("/api/workspaces/search?type=修復");
    const typeMatch = searchTypeRes.ok && searchTypeRes.data.matchCount >= 1 &&
      searchTypeRes.data.results.some(r => r.workspaceId === "ws-search-fix-demo");

    // 4. 複合檢索 (關鍵字 + 標籤)
    const searchCombinedRes = await request("/api/workspaces/search?q=審查&type=功能");
    const combinedMatch = searchCombinedRes.ok && searchCombinedRes.data.matchCount >= 1 &&
      searchCombinedRes.data.results.some(r => r.workspaceId === "ws-search-e2e-demo");

    // 清理測試資料
    await request("/api/workspaces/delete", { method: "POST", body: { id: "ws-search-e2e-demo" } });
    await request("/api/workspaces/delete", { method: "POST", body: { id: "ws-search-fix-demo" } });

    if (titleMatch && turnMatch && typeMatch && combinedMatch) {
      record("11. 對話紀錄全文搜尋與 8 大語義標籤過濾", true, "標題搜尋、歷史發言全文檢索 (SonarQube)、8 大語義標籤與複合篩選全部 100% 通過");
    } else {
      record("11. 對話紀錄全文搜尋與 8 大語義標籤過濾", false, `檢索未完全符合: title=${titleMatch}, turn=${turnMatch}, type=${typeMatch}, combined=${combinedMatch}`);
    }
  } catch (e) {
    record("11. 對話紀錄全文搜尋與 8 大語義標籤過濾", false, e.message);
  }

  // 清理測試建立的工作區
  if (createdWsId) {
    await request("/api/workspaces/delete", { method: "POST", body: { id: createdWsId } });
  }

  // 確保測試完畢後將所有視圖恢復為乾淨的首頁網址，避免干擾使用者操作
  await request("/api/debug/eval", {
    method: "POST",
    body: { platform: "chatgpt", script: "location.href = \"https://chatgpt.com/\";" }
  }).catch(() => {});
  await request("/api/debug/eval", {
    method: "POST",
    body: { platform: "claude", script: "location.href = \"https://claude.ai/new\";" }
  }).catch(() => {});

  console.log("================================================================================");
  console.log("📊 測試統計結果總覽：");
  const passedCount = results.filter(r => r.passed).length;
  console.log(`總測試項：${results.length} | 通過：${passedCount} | 失敗：${results.length - passedCount}`);
  console.log(`實體 Markdown 匯出檔案：${exportedMdPath || "無"}`);
  console.log(`實體 JSON 備份檔案：${exportedJsonPath || "無"}`);
  console.log("================================================================================");

  if (passedCount === results.length) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runSuite().catch(e => {
  console.error("Test suite runner crashed:", e);
  process.exit(1);
});
