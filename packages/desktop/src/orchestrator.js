const { createSemanticTitle } = require("./session-manager");
/**
 * Nomad AI Studio - Multi-AI Orchestrator Engine
 * Autonomous dialogue, task handoff, and debate coordination across AI engines.
 * Governed by AGENTS.md Atomic Contract & Result Pattern.
 */

const DEFAULT_TEMPLATES = {
  relay: (from, to, text, title) => 
`${title ? `【協作專案主題】：${title}\n` : ""}【來自 ${from.toUpperCase()} 的階段性輸出與任務交接】：
----------------------------------------
${text}
----------------------------------------
【指派給 ${to.toUpperCase()} 的接續任務】：
請以你的專業架構視角接續推進上述內容，補充實作細節、優化潛在缺陷，並為下一階段提供明確方向。`,

  debate: (from, to, text, title) =>
`${title ? `【協作專案主題】：${title}\n` : ""}【來自 ${from.toUpperCase()} 的方案與論點】：
----------------------------------------
${text}
----------------------------------------
【${to.toUpperCase()} 交叉審計與辯駁任務】：
請嚴格審查上述方案，挑出潛在缺陷、安全性漏洞與邊界條件，並提出更具說服力的改良方案。`,

  master: (from, to, text, title) =>
`${title ? `【協作專案主題】：${title}\n` : ""}【協調中樞指派任務】：
----------------------------------------
${text}
----------------------------------------
【${to.toUpperCase()} 專家執行】：
請專注於你所分配的模組，產出具體、可落地的實作方案並向協調中樞匯報。`,
};

class MultiAiOrchestrator {
  /**
   * @param {Object} [options]
   * @param {Function} [options.injectPrompt] - async (platform, text) => { ok: boolean }
   * @param {Function} [options.extractResponse] - async (platform) => { ok: boolean, text: string }
   * @param {Function} [options.checkStreaming] - async (platform) => { ok: boolean, isStreaming: boolean }
   * @param {number} [options.initialWaitMs=2000] - Initial delay before polling
   * @param {number} [options.pollIntervalMs=800] - Polling interval
   * @param {number} [options.maxWaitMs=45000] - Max wait time per AI turn in ms
   * @param {Function} [options.onStep] - (event) => void
   * @param {Function} [options.onComplete] - (summary) => void
   */
  constructor(options = {}) {
    this.injectPrompt = options.injectPrompt || (async () => ({ ok: true }));
    this.extractResponse = options.extractResponse || (async () => ({ ok: true, text: "" }));
    this.checkStreaming = options.checkStreaming || (async () => ({ ok: true, isStreaming: false }));
    this.initialWaitMs = options.initialWaitMs ?? 2000;
    this.pollIntervalMs = options.pollIntervalMs ?? 800;
    this.maxWaitMs = options.maxWaitMs ?? 45000;
    this.onStep = options.onStep || (() => {});
    this.onComplete = options.onComplete || (() => {});

    this.status = "idle"; // "idle" | "running" | "paused" | "stopped" | "completed" | "error"
    this.mode = "relay";
    this.sequence = ["claude", "chatgpt"];
    this.maxRounds = 2;
    this.turnDelayMs = 2500;
    this.customTemplate = null;
    this.canonicalTitle = null;

    this.currentRound = 0;
    this.currentSpeakerIndex = 0;
    this.history = [];
    this.isAborted = false;
    this.isPaused = false;
  }

  getStatus() {
    return {
      status: this.status,
      canonicalTitle: this.canonicalTitle || null,
      mode: this.mode,
      sequence: this.sequence,
      maxRounds: this.maxRounds,
      currentRound: this.currentRound,
      currentSpeaker: this.sequence[this.currentSpeakerIndex] || null,
      historyLength: this.history.length,
      recentHistory: this.history.slice(-5),
    };
  }

