import React, { act } from "react";
import { type Root, createRoot } from "react-dom/client";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MultiAISidebarTree } from "../MultiAISidebarTree";
import {
  CLAUDE_FOLDERS_KEY,
  CLAUDE_TITLES_KEY,
  CHATGPT_FOLDERS_KEY,
  CHATGPT_TITLES_KEY,
  GEMINI_FOLDERS_KEY,
  GEMINI_CONTENTS_KEY,
} from "@/core/platform/useCrossPlatformFolders";

describe("MultiAISidebarTree component", () => {
  let container: HTMLDivElement;
  let root: Root;
  const storageMock: Record<string, any> = {};

  beforeEach(() => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    storageMock[GEMINI_FOLDERS_KEY] = [{ id: "g1", name: "Gemini Folder", isExpanded: true }];
    storageMock[GEMINI_CONTENTS_KEY] = {
      g1: [{ conversationId: "gc1", title: "Gemini Chat 1", url: "https://gemini.google.com/app/gc1" }],
    };
    storageMock[CLAUDE_FOLDERS_KEY] = [{ id: "c1", name: "Claude Folder", conversationIds: ["cc1"] }];
    storageMock[CLAUDE_TITLES_KEY] = { cc1: "Claude Chat Real Title" };
    storageMock[CHATGPT_FOLDERS_KEY] = [{ id: "gpt1", name: "GPT Folder", conversationIds: ["gptc1"] }];
    storageMock[CHATGPT_TITLES_KEY] = { gptc1: "ChatGPT Chat Real Title" };

    (globalThis as any).chrome = {
      runtime: {
        id: "mock-id",
        lastError: null,
        sendMessage: vi.fn(),
      },
      storage: {
        local: {
          get: vi.fn((keys: string[], cb: (res: any) => void) => {
            const res: Record<string, any> = {};
            for (const k of keys) res[k] = storageMock[k];
            cb(res);
          }),
        },
        onChanged: {
          addListener: vi.fn(),
          removeListener: vi.fn(),
        },
      },
    };
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.clearAllMocks();
  });

  it("renders Nomad Workspace header correctly", async () => {
    await act(async () => {
      root.render(<MultiAISidebarTree currentPlatform="chatgpt" theme="dark" />);
    });

    expect(container.textContent).toContain("Nomad Workspace");
    expect(container.textContent).toContain("OpenAI ChatGPT");
    expect(container.textContent).toContain("Google Gemini");
    expect(container.textContent).toContain("Anthropic Claude");
    expect(container.textContent).toContain("xAI Grok");
  });

  it("marks ChatGPT as current platform with badge and expands folder on click", async () => {
    await act(async () => {
      root.render(<MultiAISidebarTree currentPlatform="chatgpt" theme="dark" />);
    });

    // ChatGPT node is expanded and marked as 目前
    expect(container.textContent).toContain("目前");
    expect(container.textContent).toContain("GPT Folder");

    // Click on folder to expand
    const folderEl = Array.from(container.querySelectorAll("span")).find(
      (el) => el.textContent === "GPT Folder"
    )?.closest("div");

    expect(folderEl).toBeDefined();

    await act(async () => {
      folderEl?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(container.textContent).toContain("ChatGPT Chat Real Title");
  });

  it("marks Claude as current platform with badge and expands folder on click", async () => {
    await act(async () => {
      root.render(<MultiAISidebarTree currentPlatform="claude" theme="light" />);
    });

    expect(container.textContent).toContain("Claude Folder");

    const folderEl = Array.from(container.querySelectorAll("span")).find(
      (el) => el.textContent === "Claude Folder"
    )?.closest("div");

    await act(async () => {
      folderEl?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(container.textContent).toContain("Claude Chat Real Title");
  });

  it("marks Gemini as current platform with badge and expands folder on click", async () => {
    await act(async () => {
      root.render(<MultiAISidebarTree currentPlatform="gemini" theme="dark" />);
    });

    expect(container.textContent).toContain("Gemini Folder");

    const folderEl = Array.from(container.querySelectorAll("span")).find(
      (el) => el.textContent === "Gemini Folder"
    )?.closest("div");

    await act(async () => {
      folderEl?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(container.textContent).toContain("Gemini Chat 1");
  });

  it("handles cross-platform link jump with _blank, rel noreferrer, and ExternalLink icon", async () => {
    // Current platform is Claude
    await act(async () => {
      root.render(<MultiAISidebarTree currentPlatform="claude" theme="dark" />);
    });

    // Expand OpenAI ChatGPT root platform node
    const gptRoot = Array.from(container.querySelectorAll("span")).find(
      (el) => el.textContent === "OpenAI ChatGPT"
    )?.closest("div");
    expect(gptRoot).toBeDefined();

    await act(async () => {
      gptRoot?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    // Expand GPT Folder
    const folderEl = Array.from(container.querySelectorAll("span")).find(
      (el) => el.textContent === "GPT Folder"
    )?.closest("div");
    expect(folderEl).toBeDefined();

    await act(async () => {
      folderEl?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    // Find the conversation link for ChatGPT inside Claude view
    const link = container.querySelector("a[href='https://chatgpt.com/c/gptc1']") as HTMLAnchorElement;
    expect(link).not.toBeNull();
    expect(link.target).toBe("_blank");
    expect(link.rel).toBe("noreferrer noopener");
    expect(link.title).toContain("(新分頁開啟)");
    expect(link.title).toContain("OpenAI ChatGPT");
    expect(link.getAttribute("aria-label")).toContain("(新分頁開啟)");

    // Should have external link icon (svg)
    const svgs = link.querySelectorAll("svg");
    expect(svgs.length).toBeGreaterThanOrEqual(2); // MessageSquare + ExternalLink
  });

  it("handles same-platform navigation with relative URL and SPA popstate on Gemini", async () => {
    const pushStateSpy = vi.spyOn(window.history, "pushState").mockImplementation(() => {});
    const dispatchSpy = vi.spyOn(window, "dispatchEvent");

    await act(async () => {
      root.render(<MultiAISidebarTree currentPlatform="gemini" theme="dark" />);
    });

    // Expand Gemini Folder
    const folderEl = Array.from(container.querySelectorAll("span")).find(
      (el) => el.textContent === "Gemini Folder"
    )?.closest("div");

    await act(async () => {
      folderEl?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    // Find the conversation link for Gemini
    const link = container.querySelector("a[href='/app/gc1']") as HTMLAnchorElement;
    expect(link).not.toBeNull();
    expect(link.target).toBe("_self");
    expect(link.rel).toBe("");
    expect(link.title).toBe("Gemini Chat 1");

    // Click the same-platform link
    await act(async () => {
      link.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });

    expect(pushStateSpy).toHaveBeenCalledWith({}, "", "/app/gc1");
    expect(dispatchSpy).toHaveBeenCalled();
  });

  it("handles same-platform navigation with relative URL on Claude", async () => {
    await act(async () => {
      root.render(<MultiAISidebarTree currentPlatform="claude" theme="light" />);
    });

    const folderEl = Array.from(container.querySelectorAll("span")).find(
      (el) => el.textContent === "Claude Folder"
    )?.closest("div");

    await act(async () => {
      folderEl?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const link = container.querySelector("a[href='/chat/cc1']") as HTMLAnchorElement;
    expect(link).not.toBeNull();
    expect(link.target).toBe("_self");
    expect(link.title).toBe("Claude Chat Real Title");
  });

  it("handles same-platform navigation with SPA popstate on Claude", async () => {
    const pushStateSpy = vi.spyOn(window.history, "pushState").mockImplementation(() => {});
    const dispatchSpy = vi.spyOn(window, "dispatchEvent");

    await act(async () => {
      root.render(<MultiAISidebarTree currentPlatform="claude" theme="light" />);
    });

    const folderEl = Array.from(container.querySelectorAll("span")).find(
      (el) => el.textContent === "Claude Folder"
    )?.closest("div");

    await act(async () => {
      folderEl?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const link = container.querySelector("a[href='/chat/cc1']") as HTMLAnchorElement;
    expect(link).not.toBeNull();

    await act(async () => {
      link.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });

    expect(pushStateSpy).toHaveBeenCalledWith({}, "", "/chat/cc1");
    expect(dispatchSpy).toHaveBeenCalled();
  });

  it("handles same-platform navigation with SPA popstate on ChatGPT", async () => {
    const pushStateSpy = vi.spyOn(window.history, "pushState").mockImplementation(() => {});
    const dispatchSpy = vi.spyOn(window, "dispatchEvent");

    await act(async () => {
      root.render(<MultiAISidebarTree currentPlatform="chatgpt" theme="dark" />);
    });

    const folderEl = Array.from(container.querySelectorAll("span")).find(
      (el) => el.textContent === "GPT Folder"
    )?.closest("div");

    await act(async () => {
      folderEl?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const link = container.querySelector("a[href='/c/gptc1']") as HTMLAnchorElement;
    expect(link).not.toBeNull();

    await act(async () => {
      link.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });

    expect(pushStateSpy).toHaveBeenCalledWith({}, "", "/c/gptc1");
    expect(dispatchSpy).toHaveBeenCalled();
  });

  it("dispatches gv.openConversation runtime message on cross-platform conversation click", async () => {
    await act(async () => {
      root.render(<MultiAISidebarTree currentPlatform="gemini" theme="dark" />);
    });

    // Expand Claude platform node
    const claudeRoot = Array.from(container.querySelectorAll("span")).find(
      (el) => el.textContent === "Anthropic Claude"
    )?.closest("div");

    await act(async () => {
      claudeRoot?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    // Expand Claude Folder
    const folderEl = Array.from(container.querySelectorAll("span")).find(
      (el) => el.textContent === "Claude Folder"
    )?.closest("div");

    await act(async () => {
      folderEl?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    // Find the cross-platform Claude link
    const link = container.querySelector("a[href='https://claude.ai/chat/cc1']") as HTMLAnchorElement;
    expect(link).not.toBeNull();

    await act(async () => {
      link.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));
    });

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
      type: "gv.openConversation",
      url: "https://claude.ai/chat/cc1",
    });
  });
});