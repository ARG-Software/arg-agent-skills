# One rulebook for every agent

`AGENTS.md` at the repo root is the single source of rules for every coding agent and every new teammate. Codex, OpenCode, Cursor, GitHub Copilot and many others read it natively; Claude Code reads it through an import in `CLAUDE.md`. Other agent files only point to it, so a rule is written once.

## Contents

- [Write it from the repo](#write-it-from-the-repo)
- [AGENTS.md skeleton](#agentsmd-skeleton)
- [Wiring the other agents](#wiring-the-other-agents)
- [Merging existing rules](#merging-existing-rules)

## Write it from the repo

A generic `AGENTS.md` is worse than none: agents follow it confidently and it lies. Every line must come from something you found:

- **Commands**: the exact verify, test, lint, build and run commands you ran in detection, with the working directory when it is not the root.
- **Structure**: the real top-level folders and what lives in each; the layers and which may import which, matching the architecture tests.
- **Conventions**: naming patterns seen in neighbouring files (`*.usecase.ts`, `*Handler.cs`), test file placement, error-handling style, the config module, the `lib` folder.
- **Workflow**: the default branch, branch prefixes, Conventional Commit PR titles, squash merges, who reviews, and that agents never merge.
- **Domain rules**: invariants and vocabulary from the README, docs and code comments. Ask the user for the ones you cannot find; leave a clearly marked TODO rather than inventing one.

Keep it under about 200 lines. Link to `docs/` for anything long.

Write it **last** in the setup, after CI, scripts and tests exist, so every command and folder it names is real. If the repo has a README, add the quick start there too (`cp .env.example .env`, install, verify); if it has none, the Commands table in `AGENTS.md` is enough, and creating a README is a follow-up.

## AGENTS.md skeleton

```markdown
# AGENTS.md

Rules for humans and coding agents working in this repository.

## Commands

| Task | Command |
| --- | --- |
| Install | `pnpm install` |
| Verify (run before every push) | `pnpm verify` |
| Test one file | `pnpm vitest run path/to/file.test.ts` |
| Run locally | `cp .env.example .env && pnpm dev` |

## Structure

| Folder | Holds | May import |
| --- | --- | --- |
| `src/domain` | entities, value objects, domain rules | `src/lib` only |
| `src/application` | use cases, ports | domain, lib |
| `src/infrastructure` | adapters: HTTP, database, config module | application, domain, lib |
| `src/presentation` | UI / controllers | application, domain, lib |
| `src/lib` | generic, dependency-free helpers | lib only |

Architecture tests in `test/architecture` enforce this table.

## Conventions

- Environment variables are read only in `src/infrastructure/config`; add new ones to `.env.example`.
- Search `src/lib` before writing a helper.
- Thresholds and limits live in `src/domain/policy`, never as magic numbers.
- <naming and error-handling rules found in the code>

## Workflow

- Branch from `<default-branch>`: `feature/`, `fix/`, `hotfix/`, `refactor/`, `chore/`, `docs/`.
- PR titles are Conventional Commits; they drive releases (release-please). PRs are squash merged.
- CI (`verify`, `pr-title`) must pass. A human reviews every PR. Agents never merge.
- Update this file in the same PR when a rule changes.

## Domain

- <invariants and vocabulary>
```

## Wiring the other agents

Always write `CLAUDE.md` (Claude Code does not read `AGENTS.md` directly). Add the other pointer files **only when that agent's file already exists in the repo, or the user says the team uses it**; never create files for agents nobody uses.

| File | Content |
| --- | --- |
| `CLAUDE.md` | `@AGENTS.md` on the first line, then at most a short quick reference specific to Claude Code. Never a copy of the rules. |
| `.github/copilot-instructions.md` | one line: "Follow the rules in AGENTS.md at the repository root." (Copilot also reads `AGENTS.md` directly in recent versions; keep the pointer for older ones.) |
| `.cursor/rules/agents.mdc` | front matter `alwaysApply: true` and a body pointing to `AGENTS.md`. Remove a legacy `.cursorrules` after moving its content. |
| `GEMINI.md`, `.windsurfrules`, others | only if the team uses that agent: a pointer to `AGENTS.md`. |

Codex and OpenCode read `AGENTS.md` with no extra file. Nested `AGENTS.md` files in subfolders are allowed for monorepos; the closest one to the edited file applies, so keep shared rules at the root.

## Merging existing rules

1. Collect every existing agent file (`CLAUDE.md`, `.cursorrules`, `.cursor/rules/*`, `copilot-instructions.md`, `.windsurfrules`, `GEMINI.md`) and any `CONTRIBUTING.md` rules agents should follow.
2. De-duplicate into the `AGENTS.md` sections above. When two files disagree, ask the user which rule wins; do not pick silently.
3. Replace each source file's rules with the pointer from the table above, keeping anything truly agent-specific (a Claude Code hook note, a Cursor glob rule).
4. Show the user the full diff before committing, in one commit: `docs: consolidate agent rules into AGENTS.md`.
