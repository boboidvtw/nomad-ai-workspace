type PermissionsEventsApi = Pick<typeof chrome.permissions, 'onAdded' | 'onRemoved'>;

export type PermissionChangeHandlers = {
  onAdded: (permissions: chrome.permissions.Permissions) => void;
  onRemoved: (permissions: chrome.permissions.Permissions) => void;
};

/**
 * Electron (Nomad AI Studio) does not implement `chrome.permissions`, so a bare
 * `chrome.permissions.onAdded.addListener(...)` throws at service-worker startup
 * and aborts every top-level registration after it. Register only what exists.
 *
 * @returns whether both listeners were registered.
 */
export function addPermissionChangeListeners(
  handlers: PermissionChangeHandlers,
  api: Partial<PermissionsEventsApi> | undefined = globalThis.chrome?.permissions,
): boolean {
  const onAdded = api?.onAdded;
  const onRemoved = api?.onRemoved;
  onAdded?.addListener(handlers.onAdded);
  onRemoved?.addListener(handlers.onRemoved);
  return Boolean(onAdded && onRemoved);
}
