<!-- Generated from shared/arg-base.md by scripts/sync-base.mjs. Edit the shared file, not this copy. -->

# ARG base: full reference

This file is identical in every ARG skill. The skill's `SKILL.md` has a **Stack profile** table that fills in the stack-specific parts, and this file refers to them:

| Term used here | Meaning |
| --- | --- |
| **verify** | the one command that runs everything CI runs: lint, type-check, architecture tests, tests, build |
| **lib folder** | where the dependency-free, domain-neutral helpers live |
| **arch-test tool** | how the layer rules are enforced (an import-scanning test, Nx module boundaries, NetArchTest, ...) |
| **config module** | the single place that reads environment variables |
| **release type** | the release-please strategy and the files that carry the version |

Sections:
1. Git workflow
2. Project setup
3. The `lib` folder
4. Architecture tests
5. Clean code
6. Testing
7. Documentation
8. Checklists

---

## 1. Git workflow

### 1.1 Before touching code

1. Detect the default branch:
   ```bash
   gh repo view --json defaultBranchRef -q .defaultBranchRef.name 2>/dev/null \
     || git symbolic-ref --short refs/remotes/origin/HEAD 2>/dev/null | sed 's#^origin/##' \
     || echo main
   ```
2. Check the current branch with `git branch --show-current`.
3. If you are on the default branch, or on a branch for different work, **advise a new branch and ask before creating it**:

   | Work type | Branch name |
   | --- | --- |
   | New feature | `feature/<short-slug>` |
   | Bug fix | `fix/<short-slug>` (or `bugfix/<short-slug>`) |
   | Urgent production fix | `hotfix/<short-slug>` |
   | Refactor, no behaviour change | `refactor/<short-slug>` |
   | Tooling, dependencies, docs | `chore/<short-slug>` / `docs/<short-slug>` |

   ```bash
   git switch <default-branch> && git pull --ff-only
   git switch -c feature/<short-slug>
   ```
4. Never commit directly to the default branch. Never force-push a shared branch.

### 1.2 Conventional Commits

