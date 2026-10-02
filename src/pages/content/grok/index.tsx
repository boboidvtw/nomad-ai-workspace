/**
 * Nomad AI Workspace — xAI Grok Content Script Entry
 * Mounts Grok-adapted workspace components:
 * - GrokFolderManager (Hierarchical folder tree integrated into Grok sidebar)
 * - FloatBall (Universal Flagship Super Orb with Concentric UsageRings, Mascot Ball, Width & Scale Controls)
 * - startPromptManager (Underlying Prompt Vault overlays)
 * - startSlashPromptFeature (Slash / command quick completion & dynamic variable fill)
 */

import React from 'react';
import { createRoot } from 'react-dom/client';

import FloatBall from '@/components/FloatBall';
import GrokFolderManager from '@/features/grok/components/FolderManager';
import { startPromptManager } from '@/pages/content/prompt';
import { startSlashPromptFeature } from '@/pages/content/prompt/slashPromptFeature';
import { i18n, initI18n, LANGUAGE_CHANGE_MESSAGE_TYPE } from '@/services/i18n';

import './style.css';

const NOMAD_GROK_ROOT_ID = 'nomad-grok-root';

export const mountGrokWorkspace = async () => {
  document.body.classList.add('nomad-grok-page');
  document.body.setAttribute('data-nomad-orb-active', 'true');

  await initI18n();

  // Listen for language changes from extension popup/settings
  chrome.runtime?.onMessage?.addListener((message: unknown) => {
    if (!message || typeof message !== 'object') return;
    const payload = message as { type?: string; lang?: string };
    if (payload.type !== LANGUAGE_CHANGE_MESSAGE_TYPE) return;
    if (payload.lang !== 'en' && payload.lang !== 'zh' && payload.lang !== 'zh-TW') return;
    void i18n.changeLanguage(payload.lang);
  });

  // Ensure root DOM container exists
  let rootContainer = document.getElementById(NOMAD_GROK_ROOT_ID);
  if (!rootContainer) {
    rootContainer = document.createElement('div');
    rootContainer.id = NOMAD_GROK_ROOT_ID;
    document.body.appendChild(rootContainer);
  }

  const root = createRoot(rootContainer);
  root.render(
    <>
      <GrokFolderManager />
      <FloatBall platform="grok" />
    </>,
  );

  // Initialize prompt manager & slash commands on Grok
  try {
    void startPromptManager();
    void startSlashPromptFeature();
  } catch (e) {
    console.error('[Nomad Workspace] Failed to start Prompt Manager / Slash Commands on Grok:', e);
  }
};

void mountGrokWorkspace();
