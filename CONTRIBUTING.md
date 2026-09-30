# Contributing

This repo is a catalogue of agent skills. Every skill lives in its own folder, is versioned on its own, and is installed with `npx skills add ARG-Software/arg-agent-skills --skill <skill-name>`.

## Workflow

We follow the same rules our skills teach:

1. Branch from `main`: `feat/<skill-name>` for a new skill or new guidance, `fix/<skill-name>-<slug>` for corrections, `docs/...` / `chore/...` / `ci/...` for the rest.
2. Open a pull request. `main` only accepts reviewed PRs with green checks, and PRs are **squash merged**.
3. The **PR title is a [Conventional Commit](https://www.conventionalcommits.org) whose scope is the skill name**, because release-please reads it to version that skill:

   | PR title | Effect on the skill's version |
   | --- | --- |
   | `fix(<skill-name>): correct the branch-protection example` | patch |
   | `feat(<skill-name>): add a section on side panels` | minor |
   | `feat(<skill-name>)!: rename the layers` or a `BREAKING CHANGE:` footer | major (minor while the skill is `0.x`) |
   | `docs: ...`, `chore: ...`, `ci: ...` | no release |

   Put a PR that touches several skills on separate PRs, one per skill, so each changelog stays accurate.

## The shared ARG base

Every skill carries the same **ARG base**: the clean-code principles, the branch → Conventional Commit PR → review workflow, the CI gate and ruleset, release-please, `.env` handling, the `lib` folder, architecture tests, and the checklists. It lives in one place:

| Source | Copied to | How |
| --- | --- | --- |
| `shared/base-core.md` (the must-follow rules) | every `skills/<name>/SKILL.md`, between `<!-- arg-base:start -->` and `<!-- arg-base:end -->` | `node scripts/sync-base.mjs` |
| `shared/arg-base.md` (procedures, templates, checklists) | every `skills/<name>/references/arg-base.md` | `node scripts/sync-base.mjs` |

- Edit the base only in `shared/`, then run `node scripts/sync-base.mjs` and commit the updated copies in the same PR. CI fails when a copy drifts.
- The base is stack-neutral. It refers to "verify", "the lib folder", "the arch-test tool", "the config module" and "the release type", and each skill's `## Stack profile` table fills them in.
- A base change modifies every skill, so it releases every skill. Use a title like `feat(base): ...`, and list every affected skill in the PR body.

## Adding a new skill

1. **Create the folder** `skills/<skill-name>/SKILL.md`.
   - `<skill-name>` is lowercase letters, digits, and hyphens, and must equal the `name` field.
   - Supporting files (`references/`, `templates/`, `scripts/`) go inside the same folder and are linked from `SKILL.md` with relative paths.
2. **Write the frontmatter** in this exact shape:
   ```yaml
   ---
   name: <skill-name>
   description: <what the skill does AND when the agent should use it, in one line, at most 1024 characters>
   license: MIT
   metadata:
     author: ARG Software
     homepage: https://arg.software
     version: 0.1.0 # x-release-please-version
   ---
   ```
   The `# x-release-please-version` comment lets release-please bump the version, so keep it.
3. **Lay out the body** like the other skills:
   - a short intro saying where the guidance comes from
   - the empty markers `<!-- arg-base:start -->` and `<!-- arg-base:end -->` (then run `node scripts/sync-base.mjs` to fill them)
   - a `## Stack profile` table: verify, lib folder, arch-test tool, config module, release type
   - the stack rules: layers, architecture tests, conventions, testing, CI, releases
   - a references table, the stack checklist, and an About section
   - at most 500 lines. Put long examples and templates in `references/*.md` files linked directly from `SKILL.md` (one level deep).
4. **Keep the body agent-neutral.** Use plain `git` / `gh` / `npm` commands and "ask the user before ..." instead of tool names from one specific agent. Then the skill behaves the same in Claude Code, Cursor, Codex, OpenCode, and Copilot.
5. **Register it for releases** by adding the skill to both release-please files:
   - `release-please-config.json` → `packages`:
     ```json
     "skills/<skill-name>": {
       "component": "<skill-name>",
       "extra-files": ["SKILL.md"]
     }
     ```
   - `.release-please-manifest.json`: `"skills/<skill-name>": "0.0.0"`. The first `feat(<skill-name>)` merge then releases `0.1.0`.
6. **Add a row** to the Skills table in `README.md` (link, one-line summary, install command).
7. **Sync, validate and test:**
   ```bash
   node scripts/sync-base.mjs
   node scripts/validate-skills.mjs
   npx skills add ./ --list
   ```
   Then install it into a scratch project for at least one agent and try a realistic request.
8. Open the PR titled `feat(<skill-name>): add <skill-name> skill`.

## Checks

CI runs on every PR:

- `validate` runs `scripts/validate-skills.mjs`. It checks every skill's frontmatter, that the folder name matches, the description length, the version annotation, the `## Stack profile` section, the 500-line limit, that every relative link resolves, the release-please entries, the README row, and that the ARG base copies match `shared/`.
- `pr-title` checks the Conventional Commit PR title.

## Releases

After each merge, release-please opens or updates one Release PR per changed skill, with the new version and changelog. Merging a Release PR tags `<skill-name>-v<version>` and creates the GitHub release. Release PRs are reviewed like any other PR.
