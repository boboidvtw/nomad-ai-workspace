/**
 * Real-Browser Verification Script for Google Drive Multi-AI Bidirectional Sync
 * Validates runtime message routes, state retrieval, and Scheme A platform endpoints.
 */

import { spawn } from "child_process";
import { writeFileSync } from "fs";
import { resolve } from "path";
import http from "http";

const BRAVE_PATH = "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser";
const EXT_PATH = resolve(process.cwd(), "dist_chrome");
const ARTIFACT_DIR = "/Users/liyungchih-macstudio/.gemini/antigravity-ide/brain/fab1e8a4-4953-4c8e-ae8e-a635b27cc988";
const DEBUG_PORT = 9334;
const USER_DATA_DIR = resolve(ARTIFACT_DIR, "scratch/chrome_profile_sync_test");

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function fetchJson(url) {
  return new Promise((res, rej) => {
    http.get(url, (resp) => {
      let data = "";
      resp.on("data", (c) => (data += c));
      resp.on("end", () => {
        try {
          res(JSON.parse(data));
        } catch (e) {
          rej(e);
        }
      });
    }).on("error", rej);
  });
}

async function waitForHttp(url, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      return await fetchJson(url);
    } catch {
      await sleep(300);
    }
  }
  throw new Error("Timeout waiting for " + url);
}

class CDPClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.id = 1;
    this.pending = new Map();
  }

  async connect() {
    return new Promise((res, rej) => {
      import("ws").then(({ default: WebSocket }) => {
        this.ws = new WebSocket(this.wsUrl);
        this.ws.on("open", res);
        this.ws.on("error", rej);
        this.ws.on("message", (raw) => {
          const msg = JSON.parse(raw.toString());
          if (msg.id && this.pending.has(msg.id)) {
            const { resolve: rResolve, reject: rReject } = this.pending.get(msg.id);
            this.pending.delete(msg.id);
            if (msg.error) rReject(new Error(JSON.stringify(msg.error)));
            else rResolve(msg.result);
          }
        });
      });
    });
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const msgId = this.id++;
      this.pending.set(msgId, { resolve, reject });
      this.ws.send(JSON.stringify({ id: msgId, method, params }));
    });
  }

  async evaluate(expr) {
    const res = await this.send("Runtime.evaluate", {
      expression: expr,
      awaitPromise: true,
      returnByValue: true,
    });
    return res.result?.value;
  }

  close() {
    this.ws.close();
  }
}