Versions are calculated from commit messages, so every commit and **every PR title** follows [Conventional Commits](https://www.conventionalcommits.org):

```
<type>(<optional scope>): <imperative summary>

feat(billing): add invoice export
fix(auth): refresh the token before it expires
feat(api)!: rename the order endpoints        <- breaking change
```

| Type | Use for | Release |
| --- | --- | --- |
| `feat` | new user-visible behaviour | minor |
| `fix` / `perf` | bug fixes, performance | patch |
| `feat!` / `fix!`, or a `BREAKING CHANGE:` footer | removed or changed behaviour, API/storage/message format changes, anything users must migrate | major |
| `refactor`, `docs`, `test`, `chore`, `ci`, `build`, `style` | no user-visible change | none |

- Repositories use **squash merge only**, so the PR title becomes the single commit that release-please reads.
- If you are unsure whether a change is breaking, **ask the user**. Never mark or hide a breaking change on your own.
- In a monorepo, the scope names the package or app so each changelog stays accurate. Split a change that touches unrelated packages into separate PRs.

### 1.3 Finishing the work

1. Run **verify** locally.
2. Commit in small, meaningful commits. The subject says *what* changes, in the imperative. The body says *why*.
3. Push and open the pull request:
   ```bash
   git push -u origin HEAD
   gh pr create --base <default-branch> --title "<type>(<scope>): <summary>" --body-file <pr-body.md> \
     --reviewer <teammate>      # solo developer: --assignee @me
   ```
   The PR body has these sections:
   - **Summary**
   - **Why**
   - **How it was tested**
   - **Layer impact**: which layers changed, and any new ports or adapters
   - **Screenshots**, for UI changes
4. **Every PR needs a human review.** The reviewer can be a teammate, or the user reviewing their own diff. Never merge the PR yourself, and never use admin bypass. Give the user the PR link and say it is waiting for review.
5. After the merge, run:
   ```bash
   git switch <default-branch> && git pull --ff-only && git branch -d <branch>
   ```

---

## 2. Project setup

When a project is new, or one of these pieces is missing, propose adding it on a `chore/project-setup` branch.

### 2.1 CI workflow

Create `.github/workflows/ci.yml` and replace `main` with the detected default branch. The `verify` job runs the stack's verify steps; the SKILL.md has the exact steps. The `pr-title` job rejects PR titles that are not Conventional Commits.

```yaml
name: CI

on:
  pull_request:
    types: [opened, edited, synchronize, reopened]
  push:
    branches: [main]

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

permissions:
  contents: read

jobs:
  verify:
    name: verify
    runs-on: ubuntu-latest
    timeout-minutes: 20
    steps:
      - uses: actions/checkout@v4
      # stack setup + verify steps from the skill's Stack profile go here

  pr-title:
    name: pr-title
    if: github.event_name == 'pull_request'
    runs-on: ubuntu-latest
    permissions:
      pull-requests: read
    steps:
      - uses: amannn/action-semantic-pull-request@v5
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

- Keep the job names `verify` and `pr-title` stable, because the ruleset requires them by name.
- Pin the runtime version (`.nvmrc`, `global.json`, `packageManager`) and read it in CI instead of repeating it.
- Add a dependency update bot (Dependabot or Renovate) for packages, GitHub Actions and Docker images.

### 2.2 Protect the default branch with a ruleset (ask the user first)

A ruleset makes the CI gate real. Ask the user, then run:

```bash
gh api -X POST "repos/{owner}/{repo}/rulesets" --input - <<'JSON'
{
  "name": "protect-default-branch",
  "target": "branch",
  "enforcement": "active",
  "conditions": { "ref_name": { "include": ["~DEFAULT_BRANCH"], "exclude": [] } },
  "bypass_actors": [],
  "rules": [
    { "type": "deletion" },
    { "type": "non_fast_forward" },
    {
      "type": "pull_request",
      "parameters": {
        "required_approving_review_count": 1,
        "dismiss_stale_reviews_on_push": true,
        "require_code_owner_review": false,
        "require_last_push_approval": false,
        "required_review_thread_resolution": true,
        "allowed_merge_methods": ["squash"]
      }
    },
    {
      "type": "required_status_checks",
      "parameters": {
        "strict_required_status_checks_policy": true,
        "required_status_checks": [{ "context": "verify" }, { "context": "pr-title" }]
      }
    }
  ]
}
JSON
gh repo edit --enable-squash-merge --enable-merge-commit=false --enable-rebase-merge=false --delete-branch-on-merge
```

- **Solo developers:** GitHub does not let authors approve their own PRs, so set `required_approving_review_count` to `0`. Keep the PR requirement and the required checks. The user still reviews their own diff before merging.
- The same settings are available in the UI under **Settings → Rules → Rulesets**.
- A required check that never runs blocks every PR, so add each check to the ruleset only after it has run once.

### 2.3 Review scaffolding

- `.github/pull_request_template.md` with the PR body sections from 1.3, plus a checklist: verify passed, architecture tests extended, `.env.example` updated, docs updated, breaking change marked.
- `.github/CODEOWNERS` (for example `* @org/team`), so reviewers are requested automatically.

### 2.4 One rulebook for every agent

- `AGENTS.md` at the repo root is the single, authoritative rulebook: commands, layering, naming, and domain rules. Codex, OpenCode, Cursor and Copilot read it natively.
- `CLAUDE.md` contains `@AGENTS.md` plus a short quick reference, so the rules are never duplicated.
- `.github/copilot-instructions.md` and Cursor rules point to `AGENTS.md` instead of repeating it.
- Update `AGENTS.md` in the same PR as the code whenever a rule changes.

### 2.5 Versioning and releases with release-please

Versions follow [Semantic Versioning](https://semver.org) and are calculated from the Conventional Commits merged into the default branch:

| Merged since the last release | Next version |
| --- | --- |
| only `fix` / `perf` | patch: `1.4.2` → `1.4.3` |
| at least one `feat` | minor: `1.4.2` → `1.5.0` |
| at least one breaking change | major: `1.4.2` → `2.0.0` |
| only `docs`, `chore`, `test`, `ci`, `refactor` | no release |

[release-please](https://github.com/googleapis/release-please) (free and open source) opens or updates a **Release PR** after every merge, containing the next version and the changelog. **Merging the Release PR is the release**: it tags the version and creates the GitHub release. A human reviews and merges it, never the agent.

`release-please-config.json` (single package; the Stack profile gives the release type and any `extra-files`):

```json
{
  "$schema": "https://raw.githubusercontent.com/googleapis/release-please/main/schemas/config.json",
  "packages": {
    ".": {
      "release-type": "node",
      "bump-minor-pre-major": true,
      "include-component-in-tag": false
    }
  }
}
```

`.release-please-manifest.json`: `{ ".": "0.0.0" }`. The first `feat` merge then proposes `0.1.0`. For a monorepo, add one package per deployable, set `"separate-pull-requests": true`, and tag releases `<component>-vX.Y.Z`.

`.github/workflows/release.yml`:

```yaml
name: Release

on:
  push:
    branches: [main]

permissions:
  contents: write
  pull-requests: write
  issues: write

jobs:
  release-please:
    runs-on: ubuntu-latest
    steps:
      - id: release
        uses: googleapis/release-please-action@v4
        with:
          token: ${{ secrets.RELEASE_PLEASE_TOKEN }}
          config-file: release-please-config.json
          manifest-file: .release-please-manifest.json
      # build and attach artifacts only when a release was created:
      # if: ${{ steps.release.outputs.release_created }}
```

Rules and gotchas:

- **Release token.** A PR opened with the default `GITHUB_TOKEN` does not trigger other workflows, so the required checks would never run on the Release PR and it could never be merged. Ask the user to create a fine-grained personal access token or a GitHub App token (contents and pull requests: read/write) and store it as the `RELEASE_PLEASE_TOKEN` secret.
- **Any other file that carries the version** is listed in `extra-files`: JSON files with a `jsonpath`, or any text file with an `x-release-please-version` comment on the version line. A test checks that all copies match.
- **Pre-1.0.** With `bump-minor-pre-major`, a breaking change bumps the minor while the version is `0.x`. Releasing `1.0.0` is a deliberate decision: add a `Release-As: 1.0.0` footer when the product is first stable.
- **Nobody hand-edits versions.** release-please owns them.
- **Deployment and store uploads** happen after the release, in a separate reviewed workflow or as a human step.

### 2.6 Environment variables and secrets

| File | Tracked in git? | Contents |
| --- | --- | --- |
| `.env.example` | **yes** | every variable, with a dummy or empty value and a comment each |
| `.env` | **no** | the real values for this machine |
| `.env.local`, `.env.*.local` | **no** | personal overrides |

Keep the tracked template named `.env.example`. Tools treat `*.local` files as private overrides, so committing a file with that name invites someone to put real secrets in a tracked file.

1. Add to `.gitignore`:
   ```gitignore
   .env
   .env.*
   !.env.example
   ```
2. Document `cp .env.example .env` in the README quick start.
3. Read environment variables **only in the config module**. It validates required values, fails fast with a clear message, and exports typed values. The composition root passes them on. An architecture test forbids reading the environment anywhere else.
4. A config test checks that every key in `.env.example` is read by the config module, and that every variable the module reads is listed in `.env.example`.
5. In CI, real values come from repository or environment secrets. Never echo them into logs.
6. Before committing, check `git status` and `git diff --cached` for `.env` files or pasted keys. If a real secret was ever committed, tell the user to **rotate it**. Removing it from history is not enough.
7. **Anything bundled into client code is public**: browser apps, extensions and mobile apps. `.env` keeps values out of git, not out of the shipped bundle. Only public-by-design values go into client builds. Real secrets stay on a server.

---

## 3. The `lib` folder

The lib folder holds small, **dependency-free, domain-neutral** mechanics that several layers reuse: truncating or normalizing strings, pluralizing, clamping and rounding numbers, de-duplicating arrays, type guards, URL parsing, date formatting, and abort or retry helpers.

- **Search it before writing any small helper.** If an equivalent exists, use it. Never keep a private copy, and never write a one-line wrapper that only renames a lib function.
- **A helper goes in `lib` only when it is generic *and* has more than one consumer.** Being pure or short is not enough. Business policy (thresholds, pricing, scoring, vendor knowledge) stays with the feature that owns it.
- **`lib` imports nothing but `lib`**: no layers and no third-party packages. An architecture test enforces this.
- Group helpers by topic (`text`, `numbers`, `arrays`, `url`, `guards`, `dates`), never a `utils` dumping ground.
- Keep feature-local helpers inside the feature.
- Every lib function has unit tests, including edge cases (empty input, boundaries, Unicode).

---

## 4. Architecture tests

Every rule in the skill's layer table is an automated check that runs in CI.

- **One rule per test, with a descriptive name**, for example `"domain must not import infrastructure"`. A failure lists the offending `file -> import` pairs, not just `false`.
- **Resolve both path aliases and relative imports.** A `../../infrastructure/x` escape must fail just like `@infrastructure/x`. Do not use ArchUnitTS's built-in `dependOnFiles()` for cross-layer rules: it does not resolve tsconfig path aliases (LukasNiessen/ArchUnitTS#88), so it passes silently on real violations.
- **Package-ownership rules** keep libraries contained: only the persistence adapter may import the ORM, and only the HTTP adapter may import the HTTP client.
- **Structural rules** check naming and placement: repositories implement their interfaces and live in infrastructure, and interfaces for ports are never declared in infrastructure.
- **When you add a layer, alias, project or package**, extend the rules in the same PR.

For JavaScript and TypeScript projects without a boundary tool, this dependency-free helper works with Jest, Vitest and `node:test`. Adjust `LAYERS` and `SOURCE_ROOT` to the project:

```js
// test/architecture/layers.js
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const SOURCE_ROOT = "src";
const LAYERS = ["domain", "application", "infrastructure", "presentation", "bootstrap", "lib"];
const ALIASES = Object.fromEntries(LAYERS.map((layer) => [`@${layer}`, layer]));
export const EXTERNAL = "external";
export const OUTSIDE = "outside-src";

export function filesUnder(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return filesUnder(path);
    return /\.(ts|tsx|js|jsx|mjs)$/.test(name) ? [path.replace(/\\/g, "/")] : [];
  });
}

