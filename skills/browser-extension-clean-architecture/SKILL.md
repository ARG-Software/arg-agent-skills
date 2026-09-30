---
name: browser-extension-clean-architecture
description: Clean architecture and a disciplined git workflow for browser extensions (Manifest V3, Chrome/Firefox/Safari), including extensions that run AI on the device. Use when starting or scaffolding an extension project, adding a feature, fixing a bug, refactoring, adding a helper or utility, reviewing architecture or layer boundaries, writing architecture tests, setting up CI, environment variables and secrets (.env), versioning, releases, changelogs, Conventional Commits, or preparing a branch and pull request. Enforces domain/application/infrastructure/presentation separation with architecture tests, a dependency-free src/lib folder for reusable helpers, feature/fix branches, reviewed PRs, a CI pipeline that runs the tests before anything reaches the default branch, untracked .env files, and automatic SemVer releases with release-please.
license: MIT
metadata:
  author: ARG Software
  homepage: https://arg.software
  version: 0.1.0 # x-release-please-version
---

# Browser Extension Clean Architecture

Guidance for building browser extensions that stay easy to change after hundreds of features. It was distilled from ARG Architect, a production MV3 extension (Chrome + Firefox) that runs a multilingual AI model entirely on the device.

These rules work with any coding agent: Claude Code, Cursor, Codex, OpenCode, and GitHub Copilot. Commands are plain `git`, `gh`, and `npm`. Wherever a step says "ask the user", stop and get confirmation before doing it.

## Core principles

1. **Dependencies point inward.** Domain knows nothing. Application knows the domain. Infrastructure and presentation sit at the edges.
2. **One composition root.** Only `src/bootstrap/` constructs concrete classes and wires them together.
3. **Architecture is tested, not hoped for.** Every layer rule is an automated test that runs in CI.
4. **Nothing reaches the default branch without a branch, a PR, a review, and green CI.**
5. **Reusable, domain-neutral helpers live in `src/lib/`**, never copied between files.
6. **Unknown is not bad.** If the software could not observe something, say it is unknown. Never report it as a failure.
7. **Versions come from commits.** Conventional Commits + release-please: fix → patch, feature → minor, breaking → major.
8. **Secrets never live in git.** A tracked `.env.example` documents the variables and an untracked `.env` holds the real values.
9. **Follow the local style.** Read the neighbouring files before writing new ones, and match their naming, comment density, and idioms.

---

## 1. Git workflow (apply on every task)

### Before touching code

Every new feature, bug fix, or change starts on its own branch.

1. Detect the default branch. Never assume it is `main`:
   ```bash
   gh repo view --json defaultBranchRef -q .defaultBranchRef.name 2>/dev/null \
     || git symbolic-ref --short refs/remotes/origin/HEAD 2>/dev/null | sed 's#^origin/##' \
     || echo main
   ```
2. Check the current branch: `git branch --show-current`.
3. If you are on the default branch, or on a branch meant for different work, **advise the user to create a new branch** and ask before creating it:

   | Work type | Branch name |
   | --- | --- |
   | New feature | `feature/<short-slug>` |
   | Bug fix | `fix/<short-slug>` (or `bugfix/<short-slug>`) |
   | Urgent production fix | `hotfix/<short-slug>` |
   | Refactor, no behaviour change | `refactor/<short-slug>` |
   | Tooling, deps, docs | `chore/<short-slug>` / `docs/<short-slug>` |

   ```bash
   git switch <default-branch> && git pull --ff-only
   git switch -c feature/<short-slug>
   ```
4. Never commit directly to the default branch. Never force-push a shared branch.

### Commit and PR titles: Conventional Commits

