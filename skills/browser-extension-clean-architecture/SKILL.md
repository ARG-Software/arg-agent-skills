---
name: browser-extension-clean-architecture
description: Clean architecture and a disciplined git workflow for browser extensions (Manifest V3, Chrome/Firefox/Safari), including extensions that run AI on the device. Use when starting or scaffolding an extension project, adding a feature, fixing a bug, refactoring, adding a helper or utility, calling a browser API (tabs, storage, scripting, webRequest, messaging), reviewing architecture or layer boundaries, writing architecture tests, setting up CI, environment variables and secrets (.env), versioning, releases, changelogs, Conventional Commits, or preparing a branch and pull request. Enforces domain/application/infrastructure/presentation separation with architecture tests, keeps every browser API inside infrastructure adapters, a dependency-free src/lib folder for reusable helpers, feature/fix branches, reviewed PRs, a CI pipeline that runs the tests before anything reaches the default branch, untracked .env files, and automatic SemVer releases with release-please.
license: MIT
metadata:
  author: ARG Software
  homepage: https://arg.software
  version: 1.0.0 # x-release-please-version
---

# Browser Extension Clean Architecture

Guidance for building browser extensions that stay easy to change after hundreds of features. It is distilled from ARG Architect, a production MV3 extension for Chrome and Firefox that runs a multilingual AI model entirely on the device.

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

| Base term | In a browser extension |
| --- | --- |
| **verify** | `npm run lint && npx tsc --noEmit && npm run test:architecture && npm test && npm run build` (plus `npm run build:firefox && npx web-ext lint --source-dir dist-firefox` when Firefox is a target) |
| **lib folder** | `src/lib/` |
| **arch-test tool** | the import-scanning helper from [references/arg-base.md](references/arg-base.md) section 4, with the extension rules in section 3 below |
| **config module** | `src/infrastructure/config/env.config.ts`, the only file that reads `import.meta.env` |
| **release type** | release-please `node`, with every manifest's `version` in `extra-files`. See [references/release-and-ci.md](references/release-and-ci.md) |

---

## 1. Folder layout

```
src/
  domain/          business models, rules, policies, repository/port interfaces
  application/     use cases, orchestration, messaging protocol, ports for everything the browser provides
  services/        UI-facing facade over application use cases (what the popup calls)
  presentation/    popup / options / side-panel UI (React, Svelte, Vue, vanilla...)
  infrastructure/  ALL browser API code: adapters, storage, messaging transport, injected page scripts, network gateways, AI runtimes, config
  bootstrap/       composition roots + entry points (popup, background, content scripts)
  lib/             dependency-free, domain-neutral helpers reused across layers
test/
  architecture/    layer-boundary tests
```

Add a path alias per layer in `tsconfig.json` and in the bundler config (`@domain/*`, `@application/*`, `@services/*`, `@presentation/*`, `@infrastructure/*`, `@bootstrap/*`, `@lib/*`), and use the aliases for every cross-layer import.

---

## 2. All browser logic lives in the infrastructure layer

This is the rule that keeps an extension portable and testable. **Every call into the browser is implemented in `src/infrastructure/`**, behind a port (an interface) declared in `domain` or `application`. This covers:
- `chrome.*` / `browser.*`: tabs, windows, scripting, storage, runtime messaging, webRequest, notifications, cookies, permissions, action, alarms, offscreen, sidePanel
- functions injected into pages with `scripting.executeScript`, and the page-world stores they install
- DOM access to the audited page, `fetch` to external services, IndexedDB, `navigator.*` feature detection

Nothing else touches them:
- **Domain, application, services, presentation and lib never reference `chrome` or `browser`.** Application code asks a port (`ITabs`, `IPageRuntime`, `ISettingsRepository`, `IBackgroundChannel`) and never knows which browser answers.
- **Presentation reaches browser features only through services.** Services call use cases, and use cases call ports. A popup component that needs the current tab calls `services.page.getCurrentTab()`, never `chrome.tabs.query`.
- **Bootstrap only wires.** Entry files pick the per-browser adapter set (`createChromeAdapters()` / `createFirefoxAdapters()`) and pass it to the shared wiring. They may register listeners the platform requires at the top level, but the listener body calls an adapter or a router.
- **Per-browser differences are subclass overrides.** Put the logic in a `Base*` class under `infrastructure/browser/base/`. Thin `Chrome*` / `Firefox*` / `Safari*` subclasses override only where the APIs really diverge. Never duplicate logic across browsers, and never branch on `if (isFirefox)` outside the adapters.
- **Degrade inside the adapter.** Presence-guard optional APIs (`webRequest`, `notifications`, `cookies`, `permissions`, `scripting` MAIN world, `action.openPopup`) in the adapter, and return an "unavailable" result the application can report as unknown. They never throw at startup.

An architecture test enforces this (section 3), and [references/browser-adapters.md](references/browser-adapters.md) has a complete port → base adapter → per-browser subclass → wiring example.

---

## 3. Layers and architecture tests

