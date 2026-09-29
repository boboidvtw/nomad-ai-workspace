/**
 * MultiAISidebarTree.tsx
 * Nomad AI Workspace — Hierarchical Multi-AI Sidebar Component
 * Displays stored folders & conversations segmented by AI platform.
 */

import React, { useState } from 'react';
import { 
  ChevronDown, 
  ChevronRight, 
  Folder as FolderIcon, 
  FolderOpen, 
  ExternalLink, 
  MessageSquare,
  Sparkles,
  Cloud
} from 'lucide-react';
import { SUPPORTED_PLATFORMS, type PlatformId } from '@/core/platform/registry';
import { useCrossPlatformFolders } from '@/core/platform/useCrossPlatformFolders';
import type { CrossPlatformFolder } from '@/core/platform/types';

interface Props {
  currentPlatform: PlatformId;
  theme?: 'dark' | 'light';
  className?: string;
  onOpenSyncSettings?: () => void;
}

export const MultiAISidebarTree: React.FC<Props> = ({
  currentPlatform,
  theme = 'dark',
  className = '',
  onOpenSyncSettings,
}) => {
  const { geminiFolders, claudeFolders, loading } = useCrossPlatformFolders();
  
  // Track collapsed/expanded state of platform root nodes
  const [expandedPlatforms, setExpandedPlatforms] = useState<Record<PlatformId, boolean>>({
    gemini: currentPlatform === 'gemini',
    claude: currentPlatform === 'claude',
    chatgpt: false,
    grok: false,
    deepseek: false,
  });

  // Track expanded folders
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});

  const togglePlatform = (id: PlatformId) => {
    setExpandedPlatforms((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const toggleFolder = (folderId: string) => {
    setExpandedFolders((prev) => ({ ...prev, [folderId]: !prev[folderId] }));
  };

  const isDark = theme === 'dark';
  const textPrimary = isDark ? 'text-zinc-200' : 'text-stone-800';
  const textMuted = isDark ? 'text-zinc-400' : 'text-stone-500';
  const bgHover = isDark ? 'hover:bg-white/5' : 'hover:bg-black/5';
  const borderSubtle = isDark ? 'border-white/10' : 'border-black/10';

  const renderFolderList = (folders: CrossPlatformFolder[], platformId: PlatformId) => {
    if (folders.length === 0) {
      return (
        <div className={`px-6 py-2 text-xs italic ${textMuted}`}>
          尚無已存放資料夾
        </div>
      );
    }

    return (
      <div className="space-y-0.5 pl-3">
        {folders.map((f) => {
          const isOpen = expandedFolders[f.id] ?? false;
          return (
            <div key={f.id} className="text-xs">
              <div
                onClick={() => toggleFolder(f.id)}
                className={`flex items-center gap-1.5 px-2 py-1 rounded cursor-pointer ${bgHover} ${textPrimary}`}
              >
                {isOpen ? (
                  <ChevronDown className="w-3.5 h-3.5 opacity-60 flex-shrink-0" />
                ) : (
                  <ChevronRight className="w-3.5 h-3.5 opacity-60 flex-shrink-0" />
                )}
                {isOpen ? (
                  <FolderOpen className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                ) : (
                  <FolderIcon className="w-3.5 h-3.5 text-amber-500/80 flex-shrink-0" />
                )}
                <span className="truncate flex-1 font-medium">{f.name}</span>
                <span className="text-[10px] opacity-50 px-1 rounded bg-black/10">
                  {f.conversations.length}
                </span>
              </div>

              {isOpen && (
                <div className="pl-5 space-y-0.5 py-0.5 border-l border-white/5 ml-3 my-0.5">
                  {f.conversations.map((c) => {
                    const isCurrent = platformId === currentPlatform;
                    return (
                      <a
                        key={c.id}
                        href={c.url}
                        target={isCurrent ? '_self' : '_blank'}
                        rel="noreferrer"
                        className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs no-underline truncate ${bgHover} ${textMuted} hover:text-white transition-colors`}
                        title={c.title}
                      >
                        <MessageSquare className="w-3 h-3 opacity-60 flex-shrink-0" />
                        <span className="truncate flex-1">{c.title}</span>
                        {!isCurrent && (
                          <ExternalLink className="w-2.5 h-2.5 opacity-40 group-hover:opacity-80 flex-shrink-0" />
                        )}
                      </a>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className={`nomad-sidebar-tree flex flex-col font-sans select-none ${className}`}>
      {/* Header Bar */}
      <div className={`flex items-center justify-between px-3 py-2 border-b ${borderSubtle}`}>
        <div className="flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-blue-400" />
          <span className={`text-xs font-semibold tracking-wide ${textPrimary}`}>
            Nomad Workspace
          </span>
        </div>
        {onOpenSyncSettings && (
          <button
            onClick={onOpenSyncSettings}
            className={`p-1 rounded ${bgHover} text-xs opacity-70 hover:opacity-100 transition-opacity`}
            title="Google Drive 雲端同步設定"
          >
            <Cloud className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Platform Hierarchical Root Nodes */}
      <div className="py-2 space-y-1 overflow-y-auto max-h-[calc(100vh-280px)]">
        {/* 1. Google Gemini Node */}
        {(() => {
          const cfg = SUPPORTED_PLATFORMS.gemini;
          const isCurrent = currentPlatform === 'gemini';
          const isExpanded = expandedPlatforms.gemini;
          return (
            <div className="px-2">
              <div
                onClick={() => togglePlatform('gemini')}
                className={`flex items-center gap-1.5 px-2 py-1.5 rounded-md cursor-pointer ${bgHover} transition-colors`}
              >
                {isExpanded ? (
                  <ChevronDown className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
                ) : (
                  <ChevronRight className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
                )}
                <span className="w-2 h-2 rounded-full bg-blue-500 shadow-sm shadow-blue-500/50 flex-shrink-0" />
                <span className={`text-xs font-semibold flex-1 ${textPrimary}`}>
                  {cfg.name}
                </span>
                {isCurrent && (
                  <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/30">
                    目前
                  </span>
                )}
                <span className="text-[10px] text-zinc-500 font-mono">
                  ({geminiFolders.reduce((acc, f) => acc + f.conversations.length, 0)})
                </span>
              </div>
              {isExpanded && renderFolderList(geminiFolders, 'gemini')}
            </div>
          );
        })()}

        {/* 2. Anthropic Claude Node */}
        {(() => {
          const cfg = SUPPORTED_PLATFORMS.claude;
          const isCurrent = currentPlatform === 'claude';
          const isExpanded = expandedPlatforms.claude;
          return (
            <div className="px-2">
              <div
                onClick={() => togglePlatform('claude')}
                className={`flex items-center gap-1.5 px-2 py-1.5 rounded-md cursor-pointer ${bgHover} transition-colors`}
              >
                {isExpanded ? (
                  <ChevronDown className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
                ) : (
                  <ChevronRight className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
                )}
                <span className="w-2 h-2 rounded-full bg-amber-600 shadow-sm shadow-amber-600/50 flex-shrink-0" />
                <span className={`text-xs font-semibold flex-1 ${textPrimary}`}>
                  {cfg.name}
                </span>
                {isCurrent && (
                  <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30">
                    目前
                  </span>
                )}
                <span className="text-[10px] text-zinc-500 font-mono">
                  ({claudeFolders.reduce((acc, f) => acc + f.conversations.length, 0)})
                </span>
              </div>
              {isExpanded && renderFolderList(claudeFolders, 'claude')}
            </div>
          );
        })()}

        {/* 3. OpenAI ChatGPT Node (Ready/Placeholder) */}
        {(() => {
          const cfg = SUPPORTED_PLATFORMS.chatgpt;
          const isExpanded = expandedPlatforms.chatgpt;
          return (
            <div className="px-2 opacity-60 hover:opacity-100 transition-opacity">
              <div
                onClick={() => togglePlatform('chatgpt')}
                className={`flex items-center gap-1.5 px-2 py-1.5 rounded-md cursor-pointer ${bgHover}`}
              >
                {isExpanded ? (
                  <ChevronDown className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                ) : (
                  <ChevronRight className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                )}
                <span className="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0" />
                <span className={`text-xs font-medium flex-1 ${textPrimary}`}>
                  {cfg.name}
                </span>
                <span className="text-[9px] px-1 py-0.5 rounded bg-white/10 text-zinc-400">
                  即將推出
                </span>
              </div>
              {isExpanded && (
                <div className="pl-6 py-1 text-[11px] text-zinc-500 italic">
                  ChatGPT 官方側邊欄即將支援
                </div>
              )}
            </div>
          );
        })()}

        {/* 4. xAI Grok Node (Planned) */}
        {(() => {
          const cfg = SUPPORTED_PLATFORMS.grok;
          const isExpanded = expandedPlatforms.grok;
          return (
            <div className="px-2 opacity-50 hover:opacity-90 transition-opacity">
              <div
                onClick={() => togglePlatform('grok')}
                className={`flex items-center gap-1.5 px-2 py-1.5 rounded-md cursor-pointer ${bgHover}`}
              >
                {isExpanded ? (
                  <ChevronDown className="w-3.5 h-3.5 text-sky-400 flex-shrink-0" />
                ) : (
                  <ChevronRight className="w-3.5 h-3.5 text-sky-400 flex-shrink-0" />
                )}
                <span className="w-2 h-2 rounded-full bg-sky-500 flex-shrink-0" />
                <span className={`text-xs font-medium flex-1 ${textPrimary}`}>
                  {cfg.name}
                </span>
                <span className="text-[9px] px-1 py-0.5 rounded bg-white/10 text-zinc-400">
                  規劃中
                </span>
              </div>
              {isExpanded && (
                <div className="pl-6 py-1 text-[11px] text-zinc-500 italic">
                  xAI Grok 工作空間規劃中
                </div>
              )}
            </div>
          );
        })()}
      </div>
    </div>
  );
};

export default MultiAISidebarTree;
