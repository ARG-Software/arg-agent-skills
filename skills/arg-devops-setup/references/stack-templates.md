# Stack templates

The per-stack parts of the setup. The shared skeletons (the CI workflow with its `verify` and `pr-title` jobs, the ruleset, the PR template, release-please, `.env`) are in [arg-base.md](arg-base.md) sections 2 to 4; this file fills in the stack-specific steps.

For every stack, adapt to what the repo already uses (its package manager, test runner, linter, folders) instead of copying these verbatim. Pin third-party actions at least to a major version; teams with strict supply-chain rules pin to a commit SHA and let Dependabot update it.

## Contents

- [Dependency updates (all stacks)](#dependency-updates-all-stacks)
- [Node and TypeScript](#node-and-typescript)
- [Nx monorepo](#nx-monorepo)
- [.NET](#net)
- [Python](#python)
- [Go](#go)
- [Rust](#rust)

## Releases on an existing project (all stacks)

The release-please skeleton in [arg-base.md](arg-base.md) section 2.5 starts a new project at `0.0.0`. On an existing project:

- Seed `.release-please-manifest.json` with the **current** version: `{ ".": "1.2.0" }`. Starting from `0.0.0` would propose a lower version.
- Add `"bootstrap-sha": "<output of git rev-parse HEAD on the default branch>"` to the package in `release-please-config.json`, so the first Release PR only lists changes made after the setup.
- `bump-minor-pre-major` only matters while the version is `0.x`; it is harmless at `1.x` and later.
- If tags already exist (`v1.2.0`), release-please finds them; keep the existing tag format with `include-component-in-tag` and `include-v-in-tag`.

## Dependency updates (all stacks)

`.github/dependabot.yml`, one entry per ecosystem the repo uses, plus GitHub Actions:

```yaml
version: 2
updates:
  - package-ecosystem: npm            # nuget | uv | pip | gomod | cargo | docker
    directory: /
    schedule: { interval: weekly }
    groups:
      minor-and-patch: { update-types: [minor, patch] }
    commit-message: { prefix: chore, include: scope }
  - package-ecosystem: github-actions
    directory: /
    schedule: { interval: weekly }
    commit-message: { prefix: ci }
```

The `chore` and `ci` prefixes keep dependency bumps out of releases. Use `prefix: fix` instead when the team wants a patch release for every security update. If the repo uses Renovate, keep it.

---

## Node and TypeScript

**Runtime pin**: `.nvmrc` (for example `22`) and `packageManager` in `package.json` (for example `"pnpm@9.15.0"`).

**verify script** in `package.json`, so everyone runs the same thing:

```json
{ "scripts": { "verify": "pnpm lint && pnpm typecheck && pnpm test && pnpm build" } }
```

**CI steps** for the `verify` job:

```yaml
      - uses: pnpm/action-setup@v4          # omit for npm; reads packageManager
      - uses: actions/setup-node@v4
        with:
          node-version-file: .nvmrc
          cache: pnpm                       # npm | yarn
      - run: pnpm install --frozen-lockfile # npm ci | yarn install --immutable
      - run: pnpm verify
```

**No lock file?** `npm ci` and `cache: npm` fail without one. Generate it with `npm install --package-lock-only` (it writes the lock file without installing). That contacts the registry unless the project has no dependencies, so ask the user first. If they decline, use `npm install` and drop `cache:` in CI, and list the lock file as a follow-up.

**release-please**: `"release-type": "node"`. It bumps `package.json` and `package-lock.json` itself.

**Architecture tests**: if the repo has no boundary tool, copy the dependency-free helper from [arg-base.md](arg-base.md) section 4, with three adjustments:

1. **Put the helper outside the test folders**, for example `tools/architecture/layers.js`. Runners such as `node --test` treat every `.js` file under `test/` as a test file.
2. **Set `LAYERS` and `SOURCE_ROOT` to the folders that exist.** Use the repo's helper folder name (`utils`, `common`) in place of `lib`; otherwise imports of it count as `OUTSIDE` and correct code fails. Files directly under `SOURCE_ROOT` (the composition root, such as `src/index.js`) are not checked, which is intended.
3. **Write the test for the repo's runner and module system.** With `"type": "module"`, imports need the `.js` extension. For `node:test`:

```js
// test/architecture/layers.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { EXTERNAL, OUTSIDE, usagesOutside, violations } from "../../tools/architecture/layers.js";

// Offenders that existed before the setup. Remove an entry when it is fixed; never add one.
const KNOWN_EXCEPTIONS = [
  "src/domain/order.js -> ../infrastructure/config.js",
];
const fresh = (found) => found.filter((v) => !KNOWN_EXCEPTIONS.includes(v));

const RULES = {
  "domain must not import other layers": () => violations("domain", ["application", "infrastructure"]),
  "domain must not import packages": () => violations("domain", [EXTERNAL, OUTSIDE]),
  "application must not import infrastructure": () => violations("application", ["infrastructure"]),
  "utils stays dependency-free": () => violations("utils", ["domain", "application", "infrastructure", EXTERNAL, OUTSIDE]),
};

for (const [name, check] of Object.entries(RULES)) {
  test(name, () => assert.deepEqual(fresh(check()), []));
}

test("only the config module reads the environment", () => {
  assert.deepEqual(usagesOutside(["infrastructure"], /\b(process\.env|import\.meta\.env)\b/), []);
});

test("every known exception still exists (delete the fixed ones)", () => {
  const all = Object.values(RULES).flatMap((check) => check());
  assert.deepEqual(KNOWN_EXCEPTIONS.filter((e) => !all.includes(e)), []);
});
```

For Jest or Vitest, use the same structure with `describe`/`test`/`expect`. Prove the rules work before committing: add a temporary file that breaks one, watch the test fail with the `file -> import` pair, then delete it.

**Config parity test** (when the repo has a config module), so `.env.example` and the code never drift:

```js
// test/config.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test(".env.example lists exactly the variables the config module reads", () => {
  const example = readFileSync(".env.example", "utf8").split(/\r?\n/)
    .map((line) => /^([A-Z0-9_]+)=/.exec(line)?.[1]).filter(Boolean);
  const config = readFileSync("src/infrastructure/config.js", "utf8");
  const read = [...config.matchAll(/process\.env\.([A-Z0-9_]+)/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(read)].sort(), [...new Set(example)].sort());
});
```

If the repo already uses ESLint flat config, `eslint-plugin-boundaries` is an alternative to the helper that runs with lint:

```js
// eslint.config.js (excerpt)
import boundaries from "eslint-plugin-boundaries";

export default [
  {
    plugins: { boundaries },
    settings: {
      "boundaries/elements": [
        { type: "domain", pattern: "src/domain/*" },
        { type: "application", pattern: "src/application/*" },
        { type: "infrastructure", pattern: "src/infrastructure/*" },
        { type: "presentation", pattern: "src/presentation/*" },
        { type: "lib", pattern: "src/lib/*" },
      ],
      "import/resolver": { typescript: true },
    },
    rules: {
      "boundaries/element-types": ["error", {
        default: "disallow",
        rules: [
          { from: "domain", allow: ["domain", "lib"] },
          { from: "application", allow: ["application", "domain", "lib"] },
          { from: "infrastructure", allow: ["infrastructure", "application", "domain", "lib"] },
          { from: "presentation", allow: ["presentation", "application", "domain", "lib"] },
          { from: "lib", allow: ["lib"] },
        ],
      }],
    },
  },
];
```

The TypeScript resolver is required; without it, path aliases are not resolved and violations pass silently.

## Nx monorepo

**CI steps**: only affected projects, with the base commit set correctly:

```yaml
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version-file: .nvmrc, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - uses: nrwl/nx-set-shas@v4
      - run: pnpm nx affected -t lint typecheck test build
```

**release-please**: one package per deployable app or publishable library, `"separate-pull-requests": true`, tags `<component>-vX.Y.Z` (see `arg-nx-monorepo` for the full setup).

**Architecture tests**: tag every project (`"tags": ["type:domain", "scope:orders"]` in `project.json`) and enforce `@nx/enforce-module-boundaries` in the root ESLint config:

```js
"@nx/enforce-module-boundaries": ["error", {
  enforceBuildableLibDependency: true,
  depConstraints: [
    { sourceTag: "type:domain", onlyDependOnLibsWithTags: ["type:domain", "type:util"] },
    { sourceTag: "type:application", onlyDependOnLibsWithTags: ["type:application", "type:domain", "type:util"] },
    { sourceTag: "type:infrastructure", onlyDependOnLibsWithTags: ["type:infrastructure", "type:application", "type:domain", "type:util"] },
    { sourceTag: "type:util", onlyDependOnLibsWithTags: ["type:util"] },
  ],
}]
```

## .NET

**Runtime pin**: `global.json` with the SDK version and `"rollForward": "latestFeature"`.

**CI steps**:

```yaml
      - uses: actions/setup-dotnet@v4
        with: { global-json-file: global.json }
      - run: dotnet restore
      - run: dotnet format --verify-no-changes --no-restore
      - run: dotnet build --no-restore -c Release -warnaserror
      - run: dotnet test --no-build -c Release
```

Add `services:` (or Testcontainers, which needs only Docker on the runner) when integration tests need a database.

**release-please**: `"release-type": "simple"`, with the version kept in one place and listed in `extra-files`:

```xml
<!-- Directory.Build.props -->
<Project>
  <PropertyGroup>
    <Version>0.1.0</Version> <!-- x-release-please-version -->
  </PropertyGroup>
</Project>
```

```json
{ "packages": { ".": { "release-type": "simple", "extra-files": ["Directory.Build.props"] } } }
```

**Architecture tests**: a `tests/<Product>.ArchitectureTests` project with NetArchTest.Rules (see `arg-dotnet` for the full set):

```csharp
[Fact]
public void Domain_must_not_depend_on_other_layers()
{
    var result = Types.InAssembly(typeof(DomainMarker).Assembly)
        .ShouldNot().HaveDependencyOnAny("MyApp.Application", "MyApp.Infrastructure", "MyApp.Api")
        .GetResult();

    Assert.True(result.IsSuccessful, string.Join(", ", result.FailingTypeNames ?? []));
}
```

## Python

**Runtime pin**: `.python-version` and `requires-python` in `pyproject.toml`.

**CI steps** (uv; for poetry use `snok/install-poetry` and `poetry install --sync`):

```yaml
      - uses: astral-sh/setup-uv@v5
        with: { enable-cache: true }
      - run: uv sync --locked
      - run: uv run ruff check
      - run: uv run ruff format --check
      - run: uv run mypy .        # or pyright, whichever the repo uses
      - run: uv run pytest
```

**release-please**: `"release-type": "python"`. It bumps the version in `pyproject.toml`; list any `__version__` file in `extra-files`.

**Architecture tests**: import-linter, run in CI with `uv run lint-imports`:

```ini
# .importlinter
[importlinter]
root_package = myapp

[importlinter:contract:layers]
name = Dependencies point inward
type = layers
layers =
    myapp.presentation | myapp.infrastructure
    myapp.application
    myapp.domain

[importlinter:contract:lib]
name = lib stays dependency-free
type = forbidden
source_modules = myapp.lib
forbidden_modules =
    myapp.domain
    myapp.application
    myapp.infrastructure
    myapp.presentation
```

## Go

**Runtime pin**: the `go` (and optional `toolchain`) line in `go.mod`.

**CI steps**:

```yaml
      - uses: actions/setup-go@v5
        with: { go-version-file: go.mod }
      - run: test -z "$(gofmt -l .)"
      - run: go vet ./...
      - uses: golangci/golangci-lint-action@v6   # if the repo uses golangci-lint
      - run: go test -race ./...
      - run: go build ./...
```

**release-please**: `"release-type": "go"`. Go modules are versioned by the git tag; nothing else to bump. For a module at v2 or later, the module path must end in `/v2`.

**Architecture tests**: `go-arch-lint` with a `.go-arch-lint.yml`, run in CI, or a plain Go test that walks `go list -deps -json ./internal/domain/...` and fails on any import of `internal/infrastructure` or `internal/application`. Keep `internal/` so other modules cannot import the layers at all.

## Rust

**Runtime pin**: `rust-toolchain.toml` with the channel, plus `rustfmt` and `clippy` components; `rustup` picks it up automatically.

**CI steps**:

```yaml
      - uses: dtolnay/rust-toolchain@stable
        with: { components: "rustfmt, clippy" }
      - uses: Swatinem/rust-cache@v2
      - run: cargo fmt --all --check
      - run: cargo clippy --all-targets --all-features -- -D warnings
      - run: cargo test --all-features
      - run: cargo build --release
```

**release-please**: `"release-type": "rust"` for a single crate; for a workspace, one package per published crate plus the `cargo-workspace` plugin.

**Architecture tests**: make each layer its own crate in a workspace (`domain`, `application`, `infrastructure`, `app`). Cargo then enforces the direction: a crate cannot import one it does not depend on. Add a test that runs `cargo metadata --format-version 1` and fails if `domain` or `application` lists `infrastructure` (or a forbidden third-party crate) in its dependencies.
