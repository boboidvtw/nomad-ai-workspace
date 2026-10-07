import fs from 'fs';
import path from 'path';
import { chromium } from 'playwright';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const repoRoot = path.resolve(__dirname, '..');
const distDir = path.join(repoRoot, 'dist_chrome');
const scratchDir = path.join(repoRoot, 'scratch');
const userDataDir = path.join(scratchDir, 'chrome-profile');
const screenshotDir = path.join(scratchDir, 'screenshots');

// Ensure directories exist
fs.mkdirSync(userDataDir, { recursive: true });
fs.mkdirSync(screenshotDir, { recursive: true });

async function run() {
  console.log('Starting Network & UI Audit via Playwright...');
  console.log(`Extension Path: ${distDir}`);
  console.log(`User Data Path: ${userDataDir}`);
  console.log(`Screenshot Path: ${screenshotDir}`);

  const browserContext = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    args: [
      `--disable-extensions-except=${distDir}`,
      `--load-extension=${distDir}`,
      '--no-first-run',
      '--no-default-browser-check',
    ],
  });

  const requests = [];
  const consoleLogs = [];
  const pageErrors = [];

  // Monitor network requests
  browserContext.on('request', (request) => {
    const url = request.url();
    const method = request.method();
    const type = request.resourceType();
    requests.push({ url, method, type, timestamp: new Date().toISOString() });
  });

  // Find extension ID from service worker (MV3) or background pages (MV2) with retry loop
  let extensionId = '';
  console.log('Waiting for extension background/service worker to register...');
  for (let i = 0; i < 20; i++) {
    const workers = browserContext.serviceWorkers();
    if (workers.length > 0) {
      extensionId = workers[0].url().split('/')[2];
      console.log(`Extension ID found from Service Worker: ${extensionId}`);
      break;
    }
    const bgPages = browserContext.backgroundPages();
    if (bgPages.length > 0) {
      extensionId = bgPages[0].url().split('/')[2];
      console.log(`Extension ID found from Background Page: ${extensionId}`);
      break;
    }

    // Also try listing pages to see if any extension page is open
    const pages = browserContext.pages();
    for (const p of pages) {
      if (p.url().startsWith('chrome-extension://')) {
        extensionId = p.url().split('/')[2];
        console.log(`Extension ID found from active extension page: ${extensionId}`);
        break;
      }
    }
    if (extensionId) break;

    await new Promise((r) => setTimeout(r, 500));
  }

  // Setup page-level monitoring helpers
  const setupPageMonitoring = (page, pageName) => {
    page.on('console', (msg) => {
      consoleLogs.push({ page: pageName, type: msg.type(), text: msg.text() });
    });
    page.on('pageerror', (err) => {
      console.log(`[Error][${pageName}] ${err.message}`);
      pageErrors.push({ page: pageName, error: err.stack || err.message });
    });
  };

  // 1. Create Gemini Page first to trigger content scripts and wake up extension Service Worker
  console.log('Navigating to Google Gemini to wake up Extension...');
  const geminiPage = await browserContext.newPage();
  setupPageMonitoring(geminiPage, 'Gemini');
  geminiPage.on('dialog', async (dialog) => {
    console.log(`[Dialog] ${dialog.type()}: ${dialog.message()}`);
    await dialog.dismiss();
  });

  try {
    await geminiPage.goto('https://gemini.google.com/', {
      waitUntil: 'domcontentloaded',
      timeout: 15000,
    });
    console.log('Gemini page loaded. Waiting for Extension to initialize...');
    await geminiPage.waitForTimeout(4000);
  } catch (e) {
    console.log(`Initial Gemini load warning: ${e.message}`);
  }

  // 2. Now run the retry loop to capture the registered Extension ID
  let detectedExtensionId = extensionId;
  if (!detectedExtensionId) {
    console.log('Re-scanning for Extension ID after Gemini load...');
    for (let i = 0; i < 20; i++) {
      const workers = browserContext.serviceWorkers();
      if (workers.length > 0) {
        detectedExtensionId = workers[0].url().split('/')[2];
        console.log(`Detected Extension ID from SW: ${detectedExtensionId}`);
        break;
      }
      const bgPages = browserContext.backgroundPages();
      if (bgPages.length > 0) {
        detectedExtensionId = bgPages[0].url().split('/')[2];
        console.log(`Detected Extension ID from Background Page: ${detectedExtensionId}`);
        break;
      }
      const pages = browserContext.pages();
      for (const p of pages) {
        if (p.url().startsWith('chrome-extension://')) {
          detectedExtensionId = p.url().split('/')[2];
          console.log(`Detected Extension ID from active extension page: ${detectedExtensionId}`);
          break;
        }
      }
      if (detectedExtensionId) break;
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  if (!detectedExtensionId) {
    console.error('CRITICAL: Could not determine Extension ID dynamically even after Gemini load!');
    const pages = browserContext.pages();
    console.log(
      'Active pages URLs:',
      pages.map((p) => p.url()),
    );
  } else {
    extensionId = detectedExtensionId;

    // 3. Now audit Popup Page
    console.log('Navigating to Popup Page...');
    const popupPage = await browserContext.newPage();
    setupPageMonitoring(popupPage, 'Popup');
    try {
      await popupPage.goto(`chrome-extension://${extensionId}/src/pages/popup/index.html`);
      await popupPage.waitForTimeout(3000); // wait for UI render
      await popupPage.screenshot({ path: path.join(screenshotDir, 'popup.png') });
      console.log('Popup Page screenshot captured.');
    } catch (err) {
      console.error('Failed to audit Popup:', err.message);
    }
    await popupPage.close();

    // 4. Now audit Options Page
    console.log('Navigating to Options Page...');
    const optionsPage = await browserContext.newPage();
    setupPageMonitoring(optionsPage, 'Options');
    try {
      await optionsPage.goto(`chrome-extension://${extensionId}/src/pages/options/index.html`);
      await optionsPage.waitForTimeout(3000);
      await optionsPage.screenshot({ path: path.join(screenshotDir, 'options.png') });
      console.log('Options Page screenshot captured.');
    } catch (err) {
      console.error('Failed to audit Options:', err.message);
    }
    await optionsPage.close();
  }

  // 5. Final Gemini page screenshot capture (confirming content script rendering after initialization)
  try {
    await geminiPage.bringToFront();
    await geminiPage.screenshot({ path: path.join(screenshotDir, 'gemini.png') });
    console.log('Gemini Page final screenshot captured.');
  } catch (e) {
    console.log(
      `Failed to capture final Gemini screenshot: ${e.message}. Capturing screenshot anyway.`,
    );
    await geminiPage.screenshot({ path: path.join(screenshotDir, 'gemini_error.png') });
  }

  // Close browser
  await browserContext.close();
  console.log('Browser closed.');

  // Clean up userDataDir to prevent cache lock next time
  try {
    fs.rmSync(userDataDir, { recursive: true, force: true });
  } catch (e) {
    console.error('Failed to cleanup temp profile:', e.message);
  }

  // Analyze network requests
  const allowedHosts = [
    'gemini.google.com',
    'google.com',
    'gstatic.com',
    'googleusercontent.com',
    'googleapis.com',
    'chrome-extension:',
    'localhost',
    '127.0.0.1',
  ];

  const auditReport = {
    totalRequests: requests.length,
    externalRequests: [],
    suspiciousRequests: [],
    allowedRequestsCount: 0,
    blockedRequestsCount: 0,
    consoleLogs,
    pageErrors,
    allRequests: requests,
  };

  for (const req of requests) {
    try {
      const urlStr = req.url;
      if (urlStr.startsWith('chrome-extension:') || urlStr.startsWith('data:')) {
        auditReport.allowedRequestsCount++;
        continue;
      }
      const parsedUrl = new URL(urlStr);
      const host = parsedUrl.host;
      const isAllowed = allowedHosts.some((allowed) => host.endsWith(allowed) || host === allowed);

      if (!isAllowed) {
        auditReport.externalRequests.push(req);
        auditReport.blockedRequestsCount++;
        // Check if it matches known disabled telemetry/external endpoints
        if (
          host.includes('github') ||
          host.includes('marketplace') ||
          host.includes('announcements') ||
          host.includes('analytics') ||
          host.includes('telemetry')
        ) {
          auditReport.suspiciousRequests.push(req);
        }
      } else {
        auditReport.allowedRequestsCount++;
      }
    } catch {
      // not a valid URL
    }
  }

  // Write report
  const reportPath = path.join(scratchDir, 'audit_report.json');
  fs.writeFileSync(reportPath, JSON.stringify(auditReport, null, 2));
  console.log(`Audit report generated at: ${reportPath}`);
  console.log(`Total Requests: ${auditReport.totalRequests}`);
  console.log(`Allowed Requests: ${auditReport.allowedRequestsCount}`);
  console.log(`External/Blocked Requests: ${auditReport.blockedRequestsCount}`);
  console.log(`Suspicious Requests: ${auditReport.suspiciousRequests.length}`);
  console.log(`Console Errors: ${pageErrors.length}`);

  if (auditReport.suspiciousRequests.length > 0) {
    console.log('⚠️ WARNING: Suspicious requests detected!');
  } else {
    console.log('✅ Success: No suspicious network requests detected.');
  }
}

run().catch(console.error);
