/**
 * Nomad AI Studio - relay history persistence
 * Saves each relay turn to the active workspace and, when the relay ends, replaces the saved
 * history with the orchestrator's full record.
 */

/**
 * @typedef {object} RelayHistoryDeps
 * @property {() => any} getSessionManager - the SessionManager, or null before it exists
 * @property {() => Array<Record<string, any>> | undefined} getOrchestratorHistory
 * @property {(platform: string, title: string) => Promise<unknown>} rename - in-page chat rename
 */

/** @param {RelayHistoryDeps} deps */
function createRelayHistory({ getSessionManager, getOrchestratorHistory, rename }) {
  const activeWorkspace = () => {
    const sm = getSessionManager();
    const ws = sm?.getActiveWorkspace();
    return sm && ws ? { sm, ws } : null;
  };

  return {
    /**
     * Handles a `turn-complete` step.
     * @param {Record<string, any>} event
     */
    async onTurnComplete(event) {
      // Record before awaiting anything: the orchestrator does not await this handler, so on the
      // last turn onComplete runs during the rename and a later addTurn would save the turn twice.
      const active = activeWorkspace();
      if (active) {
        active.sm.captureActiveUrls(active.ws.id);
        active.sm.addTurn(active.ws.id, {
          speaker: event.speaker,
          round: event.round,
          content: event.content || event.responseSnippet,
          timestamp: new Date().toISOString(),
        });
      }
      try {
        await rename(event.speaker, event.canonicalTitle);
      } catch (e) {
        console.warn('[Nomad Desktop] Action failed:', e instanceof Error ? e.message : String(e));
      }
    },

    /** Marks the workspace completed; returns it, or null when there is no active workspace. */
    onComplete() {
      const active = activeWorkspace();
      if (!active) return null;
      active.sm.captureActiveUrls(active.ws.id);
      const recorded = getOrchestratorHistory();
      const history = recorded && recorded.length > 0 ? recorded : active.ws.history || [];
      return active.sm.updateWorkspace(active.ws.id, {
        completed: true,
        history,
        turns: history.length,
      });
    },
  };
}

module.exports = { createRelayHistory };
