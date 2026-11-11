---
name: arg-devops-setup
description: DevOps setup for any repository, new or existing, the ARG way. Use when asked to set up or audit a repo's DevOps, CI, GitHub Actions, rulesets, squash merges, PR templates, CODEOWNERS, Conventional Commit PR titles, release-please, changelogs, Dependabot, AGENTS.md or CLAUDE.md, .env handling, a lib folder, architecture tests, a Docker Compose local stack with a database, Prometheus and Grafana observability, a /metrics endpoint, or a Portainer container UI; to make a repo production-ready; or to bring a project up to the ARG base. Detects the stack (Node/TypeScript, Nx, .NET, Python, Go, Rust), shows a gap table of what is present, partial or missing, adds the missing pieces on a chore/project-setup branch without overwriting existing CI or rules, asks before any ruleset, secret, push or PR, and opens one PR for review. Never merges.
license: MIT
metadata:
  author: ARG Software
  homepage: https://arg.software
---

# DevOps setup for any repo, the ARG way

A procedure that gives any repository, new or years old, the delivery pipeline every ARG project runs on: CI that gates the default branch, a ruleset that makes the gate real, Conventional Commit PRs, automatic versions and changelogs with release-please, one rulebook for every coding agent, safe `.env` handling, a `lib` folder, and architecture tests. Optionally it adds a local stack in Docker Compose: the database the app uses, Prometheus and Grafana watching the app's `/metrics`, and Portainer to see the running containers. It is the setup side of the ARG base: the base says what a project needs, this skill puts it there.

Two rules come before everything else:

1. **Audit before you add.** Detect what the repo already has and show it to the user. Never overwrite existing CI, agent rules, release tooling or config; extend them, or propose a diff.
2. **Local changes are yours, outward changes are the user's.** You may edit files on the setup branch. Rulesets, repository settings, secrets, pushes and PRs each need the user's explicit go-ahead.

<!-- arg-base:start -->
## ARG base: rules for every task

These rules are the same in every ARG skill. The **Stack profile** table in this skill fills in the stack-specific parts: the verify command, the `lib` folder, the architecture-test tool, the config module, and the release type. The full procedures, templates and checklists are in [references/arg-base.md](references/arg-base.md). Read it when you set up a project, open a PR, or release.

These rules work with any coding agent (Claude Code, Cursor, Codex, OpenCode, GitHub Copilot). Commands are plain `git`, `gh` and the stack's own CLI. Wherever a step says **ask the user**, stop and get confirmation first.

### Principles

1. **Dependencies point inward.** Domain knows nothing. Application knows the domain. Infrastructure and presentation sit at the edges. Only the composition root builds concrete classes and wires them together.
2. **Architecture is tested, not hoped for.** Every layer rule is an automated test or lint rule that runs in CI.
3. **Nothing reaches the default branch without a branch, a PR, a human review, and green CI.**
4. **Reusable, domain-neutral helpers live in the `lib` folder**, never copied between files.
5. **Unknown is not bad, and absent is not unknown.** If something could not be observed, report it as unknown. If it was observed and is missing, that is a real negative result.
6. **Versions come from commits.** Conventional Commits drive release-please: fix → patch, feat → minor, breaking → major.
7. **Secrets never live in git.** A tracked `.env.example` documents every variable. An untracked `.env` holds the real values.
8. **Follow the local style.** Read the neighbouring files before writing new ones, and match their naming, comment density, and idioms.

### On every task

1. **Branch first.** Detect the default branch, and never assume it is `main`. If you are on the default branch, or on a branch meant for other work, advise a new branch and ask before creating it:
   - `feature/<slug>` for a feature
   - `fix/<slug>` for a bug
   - `hotfix/<slug>` for an urgent fix
   - `refactor/<slug>` when behaviour does not change
   - `chore/<slug>` / `docs/<slug>` for everything else

   Never commit to the default branch. Never force-push a shared branch.
