/**
 * Nomad AI Workspace — ChatGPT Content Script Entry
 * Mounts ChatGPT-adapted workspace components:
 * - ChatGPTFolderManager (Hierarchical folder tree integrated into ChatGPT sidebar)
 * - ChatGPTFloatBall (Draggable Nomad Super Orb with Multi-AI tree & Prompt Vault)
 * - startPromptManager (Prompt library overlays & slash command trigger)
 */

import React from 'react';
import { createRoot } from 'react-dom/client';
import { i18n, initI18n, LANGUAGE_CHANGE_MESSAGE_TYPE } from '@/services/i18n';
import { startBrandTheme } from '@/pages/content/platformTheme';
import { startPromptManager } from '@/pages/content/prompt';
import ChatGPTFolderManager from '@/features/chatgpt/components/FolderManager';
import ChatGPTFloatBall from '@/features/chatgpt/components/FloatBall';
import './style.css';

const NOMAD_CHATGPT_ROOT_ID = 'nomad-chatgpt-root';

const mount = async () => {
  document.body.classList.add('nomad-chatgpt-page');

  // Start live brand theme (OpenAI emerald accent #10a37f)
  try {
    startBrandTheme(window.location.href, document);
  } catch (e) {
    console.warn('[Nomad Workspace] Failed to initialize brand theme:', e);
  }

  await initI18n();

  // Listen for language changes from extension popup/settings
  chrome.runtime.onMessage.addListener((message: unknown) => {
    if (!message || typeof message !== 'object') return;
    const payload = message as { type?: string; lang?: string };
    if (payload.type !== LANGUAGE_CHANGE_MESSAGE_TYPE) return;
    if (payload.lang !== 'en' && payload.lang !== 'zh' && payload.lang !== 'zh-TW') return;
    void i18n.changeLanguage(payload.lang);
  });

  // Ensure root DOM container exists
  let rootContainer = document.getElementById(NOMAD_CHATGPT_ROOT_ID);
  if (!rootContainer) {
    rootContainer = document.createElement('div');
    rootContainer.id = NOMAD_CHATGPT_ROOT_ID;
    document.body.appendChild(rootContainer);
  }

  const root = createRoot(rootContainer);
  root.render(
    <>
      <ChatGPTFolderManager />
      <ChatGPTFloatBall />
    </>,
  );

  // Initialize prompt manager & slash commands on ChatGPT
  try {
    void startPromptManager();
  } catch (e) {
    console.error('[Nomad Workspace] Failed to start Prompt Manager on ChatGPT:', e);
  }
};

void mount();