Versions are calculated from commit messages (see §2.6), so every commit and **every PR title** follows [Conventional Commits](https://www.conventionalcommits.org):

```
<type>(<optional scope>): <imperative summary>

feat(popup): add export to PDF
fix(background): stop the queue when the runner window closes
feat(messaging)!: rename the audit actions        <- breaking change
```

| Type | Use for | Release |
| --- | --- | --- |
| `feat` | new user-visible behaviour (`feature/` branches) | minor |
| `fix` / `perf` | bug fixes, performance (`fix/`, `bugfix/`, `hotfix/` branches) | patch |
| `feat!` / `fix!`, or a `BREAKING CHANGE:` footer | removed or changed behaviour, storage/message formats, permissions users must re-grant | major |
| `refactor`, `docs`, `test`, `chore`, `ci`, `build` | no user-visible change | none |

- Repositories use **squash merge only**, so the PR title becomes the single commit on the default branch that the release tool reads. Write the PR title in this format.
- If you are unsure whether a change is breaking, **ask the user**. Never mark or hide a breaking change on your own.

### Finishing the work

1. Run the full verification locally (see [Before opening the PR](#before-opening-the-pr)).
2. Commit in small, meaningful Conventional Commits. The subject says *what* changes, in the imperative, and the body says *why*.
3. Push and open a pull request:
   ```bash
   git push -u origin HEAD
   gh pr create --base <default-branch> --title "<type>(<scope>): <imperative summary>" --body-file <pr-body.md> \
     --reviewer <teammate>      # or, for a solo developer: --assignee @me
   ```
   PR body sections: **Summary**, **Why**, **How it was tested**, **Layer impact** (which layers changed, any new ports/adapters), **Screenshots** (UI changes).
4. **Every PR needs a human review.** It can be a teammate, or the user reviewing their own diff. Never merge the PR yourself, and never use admin bypass. Tell the user the PR is waiting for review and give them the link.
5. After the merge: `git switch <default-branch> && git pull --ff-only && git branch -d <branch>`.

---

## 2. Project bootstrap (first session, or whenever a piece is missing)

On a new project, or when you notice something from this list is missing, propose setting it up. Do it in a `chore/project-setup` branch.

### 2.1 Folder layout

```
src/
  domain/          business models, rules, policies, repository/port interfaces
  application/     use cases, orchestration, messaging protocol, port interfaces for the browser
  services/        UI-facing facade over application use cases (what the popup calls)
  presentation/    popup / options / side-panel UI (React, Svelte, Vue, vanilla...)
  infrastructure/  browser adapters, storage, network gateways, AI runtimes, config
  bootstrap/       composition roots + entry points (popup, background, content scripts)
  lib/             dependency-free, domain-neutral helpers reused across layers
test/
  architecture/    layer-boundary tests
```

Add a path alias per layer in `tsconfig.json` and in the bundler config, then use the aliases for every cross-layer import:

```jsonc
// tsconfig.json → compilerOptions.paths
"@domain/*": ["src/domain/*"],
"@application/*": ["src/application/*"],
"@services/*": ["src/services/*"],
"@presentation/*": ["src/presentation/*"],
"@infrastructure/*": ["src/infrastructure/*"],
"@bootstrap/*": ["src/bootstrap/*"],
"@lib/*": ["src/lib/*"]
```

### 2.2 CI pipeline (tests must pass before anything lands on the default branch)

Create `.github/workflows/ci.yml`. Replace `main` with the detected default branch:

```yaml
name: CI

on:
  pull_request:
  push:
    branches: [main]

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

jobs:
  verify:
    name: verify
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: npm
      - run: npm ci
      - run: npm run lint
      - run: npx tsc --noEmit
      - run: npm run test:architecture
      - run: npm test
      - run: npm run build

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

The `pr-title` job fails any PR whose title is not a Conventional Commit, because that title decides the next version. Also add the matching scripts to `package.json` (`lint`, `test`, `test:architecture`, `build`). If the project targets Firefox, add a `build:firefox` step and `npx web-ext lint --source-dir dist-firefox`.

### 2.3 Protect the default branch (outward-facing: ask the user first)

Branch protection makes the CI gate real. Ask the user, then run:

```bash
gh api -X PUT "repos/{owner}/{repo}/branches/<default-branch>/protection" --input - <<'JSON'
{
  "required_status_checks": { "strict": true, "contexts": ["verify", "pr-title"] },
  "enforce_admins": true,
  "required_pull_request_reviews": { "required_approving_review_count": 1 },
  "restrictions": null
}
JSON
```

**Solo developers:** GitHub does not let authors approve their own PRs. Use `"required_approving_review_count": 0` and keep the PR requirement and the green checks. The user still reviews their own diff in the PR before merging.

Also allow only squash merges, so PR titles drive the versions: `gh repo edit --enable-squash-merge --enable-merge-commit=false --enable-rebase-merge=false`.

### 2.4 Review scaffolding

- `.github/pull_request_template.md` with the PR body sections from §1.
- `.github/CODEOWNERS` (for example `* @org/team` or `* @username`) so reviewers are requested automatically.

### 2.5 One rulebook for every agent

- `AGENTS.md` at the repo root is the single, authoritative rulebook: commands, layering, naming, domain rules. Codex, OpenCode, Cursor, and Copilot read it natively.
- `CLAUDE.md` contains `@AGENTS.md` plus a short quick reference, so the rules are never duplicated.
- If you use `.github/copilot-instructions.md` or Cursor rules, have them point to `AGENTS.md` instead of repeating it.
- Whenever a rule changes, update `AGENTS.md` in the same PR as the code.

### 2.6 Versioning and releases (SemVer with release-please)

Versions follow [Semantic Versioning](https://semver.org) `MAJOR.MINOR.PATCH` and are **calculated automatically from the Conventional Commits merged into the default branch**:

| Merged since the last release | Next version |
| --- | --- |
| only `fix` / `perf` | patch: `1.4.2` → `1.4.3` |
| at least one `feat` | minor: `1.4.2` → `1.5.0` |
| at least one breaking change (`!` or `BREAKING CHANGE:`) | major: `1.4.2` → `2.0.0` |
| only `docs`, `chore`, `test`, `ci`, `refactor` | no release |

[release-please](https://github.com/googleapis/release-please) does the bookkeeping. After every merge it opens or updates a **Release PR** containing the next version and the changelog. **Merging that Release PR is the release**: it tags the version, creates the GitHub release, and the workflow attaches the built zips. Like any PR, it is reviewed by a human and never merged by the agent.

`release-please-config.json`. The `extra-files` entries keep every manifest's version in sync with `package.json`:

```json
{
  "$schema": "https://raw.githubusercontent.com/googleapis/release-please/main/schemas/config.json",
  "packages": {
    ".": {
      "release-type": "node",
      "bump-minor-pre-major": true,
      "include-component-in-tag": false,
      "extra-files": [
        { "type": "json", "path": "manifest.json", "jsonpath": "$.version" },
        { "type": "json", "path": "manifest.firefox.json", "jsonpath": "$.version" }
      ]
    }
  }
}
```

`.release-please-manifest.json` (the current version, which release-please updates itself):

```json
{ ".": "0.1.0" }
```

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

      - if: ${{ steps.release.outputs.release_created }}
        uses: actions/checkout@v4
      - if: ${{ steps.release.outputs.release_created }}
        uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: npm
      - if: ${{ steps.release.outputs.release_created }}
        run: npm ci && npm run package && npm run package:firefox
      - if: ${{ steps.release.outputs.release_created }}
        run: gh release upload ${{ steps.release.outputs.tag_name }} release/*.zip
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

(`package` / `package:firefox` are `npm run build && web-ext build --source-dir dist --artifacts-dir release` and the Firefox equivalent.)

Rules and gotchas:

- **Release token.** A PR opened with the default `GITHUB_TOKEN` does not trigger other workflows, so the required CI checks would never run on the Release PR and it could never be merged. Ask the user to create a fine-grained personal access token or a GitHub App token (contents + pull requests: read/write) and store it as the `RELEASE_PLEASE_TOKEN` repository secret.
- **Pre-1.0.** Start at `0.1.0`. With `bump-minor-pre-major`, a breaking change bumps the minor while the version is `0.x`. Releasing `1.0.0` is a deliberate decision: add a `Release-As: 1.0.0` footer to a commit when the extension is first stable and public.
- **Store-compatible versions only.** Chrome and Firefox manifests accept 1-4 dot-separated integers, so never use `-beta` / `-rc` suffixes. If you need a beta channel, publish a separate beta listing.
- **Nobody hand-edits the version** in `package.json` or any manifest. release-please owns it, and a test checks that they match (§10).
- **Store upload stays a human step** (or a separate, reviewed workflow). Upload the zip from the GitHub release after checking it.

### 2.7 Environment variables and secrets (`.env`)

Build-time configuration comes from environment files, never from values hard-coded in source:

| File | Tracked in git? | Contents |
| --- | --- | --- |
| `.env.example` | **yes** | every variable the build needs, with dummy or empty values and a comment each, e.g. `VITE_CONTACT_FORM_KEY=your-key-here` |
| `.env` | **no** | the real values for this machine |
| `.env.local`, `.env.*.local` | **no** | personal overrides (Vite loads them on top of `.env`) |

Keep the tracked template named `.env.example`, not `.env.local`. Vite and most tools treat `*.local` files as private, untracked overrides, so committing dummy values under that name invites someone to put real secrets in a file that is tracked.

Setup:

1. Add to `.gitignore`:
   ```gitignore
   .env
   .env.*
   !.env.example
   ```
2. Create `.env.example` and document `cp .env.example .env` in the README's quick start.
3. Read variables in **one place only**: an infrastructure config module (e.g. `src/infrastructure/config/env.config.ts`) that reads `import.meta.env`, validates that required values are present, fails the build or startup with a clear message when one is missing, and exports typed values. The composition root passes them to the adapters that need them. Add an architecture test so that no other file reads `import.meta.env` or `process.env`.
4. In CI, keep real values in GitHub Actions secrets and write them into `.env` in the build step (`echo "VITE_X=${{ secrets.VITE_X }}" >> .env`). Never `echo` them into logs.
5. Before committing, check `git status` / `git diff --cached` for `.env` files or pasted keys. If a real secret was ever committed, tell the user to **rotate it**: removing it from history is not enough.

**Everything bundled into an extension is public.** Any variable the bundler inlines (`VITE_*`) ends up readable in the shipped JavaScript. `.env` keeps values out of *git*, not out of the *extension package*. So only put public-by-design values (public API keys, site keys, endpoints, feature flags) in the build. Real secrets (private API keys, database credentials, signing keys) belong on a backend or serverless proxy that the extension calls, never in the bundle.

---

## 3. Layers

| Layer | May import | Must never import | Owns |
| --- | --- | --- | --- |
| `domain` | `lib` | any other layer, any npm package, `chrome.*`, `fetch`, storage, UI | models, rules, policies, repository interfaces |
| `application` | `domain`, `lib` | infrastructure, presentation, services, bootstrap, npm packages | use cases, orchestration, messaging protocol, browser-facing ports |
| `services` | `application`, `domain`, `lib` | infrastructure, presentation, bootstrap | UI facade: unwraps use-case results, re-exports the DTO types the UI needs |
| `presentation` | `services`, domain display types, `lib` | application, infrastructure, bootstrap | components, display formatting, UI state |
| `infrastructure` | `application`, `domain`, `lib`, npm packages | presentation, services, bootstrap | browser adapters, repositories, gateways, AI runtimes, config |
| `bootstrap` | everything | (nothing imports bootstrap) | composition roots and entry files only |
| `lib` | `lib` | every layer, every npm package | generic helpers |

Rules that make this hold up in practice:

- **Ports live inward, adapters live outward.** `I*Repository`, `I*Gateway`, and browser ports are declared in `domain` or `application`. Their implementations live in `infrastructure`.
- **The UI calls services, never use cases or adapters.** Presentation gets one `PanelServices`-style object from the composition root.
- **Split composition per process.** The popup entry and the background entry each have their own wiring module. The popup entry must never reach the background wiring, directly or transitively; otherwise the whole engine ships in the popup bundle. Test this.
- **Bootstrap only composes.** It declares no classes and exports no interfaces except the composition contract types.
- **Register, don't construct.** A new use case, adapter, or gateway is registered in the matching wiring module. It is never `new`-ed inside React components, domain code, or leaf application code.
- **Small, cohesive owners.** Split orchestration by responsibility, for example a queue that manages jobs, an orchestrator that decides when work runs, and a runner that does one unit of work. Only the orchestrator links them.

---

## 4. Architecture tests

Every row of the layer table is a test. Rules:

- **One rule per test, with a descriptive name**, for example `"domain layer must not import the infrastructure layer"`.
- **Resolve both path aliases and relative imports.** A `../../infrastructure/x` escape must fail just like `@infrastructure/x`. Do not rely on ArchUnitTS's built-in `dependOnFiles()` for cross-layer rules: it does not resolve tsconfig path aliases (LukasNiessen/ArchUnitTS#88), so it passes silently on real violations. Read the raw import specifiers yourself, either with the dependency-free helper below or inside an ArchUnitTS custom `adhereTo` condition.
- **Add package-ownership rules** for libraries that must stay contained: only `presentation/state/` may import the state library, and only `infrastructure/export/` may import the PDF library.
- **Add structural rules:**
  - `*.repository.ts` lives in infrastructure and `implements I*Repository`.
  - `*.service.ts` lives in `services/` and `implements I*Service`.
  - Repository interfaces are never declared in infrastructure.
- **When you add a layer or alias**, extend the alias map and add its rules in the same PR.

Dependency-free helper (`test/architecture/layers.js`), usable from Jest or Vitest:

```js
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const LAYERS = ["domain", "application", "services", "presentation", "infrastructure", "bootstrap", "lib"];
const ALIASES = Object.fromEntries(LAYERS.map((layer) => [`@${layer}`, layer]));
export const EXTERNAL = "external";
export const OUTSIDE = "outside-src";

function filesUnder(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return filesUnder(path);
    return /\.(ts|tsx|js|jsx)$/.test(name) ? [path.replace(/\\/g, "/")] : [];
  });
}

function stripComments(code) {
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
    const inside = /^src\/([^/]+)\//.exec(resolveRelative(specifier, filePath));
    return inside && LAYERS.includes(inside[1]) ? inside[1] : OUTSIDE;
  }
  const alias = /^(@[a-z-]+)(\/|$)/.exec(specifier);
  return alias && ALIASES[alias[1]] ? ALIASES[alias[1]] : EXTERNAL;
}