| Layer | May import | Must never import | Owns |
| --- | --- | --- | --- |
| `domain` | `lib` | any other layer, any npm package, browser APIs, `fetch`, storage, UI | models, rules, policies, repository interfaces |
| `application` | `domain`, `lib` | infrastructure, presentation, services, bootstrap, npm packages, browser APIs | use cases, orchestration, messaging protocol, ports for browser capabilities |
| `services` | `application`, `domain`, `lib` | infrastructure, presentation, bootstrap, browser APIs | UI facade: unwraps use-case results, re-exports the DTO types the UI needs |
| `presentation` | `services`, domain display types, `lib` | application, infrastructure, bootstrap, browser APIs | components, display formatting, UI state |
| `infrastructure` | `application`, `domain`, `lib`, npm packages, **browser APIs** | presentation, services, bootstrap | browser adapters, repositories, gateways, AI runtimes, config |
| `bootstrap` | everything | (nothing imports bootstrap) | composition roots and entry files only |
| `lib` | `lib` | every layer, every npm package, browser APIs | generic helpers |

Rules that make this hold up:
- **Ports inward, adapters outward.** Declare `I*Repository`, `I*Gateway` and browser ports in `domain` or `application`. Implement them in `infrastructure`.
- **Split composition per process.** The popup entry and the background entry each have their own wiring module. The popup entry must never reach the background wiring, directly or transitively; otherwise the whole engine ships in the popup bundle.
- **Bootstrap declares no classes** and exports only the composition contract types.
- **Register, don't construct.** A new use case, adapter or gateway is registered in the matching wiring module, never created inside components, domain code, or leaf application code.
- **Small, cohesive owners.** For example: a queue manages jobs, an orchestrator decides when work runs, and a runner does one unit of work. Only the orchestrator links them.

Use the base import-scanning helper with `LAYERS` extended to include `services`. Then add these extension rules, one per test:

```js
// test/architecture/extension.test.js
import { readFileSync } from "node:fs";
import { EXTERNAL, OUTSIDE, importSpecifiers, usagesOutside, violations } from "./layers";

const BROWSER_API = /\b(chrome|browser)\s*\.\s*[a-zA-Z]+/;

describe("architecture: browser extension rules", () => {
  test("only infrastructure and bootstrap call browser APIs", () => {
    expect(usagesOutside(["infrastructure", "bootstrap"], BROWSER_API)).toEqual([]);
  });
  test("presentation reaches application logic only through services", () => {
    expect(violations("presentation", ["application", "infrastructure", "bootstrap"])).toEqual([]);
  });
  test("services must not import infrastructure, presentation or bootstrap", () => {
    expect(violations("services", ["infrastructure", "presentation", "bootstrap"])).toEqual([]);
  });
  test("application must not import npm packages", () => {
    expect(violations("application", [EXTERNAL, OUTSIDE])).toEqual([]);
  });
  test("the popup entry never imports the background wiring", () => {
    const popupEntry = readFileSync("src/bootstrap/popup.tsx", "utf8");
    expect(importSpecifiers(popupEntry).filter((specifier) => specifier.includes("backgroundwiring"))).toEqual([]);
  });
});
```

The browser-API test is textual on purpose, so it also catches untyped globals. To avoid false positives, never name port variables `chrome` or `browser` outside infrastructure (use `tabs`, `page`, `channel`). The popup test above checks direct imports. Make it transitive by walking the bootstrap import graph with `importSpecifiers`. Also add package-ownership rules (for example, only `presentation/state/` imports the state library) and structural rules (`*.repository.ts` lives in infrastructure and implements `I*Repository`). Never use ArchUnitTS `dependOnFiles()` for cross-layer rules, because it does not resolve path aliases.

---

## 4. `src/lib`

Follow the base rules for the lib folder. Typical extension helpers are `truncate`, `pluralize`, `clampNumber`, `unique`, `hostnameOrOriginal`, `isSameOrSubdomain`, and abort-signal helpers.

The one sanctioned exception is a function serialized into a page with `scripting.executeScript`. It cannot import anything, so it carries an inline copy of what it needs and receives constants (such as page-global names) through `args`. These functions live in `infrastructure/`.

---

## 5. Manifest V3 and cross-browser rules

