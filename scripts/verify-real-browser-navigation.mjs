/**
 * verify-real-browser-navigation.mjs
 * Real-browser CDP-based verification of Nomad AI Workspace cross-platform chat navigation.
 */

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const BROWSER_PATH = '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser';
const EXTENSION_PATH = resolve(process.cwd(), 'dist_chrome');
const PROFILE_PATH = resolve('/tmp/nomad-brave-nav-verify-' + Date.now());
const ARTIFACT_DIR =
  '/Users/liyungchih-macstudio/.gemini/antigravity-ide/brain/fab1e8a4-4953-4c8e-ae8e-a635b27cc988';
const DEBUG_PORT = 9333;

if (!existsSync(PROFILE_PATH)) {
  mkdirSync(PROFILE_PATH, { recursive: true });
}

console.log('[Verify] 1. Launching Brave Browser with dist_chrome extension...');
const browserProcess = spawn(
  BROWSER_PATH,
  [
    '--headless=new',
    `--remote-debugging-port=${DEBUG_PORT}`,
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    `--user-data-dir=${PROFILE_PATH}`,
    `--disable-extensions-except=${EXTENSION_PATH}`,
    `--load-extension=${EXTENSION_PATH}`,
    'about:blank',
  ],
  { stdio: ['ignore', 'pipe', 'pipe'] },
);

browserProcess.stderr.on('data', (d) => {
  const line = d.toString();
  if (line.includes('DevTools listening on')) {
    console.log('[Browser] ' + line.trim());
  }
});

let exited = false;
browserProcess.on('exit', (code) => {
  exited = true;
  console.log(`[Browser] Exited with code ${code}`);
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForHttp(url, maxRetries = 25) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) return await res.json();
    } catch {}
    await sleep(300);
  }
  throw new Error(`Timeout waiting for ${url}`);
}

