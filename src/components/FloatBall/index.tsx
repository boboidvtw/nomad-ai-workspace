/**
 * index.tsx
 * Nomad AI Workspace — Universal Flagship Super Orb (物理合一)
 * Integrates Concentric UsageRings, Nomad 3D Star Mascot, PromptManager Trigger,
 * and Universal Width / Ball Size Controls across Claude, Gemini, and ChatGPT.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { LucideIcon } from 'lucide-react';
import {
  ArrowLeftRight,
  MessageSquare,
  RefreshCw,
  Settings,
  SlidersHorizontal,
  X,
} from 'lucide-react';

import { useBallSizeControl } from '@/hooks/useBallSizeControl';
import { useDraggable } from '@/hooks/useDraggable';
import { useUniversalUsage } from '@/hooks/useUniversalUsage';
import { initI18n } from '@/services/i18n';
import { readStoredFloatBallPosition, writeStoredFloatBallPosition } from '@/services/storage';

import UsageRings from './UsageRings';
import { panels } from './panelRegistry';

export type PlatformId = 'claude' | 'gemini' | 'chatgpt';

type Point = { x: number; y: number };
type PanelSide = 'left' | 'right';

const detectPlatform = (): PlatformId => {
  const host = window.location.hostname.toLowerCase();
  if (host.includes('claude.ai')) return 'claude';
  if (host.includes('chatgpt.com') || host.includes('openai.com')) return 'chatgpt';
  if (host.includes('gemini.google') || host.includes('aistudio.google')) return 'gemini';
  return 'claude';
};

const getPlatformBrandColor = (platform: PlatformId): string => {
  switch (platform) {
    case 'chatgpt':
      return '#10a37f';
    case 'gemini':
      return '#4E88F5';
    case 'claude':
    default:
      return '#d97757';
  }
};

const getPlatformDisplayName = (platform: PlatformId): string => {
  switch (platform) {
    case 'chatgpt':
      return 'ChatGPT';
    case 'gemini':
      return 'Gemini';
    case 'claude':
    default:
      return 'Claude';
  }
};

type PanelMenuProps = {
  platform: PlatformId;
  side: PanelSide;
  onClose: () => void;
  onSelectPanel: (panelId: string) => void;
  onOpenPromptVault: () => void;
  onRefreshUsage: () => void;
};

const panelIcons: Record<string, LucideIcon> = {
  ArrowLeftRight,
  Settings,
  SlidersHorizontal,
};

const PanelMenu = ({
  platform,
  side,
  onClose,
  onSelectPanel,
  onOpenPromptVault,
  onRefreshUsage,
}: PanelMenuProps) => {
  const { t } = useTranslation();

  const sideClass = side === 'left' ? 'right-full mr-3' : 'left-full ml-3';
  const arrowWrapperClass = side === 'left' ? 'left-full' : 'right-full';
  const arrowBorderClass = side === 'left' ? 'border-l-[#e5e0d8]' : 'border-r-[#e5e0d8]';
  const arrowFillClass = side === 'left' ? 'border-l-white' : 'border-r-white';
  const arrowBorderOffsetClass = side === 'left' ? 'left-0' : 'right-0';

  const platformName = getPlatformDisplayName(platform);

  return (
    <div className={`absolute top-1/2 -translate-y-1/2 ${sideClass} z-50`}>
      <div className="relative w-[15rem] rounded-xl border border-[#e5e0d8] bg-white p-2.5 text-[#374151] shadow-[0_8px_24px_rgba(0,0,0,0.12)]">
        <div className="mb-2 flex items-center justify-between border-b border-[#f1ece4] pb-1.5">
          <div className="text-[12px] font-semibold text-[#111827]">Nomad 旗艦中樞</div>
          <button
            type="button"
            className="rounded p-1 text-[#6b7280] hover:bg-zinc-100"
            aria-label={t('common.cancel')}
            onClick={onClose}
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="flex flex-col gap-1">
          {/* Primary shortcut: Prompt Vault */}
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[12px] font-medium text-emerald-700 transition-colors hover:bg-emerald-50"
            onClick={() => {
              onClose();
              onOpenPromptVault();
            }}
          >
            <MessageSquare className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
            <span className="truncate">Nomad 提示詞庫中樞</span>
          </button>

          {panels.map((panel) => {
            const Icon = panel.icon ? panelIcons[panel.icon] : undefined;
            return (
              <button
                key={panel.id}
                type="button"
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[12px] transition-colors hover:bg-zinc-50"
                aria-label={t(panel.labelKey)}
                onClick={() => onSelectPanel(panel.id)}
              >
                {Icon ? (
                  <Icon className="h-4 w-4 shrink-0 text-[#6b7280]" aria-hidden="true" />
                ) : null}
                <span className="truncate">{t(panel.labelKey)}</span>
              </button>
            );
          })}

          <div className="my-1 h-px bg-[#f1ece4]" />

          <button
            type="button"
            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[11px] text-[#6b7280] transition-colors hover:bg-zinc-50"
            onClick={() => {
              onRefreshUsage();
              onClose();
            }}
          >
            <RefreshCw className="h-3.5 w-3.5 shrink-0 text-[#9ca3af]" aria-hidden="true" />
            <span className="truncate">重新整理 {platformName} 額度</span>
          </button>
        </div>

        <div className={`absolute top-1/2 -translate-y-1/2 ${arrowWrapperClass}`}>
          <div
            className={`h-0 w-0 border-y-[6px] border-y-transparent ${arrowBorderClass} ${side === 'left' ? 'border-l-[6px]' : 'border-r-[6px]'}`}
          />
          <div
            className={`absolute ${arrowBorderOffsetClass} top-1/2 h-0 w-0 -translate-y-1/2 border-y-[5px] border-y-transparent ${arrowFillClass} ${
              side === 'left' ? 'border-l-[5px]' : 'border-r-[5px]'
            }`}
          />
        </div>
      </div>
    </div>
  );
};