export function stripComments(code) {
  return code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:\\'"])\/\/[^\n]*$/gm, "$1");
}

export function importSpecifiers(code) {
  const patterns = [
    /\bfrom\s+["']([^"']+)["']/g,
    /\bimport\s+["']([^"']+)["']/g,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
    /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g,
  ];
  const source = stripComments(code);
  return patterns.flatMap((pattern) => [...source.matchAll(pattern)].map((match) => match[1]));
}

function resolveRelative(specifier, filePath) {
  const segments = filePath.split("/").slice(0, -1);
  for (const part of specifier.split("/")) {
    if (part === "..") segments.pop();
    else if (part !== "." && part !== "") segments.push(part);
  }
  return segments.join("/");
}

export function layerOf(specifier, filePath) {
  if (specifier.startsWith(".")) {
    const inside = new RegExp(`^${SOURCE_ROOT}/([^/]+)/`).exec(resolveRelative(specifier, filePath));
    return inside && LAYERS.includes(inside[1]) ? inside[1] : OUTSIDE;
  }
  const alias = /^(@[a-z-]+)(\/|$)/.exec(specifier);
  return alias && ALIASES[alias[1]] ? ALIASES[alias[1]] : EXTERNAL;
}

/** `file -> import` pairs in `<SOURCE_ROOT>/<layer>` that import any of `forbidden` (layers, EXTERNAL, or OUTSIDE). */
export function violations(layer, forbidden) {
  return filesUnder(`${SOURCE_ROOT}/${layer}`).flatMap((file) =>
    importSpecifiers(readFileSync(file, "utf8"))
      .filter((specifier) => forbidden.includes(layerOf(specifier, file)))
      .map((specifier) => `${file} -> ${specifier}`),
  );
}