async function run() {
  console.log("=== STARTING GOOGLE DRIVE SYNC REAL-BROWSER VERIFICATION ===");
  console.log("[Verify] Launching Brave with extension: " + EXT_PATH);

  const browserProcess = spawn(
    BRAVE_PATH,
    [
      `--remote-debugging-port=${DEBUG_PORT}`,
      `--disable-extensions-except=${EXT_PATH}`,
      `--load-extension=${EXT_PATH}`,
      `--user-data-dir=${USER_DATA_DIR}`,
      "--no-first-run",
      "--no-default-browser-check",
      "about:blank",
    ],
    { stdio: "ignore" }
  );

  let exited = false;
  browserProcess.on("exit", () => {
    exited = true;
  });

  try {
    console.log("[Verify] 1. Waiting for remote debugging port on " + DEBUG_PORT + "...");
    let targets = [];
    let welcomeTarget = null;
    let extId = null;

    for (let attempt = 0; attempt < 25; attempt++) {
      targets = await waitForHttp(`http://127.0.0.1:${DEBUG_PORT}/json`);
      welcomeTarget = targets.find((t) => t.url && t.url.includes("chrome-extension://") && t.webSocketDebuggerUrl);
      if (welcomeTarget) {
        const match = welcomeTarget.url.match(/chrome-extension:\/\/([^\/]+)/);
        if (match) {
          extId = match[1];
          break;
        }
      }
      await sleep(400);
    }

    console.log("[Verify] 2. Discovered Extension ID: " + extId);
    if (!extId || !welcomeTarget) {
      console.dir(targets);
      throw new Error("Could not detect Extension ID from running targets");
    }
    const cdp = new CDPClient(welcomeTarget.webSocketDebuggerUrl);
    await cdp.connect();
    console.log("[Verify] Connected to extension page CDP.");

    // 3. Test nomad.sync.getState
    console.log("[Verify] 3. Testing nomad.sync.getState...");
    const nomadStateRes = await cdp.evaluate(`
      new Promise((resolve) => {
        chrome.runtime.sendMessage({ type: "nomad.sync.getState" }, (res) => resolve(res));
      })
    `);
    console.log("[Verify] nomad.sync.getState response:", nomadStateRes);
    if (!nomadStateRes?.ok || !nomadStateRes?.state) {
      throw new Error("nomad.sync.getState failed or returned invalid state");
    }

    // 4. Test cv.sync.getState
    console.log("[Verify] 4. Testing cv.sync.getState...");
    const cvStateRes = await cdp.evaluate(`
      new Promise((resolve) => {
        chrome.runtime.sendMessage({ type: "cv.sync.getState" }, (res) => resolve(res));
      })
    `);
    console.log("[Verify] cv.sync.getState response:", cvStateRes);
    if (!cvStateRes?.ok || !cvStateRes?.state) {
      throw new Error("cv.sync.getState failed or returned invalid state");
    }

    // 5. Test gv.sync.getState
    console.log("[Verify] 5. Testing gv.sync.getState...");
    const gvStateRes = await cdp.evaluate(`
      new Promise((resolve) => {
        chrome.runtime.sendMessage({ type: "gv.sync.getState" }, (res) => resolve(res));
      })
    `);
    console.log("[Verify] gv.sync.getState response:", gvStateRes);
    if (!gvStateRes?.ok || !gvStateRes?.state) {
      throw new Error("gv.sync.getState failed or returned invalid state");
    }

    // 6. Test ChatGPT Sync Route: nomad.sync.downloadChatGPT (non-interactive)
    console.log("[Verify] 6. Testing nomad.sync.downloadChatGPT (non-interactive)...");
    const chatgptDownloadRes = await cdp.evaluate(`
      new Promise((resolve) => {
        chrome.runtime.sendMessage({
          type: "nomad.sync.downloadChatGPT",
          payload: { interactive: false }
        }, (res) => resolve(res));
      })
    `);
    console.log("[Verify] nomad.sync.downloadChatGPT result:", chatgptDownloadRes);
    // Non-interactive without token correctly returns ok: false, data: null (does not crash or hang!)
    if (chatgptDownloadRes === undefined) {
      throw new Error("nomad.sync.downloadChatGPT hung or returned undefined (routing broken!)");
    }

    // 7. Test ChatGPT Sync Route: nomad.sync.uploadChatGPT (non-interactive)
    console.log("[Verify] 7. Testing nomad.sync.uploadChatGPT (non-interactive)...");
    const chatgptUploadRes = await cdp.evaluate(`
      new Promise((resolve) => {
        chrome.runtime.sendMessage({
          type: "nomad.sync.uploadChatGPT",
          payload: {
            folders: [{ id: "test-gpt-f1", name: "ChatGPT Test", conversationIds: ["c1"], isExpanded: true }],
            interactive: false
          }
        }, (res) => resolve(res));
      })
    `);
    console.log("[Verify] nomad.sync.uploadChatGPT result:", chatgptUploadRes);
    if (chatgptUploadRes === undefined) {
      throw new Error("nomad.sync.uploadChatGPT hung or returned undefined (routing broken!)");
    }

    // 8. Test Claude Sync Route: nomad.sync.downloadClaude (non-interactive)
    console.log("[Verify] 8. Testing nomad.sync.downloadClaude (non-interactive)...");
    const claudeDownloadRes = await cdp.evaluate(`
      new Promise((resolve) => {
        chrome.runtime.sendMessage({
          type: "nomad.sync.downloadClaude",
          payload: { interactive: false }
        }, (res) => resolve(res));
      })
    `);
    console.log("[Verify] nomad.sync.downloadClaude result:", claudeDownloadRes);
    if (claudeDownloadRes === undefined) {
      throw new Error("nomad.sync.downloadClaude hung or returned undefined (routing broken!)");
    }

    // 9. Test Claude Sync Route: cv.sync.download
    console.log("[Verify] 9. Testing cv.sync.download (non-interactive)...");
    const cvDownloadRes = await cdp.evaluate(`
      new Promise((resolve) => {
        chrome.runtime.sendMessage({
          type: "cv.sync.download",
          payload: { interactive: false }
        }, (res) => resolve(res));
      })
    `);
    console.log("[Verify] cv.sync.download result:", cvDownloadRes);
    if (cvDownloadRes === undefined) {
      throw new Error("cv.sync.download hung or returned undefined (routing broken!)");
    }

    // 10. Test Gemini Sync Route: nomad.sync.downloadGemini (non-interactive)
    console.log("[Verify] 10. Testing nomad.sync.downloadGemini (non-interactive)...");
    const geminiDownloadRes = await cdp.evaluate(`
      new Promise((resolve) => {
        chrome.runtime.sendMessage({
          type: "nomad.sync.downloadGemini",
          payload: { interactive: false }
        }, (res) => resolve(res));
      })
    `);
    console.log("[Verify] nomad.sync.downloadGemini result:", geminiDownloadRes);
    if (geminiDownloadRes === undefined) {
      throw new Error("nomad.sync.downloadGemini hung or returned undefined (routing broken!)");
    }

    // 11. Test nomad.sync.signOut
    console.log("[Verify] 11. Testing nomad.sync.signOut...");
    const signOutRes = await cdp.evaluate(`
      new Promise((resolve) => {
        chrome.runtime.sendMessage({ type: "nomad.sync.signOut" }, (res) => resolve(res));
      })
    `);
    console.log("[Verify] nomad.sync.signOut result:", signOutRes);
    if (!signOutRes?.ok || signOutRes?.state?.isAuthenticated !== false) {
      throw new Error("nomad.sync.signOut failed to set isAuthenticated to false");
    }

    // 12. Navigate to options page, take screenshot of Cloud Sync settings UI
    console.log("[Verify] 12. Navigating to Options Page for visual validation...");
    const optionsUrl = `chrome-extension://${extId}/src/pages/options/index.html`;
    await cdp.send("Page.navigate", { url: optionsUrl });
    await sleep(2000);

    const screenshot = await cdp.send("Page.captureScreenshot", { format: "png" });
    const screenshotPath = resolve(ARTIFACT_DIR, "real_browser_sync_verified.png");
    writeFileSync(screenshotPath, Buffer.from(screenshot.data, "base64"));
    console.log("[Verify] Screenshot saved to: " + screenshotPath);

    cdp.close();

    console.log("---------------------------------------------------------------");
    console.log("🎉 ALL REAL BROWSER GOOGLE DRIVE SYNC MESSAGE CHECKS PASSED!");
    console.log("---------------------------------------------------------------");
  } finally {
    console.log("[Verify] Cleaning up Browser process...");
    browserProcess.kill("SIGKILL");
  }
}

run().catch((err) => {
  console.error("❌ Verification failed with error:", err);
  process.exit(1);
});