/** Files in `src/<layer>` that import any of `forbidden` (layers, EXTERNAL, or OUTSIDE). */
export function violations(layer, forbidden) {
  return filesUnder(`src/${layer}`).flatMap((file) =>
    importSpecifiers(readFileSync(file, "utf8"))
      .filter((specifier) => forbidden.includes(layerOf(specifier, file)))
      .map((specifier) => `${file} -> ${specifier}`),
  );
}
```

```js
// test/architecture/layers.test.js
import { EXTERNAL, OUTSIDE, violations } from "./layers";

describe("Clean architecture: dependencies point inward", () => {
  test("domain layer must not import any other layer", () => {
    expect(violations("domain", ["application", "services", "presentation", "infrastructure", "bootstrap"])).toEqual([]);
  });
  test("domain layer must not import npm packages", () => {
    expect(violations("domain", [EXTERNAL, OUTSIDE])).toEqual([]);
  });
  test("application layer must not import infrastructure, presentation, services, or bootstrap", () => {
    expect(violations("application", ["infrastructure", "presentation", "services", "bootstrap"])).toEqual([]);
  });
  test("presentation layer reaches application logic only through services", () => {
    expect(violations("presentation", ["application", "infrastructure", "bootstrap"])).toEqual([]);
  });
  test("lib stays dependency-free: no layers and no packages", () => {
    expect(violations("lib", ["domain", "application", "services", "presentation", "infrastructure", "bootstrap", EXTERNAL, OUTSIDE])).toEqual([]);
  });
});
```

Returning the list of offending `file -> import` pairs, rather than a boolean, makes CI failures self-explanatory.

---

## 5. `src/lib`: reusable helpers that are not business logic

`src/lib/` holds small, **dependency-free, domain-neutral** mechanics that several layers reuse: truncating or normalizing strings, pluralizing, clamping and rounding numbers, de-duplicating arrays, type guards, URL/host parsing, abort-signal helpers, date formatting.

```ts
// src/lib/text.ts
/** `value` cut to `maxLength` characters, ending with `suffix` when it was cut. */
export function truncate(value: string, maxLength: number, suffix = "..."): string {
  if (value.length <= maxLength) return value;
  return value.slice(0, Math.max(0, maxLength - suffix.length)) + suffix;
}

