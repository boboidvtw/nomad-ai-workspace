/**
 * Nomad AI Studio - view stacking
 * Applies a planViewStacking plan to the window's platform views.
 */

/**
 * Restacks first and only then shows the views kept rendering, so no step of the change can put
 * a relay speaker over the views the user is looking at. Returns the stack key now in effect.
 * @param {object} params
 * @param {{ addChildView: (view: any) => void }} params.contentView
 * @param {Record<string, { view: { setBounds: (b: any) => void, setVisible: (v: boolean) => void } }>} params.views
 * @param {Record<string, { x: number, y: number, width: number, height: number } | undefined>} params.boundsMap
 * @param {ReturnType<typeof import('./layout-engine').planViewStacking>} params.plan
 * @param {any} params.dashboardView - kept above every platform view
 * @param {string | null} params.lastStackKey
 * @param {(key: string) => void} params.ensureLoaded
 * @returns {string | null}
 */
function applyViewStacking({
  contentView,
  views,
  boundsMap,
  plan,
  dashboardView,
  lastStackKey,
  ensureLoaded,
}) {
  // addChildView moves a view to the top, which puts the user's views over the held ones.
  // Restack only when the stacking changes, so resizing during a relay does not reorder views.
  if (plan.stackKey && plan.stackKey !== lastStackKey) {
    for (const key of plan.raise) contentView.addChildView(views[key].view);
    if (dashboardView) contentView.addChildView(dashboardView);
  }
  for (const [key, item] of Object.entries(views)) {
    const b = boundsMap[key];
    const { visible, load } = plan.views[key];
    if (load) ensureLoaded(key);
    // Hidden views are sized too, so a page a bot drives in the background still lays out.
    if (b) item.view.setBounds({ x: b.x, y: b.y, width: b.width, height: b.height });
    item.view.setVisible(visible);
  }
  return plan.stackKey;
}

module.exports = { applyViewStacking };
