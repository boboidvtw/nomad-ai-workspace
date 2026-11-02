/**
 * Nomad AI Studio - render holds
 * Counts the tasks waiting on a platform's reply, so its view keeps rendering while it answers:
 * a hidden Gemini page finishes a reply without drawing its text.
 */

/** @param {() => void} onChange - called whenever the held set changes */
function createRenderHolds(onChange) {
  /** @type {Map<string, number>} */
  const counts = new Map();

  return {
    /** @returns {string[]} the platforms currently held */
    list: () => [...counts.keys()],

    /**
     * Holds `platform` while `task` runs.
     * @template T
     * @param {string} platform
     * @param {() => Promise<T>} task
     * @returns {Promise<T>}
     */
    async during(platform, task) {
      counts.set(platform, (counts.get(platform) || 0) + 1);
      onChange();
      try {
        return await task();
      } finally {
        const left = (counts.get(platform) || 1) - 1;
        if (left > 0) counts.set(platform, left);
        else counts.delete(platform);
        onChange();
      }
    },
  };
}

module.exports = { createRenderHolds };
