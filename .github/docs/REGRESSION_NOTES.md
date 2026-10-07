# Regression Notes

Bugs that shipped once and are now pinned by a test. Each topic file lists entries
with three fields: **Trap** (what went wrong), **Rule** (what to do instead) and
**Guard** (the test that fails if it comes back). `npm run regressions:check`
validates the structure and that every guard path exists.

When you fix a bug that could plausibly return, add an entry to the matching topic
(or a new topic linked below) in the same PR.

## Topics

- [Content-script DOM injection](regressions/content-dom.md)
- [Desktop multi-AI orchestrator](regressions/desktop-orchestrator.md)
