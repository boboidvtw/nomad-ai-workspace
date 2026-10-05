/**
 * Nomad Pipeline Manager - Orchestrating Headroom Context Compression & Laya Forward Millisecond Decision
 */

const { ok, err } = require('../result');
const { ErrorCodes } = require('../error-codes');
const { compress, estimateTokens } = require('./headroom');
const { decide } = require('./laya');

class PipelineManager {
  constructor(options = {}) {
    this.headroomEnabled = options.headroomEnabled !== false;
    this.layaEnabled = options.layaEnabled !== false;
    this.compressionLevel = options.compressionLevel || 'balanced';
    this.autoEnhance = Boolean(options.autoEnhance);
    this.maxTokens = Number(options.maxTokens) || 8000;

    // Runtime Telemetry
    this.stats = {
      totalProcessed: 0,
      totalSavedTokens: 0,
      totalLayaLatencyMs: 0,
      intents: {}
    };
  }

  /**
   * Process prompt & context through the full pipeline
   * @param {Object} input
   * @param {string} input.prompt - User query or directive
   * @param {string} [input.context] - Background conversational history or system context
   * @param {Object} [input.options]
   * @returns {import('../result').UnitResult<Object>}
   */
  process(input = {}) {
    try {
      const rawPrompt = typeof input === 'string' ? input : (input.prompt || '');
      const rawContext = input.context || '';
      const opts = input.options || {};

      if (!rawPrompt.trim() && !rawContext.trim()) {
        return err(ErrorCodes.PIPELINE_INVALID_INPUT_003, 'Pipeline input must contain prompt or context');
      }

      const combinedText = rawContext ? `${rawContext}\n\n${rawPrompt}` : rawPrompt;

      // Phase 1: Headroom Context Compression
      let headroomResult = null;
      let textAfterHeadroom = combinedText;

      if (this.headroomEnabled && (opts.headroom !== false)) {
        const compRes = compress(combinedText, {
          level: opts.compressionLevel || this.compressionLevel,
          maxTokens: opts.maxTokens || this.maxTokens
        });

        if (!compRes.success) {
          return compRes;
        }
        headroomResult = compRes.data;
        textAfterHeadroom = compRes.data.text;
      } else {
        const tokens = estimateTokens(combinedText);
        headroomResult = {
          originalTokens: tokens,
          compressedTokens: tokens,
          savedTokens: 0,
          savingsRatio: 0,
          text: combinedText
        };
      }

      // Phase 2: Laya Forward Millisecond Decision & Enhancement
      let layaResult = null;
      let finalPrompt = textAfterHeadroom;

      if (this.layaEnabled && (opts.laya !== false)) {
        const layaRes = decide(rawPrompt, {
          enhance: opts.enhance !== undefined ? opts.enhance : this.autoEnhance,
          preferredPlatform: opts.preferredPlatform
        });

        if (!layaRes.success) {
          return layaRes;
        }

        layaResult = layaRes.data;
        if (layaResult.enhanced) {
          // If enhanced, inject directive to prompt
          finalPrompt = rawContext ? `${headroomResult.text}\n\n${layaResult.enhancedPrompt}` : layaResult.enhancedPrompt;
        }
      }

      // Update statistics
      this.stats.totalProcessed++;
      if (headroomResult) {
        this.stats.totalSavedTokens += headroomResult.savedTokens;
      }
      if (layaResult) {
        this.stats.totalLayaLatencyMs += layaResult.latencyMs;
        this.stats.intents[layaResult.intent] = (this.stats.intents[layaResult.intent] || 0) + 1;
      }

      return ok({
        pipelineId: `pipe-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        originalPrompt: rawPrompt,
        processedPrompt: finalPrompt,
        headroom: headroomResult,
        laya: layaResult,
        timestamp: new Date().toISOString()
      });
    } catch (e) {
      return err(
        ErrorCodes.PIPELINE_INVALID_INPUT_003,
        'Pipeline execution error: ' + (e instanceof Error ? e.message : String(e))
      );
    }
  }

  getStats() {
    const avgLatency = this.stats.totalProcessed > 0
      ? Number((this.stats.totalLayaLatencyMs / this.stats.totalProcessed).toFixed(3))
      : 0;

    return {
      ...this.stats,
      avgLayaLatencyMs: avgLatency
    };
  }
}

module.exports = {
  estimateTokens,
  compress,
  decide,
  PipelineManager
};
