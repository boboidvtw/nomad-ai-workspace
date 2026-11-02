const { createSemanticTitle } = require('./session-manager');
/**
 * Nomad AI Studio - Multi-AI Orchestrator Engine
 * Autonomous dialogue, task handoff, and debate coordination across AI engines.
 * Governed by AGENTS.md Atomic Contract & Result Pattern.
 */

/** @typedef {(from: string, to: string, text: string, title?: string | null, originalPrompt?: string | null) => string} TurnTemplate */

/**
 * @typedef {Object} OrchestrationTurn
 * @property {string} timestamp
 * @property {string} speaker
 * @property {string} type
 * @property {string} content
 * @property {number} round
 */

const INCOMPLETE_REPLY_NOTE = '[注意：這份回覆等待逾時，內容可能不完整]';

/**
 * The latest reply on a page and how many replies the page holds. `count` and `countOf` (the
 * selector that was counted) are null when the extractor could not count, so text alone decides.
 * @typedef {{ text: string, count: number | null, countOf: string | null }} ReplySnapshot
 */

/**
 * Whether a page read moved past the reply that was there before the send. With a count, only
 * more replies than before, the last of which is not the one marked before the send, do: the
 * old text can come back after a blink of the page (an empty read, a stop button that flickers)
 * when the platform dropped the prompt, and older replies can load in above it. A page holding
 * fewer replies than before reloaded under us; it waits, so the worst case is a visible timeout,
 * never an old reply passed on as new. Without a comparable count, activity or other text does.
 * @param {ReplySnapshot} previous
 * @param {{ ok?: boolean, count?: number, countOf?: string, isBaseline?: boolean } | undefined} res
 * @param {string} pageText
 * @param {boolean} isStreaming
 * @returns {boolean}
 */
function movedPastPrevious(previous, res, pageText, isStreaming) {
  if (previous.count !== null) {
    if (typeof res?.count !== 'number') return false;
    if (res.countOf === previous.countOf) return res.count > previous.count && !res.isBaseline;
  }
  return isStreaming || (res?.ok !== false && pageText !== previous.text);
}

/**
 * What every speaker needs before the previous reply: without the user's question, a later
 * speaker sees only an answer to something it was never asked.
 * @param {string | null | undefined} title
 * @param {string | null | undefined} originalPrompt
 * @returns {string}
 */
function handoffContext(title, originalPrompt) {
  const titleLine = title ? `【協作專案主題】：${title}\n` : '';
  const promptBlock = originalPrompt
    ? `【使用者原始問題】：\n${originalPrompt}\n----------------------------------------\n`
    : '';
  return titleLine + promptBlock;
}

