# Agent Instructions

## Branches And Commits

- Broad cleanup work must be split into multiple narrowly scoped branches and PRs by concern, for example unused-code removal, type consolidation, dependency cleanup, circular-dependency fixes, or auth-routing refactors.
- Use descriptive conventional branch names such as `chore/remove-unused-code`, `refactor/auth-compliance-routing`, or `types/consolidate-shared-models`.
- Do not use the `codex/` branch namespace for this repository.
- Use Conventional Commit messages, for example `chore: remove unused components`, `refactor: consolidate auth compliance routing`, or `types: share learner profile models`.
- Avoid bundling unrelated cleanup, formatting, dependency, and behavioral changes into one commit or PR.