- **Call `chrome.*` directly inside infrastructure.** Firefox and Safari alias it, so no polyfill layer is needed.
- **One manifest per browser, kept in parity.** Permissions, CSP, icons and web-accessible resources match, and a test enforces it. Only the background style (service worker vs event-page scripts), entry pages and `browser_specific_settings` may differ. Pin `strict_min_version` to the version that supports the APIs you use.
- **Minimal permissions.** Justify every permission. Prefer optional permissions requested at the moment they are needed.
- **Strict CSP.** Use `script-src 'self'; object-src 'self'`, with no `unsafe-eval`, and no `wasm-unsafe-eval` unless you really ship WASM and have reviewed the trade-off. A test asserts it.
- **No script on normal browsing.** Never declare `content_scripts` on `<all_urls>`: it fingerprints users and slows every page. Register scripts only for the hosts you work on with `chrome.scripting.registerContentScripts` (`persistAcrossSessions: false`), and remove them when you are done, including after a service-worker restart.
- **Dual-world page access.** Try the MAIN world for full page access. Fall back to the ISOLATED world when the page CSP blocks injection, and report the degraded fields as unknown.
- **The service worker is not a normal module.** Never use dynamic `import()` in code the MV3 service worker runs, because it is rejected at runtime. Load large data as a bundled asset URL and `fetch` it once (memoized, retried after a failure).
- **Keep the popup bundle lean.** Popup and background have separate composition roots, and heavy libraries are lazily imported only where they are used.
- **Define the messaging protocol once, in application.** One file holds the action-name constants, a request/response type map, and a decoder that validates untrusted messages. One router answers them. The transport (`chrome.runtime.sendMessage` / `onMessage`) is an infrastructure adapter behind an `IBackgroundChannel` port. Adding a message means one constant, one map entry, one decode case, and one router case.
- **Exclude your own traffic.** Filter `chrome-extension:` / `moz-extension:` URLs out of anything collected from pages.
- **Long work runs in the background**, not in the popup. The popup can close at any time, so persist job state, restore it on open, and make the work cancellable with an `AbortController` threaded through every async step.
- **Package and lint per browser.** Use `web-ext build` for release zips and `web-ext lint` for Firefox (0 errors).

---

## 6. AI inside the extension

- **Run the model on the device and bundle it.** An infrastructure adapter loads it from the extension origin, lazily on first use, and retries after a failed load. It makes no network calls and downloads nothing at install.
- **Keep the AI behind a port.** Application code talks to an `I*Runtime` interface, and the concrete runtime lives in infrastructure. Swapping models means changing one file.
- **One coordinator owns the policy.** It bounds and normalizes the input text, races the runtime against a timeout and the job's abort signal, and maps every failure, timeout or cancellation to a neutral `unknown`. The runtime only computes and never decides.
- **Never fake intelligence.** If semantic analysis is unavailable, report `unknown`. Never fall back silently to keyword or regex heuristics.
- **Calibrate thresholds on data.** Keep a hand-labelled evaluation set and a script that prints how the shipped model scores it. Re-run it before moving any threshold.
- **Keep the CSP intact.** Prefer runtimes that need no `eval` or WASM.
- **Disclose it.** The UI says that the model is built in, how large it is, and that no data leaves the device.

---

## 7. Persistence and privacy

- **Storage goes through repository interfaces.** Only infrastructure touches `chrome.storage` or IndexedDB.
- **Version everything you persist.** Stored records carry a schema version and are strictly validated. Older or unknown versions show as "unsupported". **Incompatibility never deletes user data.** Register migrators explicitly.
- **Quota failures leave the new item unsaved.** Never evict existing user data silently to make room.
- **External calls are opt-in.** Anything that sends user data (hostnames, URLs, content) to a third party is a setting that is off by default and clearly labelled.
- **Never persist secrets or raw sensitive content.** Keep only the type and a redacted location.
- **Everything bundled into an extension is public**, including every `VITE_*` value. Real secrets belong on a backend the extension calls.

---

## 8. Testing

- Domain rules get unit tests. Use cases get workflow tests with fake ports. Adapters get focused tests with a mocked `chrome` global (set up once in the test setup file).
- **Parity tests**: both manifests carry the same permissions, CSP, icons and web-accessible resources, and no static `content_scripts`.
- **Version parity test**: `package.json` and every manifest carry the same `version`.
- **Environment tests**: only `src/infrastructure/config/` reads `import.meta.env`, and `.env.example` matches the keys the config module reads.
- **Real pages replayed offline**: capture real page evidence into `test/fixtures/`, store reviewed goldens beside it, and replay them in CI.

---

## 9. References

| File | Read it when |
| --- | --- |
| [references/arg-base.md](references/arg-base.md) | setting up a project, opening a PR, releasing, writing architecture tests |
| [references/browser-adapters.md](references/browser-adapters.md) | adding or changing anything that calls a browser API |
| [references/release-and-ci.md](references/release-and-ci.md) | creating the CI workflow, the release workflow, or the store packages |

---

## 10. Extension checklist (on top of the base checklists)

- [ ] Every new browser call is in an infrastructure adapter behind a port, and the browser-API architecture test passes.
- [ ] Per-browser differences are subclass overrides, not `if (isFirefox)` branches.
- [ ] Optional APIs are presence-guarded and degrade to unknown or a no-op.
- [ ] New permissions are justified, added to every manifest, and covered by the parity test.
- [ ] No dynamic `import()` in service-worker code, and the popup bundle did not grow with background code.
- [ ] New messages are added to the protocol file, the decoder, and the router.
- [ ] Loaded the unpacked build in each target browser and exercised the change.

---

## About

This skill is maintained by **[ARG Software](https://arg.software)** and distilled from the architecture of **ARG Architect**, ARG's browser extension for architecture, security, performance, and AI-readiness audits. It runs on Chrome and Firefox with a bundled on-device AI model. Need help building or reviewing a browser extension or an AI-powered product? Visit [arg.software](https://arg.software).
