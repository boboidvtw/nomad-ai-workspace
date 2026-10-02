import React, { act } from 'react';
import { type Root, createRoot } from 'react-dom/client';

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import FloatBall from '../FloatBall';

const storageMock: Record<string, any> = {};

describe('Universal FloatBall (Flagship Super Orb)', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    storageMock['floatBallPosition'] = { x: 100, y: 200 };
    storageMock['floatBallSize'] = 1;
    (globalThis as any).chrome = {
      runtime: {
        getURL: (path: string) => `chrome-extension://mock/${path}`,
        onMessage: {
          addListener: vi.fn(),
          removeListener: vi.fn(),
        },
      },
      storage: {
        local: {
          get: vi.fn((keys: string[], cb: (res: any) => void) => {
            const res: Record<string, any> = {};
            for (const k of keys) res[k] = storageMock[k];
            cb(res);
          }),
          set: vi.fn((data: Record<string, any>, cb?: () => void) => {
            Object.assign(storageMock, data);
            cb?.();
          }),
        },
        onChanged: {
          addListener: vi.fn(),
          removeListener: vi.fn(),
        },
      },
    };

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    document.body.removeAttribute('data-nomad-orb-active');
    vi.clearAllMocks();
  });

  it('renders the mascot orb button and marks body as active', async () => {
    await act(async () => {
      root.render(<FloatBall platform="gemini" />);
    });

    expect(document.body.getAttribute('data-nomad-orb-active')).toBe('true');
    const ballBtn = container.querySelector(
      'button[title="Nomad 提示詞中樞 (左鍵開啟 / 右鍵設定對話寬度)"]',
    );
    expect(ballBtn).not.toBeNull();

    const mascotImg = container.querySelector('img[alt="Nomad Mascot"]');
    expect(mascotImg).not.toBeNull();
    expect(mascotImg?.getAttribute('src')).toBe('chrome-extension://mock/mascot-logo.png');
  });

  it('applies correct brand styling for Gemini and ChatGPT', async () => {
    await act(async () => {
      root.render(<FloatBall platform="chatgpt" />);
    });
    const chatgptBtn = container.querySelector<HTMLButtonElement>(
      'button[title="Nomad 提示詞中樞 (左鍵開啟 / 右鍵設定對話寬度)"]',
    )!;
    expect(chatgptBtn.style.background).toContain('#10a37f');

    await act(async () => {
      root.render(<FloatBall platform="gemini" />);
    });
    const geminiBtn = container.querySelector<HTMLButtonElement>(
      'button[title="Nomad 提示詞中樞 (左鍵開啟 / 右鍵設定對話寬度)"]',
    )!;
    expect(geminiBtn.style.background).toContain('#4E88F5');
  });

  it('clicks the underlying #gv-pm-trigger on left click', async () => {
    const trigger = document.createElement('button');
    trigger.id = 'gv-pm-trigger';
    const clickSpy = vi.fn();
    trigger.addEventListener('click', clickSpy);
    document.body.appendChild(trigger);

    await act(async () => {
      root.render(<FloatBall platform="gemini" />);
    });
    const ballBtn = container.querySelector<HTMLButtonElement>(
      'button[title="Nomad 提示詞中樞 (左鍵開啟 / 右鍵設定對話寬度)"]',
    )!;

    await act(async () => {
      ballBtn.dispatchEvent(
        new PointerEvent('pointerdown', {
          button: 0,
          clientX: 100,
          clientY: 100,
          pointerId: 1,
          bubbles: true,
        }),
      );
      document.dispatchEvent(
        new PointerEvent('pointerup', { clientX: 100, clientY: 100, pointerId: 1, bubbles: true }),
      );
    });

    expect(clickSpy).toHaveBeenCalled();
    trigger.remove();
  });

  it('opens the Nomad flagship menu on right click or mini button click', async () => {
    await act(async () => {
      root.render(<FloatBall platform="chatgpt" />);
    });
    const ballBtn = container.querySelector<HTMLButtonElement>(
      'button[title="Nomad 提示詞中樞 (左鍵開啟 / 右鍵設定對話寬度)"]',
    )!;

    await act(async () => {
      ballBtn.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    });

    expect(container.textContent).toContain('Nomad 旗艦中樞');
    expect(container.textContent).toContain('Nomad 提示詞庫中樞');
    expect(container.textContent).toContain('重新整理 ChatGPT 額度');
  });

  it('anchors to the right side of the chat composer when present', async () => {
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 1440 });
    Object.defineProperty(window, 'innerHeight', { writable: true, configurable: true, value: 900 });
    const composer = document.createElement('form');
    composer.id = 'thread-bottom-container';
    composer.innerHTML = '<div id="prompt-textarea" contenteditable="true"></div>';
    composer.getBoundingClientRect = () => ({
      width: 768,
      height: 64,
      top: 800,
      bottom: 864,
      left: 336,
      right: 1104,
      x: 336,
      y: 800,
      toJSON: () => {},
    });
    document.body.appendChild(composer);

    await act(async () => {
      root.render(<FloatBall platform="chatgpt" />);
    });

    const orb = container.querySelector<HTMLDivElement>('[data-nomad-orb="true"]');
    expect(orb).not.toBeNull();
    // composer right (1104) + gap (14) = 1118px
    expect(orb?.style.left).toBe('1118px');

    composer.remove();
  });

  it('applies correct brand styling and menu for Grok', async () => {
    await act(async () => {
      root.render(<FloatBall platform="grok" />);
    });
    const grokBtn = container.querySelector<HTMLButtonElement>(
      'button[title="Nomad 提示詞中樞 (左鍵開啟 / 右鍵設定對話寬度)"]',
    )!;
    expect(grokBtn.style.background).toContain('#2997ff');

    await act(async () => {
      grokBtn.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    });
    expect(container.textContent).toContain('重新整理 Grok 額度');
  });

  it('anchors to Grok chat composer and adapts under narrow viewport', async () => {
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 800 });
    Object.defineProperty(window, 'innerHeight', { writable: true, configurable: true, value: 600 });

    const grokComposer = document.createElement('form');
    grokComposer.innerHTML = '<textarea placeholder="Ask Grok something..."></textarea>';
    grokComposer.getBoundingClientRect = () => ({
      width: 700,
      height: 60,
      top: 500,
      bottom: 560,
      left: 50,
      right: 750,
      x: 50,
      y: 500,
      toJSON: () => {},
    });
    document.body.appendChild(grokComposer);

    await act(async () => {
      root.render(<FloatBall platform="grok" />);
    });

    const orb = container.querySelector<HTMLDivElement>('[data-nomad-orb="true"]');
    expect(orb).not.toBeNull();
    // Orb should not exceed viewport boundary (800 - width - 8)
    const leftPx = parseInt(orb?.style.left || '0', 10);
    expect(leftPx).toBeLessThanOrEqual(800);
    expect(leftPx).toBeGreaterThanOrEqual(8);

    grokComposer.remove();
  });

});
