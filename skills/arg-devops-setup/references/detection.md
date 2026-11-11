# Detection and the gap table

How to read a repository before changing it: find the stack, the commands, and what each piece of the ARG base looks like today.

## Contents

- [Stack signals](#stack-signals)
- [Finding the commands](#finding-the-commands)
- [The pieces and how to judge them](#the-pieces-and-how-to-judge-them)
- [Gap table format](#gap-table-format)

## Stack signals

Check from the repo root. A repo can match several rows (a .NET API with a TypeScript front end); handle each part, and use one CI workflow with a job per part or a matrix.

| Signal | Stack | Package manager / tool |
| --- | --- | --- |
| `package.json` + `pnpm-lock.yaml` / `yarn.lock` / `package-lock.json` / `bun.lockb` | Node / TypeScript | pnpm / yarn / npm / bun (also `packageManager` in `package.json`) |
| `nx.json` | Nx monorepo | the lock file's manager; `nx affected` in CI |
| `turbo.json`, `pnpm-workspace.yaml`, `workspaces` in `package.json` | JS monorepo | Turborepo / workspaces |
| `angular.json` | Angular | see `arg-angular` |
| `app.json` with `expo`, `metro.config.js` | React Native / Expo | see `arg-react-native` |
| `manifest.json` with `manifest_version: 3` | browser extension | see `arg-browser-extension` |
| `*.sln`, `*.slnx`, `*.csproj`, `global.json`, `Directory.Build.props` | .NET | `dotnet` CLI; central package management if `Directory.Packages.props` |
| `pyproject.toml`, `uv.lock`, `poetry.lock`, `requirements*.txt` | Python | uv / poetry / pip |
| `go.mod` | Go | `go` CLI |
| `Cargo.toml`, `Cargo.lock` | Rust | `cargo`; workspace if `[workspace]` |
| `pom.xml`, `build.gradle(.kts)` | Java / Kotlin | Maven / Gradle (use the stack-neutral rows of this skill; templates are not included) |

Runtime version files: `.nvmrc`, `.node-version`, `packageManager`, `global.json`, `.python-version`, `go.mod`'s `go` line, `rust-toolchain.toml`. If none exists, propose one and read it in CI.

## Finding the commands

In this order, stop at the first source that answers:

1. The existing CI workflow's main job: the steps it runs are the de facto verify.
2. `AGENTS.md`, `CLAUDE.md`, `CONTRIBUTING.md`, README "development" sections.
3. Scripts: `package.json` `scripts` (`lint`, `typecheck`, `test`, `build`, `check`, `verify`), `Makefile` / `justfile` / `Taskfile.yml` targets, `nx.json` target defaults, `pyproject.toml` `[tool.*]` sections.
4. Stack defaults in [stack-templates.md](stack-templates.md).

If the repo has no single verify entry point, propose one (`npm run verify`, `make verify`, `just verify`) that chains lint, typecheck, test and build, so humans, agents and CI run the same thing.

Run the commands once before changing anything. Record which pass, which fail, and which need services (a database, Docker). A failing baseline goes in the gap table; fixing application code is a separate PR.

## The pieces and how to judge them

| Piece | Present when | Partial when | Where to look |
| --- | --- | --- | --- |
| **CI verify** | a workflow runs the full verify on pull requests and on pushes to the default branch | it runs only some steps, only on push, or on a branch that is not the default | `.github/workflows/*.yml` (`on:` and job steps) |
| **PR-title check** | a job rejects non-Conventional-Commit PR titles | commitlint runs on commits but not on the PR title (squash merges use the title) | workflows, `commitlint.config.*` |
| **Ruleset / branch protection** | the default branch requires a PR, the CI checks by name, and blocks force-push and deletion | some of those rules, or classic branch protection without required checks | `gh api repos/{owner}/{repo}/rulesets`, `gh api repos/{owner}/{repo}/branches/<default>/protection` |
| **Squash-only merges** | only squash is allowed and branches auto-delete | squash allowed alongside merge commits or rebase | `gh repo view --json squashMergeAllowed,mergeCommitAllowed,rebaseMergeAllowed,deleteBranchOnMerge` |
| **PR template** | `.github/pull_request_template.md` with summary, testing and a checklist | a template without the checklist | `.github/` |
| **CODEOWNERS** | owners cover `*` or every top-level folder | owners for some paths only | `.github/CODEOWNERS`, `CODEOWNERS`, `docs/CODEOWNERS` |
| **Agent rulebook** | `AGENTS.md` holds the rules; `CLAUDE.md` imports it; other agent files point to it | rules duplicated across files, or only `CLAUDE.md` / `.cursor/rules` | root, `.cursor/rules/`, `.github/copilot-instructions.md`, `.windsurfrules` |
| **Releases** | release-please (or a working equivalent) driven by Conventional Commits, with a token that triggers checks | release-please with the default `GITHUB_TOKEN` (Release PRs never get checks), or versions edited by hand | `release-please-config.json`, `.releaserc*`, `.changeset/`, `GitVersion.yml`, `gh secret list` |
| **Dependency updates** | Dependabot or Renovate for packages and GitHub Actions | packages only | `.github/dependabot.yml`, `renovate.json` |
| **`.env` hygiene** | tracked `.env.example`, `.gitignore` ignores `.env` and `.env.*` except the example, nothing secret tracked | example missing or out of date; `.env.local` tracked | `git ls-files | grep -i env`, `.gitignore` |
| **Verify entry point** | one command (`npm run verify`, `make verify`) runs everything CI runs | CI runs steps that no local command chains together | `package.json` scripts, `Makefile`, `justfile` |
| **Runtime pin** | a version file that CI reads (`.nvmrc`, `global.json`, `.python-version`, `go.mod`, `rust-toolchain.toml`) | CI hard-codes a version, or the pinned version is past end of life (flag it; upgrading is a follow-up) | root files, `setup-*` steps in workflows |
| **Config module** | one module reads the environment and validates it | environment read in many places | `rg -n "process\.env|import\.meta\.env|Environment\.GetEnvironmentVariable|os\.environ|os\.Getenv|std::env::var"` (without ripgrep: `grep -rnE` with the same pattern, excluding `node_modules`, `bin`, `obj`, `target`, `.venv`) |
| **lib folder** | a dependency-free folder of generic helpers | a `utils` dumping ground, or helpers copied between features | `src/lib`, `libs/shared`, `utils/`, `helpers/`, `common/` |
| **Architecture tests** | layer rules run in CI and fail on violations | a boundary tool installed but not in CI, or rules that do not resolve aliases | `test/architecture`, `*ArchitectureTests*`, eslint boundary rules, `.importlinter`, `.go-arch-lint.yml` |
| **Local services** (optional) | a compose file or dev container starts every database, cache and broker the code uses, with pinned images and credentials from `.env` | some services missing, `latest` tags, hard-coded passwords, ports open on all interfaces | `compose.yaml`, `docker-compose*.yml`, `.devcontainer/`; service signals in [local-stack.md](local-stack.md#detecting-the-services) |
| **Observability** (optional, services only) | the app exposes `/metrics` and a local Prometheus and Grafana scrape and show it | metrics endpoint without a local stack, or a stack with nothing to scrape | `prom-client`, `OpenTelemetry.*`, `prometheus_client`, `client_golang`; `ops/`, `prometheus.yml`, Grafana provisioning |
| **Container UI** (optional) | Portainer (or the team's choice) in a `tools` profile, bound to `127.0.0.1` | Portainer exposed on all interfaces or in a production compose file | compose files |
| **Line endings** | `.gitattributes` sets `* text=auto` (and `eol=lf` for scripts) | missing in a repo edited on Windows and Unix, where git warns about CRLF conversion | `.gitattributes` |

Remote settings you cannot read (no `gh` auth, no admin rights) are **unknown**, never missing.

## Gap table format

```markdown
## DevOps setup: <repo>

Stack: TypeScript (pnpm 9, Node 22 from .nvmrc), Vitest, ESLint. Default branch: `develop`.
Baseline verify: `pnpm lint` pass, `pnpm test` pass, `pnpm build` fail (missing env var API_URL).

| Piece | Status | Evidence | Proposed action |
| --- | --- | --- | --- |
| CI verify | partial | `.github/workflows/test.yml` runs `pnpm test` on push only | add `pull_request`, lint, typecheck, build; rename job to `verify` |
| Verify entry point | missing | CI runs four separate commands | add `"verify"` script chaining them |
| Runtime pin | partial | CI hard-codes `node-version: 22`; no `.nvmrc` | add `.nvmrc` with `22`, read it in CI |
| PR-title check | missing | - | add `pr-title` job |
| Ruleset | unknown | `gh` not authenticated | check after `gh auth login` |
| Squash-only merges | unknown | same | same |
| PR template | missing | - | add template |
| CODEOWNERS | missing | - | add `* @<team>` (ask which team) |
| Agent rulebook | partial | rules in `CLAUDE.md` only | move to `AGENTS.md`, import from `CLAUDE.md` |
| Releases | missing | version hand-edited in `package.json` | add release-please (`node`) |
| Dependency updates | missing | - | add Dependabot for npm and actions |
| `.env` hygiene | partial | `.env.example` lacks `API_URL`; `.gitignore` ignores `.env` only | add the variable; ignore `.env.*` except the example |
| Config module | partial | `process.env` read in 7 files | follow-up: centralise in `src/infrastructure/config` |
| lib folder | partial | `src/utils/` mixes generic helpers and pricing rules | follow-up refactor; not part of setup |
| Architecture tests | missing | - | add the dependency-free helper with the current layering |

Recommended stack skill: none for this stack; the base rules apply.
```

Mark items that need code changes beyond setup (centralising config, splitting `utils`) as **follow-up**, and leave them out of the setup PR.
