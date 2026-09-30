---
name: arg-angular
description: How ARG builds scalable Angular applications with NgRx (Store, Effects, Entity, SignalStore) on standalone components and signals. Business rules stay separate from Angular and NgRx, so features stay easy to change as the app grows, and lint enforces the boundaries. Use when scaffolding or extending an Angular app, adding a feature, route, component, action, reducer, effect, selector, facade, SignalStore, API service, interceptor or guard, choosing between the global Store and a SignalStore, wiring runtime configuration, writing component, store or e2e tests, enforcing import boundaries, setting up CI, environment variables and secrets (.env), versioning with release-please, or preparing a branch and pull request. Enforces domain/application/infrastructure/feature layers with lint-checked boundaries, all HttpClient and browser storage access in infrastructure, typed action groups, pure mappers, OnPush components, a dependency-free shared lib, feature/fix branches, reviewed PRs, and CI before merge.
license: MIT
metadata:
  author: ARG Software
  homepage: https://arg.software
  version: 1.0.0 # x-release-please-version
---

# Scalable Angular apps, the ARG way

Guidance for scalable Angular applications with NgRx that stay predictable as features pile up. It is distilled from ARG Software's Angular-Redux reference app, a manufacturing dashboard with feature stores, effects, containers and a shared UI kit, and modernised. The source targets Angular 19 (end of life), NgModules and Karma. This skill targets the current Angular major, standalone APIs, signals, and Vitest or Jest.

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

| Base term | In an Angular app |
| --- | --- |
| **verify** | `npm run verify` = lint (`ng lint` + architecture tests) + `ng test --watch=false` + `npm run test:contract` + `ng build` |
| **lib folder** | `src/app/shared/lib/` (pure TypeScript, no Angular imports) |
| **arch-test tool** | ESLint import boundaries (`eslint-plugin-boundaries`) plus the base import-scanning test for the `HttpClient` and `localStorage` rules. See [references/tooling.md](references/tooling.md) |
| **config module** | `src/app/infrastructure/config/`: the `APP_CONFIG` injection token, loaded at startup |
| **release type** | release-please `node`: the version lives in `package.json` |

---

## 1. Toolchain