/** @type {Record<string, TurnTemplate>} */
const DEFAULT_TEMPLATES = {
  relay: (from, to, text, title, originalPrompt) =>
    `${handoffContext(title, originalPrompt)}【來自 ${from.toUpperCase()} 的階段性輸出與任務交接】：
----------------------------------------
${text}
----------------------------------------
【指派給 ${to.toUpperCase()} 的接續任務】：
請以你的專業架構視角接續推進上述內容，補充實作細節、優化潛在缺陷，並為下一階段提供明確方向。`,

  debate: (from, to, text, title, originalPrompt) =>
    `${handoffContext(title, originalPrompt)}【來自 ${from.toUpperCase()} 的方案與論點】：
----------------------------------------
${text}
----------------------------------------
【${to.toUpperCase()} 交叉審計與辯駁任務】：
請嚴格審查上述方案，挑出潛在缺陷、安全性漏洞與邊界條件，並提出更具說服力的改良方案。`,

  master: (from, to, text, title, originalPrompt) =>
    `${handoffContext(title, originalPrompt)}【協調中樞指派任務】：
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
   * @param {Function} [options.extractResponse] - async (platform, { markBaseline }?) => { ok: boolean, text: string, count?: number, countOf?: string, isBaseline?: boolean }
   * @param {Function} [options.checkStreaming] - async (platform) => { ok: boolean, isStreaming: boolean }
   * @param {number} [options.initialWaitMs=2000] - Initial delay before polling
   * @param {number} [options.pollIntervalMs=800] - Polling interval
   * @param {number} [options.maxWaitMs=600000] - Max wait time per AI turn in ms
   * @param {number} [options.silentWaitMs=120000] - Relay only: give up on a page that shows neither text nor streaming for this long
   * @param {number} [options.stuckStreamingMs=180000] - Settle a reply whose text stopped changing while streaming stays on this long (models pause to think or run tools, so this must outlast those)
   * @param {number} [options.pageCallTimeoutMs=60000] - Max time for one call into a page, which never returns if the page navigates away mid-script
   * @param {number} [options.composerWaitMs=20000] - How long a just-loaded page may take to mount its input box
   * @param {number} [options.composerRetryMs=1500] - Delay between looks for that input box
   * @param {(platform: string) => Promise<{ blocked: boolean, reason?: string }>} [options.checkBlocked] - Task runs only: stops waiting when the page needs a human
   * @param {(platform: string | null) => void} [options.onSpeakerChange] - The platform taking its turn, or null when the relay ends
   * @param {Function} [options.onStep] - (event) => void
   * @param {Function} [options.onComplete] - (summary) => void
   */
  constructor(options = {}) {
    this.injectPrompt = options.injectPrompt || (async () => ({ ok: true }));
    this.extractResponse = options.extractResponse || (async () => ({ ok: true, text: '' }));
    this.checkStreaming =
      options.checkStreaming || (async () => ({ ok: true, isStreaming: false }));
    this.initialWaitMs = options.initialWaitMs ?? 2000;
    this.pollIntervalMs = options.pollIntervalMs ?? 800;
    this.maxWaitMs = options.maxWaitMs ?? 600000;
    this.silentWaitMs = options.silentWaitMs ?? 120000;
    this.stuckStreamingMs = options.stuckStreamingMs ?? 180000;
    this.pageCallTimeoutMs = options.pageCallTimeoutMs ?? 60000;
    this.composerWaitMs = options.composerWaitMs ?? 20000;
    this.composerRetryMs = options.composerRetryMs ?? 1500;
    this.checkBlocked = options.checkBlocked || null;
    this.onSpeakerChange = options.onSpeakerChange || (() => {});
    this.onStep = options.onStep || (() => {});
    this.onComplete = options.onComplete || (() => {});

    this.status = 'idle'; // "idle" | "running" | "paused" | "stopped" | "completed" | "error"
    this.mode = 'relay';
    this.sequence = ['claude', 'chatgpt'];
    this.maxRounds = 2;
    this.turnDelayMs = 2500;
    /** @type {TurnTemplate | null} */
    this.customTemplate = null;
    /** @type {string | null} */
    this.canonicalTitle = null;
    /** @type {string | null} */
    this.originalPrompt = null;

    this.currentRound = 0;
    this.currentSpeakerIndex = 0;
    /** @type {OrchestrationTurn[]} */
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

  /**
   * @param {Object} params
   * @param {string} params.prompt
   * @param {string[]} [params.sequence]
   * @param {string} [params.mode='relay']
   * @param {number} [params.maxRounds=2]
   * @param {number} [params.turnDelayMs=2500]
   * @param {TurnTemplate | null} [params.customTemplate]
   * @param {string | null} [params.canonicalTitle]
   */
  async start({
    prompt,
    sequence = ['claude', 'chatgpt'],
    mode = 'relay',
    maxRounds = 2,
    turnDelayMs = 2500,
    customTemplate = null,
    canonicalTitle = null,
  }) {
    if (this.status === 'running') {
      return {
        success: false,
        errorCode: 'ORCHESTRATOR_START_ALREADY_RUNNING_001',
        message: 'Orchestrator is already running a session.',
      };
    }

    if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
      return {
        success: false,
        errorCode: 'ORCHESTRATOR_START_EMPTY_PROMPT_002',
        message: 'Initial prompt must be a non-empty string.',
      };
    }

    if (!Array.isArray(sequence) || sequence.length < 2) {
      return {
        success: false,
        errorCode: 'ORCHESTRATOR_START_INVALID_SEQUENCE_003',
        message: 'Sequence must contain at least 2 AI platforms for collaboration.',
      };
    }

    this.status = 'running';
    this.mode = mode;
    this.sequence = sequence;
    this.maxRounds = Math.min(10, Math.max(1, Number(maxRounds) || 2));
    const delay = Number(turnDelayMs);
    this.turnDelayMs = Number.isFinite(delay) ? Math.max(0, delay) : 2500;
    this.customTemplate = customTemplate;
    this.canonicalTitle = canonicalTitle || createSemanticTitle(prompt);
    this.originalPrompt = prompt.trim();
    this.isAborted = false;
    this.isPaused = false;
    this.currentRound = 1;
    this.currentSpeakerIndex = 0;
    this.history = [];

    // Record initial prompt
    this.history.push({
      timestamp: new Date().toISOString(),
      speaker: 'user',
      type: 'user-prompt',
      content: prompt.trim(),
      round: 1,
    });

    // Run execution loop in background
    this.runLoop(prompt.trim())
      .catch((err) => {
        console.error('[Nomad Orchestrator] Execution loop crashed:', err);
        this.status = 'error';
        this.emitStep('error', { error: err.message });
      })
      .finally(() => this.onSpeakerChange(null));

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
    if (this.status === 'running') {
      this.isPaused = true;
      this.status = 'paused';
      this.emitStep('paused', {
        round: this.currentRound,
        speaker: this.sequence[this.currentSpeakerIndex],
      });
      return { success: true, status: 'paused' };
    }
    return { success: false, message: 'Not currently running' };
  }

  resume() {
    if (this.status === 'paused') {
      this.isPaused = false;
      this.status = 'running';
      this.emitStep('resumed', {
        round: this.currentRound,
        speaker: this.sequence[this.currentSpeakerIndex],
      });
      return { success: true, status: 'running' };
    }
    return { success: false, message: 'Not currently paused' };
  }

  stop() {
    this.isAborted = true;
    this.status = 'stopped';
    this.emitStep('stopped', { round: this.currentRound });
    return { success: true, status: 'stopped' };
  }

  /**
   * @param {string} type
   * @param {Record<string, unknown>} data
   */
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
      console.warn('[Nomad Orchestrator] onStep callback failed:', e);
    }
  }

  /**
   * @param {string} initialPrompt
   */
  async runLoop(initialPrompt) {
    let currentInput = this.canonicalTitle
      ? `【協作專案主題】：${this.canonicalTitle}\n----------------------------------------\n${initialPrompt}`
      : initialPrompt;
    /** @type {{ speaker: string, text: string } | null} */
    let lastReply = null;

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

        this.emitStep('turn-start', {
          speaker,
          nextSpeaker,
          inputSnippet: currentInput.slice(0, 60),
        });

        this.onSpeakerChange(speaker);

        // 1. Inject prompt to current speaker, remembering the reply already on the page
        const previous = await this.readReplySnapshot(speaker);
        const delivery = await this.deliverPrompt(speaker, currentInput);

        // 2. Wait for speaker response to generate and settle
        let reply = { settled: false, text: '' };
        if (delivery.ok) {
          this.emitStep('waiting-response', { speaker });
          reply = await this.pollUntilSettled(speaker, {
            maxWaitMs: this.maxWaitMs,
            pollIntervalMs: this.pollIntervalMs,
            previous,
            honorRelayControls: true,
          });
        }

        if (this.isAborted) break;

        // 3. Format next input for the next speaker
        if (reply.text) {
          const incomplete = !reply.settled;
          const responseText = incomplete
            ? `${reply.text}\n\n${INCOMPLETE_REPLY_NOTE}`
            : reply.text;
          this.recordTurn(speaker, 'assistant-response', responseText);
          this.emitStep('turn-complete', {
            speaker,
            nextSpeaker,
            responseSnippet: responseText.slice(0, 60),
            responseLength: responseText.length,
            content: responseText,
            incomplete,
          });
          lastReply = { speaker, text: responseText };
        } else {
          // A failed turn hands on what the last speaker said, never a placeholder of its own.
          const error = delivery.error || `${speaker} 沒有回覆`;
          this.recordTurn(speaker, 'assistant-failed', `[${speaker} 未取得回覆：${error}]`);
          this.emitStep('turn-failed', { speaker, nextSpeaker, error });
        }

        if (lastReply) {
          const templateFn =
            this.customTemplate || DEFAULT_TEMPLATES[this.mode] || DEFAULT_TEMPLATES.relay;
          currentInput = templateFn(
            lastReply.speaker,
            nextSpeaker,
            lastReply.text,
            this.canonicalTitle,
            this.originalPrompt,
          );
        }

        // Turn delay
        if (
          !this.isAborted &&
          (i < this.sequence.length - 1 || this.currentRound < this.maxRounds)
        ) {
          if (this.turnDelayMs > 0) {
            await this.sleep(this.turnDelayMs);
          }
        }
      }

      this.currentRound++;
    }

    if (!this.isAborted) {
      this.status = 'completed';
      const summary = {
        totalRounds: this.currentRound - 1,
        totalTurns: this.history.length - 1,
        history: this.history,
      };
      this.emitStep('completed', summary);
      try {
        this.onComplete(summary);
      } catch {}
    }
  }

  /**
   * @param {string} speaker
   * @param {string} type
   * @param {string} content
   */
  recordTurn(speaker, type, content) {
    this.history.push({
      timestamp: new Date().toISOString(),
      speaker,
      type,
      content,
      round: this.currentRound,
    });
  }

  /**
   * Sends the prompt and reports whether the page took it, so a failed send is not waited on.
   * @param {string} speaker
   * @param {string} text
   * @returns {Promise<{ ok: boolean, error?: string }>}
   */
  async deliverPrompt(speaker, text) {
    const composerDeadline = Date.now() + this.composerWaitMs;
    try {
      for (;;) {
        const res = await this.withPageTimeout(this.injectPrompt(speaker, text));
        if (res?.ok !== false) return { ok: true };
        // Only a missing input box is safe to retry: any other failure may have left the text
        // in the box, and sending again would type it twice.
        const composerMissing = /input (element )?not found/i.test(res.error || '');
        if (!composerMissing || Date.now() >= composerDeadline) {
          throw new Error(res.error || 'Injector reported failure');
        }
        await this.sleep(this.composerRetryMs);
      }
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      console.error(`[Nomad Orchestrator] Failed to inject prompt to ${speaker}:`, error);
      this.emitStep('inject-error', { speaker, error });
      return { ok: false, error };
    }
  }

  /**
   * A script running in a page never settles if the page navigates away under it.
   * @template T
   * @param {Promise<T>} call
   * @returns {Promise<T>}
   */
  withPageTimeout(call) {
    /** @type {NodeJS.Timeout | undefined} */
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`Page did not respond within ${this.pageCallTimeoutMs} ms`)),
        this.pageCallTimeoutMs,
      );
    });
    return /** @type {Promise<T>} */ (Promise.race([call, timeout])).finally(() =>
      clearTimeout(timer),
    );
  }

  /**
   * The latest reply on the platform's page, or '' when it cannot be read.
   * @param {string} platform
   * @returns {Promise<string>}
   */
  async readReply(platform) {
    return (await this.readReplySnapshot(platform)).text;
  }

  /**
   * The latest reply and the page's reply count. Taken before a send so the wait that follows
   * can tell the new reply from the one already there.
   * @param {string} platform
   * @returns {Promise<ReplySnapshot>}
   */
  async readReplySnapshot(platform) {
    try {
      const res = await this.withPageTimeout(
        this.extractResponse(platform, { markBaseline: true }),
      );
      const counted = typeof res?.count === 'number';
      return {
        text: (res?.text || '').trim(),
        count: counted ? res.count : null,
        countOf: counted ? res.countOf || null : null,
      };
    } catch {
      return { text: '', count: null, countOf: null };
    }
  }

  /**
   * Waits for one platform's reply outside of a relay run (used by task runners).
   * Unlike a relay turn it ignores relay pause/stop state and the silent-page limit.
   * @param {string} platform
   * @param {{ maxWaitMs?: number, pollIntervalMs?: number, previous?: ReplySnapshot, previousText?: string }} [options]
   *   previous: the page read before the send (see readReplySnapshot); its reply is not taken as
   *   the answer. previousText is the same without a count.
   * @returns {Promise<{ settled: boolean, text: string, blocked?: boolean, reason?: string }>}
   */
  awaitSettled(platform, options = {}) {
    return this.pollUntilSettled(platform, {
      maxWaitMs: options.maxWaitMs ?? this.maxWaitMs,
      pollIntervalMs: options.pollIntervalMs ?? this.pollIntervalMs,
      previous: options.previous || {
        text: options.previousText || '',
        count: null,
        countOf: null,
      },
      honorRelayControls: false,
    });
  }

  /**
   * @param {string} platform
   * @param {{ maxWaitMs: number, pollIntervalMs: number, previous?: ReplySnapshot, honorRelayControls: boolean }} options
   * @returns {Promise<{ settled: boolean, text: string, blocked?: boolean, reason?: string }>}
   */
  async pollUntilSettled(
    platform,
    {
      maxWaitMs,
      pollIntervalMs,
      previous = { text: '', count: null, countOf: null },
      honorRelayControls,
    },
  ) {
    const previousText = previous.text;
    const checkBlocked = honorRelayControls ? null : this.checkBlocked;
    const isAborted = () => honorRelayControls && this.isAborted;
    const isPaused = () => honorRelayControls && this.isPaused;
    const startTime = Date.now();
    let lastLength = -1;
    let lastChangeAt = startTime;
    let stableCount = 0;
    let baselineText = '';
    let pollCount = 0;
    // Until the page shows activity (streaming, or text other than the pre-send reply), what
    // it holds is the old reply: a send that never happened must not hand that back as new.
    let sawNewReply = !previousText;

    if (this.initialWaitMs > 0) {
      await this.sleep(this.initialWaitMs);
    }

    while (Date.now() - startTime < maxWaitMs && !isAborted()) {
      if (isPaused()) {
        await this.sleep(100);
        continue;
      }

      try {
        const [statusRes, responseRes] = await Promise.all([
          this.withPageTimeout(this.checkStreaming(platform)),
          this.withPageTimeout(this.extractResponse(platform)),
        ]);

        if (checkBlocked) {
          const verdict = await checkBlocked(platform);
          if (verdict?.blocked) {
            return { settled: false, text: baselineText, blocked: true, reason: verdict.reason };
          }
        }

        const isStreaming = statusRes?.isStreaming ?? false;
        const pageText = (responseRes?.text || '').trim();
        pollCount++;
        if (!sawNewReply) {
          sawNewReply = movedPastPrevious(previous, responseRes, pageText, isStreaming);
        }
        const text = sawNewReply ? pageText : '';

        // A streaming page can still show the old reply while the new one has not started: that
        // text may only settle once streaming ends, and is never kept as a partial answer.
        const isOldReply = Boolean(previousText) && text === previousText;

        // Monotonic text accumulation: never overwrite with shorter/empty text
        if (text && !isOldReply && text.length > baselineText.length) {
          baselineText = text;
        }

        // Emit real-time response progress
        this.emitStep('response-progress', {
          speaker: platform,
          charCount: baselineText.length,
          isStreaming,
        });

        const textChanged = text.length !== lastLength;
        if (textChanged) {
          lastLength = text.length;
          lastChangeAt = Date.now();
        }

        // Condition 1: Streaming is officially finished AND we have non-empty text
        if (!isStreaming && text.length > 0) {
          stableCount = textChanged ? 0 : stableCount + 1;
          if (stableCount >= 2) {
            console.log(
              `[Nomad Orchestrator] [${platform}] Settled cleanly: length=${text.length}`,
            );
            return { settled: true, text };
          }
        } else {
          stableCount = 0;
        }

        // Condition 2: Adaptive completion if isStreaming is erroneously stuck on true. A page
        // that reports certain streaming has a signal that cannot stick, so it is never cut off.
        const looksStuck = Date.now() - lastChangeAt >= this.stuckStreamingMs;
        if (text.length > 40 && !isOldReply && !statusRes?.certain && looksStuck) {
          console.log(
            `[Nomad Orchestrator] [${platform}] Settled via adaptive inactivity: length=${text.length}`,
          );
          return { settled: true, text };
        }

        // Condition 3: A relay does not sit out the full limit on a page that never answers
        if (
          honorRelayControls &&
          !isStreaming &&
          !text &&
          Date.now() - startTime >= this.silentWaitMs
        ) {
          break;
        }
      } catch (e) {
        console.warn(
          `[Nomad Orchestrator] [${platform}] Poll error:`,
          e instanceof Error ? e.message : String(e),
        );
      }

      await this.sleep(pollIntervalMs);
    }

    // Return whatever text has been extracted if timeout or aborted
    console.log(
      `[Nomad Orchestrator] [${platform}] Exited wait loop with text length=${baselineText.length}`,
    );
    return { settled: false, text: baselineText };
  }

  /**
   * @param {number} ms
   * @returns {Promise<void>}
   */
  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

module.exports = {
  DEFAULT_TEMPLATES,
  MultiAiOrchestrator,
};
