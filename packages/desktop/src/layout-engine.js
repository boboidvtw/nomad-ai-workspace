/**
 * Nomad AI Studio - Layout Calculation Engine
 * Pure function calculation of WebContentsView bounds.
 */

const ALL_PLATFORMS = ['chatgpt', 'claude', 'gemini', 'grok', 'deepseek', 'perplexity'];

/**
 * Calculates bounds and visibility for all platforms.
 * 
 * @param {Object} params
 * @param {number} params.winWidth - Total window content width
 * @param {number} params.winHeight - Total window content height
 * @param {number} [params.topBarHeight=52] - Top control bar height
 * @param {number} [params.bottomBarHeight=68] - Bottom dispatcher bar height
 * @param {string} [params.layout='dual'] - Layout mode: 'focus' | 'dual' | 'triple' | 'quad' | 'custom'
 * @param {string[]} [params.activePlatforms=['claude', 'chatgpt']] - Platforms currently displayed
 * @param {number} [params.splitRatio=0.5] - Split ratio for dual layout (0.2 ~ 0.8)
 * @param {number} [params.drawerWidth=0] - Right sidebar/drawer width
 * @returns {Record<string, { x: number, y: number, width: number, height: number, visible: boolean }>}
 */
function calculateLayoutBounds({
  winWidth,
  winHeight,
  topBarHeight = 52,
  bottomBarHeight = 68,
  layout = 'focus',
  activePlatforms = ['chatgpt'],
  splitRatio = 0.5,
  drawerWidth = 0,
}) {
  const contentHeight = Math.max(100, (winHeight || 900) - topBarHeight - bottomBarHeight);
  const totalWidth = Math.max(200, winWidth || 1200);
  const width = Math.max(200, totalWidth - (Math.max(0, Number(drawerWidth)) || 0));

  // Initialize all platforms as invisible
  /** @type {Record<string, { x: number, y: number, width: number, height: number, visible: boolean }>} */
  const bounds = {};
  for (const p of ALL_PLATFORMS) {
    bounds[p] = { x: 0, y: topBarHeight, width: 0, height: 0, visible: false };
  }

  // Filter valid active platforms
  const active = (activePlatforms && activePlatforms.length > 0)
    ? activePlatforms.filter(p => ALL_PLATFORMS.includes(p))
    : ['chatgpt'];

  // Determine effective mode
  let effectiveMode = layout;
  if (effectiveMode === 'custom') {
    if (active.length === 1) effectiveMode = 'focus';
    else if (active.length === 2) effectiveMode = 'dual';
    else if (active.length === 3) effectiveMode = 'triple';
    else if (active.length === 4) effectiveMode = 'quad';
    else effectiveMode = 'hexa';
  }

  if (effectiveMode === 'focus' || active.length === 1) {
    const p = active[0] || 'chatgpt';
    bounds[p] = {
      x: 0,
      y: topBarHeight,
      width,
      height: contentHeight,
      visible: true,
    };
  } else if (effectiveMode === 'dual' || active.length === 2) {
    const p1 = active[0];
    const p2 = active[1] || ALL_PLATFORMS.find(k => k !== p1) || 'claude';

    // Clamp split ratio between 0.2 and 0.8
    const ratio = Math.min(0.8, Math.max(0.2, Number(splitRatio) || 0.5));
    const w1 = Math.floor(width * ratio);
    const w2 = width - w1;

    bounds[p1] = {
      x: 0,
      y: topBarHeight,
      width: w1,
      height: contentHeight,
      visible: true,
    };
    bounds[p2] = {
      x: w1,
      y: topBarHeight,
      width: w2,
      height: contentHeight,
      visible: true,
    };
  } else if (effectiveMode === 'triple' || active.length === 3) {
    const [p1, p2, p3] = active;
    const w1 = Math.floor(width / 3);
    const w2 = Math.floor(width / 3);
    const w3 = width - w1 - w2;

    bounds[p1] = { x: 0, y: topBarHeight, width: w1, height: contentHeight, visible: true };
    bounds[p2] = { x: w1, y: topBarHeight, width: w2, height: contentHeight, visible: true };
    bounds[p3] = { x: w1 + w2, y: topBarHeight, width: w3, height: contentHeight, visible: true };
  } else if (effectiveMode === 'quad' || (effectiveMode !== 'hexa' && active.length === 4)) {
    const halfWidth = Math.floor(width / 2);
    const halfHeight = Math.floor(contentHeight / 2);
    const targetKeys = active.length >= 4 ? active.slice(0, 4) : ALL_PLATFORMS.slice(0, 4);

    targetKeys.forEach((key, index) => {
      const col = index % 2;
      const row = Math.floor(index / 2);
      const x = col === 0 ? 0 : halfWidth;
      const y = topBarHeight + (row === 0 ? 0 : halfHeight);
      const w = col === 0 ? halfWidth : width - halfWidth;
      const h = row === 0 ? halfHeight : contentHeight - halfHeight;

      bounds[key] = {
        x,
        y,
        width: w,
        height: h,
        visible: true,
      };
    });
  } else if (effectiveMode === 'hexa' || active.length >= 5) {
    const colWidth = Math.floor(width / 3);
    const rowHeight = Math.floor(contentHeight / 2);
    const targetKeys = active.length >= 6 ? active.slice(0, 6) : active;

    targetKeys.forEach((key, index) => {
      const col = index % 3;
      const row = Math.floor(index / 3);
      const x = col === 0 ? 0 : col === 1 ? colWidth : colWidth * 2;
      const y = topBarHeight + (row === 0 ? 0 : rowHeight);
      const w = col === 2 ? width - colWidth * 2 : colWidth;
      const h = row === 1 ? contentHeight - rowHeight : rowHeight;

      bounds[key] = {
        x,
        y,
        width: w,
        height: h,
        visible: true,
      };
    });
  }

  return bounds;
}

module.exports = {
  ALL_PLATFORMS,
  calculateLayoutBounds,
};
