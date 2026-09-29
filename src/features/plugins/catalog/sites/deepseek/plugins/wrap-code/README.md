# DeepSeek - Code Wrapping

DeepSeek renders answer code blocks with `white-space: pre-wrap`, so any line
wider than the block folds onto the next one and the indentation of everything
below it stops meaning anything. This plugin sets `white-space: pre` and lets
the block scroll sideways instead; the **Wrap code lines** setting puts the
host's wrapping back for anyone who prefers it.

That is the whole plugin. It does not touch syntax colours, the native copy
button, thinking content, the composer, or user messages. Tables are left to
DeepSeek: it already wraps every one of them in `.ds-scroll-area` with
`overflow-x: auto`, measured live, so a rule of our own changed nothing.

Uses the DeepSeek adapter's `assistantTurn` semantic key and standard
`pre`/`code` descendants of `.ds-assistant-message-main-content`. No extra host
permissions, native handler, remote resources or new storage keys. Disabling
removes the scoped class, the setting attribute and the stylesheet.

## Validation status

Verified live on chat.deepseek.com: with the plugin off a 400-character line
reports `scrollWidth === clientWidth` (the host wrapped it); with it on the same
line reports `scrollWidth` 3163 against `clientWidth` 1600, so the block scrolls
and the page does not. The DOM lifecycle is covered by
`sources/deepseekWrapCode.test.ts` against synthetic fixtures.

The effect is only visible on a line too long for the block — short code looks
identical either way.

Related issue: #995.