/** `singular` when `count` is exactly 1, else `plural`. The count itself is not included. */
export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return count === 1 ? singular : plural;
}
```

Rules:

- **Search `src/lib` before writing any small helper.** If an equivalent exists, use it. Never keep a private copy, and never write a one-line wrapper that only renames a lib function.
- **Put a helper in `lib` only when it is generic *and* has more than one consumer.** Being pure or short is not enough. Business policy (thresholds, scoring, queue rules, vendor knowledge) stays with the feature that owns it.
- **`lib` imports nothing but `lib`**: no layers and no npm packages. The architecture test above enforces this.
- Group helpers by topic (`text.ts`, `numbers.ts`, `arrays.ts`, `url.ts`, `guards.ts`, `abort.ts`), never a `utils.ts` dumping ground.
- Keep feature-local helpers inside the feature folder, not in `lib`.
- The one sanctioned exception is functions serialized into a page with `scripting.executeScript`. They cannot import, so they carry an inline copy and receive constants through `args`.

---

## 6. Clean code rules

- **Name files by role**, with lowercase names for non-component files and PascalCase for UI components:
  `*.usecase.ts`, `*.policy.ts`, `*.repository.ts`, `*.gateway.ts`, `*.adapter.ts`, `*.service.ts`, `*.worker.ts`, `*.interface.ts`, `*.type.ts`, `*.detector.ts`/`*.scorer.ts` (or the domain's own nouns).
- **No abstractions for a single use.** Inline single-use code. Extract a private function only when it is used more than once or when the host function would grow too big. Do not create a file for a trivial one-method interface. Real replaceable ports (browser adapters, repositories, gateways, runtimes) do deserve interface files.
- **No renaming type aliases** (`type NewName = ExistingName`). Use the canonical type. Keep aliases only when they add a union, mapped type, `Omit`, generic specialization, or real structure.
- **Constants belong to policy.** Thresholds, weights, limits, and timeouts live in `*.policy.ts` (domain) or `*.config.ts` (infrastructure/application), never as magic numbers inside classes or UI.
- **Compute and explain separately.** Code that computes a result produces data. Explanations, recommendations, and user copy are produced by a separate step. The UI renders statuses verbatim and never re-derives verdicts from text.
- **Unknown ≠ bad, absent ≠ unknown.** If the evidence could not be observed (API unavailable, fetch failed, data truncated), report `unknown` and lower confidence. If it was observed and the signal is missing, that is a real negative finding.
- **Collectors stay generic.** Code that gathers data records observable facts (URLs, headers, timings, DOM summaries). Knowledge about specific vendors or technologies lives in detectors or rules, never in collectors.
- **Prefer precise evidence over broad heuristics.** Several specific indicators beat one loose regex. Minified bundles are single-line, so a loose pattern matches everything.
- **Functions do one thing at one level of abstraction.** Names reveal intent, and comments explain *why*, not *what*.

---

## 7. Browser extension rules (MV3, cross-browser)

- **Keep browser APIs at the edge.** `chrome.*` appears only in `infrastructure` (and entry files). Domain, application, services, presentation, and lib never touch it.
- **Shared base, thin per-browser subclasses.** Put real logic in `Base*` classes and add `Chrome*` / `Firefox*` / `Safari*` subclasses that override only where the APIs actually diverge. Never duplicate logic across browsers, and never branch on `if (isFirefox)`.
- **Call `chrome.*` directly.** Firefox and Safari alias it, so no polyfill layer is needed. **Presence-guard optional APIs** (`webRequest`, `notifications`, `cookies`, `permissions`, `scripting` MAIN world, `action.openPopup`) so they degrade to unknown or a no-op and never throw at startup.
- **Keep one manifest per browser, in parity.** Permissions, CSP, icons, and web-accessible resources must match, and a test enforces it. Only background style, entry pages, and browser-specific settings may differ. Pin `strict_min_version` to the version that supports the APIs you use.
- **Minimal permissions.** Justify every permission. Prefer optional permissions requested at the moment they are needed.
- **Strict CSP.** Use `script-src 'self'; object-src 'self'`, with no `unsafe-eval` and no `wasm-unsafe-eval` unless you truly ship WASM and have reviewed the trade-off. A test asserts it.
- **No script on normal browsing.** Do not declare `content_scripts` on `<all_urls>`, because that fingerprints users and slows every page. Register scripts only for the hosts you work on with `chrome.scripting.registerContentScripts` (`persistAcrossSessions: false`), and remove them when you are done, including on service-worker restart.
- **Dual-world page access.** Try the MAIN world for full page access. Fall back to the ISOLATED world when the page's CSP blocks injection, and surface the degraded fields as unknown.
- **The service worker is not a normal module.** Never use dynamic `import()` in code the MV3 service worker runs, because it is rejected at runtime. Load large data as a bundled asset URL and `fetch` it once (memoized, retried after a failure).
- **Keep the popup bundle lean.** Popup and background are separate composition roots, and heavy libraries are lazily imported only where needed.
- **Define the messaging protocol once.** Keep one file with action-name constants, a request/response type map, and a decoder that validates untrusted messages. Keep one router. Callers never compare action strings by hand. Adding a message means one constant, one map entry, one decode case, and one router case.
- **Exclude your own traffic.** Filter `chrome-extension:` / `moz-extension:` URLs out of anything you collect from pages.
- **Long work runs in the background**, not in the popup. The popup can close at any time, so persist job state, restore it on open, and make work cancellable with `AbortController` threaded through every async step.
- **Package and lint per browser.** Use `web-ext build` for release zips and `web-ext lint` for Firefox (0 errors).

---

## 8. AI inside the extension

- **Run the model on the device and bundle it with the extension.** Load it from the extension origin through an adapter, lazily, on first use, and retry after a failed load. Make no network calls and do not download it at install. This keeps user data on the device and keeps the store review simple.
- **Keep the AI behind a port.** Application code talks to an `I*Runtime` interface, and the concrete runtime lives in `infrastructure`. Swapping models means changing one file.
- **One coordinator owns the policy.** It bounds and normalizes the input text, races the runtime against a timeout and the job's abort signal, and maps every failure, timeout, or cancellation to a neutral `unknown`. The runtime only computes and never decides.
- **Never fake intelligence.** If semantic analysis is unavailable, report `unknown`. Never silently fall back to keyword or regex heuristics.
- **Calibrate thresholds on data.** Keep a hand-labelled evaluation set and a script that prints how the shipped model scores it. Re-run it before moving any threshold, and document the distribution.
- **Keep the CSP intact.** Prefer runtimes that need no `eval` or WASM. If you do need WASM, it is an explicit, reviewed CSP change.
- **Disclose it.** State in the UI that the model is built in, how large it is, and that no data leaves the device.

---

## 9. Persistence and privacy

- **Storage goes through repository interfaces.** Only infrastructure touches `chrome.storage` / IndexedDB.
- **Version everything you persist.** Stored records carry a schema version and are strictly validated against the current schema. Older or unknown versions are shown as "unsupported". **Incompatibility never deletes user data.** Register migrators explicitly.
- **Quota failures leave the new item unsaved.** Never evict existing user data to make room silently.
- **External calls are opt-in.** Anything that sends user data (hostnames, URLs, content) to a third party is a setting that is off by default and clearly labelled.
- **Never persist secrets or raw sensitive content.** Keep only the type and a redacted location.
- **Bundled keys are public.** Anything shipped inside an extension can be read. If a credential must stay secret, route the call through a backend. Build-time values come from `.env` files as described in §2.7.

---

## 10. Testing

- **Test behaviour at the boundary that owns it.** Domain rules get unit tests. Use cases get workflow tests with fake ports. Adapters get focused tests with mocked browser APIs. Never monkey-patch private methods to reproduce a lower layer.
- **Architecture tests** (§4) and **config parity tests** (manifests, CSP, permissions) run in CI on every PR.
- **Real-world data, replayed offline.** Capture real inputs once into `test/fixtures/`, store reviewed expected results ("goldens") beside them, and replay them in CI. Never make CI depend on the live network. Refresh captures and goldens deliberately, in the same PR.
- **Version parity test.** `package.json` and every manifest carry the same `version`, so a missing `extra-files` entry is caught before release.
- **Environment tests.** An architecture test allows `import.meta.env` / `process.env` only in the config module. A config test checks that every key in `.env.example` is read by the config module and every variable it reads is listed in `.env.example`.
- **Generated data is never hand-edited.** Datasets such as vulnerability databases, models, and fonts come from an `npm run update:*` script. A scheduled workflow can regenerate them, run the full verification, and open a PR for human review.
- **Every bug fix starts with a failing test** that reproduces the bug.

---

## 11. Documentation

- `README.md` is a short landing page: what the project is, how to build it, how to load it, and links.
- `docs/` holds the wiki: `architecture.md`, `development.md`, `conventions.md`, and a doc per domain area. Update docs in the same PR as the behaviour they describe.
- `AGENTS.md` is the single rulebook for coding agents (§2.5).
- User-facing copy is consistent. Pick one style (for example plain hyphens, no em dashes) and apply it everywhere.

---

## 12. Checklists

### New feature
- [ ] On a fresh `feature/<slug>` branch cut from an up-to-date default branch.
- [ ] Identified which layer owns each part: domain rule, use case, port, adapter, service method, UI.
- [ ] New ports are declared in domain/application, their implementations are in infrastructure, and they are registered in the right wiring module.
- [ ] Checked `src/lib` for existing helpers, and added a new generic helper there only if it has several consumers.
- [ ] Thresholds and limits are in a policy/config file.
- [ ] Unavailable data surfaces as `unknown`.
- [ ] Tests at the owning boundary. The architecture tests are extended if a layer, alias, or owned package was added.
- [ ] New configuration or keys are added to `.env.example` (with dummy values) and read through the config module. No real values are committed.
- [ ] The PR title is `feat(<scope>): ...`, with `!` / `BREAKING CHANGE:` if the change breaks users (ask the user when unsure).
- [ ] `AGENTS.md` / `docs/` updated if a rule or behaviour changed.

### Bug fix
- [ ] On a `fix/<slug>` (or `bugfix/`/`hotfix/`) branch.
- [ ] A failing test reproduces the bug first.
- [ ] Fixed the root cause in the owning layer, not with a workaround in the UI or a hostname-specific special case.
- [ ] The test now passes, and nothing else changed behaviour.
- [ ] The PR title is `fix(<scope>): ...`.

### Before opening the PR
- [ ] `npm run lint`
- [ ] `npx tsc --noEmit`
- [ ] `npm run test:architecture`
- [ ] `npm test`
- [ ] `npm run build` (plus `build:firefox` and `web-ext lint` when relevant)
- [ ] Loaded the unpacked build in the browser and exercised the change.
- [ ] Pushed the branch, opened the PR with Summary / Why / How tested / Layer impact, and requested a reviewer (a teammate or the user).
- [ ] `git diff --cached` contains no `.env` file and no real keys.
- [ ] Did not merge it yourself.

### Releasing
- [ ] Open the Release PR that release-please maintains and check that the proposed version matches what was merged: fix → patch, feat → minor, breaking → major.
- [ ] Read the generated changelog and fix unclear entries by editing the Release PR.
- [ ] CI is green on the Release PR.
- [ ] A human merges it. The agent never merges it.
- [ ] Check that the GitHub release has the Chrome and Firefox zips and that their manifest versions match the tag, then upload them to the stores.

---

## About

This skill is maintained by **[ARG Software](https://arg.software)** and distilled from the architecture of **ARG Architect**, ARG's browser extension for architecture, security, performance, and AI-readiness audits. It runs on Chrome and Firefox with a bundled on-device AI model. Need help building or reviewing a browser extension or an AI-powered product? Visit [arg.software](https://arg.software).
