/**
 * Nomad AI Workspace — ChatGPT FloatBall (Super Orb) Component
 * Provides draggable mascot floating orb on ChatGPT with prompt launcher and multi-AI workspace.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { MessageSquare, SlidersHorizontal, X, Layers, Cloud, Sparkles } from 'lucide-react';
import { readStoredFloatBallPosition, writeStoredFloatBallPosition, type FloatBallPosition } from '@/services/storage';
import { useDraggable } from '@/features/claude/hooks/useDraggable';
import { MultiAISidebarTree } from '@/components/MultiAISidebarTree';

const BALL_SIZE_REM = 3.2;
const BALL_RIGHT_PX = 24;
const BALL_BOTTOM_PX = 24;

export default function ChatGPTFloatBall() {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [hovered, setHovered] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [loadedPosition, setLoadedPosition] = useState<FloatBallPosition | null>(null);

  useEffect(() => {
    void (async () => {
      const stored = await readStoredFloatBallPosition();
      if (stored) setLoadedPosition(stored);
    })();
  }, []);

  const getSize = () => {
    const el = rootRef.current;
    if (!el) return { width: 52, height: 52 };
    const rect = el.getBoundingClientRect();
    return { width: rect.width || 52, height: rect.height || 52 };
  };

  const defaultPosition = () => {
    const size = getSize();
    const x = Math.max(0, window.innerWidth - size.width - BALL_RIGHT_PX);
    const y = Math.max(0, window.innerHeight - size.height - BALL_BOTTOM_PX);
    return { x, y };
  };

  const togglePromptManager = () => {
    const trigger = document.getElementById('gv-pm-trigger');
    if (trigger) {
      trigger.click();
    } else {
      console.warn('[Nomad Workspace] Prompt manager trigger not found');
    }
    setMenuOpen(false);
  };

  const draggable = useDraggable({
    defaultPosition: () => loadedPosition ?? defaultPosition(),
    getSize,
    onClick: () => {
      togglePromptManager();
    },
    onDragEnd: (pos) => {
      void writeStoredFloatBallPosition(pos);
    },
  });

  const { position, isDragging, containerStyle, onPointerDown, setPosition } = draggable;

  useEffect(() => {
    if (!loadedPosition) return;
    setPosition(loadedPosition);
  }, [loadedPosition, setPosition]);

  // Close menu on click outside
  useEffect(() => {
    if (!menuOpen) return;
    const handleDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    window.addEventListener('mousedown', handleDown, true);
    return () => window.removeEventListener('mousedown', handleDown, true);
  }, [menuOpen]);

  const side = position.x >= window.innerWidth / 2 ? 'left' : 'right';
  const sideClass = side === 'left' ? 'right-full mr-3' : 'left-full ml-3';

  return (
    <div className="fixed z-50 select-none" style={containerStyle} data-nomad-orb="true">
      <div ref={rootRef} className="relative group" style={{ width: `${BALL_SIZE_REM}rem`, height: `${BALL_SIZE_REM}rem` }}>
        {/* Main Floating Orb Button */}
        <button
          type="button"
          className={`relative z-10 flex items-center justify-center rounded-full shadow-lg transition-transform duration-150 ${
            isDragging ? 'cursor-grabbing scale-105' : 'cursor-grab hover:scale-105 active:scale-95'
          }`}
          style={{
            width: `${BALL_SIZE_REM}rem`,
            height: `${BALL_SIZE_REM}rem`,
            background: hovered
              ? 'linear-gradient(135deg, #0d8a6a, #10a37f)'
              : 'linear-gradient(135deg, #10a37f, #14b88a)',
            border: '1.5px solid rgba(255, 255, 255, 0.25)',
            boxShadow: hovered
              ? '0 10px 25px rgba(16, 163, 127, 0.45), 0 0 12px rgba(16, 163, 127, 0.3)'
              : '0 4px 14px rgba(0, 0, 0, 0.25)',
          }}
          onPointerDown={onPointerDown}
          onContextMenu={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setMenuOpen((prev) => !prev);
          }}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          aria-label="Nomad AI Workspace"
          title="Nomad ChatGPT 旗艦中樞 (左鍵開啟提示詞庫 / 右鍵工作空間選單)"
        >
          <img
            src={chrome.runtime.getURL('mascot-logo.png')}
            alt="Nomad Mascot"
            className="pointer-events-none select-none transition-transform duration-200"
            style={{
              width: '2.1rem',
              height: '2.1rem',
              objectFit: 'contain',
              filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))',
              transform: hovered ? 'scale(1.1)' : 'scale(1)',
            }}
          />
        </button>

        {/* Mini quick-settings button on hover */}
        <button
          type="button"
          className={`absolute top-0 right-0 z-20 flex size-5 items-center justify-center rounded-full border border-white/20 bg-zinc-900 text-zinc-300 shadow-md transition-all duration-150 hover:bg-zinc-800 hover:scale-110 active:scale-95 ${
            hovered || menuOpen ? 'opacity-100 scale-100' : 'opacity-0 scale-75 pointer-events-none'
          }`}
          title="Nomad 工作空間選單 (亦可右鍵開啟)"
          onClick={(e) => {
            e.stopPropagation();
            setMenuOpen((prev) => !prev);
          }}
        >
          <SlidersHorizontal className="h-2.5 w-2.5" />
        </button>

        {/* Quick Popover Menu */}
        {menuOpen && (
          <div
            className={`absolute top-1/2 -translate-y-1/2 ${sideClass} z-50 w-56 rounded-xl border border-white/10 bg-zinc-900/95 backdrop-blur-md p-2.5 text-zinc-200 shadow-2xl`}
          >
            <div className="mb-2 flex items-center justify-between border-b border-white/10 pb-1.5">
              <div className="text-xs font-semibold text-white flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                Nomad 旗艦中樞
              </div>
              <button
                type="button"
                className="rounded p-1 text-zinc-400 hover:text-white hover:bg-white/10"
                onClick={() => setMenuOpen(false)}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="flex flex-col gap-1">
              {/* Multi-AI Workspace Tree Drawer */}
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-medium text-emerald-400 hover:bg-emerald-500/15 transition-colors"
                onClick={() => {
                  setMenuOpen(false);
                  setWorkspaceOpen(true);
                }}
              >
                <Layers className="h-4 w-4 text-emerald-400 shrink-0" />
                <span className="truncate">Nomad 多平台工作空間</span>
              </button>

              {/* Prompt Vault */}
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs text-zinc-200 hover:bg-white/5 transition-colors"
                onClick={togglePromptManager}
              >
                <MessageSquare className="h-4 w-4 text-zinc-400 shrink-0" />
                <span className="truncate">提示詞庫中樞 (Prompt Vault)</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Full Workspace Tree Modal */}
      {workspaceOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-zinc-900 shadow-2xl overflow-hidden text-zinc-100">
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
              <div className="text-sm font-semibold flex items-center gap-2">
                <span>📁 Nomad 多平台工作空間總覽</span>
              </div>
              <button
                onClick={() => setWorkspaceOpen(false)}
                className="text-zinc-400 hover:text-white p-1 rounded-md"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-2 max-h-[70vh] overflow-y-auto">
              <MultiAISidebarTree currentPlatform="chatgpt" theme="dark" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