  async start({
    prompt,
    sequence = ["claude", "chatgpt"],
    mode = "relay",
    maxRounds = 2,
    turnDelayMs = 2500,
    customTemplate = null,
    canonicalTitle = null,
  }) {
    if (this.status === "running") {
      return {
        success: false,
        errorCode: "ORCHESTRATOR_START_ALREADY_RUNNING_001",
        message: "Orchestrator is already running a session.",
      };
    }

    if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
      return {
        success: false,
        errorCode: "ORCHESTRATOR_START_EMPTY_PROMPT_002",
        message: "Initial prompt must be a non-empty string.",
      };
    }

    if (!Array.isArray(sequence) || sequence.length < 2) {
      return {
        success: false,
        errorCode: "ORCHESTRATOR_START_INVALID_SEQUENCE_003",
        message: "Sequence must contain at least 2 AI platforms for collaboration.",
      };
    }

    this.status = "running";
    this.mode = mode;
    this.sequence = sequence;
    this.maxRounds = Math.min(10, Math.max(1, Number(maxRounds) || 2));
    this.turnDelayMs = Math.max(0, Number(turnDelayMs) ?? 2500);
    this.customTemplate = customTemplate;
    this.canonicalTitle = canonicalTitle || createSemanticTitle(prompt);
    this.isAborted = false;
    this.isPaused = false;
    this.currentRound = 1;
    this.currentSpeakerIndex = 0;
    this.history = [];

    // Record initial prompt
    this.history.push({
      timestamp: new Date().toISOString(),
      speaker: "user",
      type: "user-prompt",
      content: prompt.trim(),
      round: 1,
    });

    // Run execution loop in background
    this.runLoop(prompt.trim()).catch((err) => {
      console.error("[Nomad Orchestrator] Execution loop crashed:", err);
      this.status = "error";
      this.emitStep("error", { error: err.message });
    });