2. **Find the owning layer** for each part of the change. Put ports inward, adapters outward, and wire them in the composition root.
3. **Search the `lib` folder** before writing a small helper. Add a helper there only if it is generic and has more than one consumer.
4. **Put constants in policy or config.** Thresholds, limits, weights and timeouts go in policy/config files, never as magic numbers.
5. **Test at the owning boundary.** A bug fix starts with a failing test that reproduces it. Extend the architecture tests when you add a layer, alias, project, or owned package.
6. **New configuration** goes in `.env.example` (with a dummy value and a comment) and is read only through the stack's config module.
7. **Run the stack's verify command** before you push.
8. **Open a PR** whose title is a Conventional Commit: `feat(<scope>): ...`, `fix(<scope>): ...`, or `!` / `BREAKING CHANGE:` for breaking changes. Ask the user when you are unsure whether a change is breaking. Request a reviewer, who can be a teammate or the user reviewing their own diff.
9. **Never merge the PR yourself**, never bypass branch protection, and never merge a Release PR. Tell the user the PR is waiting for review and give them the link.
10. **Update `AGENTS.md` and `docs/`** in the same PR when a rule or behaviour changes.

### When a piece is missing

If the project lacks any of the following, propose adding it on a `chore/project-setup` branch, using the templates in [references/arg-base.md](references/arg-base.md):
- a CI workflow running verify plus a PR-title check
- a ruleset protecting the default branch
- squash-only merges
- a PR template and `CODEOWNERS`
- `AGENTS.md` as the single agent rulebook, with `CLAUDE.md` importing it
- release-please with a `RELEASE_PLEASE_TOKEN` secret
- `.env.example` plus the `.gitignore` rules for `.env`
- a `lib` folder
- architecture tests

Anything outward-facing needs the user's approval first: rulesets, repository settings, secrets, pushes, and PR comments.
<!-- arg-base:end -->

## Stack profile

This skill works on any stack, so it fills the base terms from the repository it sets up. [references/detection.md](references/detection.md) explains how to find each one; [references/stack-templates.md](references/stack-templates.md) has the value to add when it is missing.

| Base term | How to find or choose it |
| --- | --- |
| **verify** | the existing CI's main job, else the documented commands (`AGENTS.md`, `CONTRIBUTING.md`, README), else the tools already installed (lint, typecheck, test, build). The setup never adds a new tool; missing ones are follow-ups |
| **lib folder** | the folder the repo already uses for shared helpers, even if it is named `utils` or `common` (point the architecture tests at that name; renaming is a follow-up), else the stack default (`src/lib`, `libs/shared/util`, `src/<Product>.SharedKernel`, `<pkg>/lib`, `internal/lib`) |
| **arch-test tool** | the boundary tool already installed, else the stack default (eslint-plugin-boundaries or the dependency-free helper, `@nx/enforce-module-boundaries`, NetArchTest, import-linter, go-arch-lint, a Rust test) |
| **config module** | the one module that reads the environment, else a new one in the infrastructure or config layer |
| **release type** | `release-please-config.json` if present, else the stack default (`node`, `simple` + `extra-files`, `python`, `go`, `rust`) |

---

## 1. Procedure

### 1. Detect

Read the repo without changing anything:

