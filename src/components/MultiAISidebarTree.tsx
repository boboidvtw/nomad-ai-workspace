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
  Cloud,
} from 'lucide-react';

import { SUPPORTED_PLATFORMS, type PlatformId } from '@/core/platform/registry';
import type { CrossPlatformFolder } from '@/core/platform/types';
import { useCrossPlatformFolders } from '@/core/platform/useCrossPlatformFolders';

interface Props {
  currentPlatform: PlatformId;
  theme?: 'dark' | 'light';
  className?: string;
  onOpenSyncSettings?: () => void;
  collapsible?: boolean;
  defaultCollapsed?: boolean;
  showHeader?: boolean;
  children?: React.ReactNode;
}

export const MultiAISidebarTree: React.FC<Props> = ({
  currentPlatform,
  theme = 'dark',
  className = '',
  onOpenSyncSettings,
  collapsible = true,
  defaultCollapsed,
  showHeader = true,
  children,
}) => {
  const { geminiFolders, claudeFolders, chatgptFolders, grokFolders } = useCrossPlatformFolders();

  // Track collapsed/expanded state of entire Nomad Workspace section
  const [isWorkspaceCollapsed, setIsWorkspaceCollapsed] = useState<boolean>(() => {
    if (typeof defaultCollapsed === 'boolean') {
      return defaultCollapsed;
    }
    try {
      if (typeof localStorage !== 'undefined') {
        const stored = localStorage.getItem('nomad_workspace_collapsed');
        if (stored !== null) {
          return stored === 'true';
        }
      }
    } catch {}
    return false;
  });

  const toggleWorkspaceCollapse = () => {
    if (!collapsible) return;
    setIsWorkspaceCollapsed((prev) => {
      const next = !prev;
      try {
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem('nomad_workspace_collapsed', String(next));
        }
      } catch {}
      return next;
    });
  };

  // Track collapsed/expanded state of platform root nodes
  const [expandedPlatforms, setExpandedPlatforms] = useState<Record<PlatformId, boolean>>({
    gemini: currentPlatform === 'gemini',
    claude: currentPlatform === 'claude',
    chatgpt: currentPlatform === 'chatgpt',
    grok: currentPlatform === 'grok',
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
      return <div className={`px-6 py-2 text-xs italic ${textMuted}`}>尚無已存放資料夾</div>;
    }

    return (
      <div className="space-y-0.5 pl-3">
        {folders.map((f) => {
          const isOpen = expandedFolders[f.id] ?? false;
          return (
            <div key={f.id} className="text-xs">
              <div
                role="button"
                tabIndex={0}
                onClick={() => toggleFolder(f.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    toggleFolder(f.id);
                  }
                }}
                className={`flex cursor-pointer items-center gap-1.5 rounded px-2 py-1 ${bgHover} ${textPrimary}`}
              >
                {isOpen ? (
                  <ChevronDown className="h-3.5 w-3.5 flex-shrink-0 opacity-60" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5 flex-shrink-0 opacity-60" />
                )}
                {isOpen ? (
                  <FolderOpen className="h-3.5 w-3.5 flex-shrink-0 text-amber-400" />
                ) : (
                  <FolderIcon className="h-3.5 w-3.5 flex-shrink-0 text-amber-500/80" />
                )}
                <span className="flex-1 truncate font-medium">{f.name}</span>
                <span className="rounded bg-black/10 px-1 text-[10px] opacity-50">
                  {f.conversations.length}
                </span>
              </div>

              {isOpen && (
                <div className="my-0.5 ml-3 space-y-0.5 border-l border-white/5 py-0.5 pl-5">
                  {f.conversations.map((c) => {
                    const isCurrent = platformId === currentPlatform;
                    const conversationHref = isCurrent
                      ? platformId === 'claude'
                        ? `/chat/${c.id}`
                        : platformId === 'chatgpt'
                          ? `/c/${c.id}`
                          : platformId === 'gemini'
                            ? `/app/${c.id}`
                            : platformId === 'grok'
                              ? `/chat/${c.id}`
                              : c.url
                      : c.url;

                    const handleConversationClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
                      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) {
                        return;
                      }

                      if (isCurrent) {
                        e.preventDefault();
                        const findHostLink = (selector: string) => {
                          const elements = Array.from(
                            document.querySelectorAll<HTMLAnchorElement>(selector),
                          );
                          return elements.find(
                            (el) => !el.closest('.nomad-sidebar-tree') && el !== e.currentTarget,
                          );
                        };

                        if (currentPlatform === 'claude') {
                          const nativeLink =
                            findHostLink(`nav a[href*="${c.id}"]`) ||
                            findHostLink(`a[href^="/chat/${c.id}"]`);
                          if (nativeLink) {
                            nativeLink.dispatchEvent(
                              new MouseEvent('pointerdown', { bubbles: true, cancelable: true }),
                            );
                            nativeLink.dispatchEvent(
                              new MouseEvent('mousedown', { bubbles: true, cancelable: true }),
                            );
                            nativeLink.dispatchEvent(
                              new MouseEvent('mouseup', { bubbles: true, cancelable: true }),
                            );
                            nativeLink.click();
                            return;
                          }
                          try {
                            window.history.pushState({}, '', `/chat/${c.id}`);
                            const event =
                              typeof PopStateEvent === 'function'
                                ? new PopStateEvent('popstate', { state: window.history.state })
                                : new Event('popstate');
                            window.dispatchEvent(event);
                            window.dispatchEvent(new CustomEvent('nomad:locationchange'));
                          } catch {
                            window.location.href = `/chat/${c.id}`;
                          }
                        } else if (currentPlatform === 'chatgpt') {
                          const nativeLink =
                            findHostLink(`nav a[href*="${c.id}"]`) ||
                            findHostLink(`a[href^="/c/${c.id}"]`);
                          if (nativeLink) {
                            nativeLink.dispatchEvent(
                              new MouseEvent('pointerdown', { bubbles: true, cancelable: true }),
                            );
                            nativeLink.dispatchEvent(
                              new MouseEvent('mousedown', { bubbles: true, cancelable: true }),
                            );
                            nativeLink.dispatchEvent(
                              new MouseEvent('mouseup', { bubbles: true, cancelable: true }),
                            );
                            nativeLink.click();
                            return;
                          }
                          try {
                            window.history.pushState({}, '', `/c/${c.id}`);
                            const event =
                              typeof PopStateEvent === 'function'
                                ? new PopStateEvent('popstate', { state: window.history.state })
                                : new Event('popstate');
                            window.dispatchEvent(event);
                          } catch {
                            window.location.href = `/c/${c.id}`;
                          }
                        } else if (currentPlatform === 'gemini') {
                          const nativeLink =
                            findHostLink(`a[data-conversation-id="${c.id}"]`) ||
                            findHostLink(`conversation-list a[href*="/app/${c.id}"]`) ||
                            findHostLink(`nav a[href*="/app/${c.id}"]`);
                          if (nativeLink) {
                            nativeLink.dispatchEvent(
                              new MouseEvent('pointerdown', { bubbles: true, cancelable: true }),
                            );
                            nativeLink.dispatchEvent(
                              new MouseEvent('mousedown', { bubbles: true, cancelable: true }),
                            );
                            nativeLink.dispatchEvent(
                              new MouseEvent('mouseup', { bubbles: true, cancelable: true }),
                            );
                            nativeLink.click();
                            return;
                          }
                          try {
                            window.history.pushState({}, '', `/app/${c.id}`);
                            const event =
                              typeof PopStateEvent === 'function'
                                ? new PopStateEvent('popstate', { state: window.history.state })
                                : new Event('popstate');
                            window.dispatchEvent(event);
                          } catch {
                            window.location.href = `/app/${c.id}`;
                          }
                        } else if (currentPlatform === 'grok') {
                          const nativeLink =
                            findHostLink(`nav a[href*="${c.id}"]`) ||
                            findHostLink(`a[href*="/chat/${c.id}"]`) ||
                            findHostLink(`a[href*="/c/${c.id}"]`);
                          if (nativeLink) {
                            nativeLink.dispatchEvent(
                              new MouseEvent('pointerdown', { bubbles: true, cancelable: true }),
                            );
                            nativeLink.dispatchEvent(
                              new MouseEvent('mousedown', { bubbles: true, cancelable: true }),
                            );
                            nativeLink.dispatchEvent(
                              new MouseEvent('mouseup', { bubbles: true, cancelable: true }),
                            );
                            nativeLink.click();
                            return;
                          }
                          try {
                            window.history.pushState({}, '', `/chat/${c.id}`);
                            const event =
                              typeof PopStateEvent === 'function'
                                ? new PopStateEvent('popstate', { state: window.history.state })
                                : new Event('popstate');
                            window.dispatchEvent(event);
                          } catch {
                            window.location.href = `/chat/${c.id}`;
                          }
                        }
                      } else {
                        if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
                          try {
                            chrome.runtime.sendMessage({
                              type: 'gv.openConversation',
                              url: c.url,
                            });
                            e.preventDefault();
                          } catch {
                            // Fallback to standard anchor target="_blank"
                          }
                        }
                      }
                    };

                    const platformLabel = SUPPORTED_PLATFORMS[platformId]?.name || platformId;
                    const tooltipText = isCurrent
                      ? c.title
                      : `[${platformLabel}] ${c.title} (新分頁開啟)`;

                    return (
                      <a
                        key={c.id}
                        href={conversationHref}
                        target={isCurrent ? '_self' : '_blank'}
                        rel={isCurrent ? undefined : 'noreferrer noopener'}
                        onClick={handleConversationClick}
                        className={`flex items-center gap-1.5 truncate rounded px-2 py-1 text-xs no-underline ${bgHover} ${textMuted} group transition-colors hover:text-white`}
                        title={tooltipText}
                        aria-label={tooltipText}
                      >
                        <MessageSquare className="h-3 w-3 flex-shrink-0 opacity-60" />
                        <span className="flex-1 truncate">{c.title}</span>
                        {!isCurrent && (
                          <ExternalLink className="h-2.5 w-2.5 flex-shrink-0 text-blue-400 opacity-40 transition-opacity group-hover:opacity-100" />
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
    <div className={`nomad-sidebar-tree select-none ${className}`}>
      {/* Header bar */}
      {showHeader && (
        <div
          className={`flex items-center justify-between border-b px-3 py-2 ${borderSubtle} ${
            collapsible ? `cursor-pointer ${bgHover} transition-colors` : ''
          }`}
          onClick={collapsible ? toggleWorkspaceCollapse : undefined}
          role={collapsible ? 'button' : undefined}
          tabIndex={collapsible ? 0 : undefined}
          aria-expanded={collapsible ? !isWorkspaceCollapsed : undefined}
          onKeyDown={(e) => {
            if (collapsible && (e.key === 'Enter' || e.key === ' ')) {
              e.preventDefault();
              toggleWorkspaceCollapse();
            }
          }}
        >
          <div className="flex items-center gap-1.5">
            {collapsible &&
              (isWorkspaceCollapsed ? (
                <ChevronRight className="h-3.5 w-3.5 flex-shrink-0 opacity-70" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5 flex-shrink-0 opacity-70" />
              ))}
            <Sparkles className="h-3.5 w-3.5 flex-shrink-0 text-blue-400" />
            <span className={`text-xs font-semibold tracking-wide ${textPrimary}`}>
              Nomad Workspace
            </span>
          </div>
          {onOpenSyncSettings && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onOpenSyncSettings();
              }}
              className={`rounded p-1 ${bgHover} text-xs opacity-70 transition-opacity hover:opacity-100`}
              title="Google Drive 雲端同步設定"
            >
              <Cloud className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}

      {(!showHeader || !isWorkspaceCollapsed) && (
        <div className="nomad-workspace-body">
          {children && (
            <div
              className={`nomad-workspace-embedded-folders border-b px-1 pt-1 pb-1 ${borderSubtle}`}
            >
              {children}
            </div>
          )}

          {/* Platform Hierarchical Root Nodes */}
          <div className="max-h-[calc(100vh-280px)] space-y-1 overflow-y-auto py-2">
            {/* 1. Google Gemini Node */}
            {(() => {
              const cfg = SUPPORTED_PLATFORMS.gemini;
              const isCurrent = currentPlatform === 'gemini';
              const isExpanded = expandedPlatforms.gemini;
              return (
                <div className="px-2">
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => togglePlatform('gemini')}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        togglePlatform('gemini');
                      }
                    }}
                    className={`flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1.5 ${bgHover} transition-colors`}
                  >
                    {isExpanded ? (
                      <ChevronDown className="h-3.5 w-3.5 flex-shrink-0 text-blue-400" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5 flex-shrink-0 text-blue-400" />
                    )}
                    <span className="h-2 w-2 flex-shrink-0 rounded-full bg-blue-500 shadow-sm shadow-blue-500/50" />
                    <span className={`flex-1 text-xs font-semibold ${textPrimary}`}>
                      {cfg.name}
                    </span>
                    {isCurrent && (
                      <span className="py-0.2 rounded-full border border-blue-500/30 bg-blue-500/20 px-1.5 text-[10px] text-blue-400">
                        目前
                      </span>
                    )}
                    <span className="font-mono text-[10px] text-zinc-500">
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
                    role="button"
                    tabIndex={0}
                    onClick={() => togglePlatform('claude')}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        togglePlatform('claude');
                      }
                    }}
                    className={`flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1.5 ${bgHover} transition-colors`}
                  >
                    {isExpanded ? (
                      <ChevronDown className="h-3.5 w-3.5 flex-shrink-0 text-amber-500" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5 flex-shrink-0 text-amber-500" />
                    )}
                    <span className="h-2 w-2 flex-shrink-0 rounded-full bg-amber-600 shadow-sm shadow-amber-600/50" />
                    <span className={`flex-1 text-xs font-semibold ${textPrimary}`}>
                      {cfg.name}
                    </span>
                    {isCurrent && (
                      <span className="py-0.2 rounded-full border border-amber-500/30 bg-amber-500/20 px-1.5 text-[10px] text-amber-400">
                        目前
                      </span>
                    )}
                    <span className="font-mono text-[10px] text-zinc-500">
                      ({claudeFolders.reduce((acc, f) => acc + f.conversations.length, 0)})
                    </span>
                  </div>
                  {isExpanded && renderFolderList(claudeFolders, 'claude')}
                </div>
              );
            })()}

            {/* 3. OpenAI ChatGPT Node */}
            {(() => {
              const cfg = SUPPORTED_PLATFORMS.chatgpt;
              const isCurrent = currentPlatform === 'chatgpt';
              const isExpanded = expandedPlatforms.chatgpt;
              return (
                <div className="px-2">
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => togglePlatform('chatgpt')}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        togglePlatform('chatgpt');
                      }
                    }}
                    className={`flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1.5 ${bgHover} transition-colors`}
                  >
                    {isExpanded ? (
                      <ChevronDown className="h-3.5 w-3.5 flex-shrink-0 text-emerald-500" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5 flex-shrink-0 text-emerald-500" />
                    )}
                    <span className="h-2 w-2 flex-shrink-0 rounded-full bg-emerald-500 shadow-sm shadow-emerald-500/50" />
                    <span className={`flex-1 text-xs font-semibold ${textPrimary}`}>
                      {cfg.name}
                    </span>
                    {isCurrent && (
                      <span className="py-0.2 rounded-full border border-emerald-500/30 bg-emerald-500/20 px-1.5 text-[10px] text-emerald-400">
                        目前
                      </span>
                    )}
                    <span className="font-mono text-[10px] text-zinc-500">
                      ({chatgptFolders.reduce((acc, f) => acc + f.conversations.length, 0)})
                    </span>
                  </div>
                  {isExpanded && renderFolderList(chatgptFolders, 'chatgpt')}
                </div>
              );
            })()}

            {/* 4. xAI Grok Node */}
            {(() => {
              const cfg = SUPPORTED_PLATFORMS.grok;
              const isCurrent = currentPlatform === 'grok';
              const isExpanded = expandedPlatforms.grok;
              return (
                <div className="px-2">
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => togglePlatform('grok')}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        togglePlatform('grok');
                      }
                    }}
                    className={`flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1.5 ${bgHover} transition-colors`}
                  >
                    {isExpanded ? (
                      <ChevronDown className="h-3.5 w-3.5 flex-shrink-0 text-sky-400" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5 flex-shrink-0 text-sky-400" />
                    )}
                    <span className="h-2 w-2 flex-shrink-0 rounded-full bg-sky-500 shadow-sm shadow-sky-500/50" />
                    <span className={`flex-1 text-xs font-semibold ${textPrimary}`}>
                      {cfg.name}
                    </span>
                    {isCurrent && (
                      <span className="py-0.2 rounded-full border border-sky-500/30 bg-sky-500/20 px-1.5 text-[10px] text-sky-400">
                        目前
                      </span>
                    )}
                    <span className="font-mono text-[10px] text-zinc-500">
                      ({grokFolders.reduce((acc, f) => acc + f.conversations.length, 0)})
                    </span>
                  </div>
                  {isExpanded && renderFolderList(grokFolders, 'grok')}
                </div>
              );
            })()}

            {/* 5. DeepSeek Node (Planned) */}
            {(() => {
              const cfg = SUPPORTED_PLATFORMS.deepseek;
              const isExpanded = expandedPlatforms.deepseek;
              return (
                <div className="px-2 opacity-50 transition-opacity hover:opacity-90">
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => togglePlatform('deepseek')}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        togglePlatform('deepseek');
                      }
                    }}
                    className={`flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1.5 ${bgHover}`}
                  >
                    {isExpanded ? (
                      <ChevronDown className="h-3.5 w-3.5 flex-shrink-0 text-indigo-400" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5 flex-shrink-0 text-indigo-400" />
                    )}
                    <span className="h-2 w-2 flex-shrink-0 rounded-full bg-indigo-500" />
                    <span className={`flex-1 text-xs font-medium ${textPrimary}`}>{cfg.name}</span>
                    <span className="rounded bg-white/10 px-1 py-0.5 text-[9px] text-zinc-400">
                      規劃中
                    </span>
                  </div>
                  {isExpanded && (
                    <div className="py-1 pl-6 text-[11px] text-zinc-500 italic">
                      DeepSeek 工作空間規劃中
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
};

export default MultiAISidebarTree;