    return {
      success: true,
      data: {
        started: true,
        mode: this.mode,
        sequence: this.sequence,
        maxRounds: this.maxRounds,
        canonicalTitle: this.canonicalTitle,
      },
    };
  }

  pause() {
    if (this.status === "running") {
      this.isPaused = true;
      this.status = "paused";
      this.emitStep("paused", { round: this.currentRound, speaker: this.sequence[this.currentSpeakerIndex] });
      return { success: true, status: "paused" };
    }
    return { success: false, message: "Not currently running" };
  }

  resume() {
    if (this.status === "paused") {
      this.isPaused = false;
      this.status = "running";
      this.emitStep("resumed", { round: this.currentRound, speaker: this.sequence[this.currentSpeakerIndex] });
      return { success: true, status: "running" };
    }
    return { success: false, message: "Not currently paused" };
  }

  stop() {
    this.isAborted = true;
    this.status = "stopped";
    this.emitStep("stopped", { round: this.currentRound });
    return { success: true, status: "stopped" };
  }

  emitStep(type, data) {
    const payload = {
      type,
      timestamp: new Date().toISOString(),
      status: this.status,
      canonicalTitle: this.canonicalTitle || null,
      round: this.currentRound,
      maxRounds: this.maxRounds,
      speaker: this.sequence[this.currentSpeakerIndex],
      ...data,
    };
    try {
      this.onStep(payload);
    } catch (e) {
      console.warn("[Nomad Orchestrator] onStep callback failed:", e);
    }
  }

  async runLoop(initialPrompt) {
    let currentInput = this.canonicalTitle ? `【協作專案主題】：${this.canonicalTitle}\n----------------------------------------\n${initialPrompt}` : initialPrompt;

    while (this.currentRound <= this.maxRounds && !this.isAborted) {
      for (let i = 0; i < this.sequence.length; i++) {
        if (this.isAborted) break;

        // Handle pause wait
        while (this.isPaused && !this.isAborted) {
          await this.sleep(100);
        }
        if (this.isAborted) break;

        this.currentSpeakerIndex = i;
        const speaker = this.sequence[i];
        const nextSpeaker = this.sequence[(i + 1) % this.sequence.length];

        this.emitStep("turn-start", {
          speaker,
          nextSpeaker,
          inputSnippet: currentInput.slice(0, 60),
        });

        // 1. Inject prompt to current speaker
        try {
          await this.injectPrompt(speaker, currentInput);
        } catch (err) {
          console.error(`[Nomad Orchestrator] Failed to inject prompt to ${speaker}:`, err);
          this.emitStep("inject-error", { speaker, error: err.message });
        }

        // 2. Wait for speaker response to generate and settle
        this.emitStep("waiting-response", { speaker });
        const responseText = await this.waitForSettledResponse(speaker);

        if (this.isAborted) break;

        this.history.push({
          timestamp: new Date().toISOString(),
          speaker,
          type: "assistant-response",
          content: responseText,
          round: this.currentRound,
        });

        this.emitStep("turn-complete", {
          speaker,
          nextSpeaker,
          responseSnippet: responseText.slice(0, 60),
          responseLength: responseText.length,
          content: responseText,
        });

        // 3. Format next input for the next speaker
        const templateFn = this.customTemplate || DEFAULT_TEMPLATES[this.mode] || DEFAULT_TEMPLATES.relay;
        currentInput = templateFn(speaker, nextSpeaker, responseText, this.canonicalTitle);

        // Turn delay
        if (!this.isAborted && (i < this.sequence.length - 1 || this.currentRound < this.maxRounds)) {
          if (this.turnDelayMs > 0) {
            await this.sleep(this.turnDelayMs);
          }
        }
      }

      this.currentRound++;
    }

    if (!this.isAborted) {
      this.status = "completed";
      const summary = {
        totalRounds: this.currentRound - 1,
        totalTurns: this.history.length - 1,
        history: this.history,
      };
      this.emitStep("completed", summary);
      try {
        this.onComplete(summary);
      } catch (e) {}
    }
  }

  async waitForSettledResponse(platform, maxWaitMs = this.maxWaitMs, pollIntervalMs = this.pollIntervalMs) {
    const startTime = Date.now();
    let lastLength = -1;
    let stableCount = 0;
    let streamingStableCount = 0;
    let baselineText = "";
    let pollCount = 0;

    if (this.initialWaitMs > 0) {
      await this.sleep(this.initialWaitMs);
    }

    while (Date.now() - startTime < maxWaitMs && !this.isAborted) {
      if (this.isPaused) {
        await this.sleep(100);
        continue;
      }

      try {
        const [statusRes, responseRes] = await Promise.all([
          this.checkStreaming(platform),
          this.extractResponse(platform),
        ]);

        const isStreaming = statusRes?.isStreaming ?? false;
        const text = (responseRes?.text || "").trim();
        pollCount++;

        // Monotonic text accumulation: never overwrite with shorter/empty text
        if (text && text.length > baselineText.length) {
          baselineText = text;
        }

        // Emit real-time response progress
        this.emitStep("response-progress", {
          speaker: platform,
          charCount: baselineText.length,
          isStreaming,
        });

        // Condition 1: Streaming is officially finished AND we have non-empty text
        if (!isStreaming && text.length > 0) {
          if (text.length === lastLength) {
            stableCount++;
            if (stableCount >= 2) {
              console.log(`[Nomad Orchestrator] [${platform}] Settled cleanly: length=${text.length}`);
              return text;
            }
          } else {
            stableCount = 0;
            lastLength = text.length;
          }
        } else {
          stableCount = 0;
        }

        // Condition 2: Adaptive completion if isStreaming is erroneously stuck on true
        // If text is substantial (> 40 chars) and hasn't changed for 5 polls (~4s)
        if (text.length > 40 && text.length === lastLength) {
          streamingStableCount++;
          if (streamingStableCount >= 5) {
            console.log(`[Nomad Orchestrator] [${platform}] Settled via adaptive inactivity: length=${text.length}`);
            return text;
          }
        } else {
          streamingStableCount = 0;
          lastLength = text.length;
        }
      } catch (e) {
        console.warn(`[Nomad Orchestrator] [${platform}] Poll error:`, e.message);
      }

      await this.sleep(pollIntervalMs);
    }

    // Return whatever text has been extracted if timeout or aborted
    console.log(`[Nomad Orchestrator] [${platform}] Exited wait loop with text length=${baselineText.length}`);
    return baselineText || `[${platform} 回應擷取超時或已結束]`;
  }

  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

module.exports = {
  DEFAULT_TEMPLATES,
  MultiAiOrchestrator,
};