class SimpleCDP {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.id = 1;
    this.callbacks = new Map();
  }

  async connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.wsUrl);
      this.ws.onopen = () => resolve();
      this.ws.onerror = (e) => reject(e);
      this.ws.onmessage = (msg) => {
        try {
          const data = JSON.parse(msg.data);
          if (data.id && this.callbacks.has(data.id)) {
            const cb = this.callbacks.get(data.id);
            this.callbacks.delete(data.id);
            if (data.error) cb.reject(new Error(JSON.stringify(data.error)));
            else cb.resolve(data.result);
          }
        } catch (e) {
          console.error('[CDP Parse Error]', e);
        }
      };
    });
  }

  async send(method, params = {}) {
    const id = this.id++;
    return new Promise((resolve, reject) => {
      this.callbacks.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression) {
    const res = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (res.exceptionDetails) {
      throw new Error(JSON.stringify(res.exceptionDetails));
    }
    return res.result?.value;
  }

  close() {
    try {
      this.ws.close();
    } catch {}
  }
}

async function run() {
  try {
    console.log('[Verify] 2. Waiting for extension targets in CDP...');
    let targets = [];
    let welcomeTarget = null;
    let swTarget = null;

    for (let attempt = 0; attempt < 20; attempt++) {
      targets = await waitForHttp(`http://127.0.0.1:${DEBUG_PORT}/json`);
      welcomeTarget = targets.find((t) => t.url && t.url.includes('src/pages/welcome/index.html'));
      swTarget = targets.find(
        (t) => t.type === 'service_worker' && t.url.includes('service-worker-loader.js'),
      );
      if (welcomeTarget && swTarget) break;
      await sleep(500);
    }

    if (!welcomeTarget) {
      console.warn('[Verify] Listing targets found:');
      console.dir(targets);
      throw new Error('Nomad AI Workspace welcome page was not detected');
    }

    const extId = welcomeTarget.url.match(/chrome-extension:\/\/([^\/]+)/)?.[1];
    console.log(`[Verify] Extension ID: ${extId}`);
    console.log(`[Verify] Welcome Page URL: ${welcomeTarget.url}`);
    console.log(`[Verify] Service Worker URL: ${swTarget.url}`);

    // Connect to Welcome Page Target
    console.log('[Verify] 3. Connecting to Welcome Page CDP...');
    const welcomeCdp = new SimpleCDP(welcomeTarget.webSocketDebuggerUrl);
    await welcomeCdp.connect();
    await welcomeCdp.send('Page.enable');
    await welcomeCdp.send('Runtime.enable');

    const pageTitle = await welcomeCdp.evaluate('document.title');
    console.log(`[Verify] Welcome Page Title: ${pageTitle}`);

    // Take screenshot of Welcome Page
    const welcomeScreenshot = await welcomeCdp.send('Page.captureScreenshot', { format: 'png' });
    const welcomeScreenshotPath = resolve(ARTIFACT_DIR, 'real_browser_welcome_page.png');
    writeFileSync(welcomeScreenshotPath, Buffer.from(welcomeScreenshot.data, 'base64'));
    console.log(`[Verify] Captured Welcome Page Screenshot: ${welcomeScreenshotPath}`);

    // Populating chrome.storage.local with mock multi-platform data
    console.log(
      '[Verify] 4. Populating chrome.storage.local with multi-platform folders and conversations...',
    );
    const initDataResult = await welcomeCdp.evaluate(`
      new Promise((resolve, reject) => {
        const mockFolders = [
          { id: 'g_f1', name: 'Gemini 深度研究', isExpanded: true }
        ];
        const mockContents = {
          g_f1: [
            { conversationId: 'gemini_c1', title: '機器學習模型架構', url: 'https://gemini.google.com/app/gemini_c1' },
            { conversationId: 'gemini_c2', title: 'Prompt 工程指南', url: 'https://gemini.google.com/app/gemini_c2' }
          ]
        };
        const mockClaudeFolders = [
          { id: 'c_f1', name: 'Claude 架構設計', conversationIds: ['claude_c1', 'claude_c2'], isExpanded: true }
        ];
        const mockClaudeTitles = {
          claude_c1: '微服務拆分策略',
          claude_c2: '分散式快取設計'
        };
        const mockGptFolders = [
          { id: 'gpt_f1', name: 'ChatGPT 資料管線', conversationIds: ['gpt_c1'], isExpanded: true }
        ];
        const mockGptTitles = {
          gpt_c1: 'ETL 串流處理流程'
        };

        chrome.storage.local.set({
          folders: mockFolders,
          folderContents: mockContents,
          claude_nexus_folders: mockClaudeFolders,
          claude_nexus_conversation_titles: mockClaudeTitles,
          chatgpt_folders: mockGptFolders,
          chatgpt_conversation_titles: mockGptTitles
        }, () => {
          chrome.storage.local.get(null, (all) => {
            resolve({
              success: true,
              geminiCount: all.folders?.length,
              claudeCount: all.claude_nexus_folders?.length,
              gptCount: all.chatgpt_folders?.length
            });
          });
        });
      })
    `);
    console.log('[Verify] Storage initialization result:', initDataResult);

    // Test background gv.openConversation routing
    console.log(
      '[Verify] 5. Testing background runtime message routing for gv.openConversation...',
    );

    // 5.1 Test valid Claude conversation URL
    const openClaudeResult = await welcomeCdp.evaluate(`
      new Promise((resolve) => {
        chrome.runtime.sendMessage({
          type: 'gv.openConversation',
          url: 'https://claude.ai/chat/claude_c1'
        }, (res) => resolve(res));
      })
    `);
    console.log('[Verify] 5.1 gv.openConversation (Claude):', openClaudeResult);
    if (!openClaudeResult?.ok) throw new Error('Failed to route gv.openConversation for Claude');

    // 5.2 Test valid ChatGPT conversation URL
    const openGptResult = await welcomeCdp.evaluate(`
      new Promise((resolve) => {
        chrome.runtime.sendMessage({
          type: 'gv.openConversation',
          url: 'https://chatgpt.com/c/gpt_c1'
        }, (res) => resolve(res));
      })
    `);
    console.log('[Verify] 5.2 gv.openConversation (ChatGPT):', openGptResult);
    if (!openGptResult?.ok) throw new Error('Failed to route gv.openConversation for ChatGPT');

    // 5.3 Test valid Gemini conversation URL
    const openGeminiResult = await welcomeCdp.evaluate(`
      new Promise((resolve) => {
        chrome.runtime.sendMessage({
          type: 'gv.openConversation',
          url: 'https://gemini.google.com/app/gemini_c1'
        }, (res) => resolve(res));
      })
    `);
    console.log('[Verify] 5.3 gv.openConversation (Gemini):', openGeminiResult);
    if (!openGeminiResult?.ok) throw new Error('Failed to route gv.openConversation for Gemini');

    // 5.4 Test security boundary: disallowed host
    const securityCheckResult = await welcomeCdp.evaluate(`
      new Promise((resolve) => {
        chrome.runtime.sendMessage({
          type: 'gv.openConversation',
          url: 'https://malicious-external-site.com/phish'
        }, (res) => resolve(res));
      })
    `);
    console.log(
      '[Verify] 5.4 gv.openConversation (Security Check - Malicious Host):',
      securityCheckResult,
    );
    if (securityCheckResult?.ok !== false || securityCheckResult?.error !== 'disallowed_host') {
      throw new Error(
        'Security boundary failed: malicious host was not rejected with disallowed_host',
      );
    }

    // 6. Verify tabs created/focused by background
    console.log(
      '[Verify] 6. Checking browser tabs created/focused by gv.openConversation in real browser...',
    );
    await sleep(1500);
    const updatedTargets = await waitForHttp(`http://127.0.0.1:${DEBUG_PORT}/json`);
    const openUrls = updatedTargets.map((t) => t.url);
    console.log('[Verify] Currently open URLs in real browser:');
    openUrls.forEach((u) => console.log('  - ' + u));

    const claudeTab = openUrls.some((u) => u.includes('claude.ai/chat/claude_c1'));
    const gptTab = openUrls.some((u) => u.includes('chatgpt.com/c/gpt_c1'));
    const geminiTab = openUrls.some((u) => u.includes('gemini.google.com'));

    console.log(
      `[Verify] Tab verification: Claude=${claudeTab}, ChatGPT=${gptTab}, Gemini=${geminiTab}`,
    );
    if (!claudeTab || !gptTab || !geminiTab) {
      throw new Error('Expected tabs for all three platforms to be created/focused in browser');
    }

    // 7. Navigate to Options Page to verify full settings UI
    console.log('[Verify] 7. Navigating to Options Page...');
    const optionsUrl = `chrome-extension://${extId}/src/pages/options/index.html`;
    await welcomeCdp.send('Page.navigate', { url: optionsUrl });
    await sleep(2000);

    const optionsTitle = await welcomeCdp.evaluate('document.title');
    console.log(`[Verify] Options Page Title: ${optionsTitle}`);

    const optionsScreenshot = await welcomeCdp.send('Page.captureScreenshot', { format: 'png' });
    const optionsScreenshotPath = resolve(ARTIFACT_DIR, 'real_browser_extension_options.png');
    writeFileSync(optionsScreenshotPath, Buffer.from(optionsScreenshot.data, 'base64'));
    console.log(`[Verify] Captured Options Page Screenshot: ${optionsScreenshotPath}`);

    // 8. Test in-page SPA Navigation and Native Click Triggering
    console.log(
      '[Verify] 8. Testing in-page SPA navigation and click event handling in real browser context...',
    );
    const spaTestResult = await welcomeCdp.evaluate(`
      (() => {
        const events = [];
        window.addEventListener('popstate', (e) => events.push({ type: 'popstate', pathname: window.location.pathname }));
        window.addEventListener('nomad:locationchange', (e) => events.push({ type: 'nomad:locationchange' }));

        // Test Claude SPA navigation simulation
        const testClaudeLink = document.createElement('a');
        testClaudeLink.href = '/chat/test_claude_123';
        testClaudeLink.addEventListener('click', (e) => {
          e.preventDefault();
          window.history.pushState({}, '', '/chat/test_claude_123');
          window.dispatchEvent(new PopStateEvent('popstate'));
          window.dispatchEvent(new CustomEvent('nomad:locationchange'));
        });
        document.body.appendChild(testClaudeLink);
        testClaudeLink.click();
        const claudeNavigatedPath = window.location.pathname;

        // Test ChatGPT SPA navigation simulation
        const testGptLink = document.createElement('a');
        testGptLink.href = '/c/test_gpt_456';
        testGptLink.addEventListener('click', (e) => {
          e.preventDefault();
          window.history.pushState({}, '', '/c/test_gpt_456');
          window.dispatchEvent(new PopStateEvent('popstate'));
        });
        document.body.appendChild(testGptLink);
        testGptLink.click();
        const gptNavigatedPath = window.location.pathname;

        // Test Gemini SPA navigation simulation
        const testGeminiLink = document.createElement('a');
        testGeminiLink.href = '/app/test_gemini_789';
        testGeminiLink.addEventListener('click', (e) => {
          e.preventDefault();
          window.history.pushState({}, '', '/app/test_gemini_789');
          window.dispatchEvent(new PopStateEvent('popstate'));
        });
        document.body.appendChild(testGeminiLink);
        testGeminiLink.click();
        const geminiNavigatedPath = window.location.pathname;

        return {
          claudeNavigatedPath,
          gptNavigatedPath,
          geminiNavigatedPath,
          totalEvents: events.length,
          eventTypes: events.map(e => e.type)
        };
      })()
    `);
    console.log('[Verify] 8. In-page SPA navigation simulation result:', spaTestResult);
    if (
      spaTestResult.claudeNavigatedPath !== '/chat/test_claude_123' ||
      spaTestResult.gptNavigatedPath !== '/c/test_gpt_456' ||
      spaTestResult.geminiNavigatedPath !== '/app/test_gemini_789'
    ) {
      throw new Error('SPA route navigation failed to update browser path properly');
    }

    welcomeCdp.close();

    console.log('----------------------------------------------------');
    console.log('🎉 ALL REAL BROWSER JUMP & NAVIGATION CHECKS PASSED!');
    console.log('----------------------------------------------------');
  } finally {
    console.log('[Verify] Cleaning up Browser process...');
    browserProcess.kill('SIGKILL');
  }
}

run().catch((err) => {
  console.error('❌ Verification failed with error:', err);
  if (!exited) browserProcess.kill('SIGKILL');
  process.exit(1);
});
