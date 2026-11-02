# Merging `packages/claude-voyager` into `src/features/claude`

**Decision (2026-11-02):** We keep `packages/claude-voyager` as it is and do not deduplicate it
against `src/features/claude`.

## Why

- `packages/claude-voyager` is a subtree of the MIT project Qiuner/claude-nexus, imported with
  its history. README, `docs/ARCHITECTURE.md` and `THIRD_PARTY_NOTICES.md` list it as its own
  Chrome extension, so it is a product, not leftover code.
- Nothing in the main extension imports it, and no CI job builds or tests it, so the
  duplication costs repository size only. It never ships twice in one build.
- `src/features/claude` has drifted since the port (Nomad Workspace sidebar, oxlint and a11y
  fixes). Removing the duplication means one of two large changes: build the standalone
  extension from `src/features/claude`, which changes its build and its module boundary, or
  delete the package, which removes a listed product. Neither is a code-health cleanup.

## Reconsider when

- The standalone Claude extension is no longer published or wanted (then delete the package,
  and update README, `docs/ARCHITECTURE.md` and `THIRD_PARTY_NOTICES.md`), or
- a fix has to land in both copies (then make the package build from `src/features/claude`),
  or
- upstream claude-nexus changes are to be pulled in again (`git subtree pull` needs the
  subtree left intact).