- **Default branch**: `gh repo view --json defaultBranchRef -q .defaultBranchRef.name`, else `git symbolic-ref refs/remotes/origin/HEAD`. With no remote, use the branch the existing CI targets (`on.push.branches`), else the only local branch, else ask. Never assume `main`, and never trust `init.defaultBranch` (it is a local preference, not the repo's branch).
- **Secrets already in git** (check first): `git ls-files | grep -iE '(^|/)\.env($|\.)'` and `git log --all --oneline -- .env`. Never print a secret's value while checking; record only the file, the variable names and the commit.
- **Stack and tooling**: manifests, lock files and workspace files (see [references/detection.md](references/detection.md)). Record the language, package manager, runtime version file, monorepo tool, test runner, linter and formatter.
- **What exists**: `.github/workflows/*`, other CI (`.gitlab-ci.yml`, `azure-pipelines.yml`, `.circleci/`), `release-please-config.json` or other release tools (semantic-release, changesets, GitVersion), `AGENTS.md`, `CLAUDE.md`, `.cursor/rules/`, `.github/copilot-instructions.md`, `.github/pull_request_template.md`, `CODEOWNERS`, `.env*`, `.gitignore`, Dependabot/Renovate config, architecture tests.
- **Remote settings** (read-only, when `gh` is authenticated): rulesets (`gh api repos/{owner}/{repo}/rulesets`), merge methods (`gh repo view --json squashMergeAllowed,mergeCommitAllowed,rebaseMergeAllowed,deleteBranchOnMerge`), and whether a `RELEASE_PLEASE_TOKEN` secret exists (`gh secret list`).
- **Verify today**: find the commands and run them once, so you know the baseline before you change anything. A failing baseline is reported, not fixed silently.

### 2. Show the gap table

Report one row per base piece, with a status and the evidence:

| Piece | Status | Evidence | Proposed action |
| --- | --- | --- | --- |
| CI runs verify on PRs and pushes | partial | `.github/workflows/test.yml` runs tests only, no lint or build | add lint and build steps to the existing job, rename it `verify` |
| PR-title check | missing | no workflow checks titles | add the `pr-title` job |
| Ruleset on the default branch | unknown | `gh` not authenticated | ask the user to check, or authenticate |

Use **present**, **partial**, **missing**, or **unknown**. Unknown means you could not observe it (no `gh` auth, no access to settings); it is never reported as missing. The full list of pieces and how to judge each one is in [references/detection.md](references/detection.md).

Then recommend the matching ARG stack skill when one exists (`arg-angular`, `arg-nx-monorepo`, `arg-dotnet`, `arg-react-native`, `arg-browser-extension`, `arg-mcp-server`): this skill sets up the pipeline, the stack skill guides the code that runs through it.

### 3. Plan and ask

Propose the work in this order, and say which steps are local and which are outward-facing:

Each step below is one commit with the message shown:

1. **Branch** (local): `chore/project-setup` from the default branch. Ask before creating it.
2. **Secrets hygiene** (local, first because a leak is the most urgent finding): `.env.example`, `.gitignore`, `git rm --cached` of any tracked `.env`, and a config parity test when a config module exists. Commit: `chore: stop tracking .env and add .env.example`.
3. **CI** (local): a single verify entry point (`npm run verify`, `make verify`), the runtime version file, a lock file if missing, and the `verify` and `pr-title` jobs. Commit: `ci: add verify and pr-title jobs`.
4. **Dependency updates** (local): Dependabot or Renovate. Commit: `ci: add Dependabot`.
5. **Review scaffolding** (local): PR template, `CODEOWNERS`. Commit: `chore: add PR template and CODEOWNERS`.
6. **Releases** (local): release-please config, manifest and workflow, seeded from the current version. Commit: `chore: add release-please`.
7. **Architecture tests** (local), pointed at the real layer and helper folders. Commit: `test: add architecture tests`.
8. **Local stack** (local, optional, each piece opt-in): a `compose.yaml` with the database, cache or broker the code uses, Prometheus and Grafana with a provisioned dashboard, Portainer, and the app's `/metrics` endpoint. Commits: `chore: add local stack with docker compose` and `feat: expose prometheus metrics` (the endpoint changes the app, so it is a `feat`). See [references/local-stack.md](references/local-stack.md).
9. **Agent rulebook** (local, last, so it only describes files that now exist): `AGENTS.md`, `CLAUDE.md` importing it, and pointers only for agents the repo already has files for. Commit: `docs: add AGENTS.md`.
10. **Push and open the PR** (outward): ask first.
11. **After the PR's checks have run once** (outward, each asked separately): the `RELEASE_PLEASE_TOKEN` secret, squash-only merges, the ruleset.

The user may pick a subset. Skip anything already present and correct. If the repo has no remote, stop after step 9 and list steps 10 and 11 as pending.

### 4. Apply

Work through the approved steps, one commit each, with the messages from the plan.

- **Existing files win.** Extend an existing workflow instead of adding a second one that runs the same thing; keep its file name and workflow name. Rename its main job to `verify` unless something references the old name (search the repo for it, and ask the user when branch protection is unknown, because a required check named after the old job would block every PR).
- **No new tools in the setup PR.** Do not add a linter, type checker, formatter or test runner the repo does not already have; list them as follow-ups. Verify runs what exists, even if that is only the tests.
- **Runtimes stay as they are.** Pin the version the repo already uses. If it is past end of life, say so in the gap table as a follow-up; do not upgrade it in the setup PR.
- **Existing versions are kept.** Seed `.release-please-manifest.json` with the current version (not `0.0.0`) and set `bootstrap-sha` to the current commit, so the first changelog does not sweep in all history. See [references/stack-templates.md](references/stack-templates.md).
- **Existing release tooling wins.** If the repo uses semantic-release, changesets or GitVersion and it works, keep it and only check that Conventional Commit PR titles feed it. Propose a switch to release-please only when the user asks.
- **Existing agent rules are merged, not replaced.** Move the content of `CLAUDE.md`, `.cursor/rules` or `copilot-instructions.md` into `AGENTS.md`, then make the others point to it (see [references/agents-md.md](references/agents-md.md)). Show the user the diff.
- **Write `AGENTS.md` from the repo**, never from a generic template: the real commands, folders, layers, naming and domain rules you found.
- **Architecture tests start green.** Encode the layering the code already follows. If the code violates a rule the user wants, list the current offenders as known exceptions (the template in [references/stack-templates.md](references/stack-templates.md) has the pattern, including a test that fails once an exception is fixed so the list shrinks), and record a follow-up in the PR body, or as an issue when there is a remote and the user agrees.
- **The local stack is local.** Pin every image tag, bind every port to `127.0.0.1`, read credentials from `.env`, and keep optional services behind compose profiles. Portainer mounts the Docker socket, which is root-equivalent: say so when proposing it, and never add it to a compose file used on a shared or production host. Ask before the first `docker compose up` (it pulls images) and before installing a metrics library. The metrics library is imported only by infrastructure.
- **A secret in git is reported at once.** Tell the user immediately, before continuing: which file, which variable names, which commits. Say the value must be **rotated** whether or not the PR is ever merged, because it stays in history. Then continue with the setup: untrack the file with `git rm --cached` in its own commit. Rewriting history (`git filter-repo`) is an outward, destructive step: mention it as optional and never do it yourself.

Templates: the shared ones (CI workflow, ruleset, PR template, release-please, `.env`, `lib`, architecture-test helper) are in [references/arg-base.md](references/arg-base.md) sections 2 to 4. The per-stack parts are in [references/stack-templates.md](references/stack-templates.md).

### 5. Verify

1. Run the verify command and the new architecture tests locally. Both must pass.
2. Validate the workflows: `actionlint` if available, else check the YAML parses and every referenced script exists. For a local stack, run `docker compose config --quiet`, and with the user's approval start it and check the steps in [references/local-stack.md](references/local-stack.md#verify).
3. Check `git status`, `git diff --cached` and `git ls-files` for `.env` files or keys, without printing their values.
4. Ask before pushing. Then open one PR titled `chore: set up the ARG base` with a body that has the gap table (before and after), what was skipped and why, and the outward steps still waiting for the user.
5. **Never merge it.** Give the user the link.

### 6. Finish the outward steps

Only after the user approves each one, and only after the PR's checks have run at least once (a required check that never ran blocks every PR):

- **Release token.** Ask the user to create a fine-grained token or GitHub App token (contents and pull requests read/write) and store it with `gh secret set RELEASE_PLEASE_TOKEN`. You never see or handle the value.
- **Merge settings**: `gh repo edit --enable-squash-merge --enable-merge-commit=false --enable-rebase-merge=false --delete-branch-on-merge`.
- **Ruleset**: the `gh api` call in [references/arg-base.md](references/arg-base.md) section 2.2, with the real check names. For a solo developer, set the required approvals to `0` and keep the PR and checks.

Report what was applied and what the user still has to do by hand.

---

## 2. Not on GitHub

The procedure is the same; the files change:

| Piece | GitLab | Azure DevOps | Bitbucket |
| --- | --- | --- | --- |
| CI | `.gitlab-ci.yml` with `verify` and an MR-title job | `azure-pipelines.yml` | `bitbucket-pipelines.yml` |
| Gate | protected branch + "pipelines must succeed" + squash | branch policies: build validation, minimum reviewers, squash | branch restrictions + merge checks |
| Releases | release-please CLI in a pipeline job, or semantic-release | release-please CLI, or GitVersion | release-please CLI, or semantic-release |
| PR template | `.gitlab/merge_request_templates/Default.md` | `.azuredevops/pull_request_template.md` | repository default description |

Use the platform's CLI (`glab`, `az repos`) only with the user's approval, the same as `gh`.

## 3. Boundaries

- **Never** merge a PR, push to the default branch, force-push, delete branches, or change repository settings, rulesets or secrets without the user's explicit approval for that specific action.
- Never read, print or store secret values. Ask the user to set secrets themselves.
- Do not change application behaviour. The setup PR adds pipeline, rules and tests; if verify needs a code fix to pass, that is a separate `fix/` PR.
- Do not install a different package manager, runtime or monorepo tool. Work with what the repo uses.

---

## References

| File | Read it when |
| --- | --- |
| [references/arg-base.md](references/arg-base.md) | you need the shared templates: CI workflow, ruleset, PR template, release-please, `.env`, `lib`, architecture-test helper |
| [references/detection.md](references/detection.md) | detecting the stack and commands, and judging each piece of the gap table |
| [references/stack-templates.md](references/stack-templates.md) | filling the CI verify steps, release type, runtime pin, update bot and architecture tests for the detected stack |
| [references/local-stack.md](references/local-stack.md) | adding Docker Compose for the database, Prometheus and Grafana, Portainer, and the app's `/metrics` endpoint |
| [references/agents-md.md](references/agents-md.md) | writing `AGENTS.md`, wiring `CLAUDE.md`, Cursor, Copilot and Codex to it, and merging existing agent rules |

## Setup checklist

- [ ] Default branch, stack, commands and existing tooling detected; baseline verify run.
- [ ] Gap table shown with present / partial / missing / unknown and evidence; stack skill recommended.
- [ ] Plan approved; work on `chore/project-setup`, one Conventional Commit per piece.
- [ ] Nothing existing overwritten; agent rules merged into `AGENTS.md`.
- [ ] Verify and architecture tests pass locally; workflows validated; no secrets staged.
- [ ] Local stack (if chosen): images pinned, ports on `127.0.0.1`, credentials in `.env`, optional services in profiles, Portainer's socket risk explained, `/metrics` only behind infrastructure, `docker compose config` passes.
- [ ] PR opened only after approval, with before/after gap table; not merged.
- [ ] Token, merge settings and ruleset applied only after approval and after checks ran once.

---

## About

This skill is maintained by **[ARG Software](https://arg.software)**. It is the setup we run on day one of every project, packaged so any team can get the same pipeline in one PR. Want help modernising a legacy repo or its delivery pipeline? Visit [arg.software](https://arg.software).
