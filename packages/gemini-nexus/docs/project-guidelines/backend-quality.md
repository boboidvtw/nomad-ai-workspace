# Backend Quality Guidelines

These guidelines document the maintenance rules that are enforced by tests or repeatedly matter in review.

## Required Patterns

- Keep the repository root as the runnable Chrome extension project root. `package.json`, `manifest.json`, Vite config, source code, tests, and packaging scripts live at the root.
- Put cross-runtime utilities under `shared/`, grouped by capability such as `shared/logging/` for shared debug output. Do not reintroduce root-level `shared/*.js` compatibility wrappers.
- Use directory-local `index.js` files for aggregation entry points. Avoid sibling module files that share a name with implementation directories.
- Use `snake_case` for runtime source filenames. Tooling scripts and workflow files may use `kebab-case`.
- Split long manager/controller files when helpers develop distinct responsibilities. Existing structure tests guard several current split points.
- Keep ignored local support directories out of project structure scans: `.superpowers/`, `.trellis/`, and local design drafts belong outside tracked source ownership.

## Forbidden Patterns

- Do not keep retired message actions, obsolete controller methods, or unused compatibility facades after a feature is removed.
- Do not export helpers that are only used inside their own module.
- Do not leave source path banner comments at the top of runtime files.
- Do not keep commented `console.log` or `console.debug` calls as dormant debugging. Use `debugLog` or remove the statement.
- Do not use anonymous `catch (_)` or empty `catch (error) {}` blocks for intentionally ignored errors in files covered by hygiene tests. Prefer catchless syntax when the error is intentionally ignored.

## Testing Requirements

- Run focused tests for the touched area before broad verification.
- Keep project structure, i18n, manifest, packaging, and code hygiene expectations in `scripts/*.test.js`.
- Add a regression test before changing behavior or before encoding a new structure convention.

## Release Changelog Requirements

- Before preparing a release commit, generate the release changelog from the complete difference between the remote target branch and the local release candidate.
- For the default release target, run `git fetch origin main --tags` and inspect `git log --oneline --reverse origin/main..HEAD`.
- The changelog entry must summarize every product, test, and spec change in that range, not only the current task or latest fix.
- Exclude the version-only release commit itself when deriving user-facing changes.
- Include `CHANGELOG.md` in the release commit before pushing `origin main`.
- Push order is strict: push `origin main`, confirm the release commit is still current `HEAD`, then create and push the release tag.

## Managed Conversation Context

- Trigger: any change that builds model request history from saved `geminiSessions`.
- Saved chat history is a UI/storage record. Model request history is a derived transport payload and must not be treated as the same object.
- `prepareManagedContext(request, settings, history, signal, onStatus)` returns `{ history, systemInstruction }`.
- `history` passed into providers must contain previous turns only. The provider adapter appends the current prompt separately.
- `session.contextSummary` stores `{ text, sourceMessageCount, updatedAt }` for one hidden compressed API history message.
- `session.messages` remains the full visible transcript. Do not delete old messages only because they were compressed for API transport.
