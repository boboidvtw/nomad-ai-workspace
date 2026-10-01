/**
 * geminiOrb.tsx
 * Mounts the Nomad Universal Super Orb on Gemini.
 * Features: Concentric UsageRings, 3D Mascot Orb, PromptManager Trigger, Width & Ball Scale Controls.
 */

import React from 'react';
import { createRoot, type Root } from 'react-dom/client';

import FloatBall from '@/components/FloatBall';

import './style.css';

const GEMINI_ORB_CONTAINER_ID = 'nomad-gemini-orb-root';

let rootInstance: Root | null = null;

export function startGeminiFloatBall(): { destroy: () => void } {
  if (typeof document === 'undefined') {
    return { destroy: () => {} };
  }

  document.body.setAttribute('data-nomad-orb-active', 'true');
  document.body.classList.add('gv-gemini-page');

  let container = document.getElementById(GEMINI_ORB_CONTAINER_ID);
  if (!container) {
    container = document.createElement('div');
    container.id = GEMINI_ORB_CONTAINER_ID;
    document.body.appendChild(container);
  }

  if (!rootInstance) {
    rootInstance = createRoot(container);
  }

  rootInstance.render(<FloatBall platform="gemini" />);

  return {
    destroy: () => {
      document.body.removeAttribute('data-nomad-orb-active');
      document.body.classList.remove('gv-gemini-page');
      if (rootInstance) {
        rootInstance.unmount();
        rootInstance = null;
      }
      container?.remove();
    },
  };
}
