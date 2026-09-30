---
name: arg-react-native
description: How ARG builds scalable, fast React Native and Expo apps. Business rules stay apart from the device and UI, so the app stays easy to change as it grows. Use when scaffolding or extending a React Native app, adding a screen, use case, port, adapter, API client, storage, native module or device API, choosing state management (TanStack Query, Zustand, Jotai), fixing jank, dropped frames, slow lists, re-renders, slow startup (TTI), large bundles or app size, memory leaks, animations with Reanimated, writing Turbo Modules, writing unit, component, architecture or e2e tests (Jest, RNTL, Maestro, Detox), setting up CI, EAS or Fastlane builds, environment variables (.env), versioning with release-please, or preparing a branch and pull request. Enforces domain/application/infrastructure/presentation layers with architecture tests, device and network access only in infrastructure, measure-first performance work, a dependency-free src/lib, feature/fix branches, reviewed PRs, and CI before merge.
license: MIT
metadata:
  author: ARG Software
  homepage: https://arg.software
  version: 1.0.0 # x-release-please-version
---

# Scalable React Native apps, the ARG way

Guidance for scalable React Native apps (bare or Expo) that keep business rules independent of the device, the network and the UI kit, and stay fast because every optimisation is measured. The architecture rules are ARG Software's own. The performance guidance is inspired by Callstack's MIT-licensed [`react-native-best-practices`](https://github.com/callstackincubator/agent-skills) skill (see [Credits](#credits)), reorganised and rewritten for this structure.

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

| Base term | In a React Native app |
| --- | --- |
| **verify** | `npm run verify` = `tsc --noEmit && eslint . && jest --ci && node --test test/architecture/` (use the project's package manager) |
| **lib folder** | `src/lib` (pure TypeScript helpers: no React, no React Native, no packages) |
| **arch-test tool** | the base import-scanning helper in `test/architecture/`, plus the package rules in [references/arch-layers-and-ports.md](references/arch-layers-and-ports.md) |
| **config module** | `src/infrastructure/config/env.ts`, the only file that reads `process.env` / `react-native-config` |
| **release type** | release-please `node`, with `app.json` (`$.expo.version`) or the native version fields updated through `extra-files` |

---

## 1. Layout

```
src/
  domain/            entities, value objects, pure rules (no React, no React Native, no packages)
  application/       use cases, ports (interfaces), client-state stores, query keys
  infrastructure/    API clients, storage, native modules, device APIs, analytics, config
  presentation/      screens, components, navigation, hooks that adapt use cases, theme
  bootstrap/         providers, the container that builds adapters and use cases, app entry
  lib/               pure helpers shared by every layer
test/architecture/   layer and package rules
e2e/                 Maestro flows (or Detox specs)
```

With Expo Router, route files live in `src/app/`. Treat `src/app` as presentation: each route file only renders a screen from `src/presentation/screens` and reads params. Add `app` to the architecture test's `LAYERS` with the same rules as `presentation`.

| Layer | May import | Must never import | Owns |
| --- | --- | --- | --- |
| `domain` | `lib` | every other layer, every package | the model and its rules |
| `application` | `domain`, `lib`, state libraries (`zustand`, `jotai`, `@tanstack/query-core` types) | `infrastructure`, `presentation`, `bootstrap`, `react-native`, `expo-*`, network and storage packages | use cases, ports, stores |
| `infrastructure` | `application`, `domain`, `lib`, device, network and storage packages | `presentation`, `bootstrap` | adapters for every port |
| `presentation` | `application`, `domain`, `lib`, `react-native`, UI and navigation packages | `infrastructure`, `bootstrap`, network, storage and device packages | screens, components, navigation |
| `bootstrap` | everything | | composition and providers |
| `lib` | nothing | every layer, every package | generic helpers |

## 2. Device, network and storage access lives only in infrastructure

Everything that touches the outside world is an adapter in `src/infrastructure`, behind a port declared in `src/application/ports`:

- **Network**: `fetch`, axios, GraphQL clients, WebSockets, and SDK clients (Firebase, Supabase, Stripe).
- **Storage**: MMKV, AsyncStorage, SecureStore/Keychain, SQLite, the file system.
- **Device APIs**: camera, location, notifications, biometrics, contacts, haptics, clipboard, sharing, in-app purchases, permissions.
- **Native modules**: your own Turbo Modules and third-party native SDKs.
- **Analytics, crash reporting and feature flags.**
- **Configuration**: environment variables and build-time constants.

Presentation reaches these only through use cases or hooks that take a port, and `bootstrap` wires the concrete adapter. A screen that imports `expo-location` or calls `fetch` fails the architecture test.

This keeps use cases testable with plain fakes, lets you replace a vendor SDK in one file, and makes the permission and error handling for each capability live in one place.

[references/arch-layers-and-ports.md](references/arch-layers-and-ports.md) has a port, an adapter, the container, the TanStack Query hook, and the architecture tests.

## 3. State

- **Server state** (anything fetched) lives in **TanStack Query**. Query functions call use cases, never `fetch`. Query keys are constants in `application/queries/keys.ts`.
- **Client state** (UI and session state that is not on a server) lives in **Zustand** (always read with a selector, `useStore((s) => s.filter)`) or **Jotai** atoms. Do not put app state in a broad React Context: every consumer re-renders when the value's identity changes. Context is fine for rarely changing values (theme, the container).
- Do not split state into dozens of atoms before a profile shows the need.
- `useDeferredValue` for expensive derived views (search results), `useTransition` for non-urgent updates.
- `TextInput` is uncontrolled (`defaultValue` + `onChangeText` writing to a ref or store) unless it needs masking or formatting on every keystroke.
- Persisted client state goes through a storage port (MMKV adapter), never `AsyncStorage` imported in a store.

## 4. Performance: measure first

Every performance change follows **measure → change one thing → re-measure → keep or revert**. Record the before and after numbers in the PR description.

- **Do not add `memo`, `useMemo`, `useCallback`, atoms or the React Compiler without a measured render or FPS problem.** Show the profile.
- **Check the installed version** of a library before giving API-specific advice (FlashList v2 removed `estimatedItemSize`; Reanimated 4 needs the New Architecture and `react-native-worklets`).
- **Measure release builds** (or dev mode off) on a real mid-range Android device. Development builds and simulators hide or invent problems.
- Frame budgets: 16.6 ms at 60 FPS, 8.3 ms at 120 FPS.

| Problem | Measure with | Usual fixes |
| --- | --- | --- |
| Janky scrolling or UI | Perf Monitor, React DevTools Profiler, Flashlight (Android) | virtualized lists, fewer re-renders, work off the JS thread |
| Too many re-renders | React DevTools Profiler ("why did this render") | selectors, atomic state, React Compiler |
| Slow startup | `react-native-performance` cold-start marks | less work before first screen, Hermes mmap, lazy screens, smaller bundle |
| Large bundle or app | source-map-explorer, Expo Atlas, Ruler/Emerge | direct imports, tree shaking, R8, asset catalogs |
| Memory growth | React Native DevTools memory, Xcode Instruments, LeakCanary | effect cleanup, native weak refs |
| Animation drops frames | Perf Monitor UI/JS FPS | Reanimated on the UI thread |

### Rendering

- **Lists**: FlashList (v2 on the New Architecture) or Legend List for long or heterogeneous lists; FlatList with `getItemLayout` when items have a fixed height; never `ScrollView` + `map` for more than a screenful. Define `renderItem` outside JSX, give stable `keyExtractor`s, and use `getItemType` for mixed rows.
- **React Compiler**: adopt it per directory once `react-compiler-healthcheck` and the lint rules are clean, then remove manual memoisation there. Verify with a profile.
- **Animations**: Reanimated 4 + `react-native-worklets` (its Babel plugin is last). Animated values are shared values, never `useState`. Keep worklets small, and call back to JS with `scheduleOnRN` from completion callbacks, not from `useAnimatedStyle`.
- **Bottom sheets**: keep sheet content light, mount it lazily, and drive it with Reanimated.

### Startup and size

- Measure **cold** starts only, from process start to the first interactive screen (`screenInteractive` mark).
- Do less before the first screen: defer SDK initialisation, preload only the next likely screen, and use native navigation (`react-native-screens`, native stack).
- Hermes bytecode must be memory-mapped: React Native 0.79+ ships Android bundles uncompressed by default; on 0.78 and earlier disable bundle compression.
- No barrel imports inside the app (`import Button from "@presentation/components/Button"`), enforced by ESLint. Turn on tree shaking where the toolchain supports it (Expo) and import `Platform` directly from `react-native` so platform code can be removed.
- Check a library's size and native footprint before adding it, and prefer the platform's native SDK over a JS polyfill (Hermes already covers most of `Intl`).
- Android: R8 with resource shrinking in release, and a CI check for 16 KB page-size alignment of native libraries (Google Play requirement). iOS: assets in an Asset Catalog so App Thinning works.
- Remote code chunks only when they are first-party, served over HTTPS from an origin you control, signed, and pinned to the app release.

### Native code

- New native functionality is a **Turbo Module** (scaffold with `create-react-native-library`, local or published) behind an infrastructure adapter.
- Methods are async by default. A sync method must be trivial and deterministic (well under a frame). Heavy work runs on a background queue or coroutine, and UI work dispatches back to the main thread.
- Batch calls that cross JS ↔ native (and JNI on Android) instead of calling in loops. Use C++ for shared performance-critical code.
- Native callbacks hold weak references to views and contexts, and modules release resources on invalidation.

The performance references hold the detail:

- [references/perf-rendering.md](references/perf-rendering.md): measuring FPS and renders, lists, state, the compiler, animations, and JS memory.
- [references/perf-startup-and-size.md](references/perf-startup-and-size.md): TTI, Hermes, bundle and app size, R8, assets, 16 KB alignment, and remote chunks.
- [references/native-modules.md](references/native-modules.md): Turbo Modules, threading, and native memory.

## 5. Testing

- **Domain and use cases**: plain Jest tests with in-memory fakes for ports. No React Native in these tests.
- **Components and screens**: React Native Testing Library, queried by role and text as a user would, with the container provided with fakes. Do not snapshot whole screens.
- **Hooks**: `renderHook` with a fresh `QueryClient` per test (`retry: false`).
- **Adapters**: test the mapping and error handling with the SDK mocked at its boundary, one file per adapter.
- **Architecture tests**: the layer and package rules from section 1 (see the arch reference).
- **E2E**: Maestro flows (or Detox) for the critical journeys, run in CI on at least one platform per PR and both before a release.
- A bug fix starts with a failing test at the lowest layer that shows the bug.

## 6. Environments, CI and releases

- **Configuration** is read in one module, `src/infrastructure/config/env.ts`, validated at startup (zod), and exposed as a typed object. Expo: `EXPO_PUBLIC_*` variables read with literal `process.env.EXPO_PUBLIC_X` access (they are inlined at build time). Bare: `react-native-config`.
- **Everything in the JS bundle is public.** Never put secrets (API secret keys, signing keys, admin tokens) in `.env` values that reach the app. Secrets stay on your server, and user tokens go in SecureStore/Keychain through a storage port.
- `.env.example` is tracked and `.env*` is ignored (see the base). EAS secrets or CI secrets hold the real values for builds.
- **CI** (`verify` job): install with the lockfile, type-check, lint, unit and architecture tests. A separate job builds a release artifact and runs Maestro when the PR touches native code or before a release.
- **Versions**: release-please (`node`) owns the marketing version in `package.json` and mirrors it into `app.json` (`$.expo.version`) or the native projects. Build numbers (`versionCode`, `CFBundleVersion`) are auto-incremented by EAS (`appVersionSource: "remote"`) or CI, never hand-edited.
- **Delivery**: EAS Build/Submit or Fastlane. Over-the-air updates only for JS-only changes that match the installed runtime version (`runtimeVersion` policy); any native change ships through the stores.
- **Supply chain**: pin tool versions, review shell commands before running them, never pipe remote scripts to a shell, and review new dependencies like code.

[references/testing-and-release.md](references/testing-and-release.md) has the test setup, the Maestro flow, the CI workflow, the env module, and the release-please config.

---

## References

| File | Read it when |
| --- | --- |
| [references/arg-base.md](references/arg-base.md) | setting up the repo, opening a PR, releasing |
| [references/arch-layers-and-ports.md](references/arch-layers-and-ports.md) | adding a port, adapter, use case, query hook or screen, or extending the architecture tests |
| [references/perf-rendering.md](references/perf-rendering.md) | jank, re-renders, lists, state libraries, React Compiler, animations, JS memory |
| [references/perf-startup-and-size.md](references/perf-startup-and-size.md) | slow startup, bundle or app size, Android build config, remote chunks |
| [references/native-modules.md](references/native-modules.md) | writing or reviewing native code and Turbo Modules |
| [references/testing-and-release.md](references/testing-and-release.md) | tests, CI, environment variables, versions, builds, OTA updates |

## React Native checklist (on top of the base checklists)

- [ ] No network, storage, device or native-module import outside `src/infrastructure`, and no `react-native` import in `domain` or `application`.
- [ ] New capabilities have a port in `application/ports`, an adapter in `infrastructure`, and wiring in `bootstrap`.
- [ ] Server data goes through TanStack Query, and stores are read with selectors.
- [ ] Performance changes include before/after numbers from a release build, and no speculative memoisation was added.
- [ ] Long lists are virtualized, animations run on the UI thread, and effects clean up listeners and timers.
- [ ] No secrets in the bundle; new variables are in `.env.example` and read only through `env.ts`.
- [ ] Unit, component and architecture tests pass, and the e2e flow for a touched journey passes.
- [ ] Version changes come from release-please; build numbers come from EAS or CI.

---

## Credits

Performance guidance inspired by callstackincubator/agent-skills `react-native-best-practices` (MIT, © 2026 Callstack Incubator), itself based on Callstack's "The Ultimate Guide to React Native Optimization". This skill reorganises those ideas into ARG's layered structure and rewrites them in its own words; any mistakes are ours.

## About

This skill is maintained by **[ARG Software](https://arg.software)**, a studio that designs, builds and reviews mobile and web products. Need help with a React Native app's architecture or performance? Visit [arg.software](https://arg.software).
