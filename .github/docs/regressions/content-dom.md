# Content-script DOM injection

## Hide-archived nudge threw when the folder header was nested

- **Trap:** `mountHideArchivedNudge` located `.gv-folder-header` with a descendant
  `querySelector` but inserted with `container.insertBefore(card, header.nextSibling)`.
  The live panel wraps the header in the workspace body, so the reference node was
  not a direct child and `insertBefore` threw `NotFoundError` inside the move-to-folder
  click handler. The nudge never appeared.
- **Rule:** Insert relative to the node you found (`header.after(card)`), never assume a
  `querySelector` hit is a direct child of the container you queried.
- **Guard:** `src/pages/content/folder/__tests__/hideArchivedNudge.test.ts`