- **Use the current supported Angular major**, never an end-of-life one. Check [angular.dev/reference/releases](https://angular.dev/reference/releases) before scaffolding or upgrading. Upgrade one major at a time with `ng update @angular/core @angular/cli`, then update NgRx to the matching major (`ng update @ngrx/store`).
- TypeScript `strict: true`, with `strictTemplates`, `strictInjectionParameters` and `strictInputAccessModifiers` in `angularCompilerOptions`.
- The esbuild `application` builder, with AOT and production budgets that warn and then fail (`initial`, `anyComponentStyle`).
- RxJS 7 with `inject()`-based DI. Pin the Node version in `engines` and `.nvmrc`.
- Prettier, plus `@angular-eslint`, `@ngrx/eslint-plugin` and `eslint-plugin-boundaries` (never TSLint).
- A `.gitignore` that covers OS and IDE files (`.DS_Store`, `.idea`, `.vscode/*` except shared settings).

## 2. Layers

```
src/app/
  core/
    domain/            models and pure business rules (no Angular, no RxJS)
    application/       global state (auth, loading, errors), facades, ports as abstract classes
  infrastructure/      ALL HttpClient, interceptors, localStorage/sessionStorage, window/document access, runtime config
  features/<feature>/
    state/             actions, reducer, effects, selectors (or <feature>.store.ts for a SignalStore)
    models/            the feature's UI models and DTO -> UI mappers
    containers/        smart components: read state, dispatch, route
    components/        presentational components: inputs in, outputs out
    <feature>.routes.ts
  shared/
    ui/                the in-house UI kit (buttons, tables, filter boxes, charts)
    lib/               the base lib: pure helpers
  app.config.ts        providers: router, store, effects, http, config (the composition root)
  app.routes.ts
```

| Layer | May import | Must never import |
| --- | --- | --- |
| `core/domain` | `shared/lib` | Angular, RxJS, NgRx, every other layer |
| `core/application` | `core/domain`, `shared/lib`, NgRx, RxJS | `infrastructure`, `features` |
| `infrastructure` | `core/*`, `shared/lib`, Angular `HttpClient` | `features`, `shared/ui` |
| `features/<x>` | `core/*`, `shared/*`, its own folders | another feature's internals, `infrastructure` (except through ports provided in `app.config.ts` or its routes) |
| `shared/ui` | `shared/lib`, Angular | `core`, `infrastructure`, `features`, NgRx |
| `shared/lib` | `shared/lib` | everything else, every package |

- **All browser and network I/O lives in infrastructure.** `HttpClient`, `localStorage`, `sessionStorage`, `window`, `document`, cookies and `navigator` are used only there, behind ports. Effects and stores inject the port, never `HttpClient`.
- **Ports are abstract classes**, so they double as DI tokens: `export abstract class MachineApi { abstract getOee(filter: OeeFilter): Observable<OeeDto[]>; }`. The implementation is provided with `{ provide: MachineApi, useClass: HttpMachineApi }`, and tests swap in a fake.
- **Features never import each other's internals.** Anything two features share moves to `core` (state or models) or `shared/ui`.

## 3. Features and routing

- Each feature is lazy loaded: `{ path: "production", loadChildren: () => import("./features/production/production.routes").then((m) => m.PRODUCTION_ROUTES) }`.
- The feature's routes register its state with `provideState(productionFeature)` and `provideEffects(ProductionEffects)`, so the state only exists once the feature is loaded.
- Guards are functional (`CanActivateFn`) and read state through a selector or facade. Call `inject()` synchronously at the top of the guard, never inside an RxJS callback:
  ```ts
  export const authGuard: CanActivateFn = () => {
    const router = inject(Router);
    return inject(Store).select(selectIsLoggedIn).pipe(take(1), map((loggedIn) => loggedIn || router.createUrlTree(["/login"])));
  };
  ```
- Components are standalone. There are no NgModules in new code.

## 4. State management

**Pick one approach per feature, and write it down in the feature's README or `AGENTS.md`:**

| Use | When |
| --- | --- |
| **Global Store** (`@ngrx/store` + effects) | state shared across features or routes (auth, session, notifications), complex async flows, time-travel debugging, many screens reacting to the same events |
| **SignalStore** (`@ngrx/signals`) | state local to one feature or component tree, CRUD screens, filters and forms, simple async calls |

Never bridge the two: effects do not write into a SignalStore, and a SignalStore does not dispatch global actions to store its own data.

### Global Store rules

- **Actions** use `createActionGroup` with a `[Source] Event` source and Success/Failure pairs, e.g. `source: "Production OEE Page"` with `"Filter Changed"`, `"Oee Loaded"`, `"Oee Load Failed"`. Props are named and typed, never `any` or `props<{ payload: any }>`.
- **Reducers** use `createFeature` + `createReducer`, with immutable updates only. Collections use `@ngrx/entity` adapters.
- **Selectors** come from `createFeature` (generated) and composed `createSelector`. Components never compute derived state; selectors do.
- **Effects** are functional (`createEffect(() => ..., { functional: true })`) or class-based with `inject()`. The flattening operator is chosen on purpose:
  - `switchMap` for searches and filters, where the latest request wins
  - `concatMap` for writes that must keep their order
  - `exhaustMap` for login and submit buttons
  - `mergeMap` for independent parallel requests

  `catchError` sits **inside** the flattening operator and maps the error to a failure action, so one error does not kill the effect. Use `forkJoin` for parallel loads that must all finish.
- **Mappers** from DTO to UI model are pure, exported functions in `models/`, tested on their own. Effects call them; reducers store UI models.
- **Loading and errors**: a global `loading` slice counts in-flight requests through effects, and failure actions go through an error-reporting port, never `console.log`.
- **Rehydration**: persist only what must survive a reload (for example the `auth` slice) through a meta-reducer whose storage access sits behind an infrastructure port.
- **DevTools**: `provideStoreDevtools({ maxAge: 25, logOnly: !isDevMode() })`.

### SignalStore rules

- `signalStore(withState(initial), withComputed(...), withMethods(...))`, with updates only through `patchState`.
- Async work uses `rxMethod` with the same operator choices as effects, or `withEntities` for collections.
- Provide it at the route or component level unless it is truly app-wide.

[references/state-patterns.md](references/state-patterns.md) has complete examples of an action group, feature reducer, effects, selectors, a facade, and a SignalStore.

## 5. Components

- **Containers** (smart) read state (`store.selectSignal(selectX)`, a facade, or a SignalStore) and dispatch. They hold no presentational markup beyond layout.
- **Presentational components** (dumb) use signal `input()` / `input.required()` and `output()`, have no injected services, and are reusable from `shared/ui` or the feature's `components/`.
- **`ChangeDetectionStrategy.OnPush` everywhere.** Move to zoneless change detection when every component is OnPush and signal-based.
- **Built-in control flow**: `@if`, `@for` (with `track`), `@switch`, and `@defer` for heavy below-the-fold widgets such as charts. Never nest `*ngIf="x$ | async as x"`.
- **Forms**: typed reactive forms (`FormGroup<{...}>` with `nonNullable`). Validation messages come from a shared component, not copied per form.

## 6. Data access (infrastructure)

- **One class per backend area** (`HttpMachineApi`, `HttpAuthApi`) extends a base API class. The base class builds URLs from `APP_CONFIG`, unwraps the backend's response envelope (`{ success, result, error }`) in **one place**, and turns backend errors into a typed `ApiError`.
- **DTOs** (`*Dto`) mirror the backend and never reach components. **UI models** (`*Ui` or plain names) are what state and components use.
- **Functional interceptors**, registered with `provideHttpClient(withInterceptors([...]))`:
  - an auth interceptor that adds the token and, on 401, refreshes once while queuing concurrent requests, then retries or logs out
  - a correlation-id interceptor
  - an error interceptor that reports unexpected failures
- Method names are camelCase verbs (`getOee`, `saveDowntimeReason`). Never mirror PascalCase backend names.

[references/data-access.md](references/data-access.md) has the port, the base API, the interceptors, and the runtime config loader.

## 7. Configuration and environments

- **Runtime config, not build-time URLs.** `APP_CONFIG` is an `InjectionToken<AppConfig>` filled at startup from `/config.json` (with `provideAppInitializer`). One build then runs in every environment, with the deployment writing `config.json`. Never hard-code `apiUrl` in components or services.
- Build-time values (if any) go in `.env.example` and are read only by the config module. **Everything in the bundle is public**: tokens and secrets never belong in `environment.ts`, `config.json` or `.env`.
- A local mock API (json-server or MSW) mirrors the backend's envelope, so the app runs without the real backend. A contract test checks that the mock's responses match the DTOs.

## 8. Testing

- **Vitest or Jest**, not Karma. Recent Angular versions support Vitest in the CLI; with Jest, use `jest-preset-angular`.
- **Reducers, selectors and mappers**: plain unit tests with no TestBed.
- **Effects**: `provideMockActions(() => actions$)` + a fake port + `provideMockStore`. Assert on the emitted actions, including the failure path.
- **SignalStores**: instantiate in `TestBed` with a fake port, call methods, and assert on signals.
- **Components**: Angular Testing Library (`render`, `screen`, `userEvent`), querying by role and label, never by CSS class.
- **Contract**: `node --test` checks the mock API against the DTO shapes.
- **E2E**: Playwright against the mock API, with a smoke test per feature route.
- **Architecture**: the boundary lint rules plus the import-scanning tests run in `verify`.

## 9. CI and releases

- The `verify` job runs `npm ci` and `npm run verify`, then Playwright on the built app (`npx playwright install --with-deps chromium`).
- release-please `node` bumps `package.json`. To show the version in the UI, read it at build time from `package.json` into the config module, never by hand. Deploy the built `dist/<app>/browser` output only after a release.

[references/tooling.md](references/tooling.md) has the boundary lint config, the architecture tests, `package.json` scripts, the CI job, and the release config.

---

## References

| File | Read it when |
| --- | --- |
| [references/arg-base.md](references/arg-base.md) | setting up the repo, opening a PR, releasing |
| [references/state-patterns.md](references/state-patterns.md) | adding actions, reducers, effects, selectors, a facade, or a SignalStore |
| [references/data-access.md](references/data-access.md) | adding an API service, an interceptor, or runtime configuration |
| [references/tooling.md](references/tooling.md) | lint boundaries, architecture tests, testing setup, CI, releases, upgrades |

## Angular checklist (on top of the base checklists)

- [ ] The feature is lazy loaded, and its state and effects are provided in its routes.
- [ ] One state approach for the feature (global Store or SignalStore), with no bridge between them.
- [ ] Actions are typed `[Source] Event` groups with Success/Failure pairs, and `catchError` sits inside the flattening operator.
- [ ] DTOs are mapped to UI models by pure, tested functions. Components never see DTOs.
- [ ] `HttpClient` and browser storage are used only in infrastructure, behind abstract-class ports.
- [ ] Components are standalone and OnPush, and use signal inputs and built-in control flow.
- [ ] No hard-coded URLs: everything comes from `APP_CONFIG`.
- [ ] `npm run verify` and the Playwright smoke tests pass.

---

## About

This skill is maintained by **[ARG Software](https://arg.software)** and distilled from ARG's Angular-Redux reference application and the Angular dashboards we build for industry. Need help building or modernising an Angular application? Visit [arg.software](https://arg.software).
