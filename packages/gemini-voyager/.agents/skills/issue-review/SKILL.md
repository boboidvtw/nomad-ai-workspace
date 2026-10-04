---
name: issue-review
description: Investigate or fix a referenced Voyager GitHub issue, within the requested delivery scope.
---

# Issue Review

1. Begin with `gh issue view <number-or-url> --comments` (add `--repo owner/repo` when needed). Read the actual issue before locating the cause in the repository.
2. Match completion to the request: investigation delivers evidence, root cause or remaining uncertainty, and a recommended fix; implementation delivers the scoped change and applicable verification from `AGENTS.md`.
3. When the request includes committing or publishing, use `voyager-contribute`. A fix commit or PR includes `Closes #<number>` or `Fixes #<number>`; verify any created commit with `git show --stat --format=fuller HEAD`. An investigation or uncommitted fix needs no commit inspection.
4. When authorized to post, report the actual status in the reporter's language. Say the fix has landed and is coming in the next version only after it has landed. Close the issue only when the fix has landed or another agreed resolution is satisfied and closing is authorized; a local fix or an open PR alone is not completion of the issue.