/** Files outside `allowedLayers` whose code (comments stripped) matches `pattern`, e.g. /\bprocess\.env\b/. */
export function usagesOutside(allowedLayers, pattern) {
  return LAYERS.filter((layer) => !allowedLayers.includes(layer)).flatMap((layer) =>
    filesUnder(`${SOURCE_ROOT}/${layer}`).filter((file) => pattern.test(stripComments(readFileSync(file, "utf8")))),
  );
}
```

```js
// test/architecture/layers.test.js
import { EXTERNAL, OUTSIDE, usagesOutside, violations } from "./layers";

describe("architecture: dependencies point inward", () => {
  test("domain must not import any other layer", () => {
    expect(violations("domain", ["application", "infrastructure", "presentation", "bootstrap"])).toEqual([]);
  });
  test("domain must not import packages", () => {
    expect(violations("domain", [EXTERNAL, OUTSIDE])).toEqual([]);
  });
  test("application must not import infrastructure, presentation or bootstrap", () => {
    expect(violations("application", ["infrastructure", "presentation", "bootstrap"])).toEqual([]);
  });
  test("lib stays dependency-free", () => {
    expect(violations("lib", ["domain", "application", "infrastructure", "presentation", "bootstrap", EXTERNAL, OUTSIDE])).toEqual([]);
  });
  test("only the config module reads the environment", () => {
    expect(usagesOutside(["infrastructure"], /\b(process\.env|import\.meta\.env)\b/)).toEqual([]);
  });
});
```

---

## 5. Clean code

- **Name files and types by role**, following the local convention: `*.usecase`, `*.policy`, `*.repository`, `*.gateway`, `*.adapter`, `*.service`, `*.controller`, `*.mapper`, or the stack's equivalents.
- **No abstraction for a single use.** Inline single-use code. Extract a private function only when it is used more than once, or when the host function would grow too big. Real replaceable ports (repositories, gateways, runtimes, external services) do deserve interfaces.
- **No renaming aliases** (`type NewName = ExistingName`). Use the canonical type.
- **Constants belong to policy or config**, never as magic numbers inside classes or UI.
- **Compute and explain separately.** Code that computes a result produces data. Messages, recommendations and user copy come from a separate step. The UI renders statuses verbatim and never re-derives them from text.
- **Errors are values at the boundaries.** Expected failures (not found, validation, conflict) are typed results or typed errors that each adapter maps to its protocol. Unexpected errors are logged with context and never leak internals to users.
- **Functions do one thing at one level of abstraction.** Names reveal intent, and comments explain *why*, not *what*.
- **Prefer precise evidence over broad heuristics.** Several specific checks beat one loose regular expression.
- **Delete dead code** instead of commenting it out. Git remembers it.

---

## 6. Testing

- **Test behaviour at the boundary that owns it.** Domain rules get unit tests. Use cases get tests with fake ports. Adapters get focused tests against the real technology (Testcontainers, an in-memory server, mocked platform APIs). Never monkey-patch private methods to reproduce a lower layer.
- **Architecture tests** and **config parity tests** run in CI on every PR.
- **Every bug fix starts with a failing test** that reproduces the bug.
- **No placeholder tests.** An empty test or `expect(true)` is worse than none, because it makes coverage lie.
- **Real-world data, replayed offline.** Capture real inputs once into fixtures, store reviewed expected results beside them, and replay them in CI. CI never depends on the live network.
- **Generated data is never hand-edited.** It comes from a script, and a scheduled workflow can regenerate it and open a PR for review.
- **Tests are deterministic.** Inject the clock, random sources and IDs. Never sleep to wait for something; wait for a condition with a timeout.

---

## 7. Documentation

- `README.md` is a short landing page: what the project is, a quick start (including `cp .env.example .env`), the commands, and links. Every command it lists must exist.
- `docs/` holds the detail: `architecture.md`, `development.md`, `conventions.md`, and a doc per domain area. Update docs in the same PR as the behaviour they describe.
- `AGENTS.md` is the single rulebook for coding agents (2.4).
- `CHANGELOG.md` is generated by release-please. Never edit it by hand.
- User-facing copy uses one consistent style throughout.

---

## 8. Checklists

### New feature
- [ ] On a fresh `feature/<slug>` branch cut from an up-to-date default branch.
- [ ] Identified the owning layer for each part: domain rule, use case, port, adapter, UI.
- [ ] Ports are declared inward, implementations live in infrastructure, and both are registered in the composition root.
- [ ] Checked the lib folder for existing helpers, and added a new helper only if it is generic with several consumers.
- [ ] Thresholds and limits are in policy or config.
- [ ] Unavailable data surfaces as unknown, not as failure.
- [ ] Tests at the owning boundary. Architecture rules extended if a layer, alias, project or package was added.
- [ ] New configuration added to `.env.example` and read through the config module. No real values committed.
- [ ] PR title `feat(<scope>): ...`, with `!` or `BREAKING CHANGE:` if it breaks users (ask when unsure).
- [ ] `AGENTS.md` / `docs/` updated if a rule or behaviour changed.

### Bug fix
- [ ] On a `fix/<slug>` (or `bugfix/` / `hotfix/`) branch.
- [ ] A failing test reproduces the bug first.
- [ ] Fixed the root cause in the owning layer, not with a workaround at the edge.
- [ ] The test passes, and nothing else changed behaviour.
- [ ] PR title `fix(<scope>): ...`.

### Before opening the PR
- [ ] **verify** passes locally.
- [ ] Exercised the change for real (ran the app, called the endpoint, loaded the build).
- [ ] `git diff --cached` contains no `.env` file and no real keys.
- [ ] Pushed the branch and opened the PR with Summary / Why / How tested / Layer impact.
- [ ] Requested a reviewer (a teammate or the user).
- [ ] Did not merge it yourself.

### Releasing
- [ ] The version on the Release PR matches what was merged: fix → patch, feat → minor, breaking → major.
- [ ] Read the generated changelog, and fix unclear entries by editing the Release PR.
- [ ] CI is green on the Release PR.
- [ ] A human merges it. The agent never merges it.
- [ ] Artifacts, images or store packages carry the same version as the tag.
