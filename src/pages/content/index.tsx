/**
 * index.tsx
 * Purpose: Content script entry; only mounts the React root component.
 * Last updated: 2026-03-09
 */

import { createRoot } from 'react-dom/client';
import { i18n, initI18n, LANGUAGE_CHANGE_MESSAGE_TYPE } from '@src/services/i18n';
import { APP_ROOT_ID, APP_ROOT_SELECTOR } from '@src/constants/selectors';
import './style.css';
import FolderManager from './components/FolderManager';
import Timeline from './components/Timeline';
import FloatBall from './components/FloatBall';
import { initExportButtonInjection } from './components/ExportButton';
import { initPromptButtonInjection } from './components/PromptButton';

const mount = async () => {
  await initI18n();

  chrome.runtime.onMessage.addListener((message: unknown) => {
    if (!message || typeof message !== 'object') return;
    const payload = message as { type?: string; lang?: string };
    if (payload.type !== LANGUAGE_CHANGE_MESSAGE_TYPE) return;
    if (payload.lang !== 'en' && payload.lang !== 'zh' && payload.lang !== 'zh-TW') return;
    void i18n.changeLanguage(payload.lang);
  });

  const div = document.createElement('div');
  div.id = APP_ROOT_ID;
  document.body.appendChild(div);

  const rootContainer = document.querySelector(APP_ROOT_SELECTOR);
  if (!rootContainer) throw new Error("Can't find Content root element");
  const root = createRoot(rootContainer);
  root.render(
    <>
      <FolderManager />
      <Timeline />
      <FloatBall />
    </>,
  );

  const checkPendingExport = () => {
    const pending = sessionStorage.getItem('__pending_export');
    if (pending) {
      sessionStorage.removeItem('__pending_export');
      
      const checkAndRun = () => {
        const messages = document.querySelectorAll('[data-test-render-count]');
        if (messages.length > 0) {
          setTimeout(async () => {
            try {
              const { extractConversationMessages } = await import('./services/exportExtractors');
              const { formatContent } = await import('./services/exportFormatters');
              const extracted = await extractConversationMessages();
              const text = formatContent(extracted.messages, pending as any);
              const time = new Date().toISOString().replace(/[:.]/g, '-');
              const filename = `claude-export-${window.location.pathname.split('/chat/')?.[1] ?? ''}-${time}.md`;
              
              const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = filename;
              a.style.display = 'none';
              document.body.appendChild(a);
              a.click();
              a.remove();
              setTimeout(() => URL.revokeObjectURL(url), 1000);
            } catch (e) {
              console.error('Auto-export failed:', e);
            }
          }, 1500);
        } else {
          setTimeout(checkAndRun, 100);
        }
      };
      setTimeout(checkAndRun, 500);
    }
  };

  checkPendingExport();
  window.addEventListener('claude-nexus:locationchange', () => {
    setTimeout(checkPendingExport, 200);
  });

  initExportButtonInjection();
  initPromptButtonInjection();
};

void mount();