export type FloatBallProps = {
  platform?: PlatformId;
};

const BALL_WRAPPER_SIZE_REM = 4.8;
const BALL_BUTTON_SIZE_REM = 3.4;
const BALL_WRAPPER_FALLBACK_PX = 76;
const BALL_RIGHT_PX = 24;
const BALL_BOTTOM_PX = 24;

export default function FloatBall({ platform: platformProp }: FloatBallProps) {
  const platform = platformProp ?? detectPlatform();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [activePanelId, setActivePanelId] = useState<string | null>(null);
  const [loadedPosition, setLoadedPosition] = useState<Point | null>(null);

  const { ballScale } = useBallSizeControl();
  const { usageData, refreshUsage } = useUniversalUsage(platform);
  const brandColor = getPlatformBrandColor(platform);

  useEffect(() => {
    void initI18n();
    document.body.setAttribute('data-nomad-orb-active', 'true');
  }, []);

  const closeAll = () => {
    setOpen(false);
    setActivePanelId(null);
  };

  useEffect(() => {
    void (async () => {
      const stored = await readStoredFloatBallPosition();
      if (!stored) return;
      setLoadedPosition(stored);
    })();
  }, []);

  const getSize = () => {
    const el = rootRef.current;
    if (!el) return { width: BALL_WRAPPER_FALLBACK_PX, height: BALL_WRAPPER_FALLBACK_PX };
    const rect = el.getBoundingClientRect();
    return {
      width: rect.width || BALL_WRAPPER_FALLBACK_PX,
      height: rect.height || BALL_WRAPPER_FALLBACK_PX,
    };
  };

  /**
   * Default position: pinned at bottom-right corner with 24px margin
   */
  const defaultPosition = () => {
    const size = getSize();
    const x = Math.max(0, window.innerWidth - size.width - BALL_RIGHT_PX);
    const y = Math.max(0, window.innerHeight - size.height - BALL_BOTTOM_PX);
    return { x, y };
  };

  const syncTriggerPosition = () => {
    const trigger = document.getElementById('gv-pm-trigger');
    const el = rootRef.current;
    if (trigger && el) {
      const rect = el.getBoundingClientRect();
      trigger.style.position = 'fixed';
      trigger.style.left = `${Math.round(rect.left + rect.width / 2 - 23)}px`;
      trigger.style.top = `${Math.round(rect.top + rect.height / 2 - 23)}px`;
      trigger.style.right = 'auto';
      trigger.style.bottom = 'auto';
    }
  };

  const togglePromptManager = () => {
    const trigger = document.getElementById('gv-pm-trigger');
    if (!trigger) {
      console.warn('[Nomad] PromptManager trigger not found');
      return;
    }
    syncTriggerPosition();
    trigger.click();
    closeAll();
  };

  const draggable = useDraggable({
    defaultPosition: () => loadedPosition ?? defaultPosition(),
    getSize,
    onClick: () => {
      void refreshUsage();
      togglePromptManager();
    },
    onDragEnd: (pos) => {
      void writeStoredFloatBallPosition(pos);
      syncTriggerPosition();
      const panel = document.getElementById('gv-pm-panel');
      const el = rootRef.current;
      if (
        panel &&
        el &&
        !panel.classList.contains('gv-hidden') &&
        !panel.classList.contains('gv-locked')
      ) {
        const pad = 8;
        const panelW = Math.min(380, Math.max(300, panel.getBoundingClientRect().width || 320));
        const rect = el.getBoundingClientRect();
        const vw = window.innerWidth;
        const tentativeLeft = Math.min(
          vw - panelW - pad,
          Math.max(pad, rect.left + rect.width - panelW),
        );
        const top = Math.max(pad, rect.top - (panel.getBoundingClientRect().height || 360) - 10);
        panel.style.left = `${Math.round(tentativeLeft)}px`;
        panel.style.top = `${Math.round(top)}px`;
      }
    },
  });

  const { position, isDragging, containerStyle, onPointerDown, setPosition } = draggable;

  useEffect(() => {
    if (!loadedPosition) return;
    setPosition(loadedPosition);
    setTimeout(syncTriggerPosition, 100);
  }, [loadedPosition, setPosition]);

  useEffect(() => {
    const handleToggleWidth = () => {
      setActivePanelId('width');
      setOpen(true);
    };
    window.addEventListener('nomad:toggle-width-panel', handleToggleWidth);
    return () => window.removeEventListener('nomad:toggle-width-panel', handleToggleWidth);
  }, []);

  const panelSide = useMemo<PanelSide>(() => {
    const approxWidth = BALL_WRAPPER_SIZE_REM * ballScale * 16;
    const centerX = position.x + approxWidth / 2;
    return centerX >= window.innerWidth / 2 ? 'left' : 'right';
  }, [position.x, ballScale]);

  const activePanel = useMemo(() => {
    if (!activePanelId) return null;
    return panels.find((p) => p.id === activePanelId) ?? null;
  }, [activePanelId]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const el = rootRef.current;
      if (!el) return;
      if (e.target instanceof Node && el.contains(e.target)) return;
      closeAll();
    };
    window.addEventListener('mousedown', onDown, true);
    return () => window.removeEventListener('mousedown', onDown, true);
  }, [open]);

  return (
    <div className="fixed z-50" style={containerStyle} data-nomad-orb="true">
      <div
        ref={rootRef}
        className="group relative"
        style={{
          width: `${BALL_WRAPPER_SIZE_REM * ballScale}rem`,
          height: `${BALL_WRAPPER_SIZE_REM * ballScale}rem`,
        }}
      >
        <UsageRings data={usageData} side={panelSide} isDragging={isDragging}>
          <button
            type="button"
            className={`relative z-10 flex items-center justify-center select-none active:scale-95 ${
              isDragging ? 'cursor-grabbing' : 'cursor-grab'
            }`}
            style={{
              width: `${BALL_BUTTON_SIZE_REM * ballScale}rem`,
              height: `${BALL_BUTTON_SIZE_REM * ballScale}rem`,
              borderRadius: '50%',
              overflow: 'hidden',
              background: hovered
                ? `linear-gradient(135deg, color-mix(in srgb, var(--gv-pm-brand, ${brandColor}) 85%, black), var(--gv-pm-brand, ${brandColor}))`
                : `linear-gradient(135deg, var(--gv-pm-brand, ${brandColor}), color-mix(in srgb, var(--gv-pm-brand, ${brandColor}) 85%, white))`,
              border: `2px solid color-mix(in srgb, var(--gv-pm-brand, ${brandColor}) 75%, white)`,
              boxShadow: hovered
                ? `0 10px 28px rgba(0,0,0,0.35), 0 0 16px color-mix(in srgb, var(--gv-pm-brand, ${brandColor}) 45%, transparent)`
                : '0 4px 14px rgba(0,0,0,0.22)',
              transition:
                'background 0.2s cubic-bezier(0.4, 0, 0.2, 1), transform 0.15s ease, box-shadow 0.2s ease',
            }}
            onPointerDown={onPointerDown}
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (open) {
                closeAll();
              } else {
                setActivePanelId(null);
                setOpen(true);
              }
            }}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            aria-label="Nomad AI Workspace (提示詞庫與額度監控)"
            title="Nomad 提示詞中樞 (左鍵開啟 / 右鍵設定對話寬度)"
          >
            <img
              src={chrome.runtime.getURL('mascot-logo.png')}
              alt="Nomad Mascot"
              className="pointer-events-none transition-transform duration-200 select-none"
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                borderRadius: '50%',
                filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))',
                transform: hovered ? 'scale(1.08)' : 'scale(1)',
              }}
            />
          </button>
        </UsageRings>

        {/* Mini quick-action button on hover */}
        <button
          type="button"
          className={`absolute top-0.5 right-0.5 z-20 flex size-5 items-center justify-center rounded-full border border-[#e5e0d8] bg-white text-[#4b5563] shadow-md transition-all duration-150 hover:scale-110 hover:bg-zinc-100 active:scale-95 ${
            hovered || open ? 'scale-100 opacity-100' : 'pointer-events-none scale-75 opacity-0'
          }`}
          title="對話寬度與球體設定 (亦可右鍵開啟)"
          onClick={(e) => {
            e.stopPropagation();
            if (open) {
              closeAll();
            } else {
              setActivePanelId(null);
              setOpen(true);
            }
          }}
        >
          <SlidersHorizontal className="h-2.5 w-2.5" />
        </button>

        {open && !activePanel ? (
          <PanelMenu
            platform={platform}
            side={panelSide}
            onClose={closeAll}
            onSelectPanel={setActivePanelId}
            onOpenPromptVault={togglePromptManager}
            onRefreshUsage={refreshUsage}
          />
        ) : null}
        {open && activePanel ? <activePanel.component side={panelSide} onClose={closeAll} /> : null}
      </div>
    </div>
  );
}
