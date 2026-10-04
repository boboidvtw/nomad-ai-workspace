# Frontend Component Guidelines

Gemini Nexus uses native DOM rendering modules rather than a component framework for the sandbox chat UI.

## Component Structure

### Render Controllers For Streamed Message UI

DOM render helpers that create streamed UI must return a small controller object for later updates.

Streaming messages receive text, thoughts, sources, and images at different times. Keeping update behavior inside the render module prevents controller code from duplicating DOM queries or knowing markup details.

```javascript
const bubble = appendMessage(historyDiv, '', 'ai', null, '', null, {
    isStreaming: true,
});

bubble.update(nextText, nextThoughts, { isStreaming: true });
bubble.finalize(finalText, finalThoughts);
bubble.addSources(sources);
bubble.addImages(images);
```

The controller contract:

- `update(text, thoughts, { isStreaming: true })` updates existing message nodes and must not create duplicate streamed sections.
- `finalize(text, thoughts)` applies final streamed state such as completed labels, elapsed duration, and auto-collapse behavior.
- Restored history messages call `appendMessage()` without streaming options and must not briefly enter streaming UI states.

## Styling Patterns

- Use shared CSS files and existing CSS variables. Do not add frontend runtime styling libraries for isolated sandbox UI changes.
- Keep broad component primitives in shared component CSS, and keep surface-specific rules in files named for the UI surface.
- Use `.settings-input` for ordinary settings form controls and `.shortcut-input` only for keyboard shortcut controls.
- Keep style ownership out of runtime DOM builders. Prefer CSS modules/files over `style.cssText`.

### Research Mature Interaction Patterns Before Tuning

Before changing mature interaction patterns such as chat auto-scroll, sticky-to-bottom streaming, virtualized lists, drag/resize, focus management, or animation performance, inspect established implementations or official platform guidance first.

Preserve user intent: automatic following is allowed only while the user has not explicitly moved away from the followed region.

## Accessibility

- Icon-only controls need localized titles and matching `aria-label` values.
- Settings help controls should expose the localized help text through normal focus and hover affordances.
- Avoid adding visual-only state; stateful controls need real form elements, attributes, or accessible text.
