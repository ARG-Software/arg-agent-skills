# Tooling: boundaries, tests, CI, releases and upgrades

## `package.json` scripts

```json
{
  "scripts": {
    "start": "ng serve",
    "mock": "json-server --watch server/db.json --routes server/routes.json --port 3001",
    "lint": "ng lint && node --test test/architecture/",
    "test": "ng test --watch=false",
    "test:contract": "node --test server/",
    "e2e": "playwright test",
    "build": "ng build",
    "verify": "npm run lint && npm run test && npm run test:contract && npm run build"
  }
}
```

## Import boundaries with `eslint-plugin-boundaries`

```js
// eslint.config.js (excerpt)
import boundaries from "eslint-plugin-boundaries";

export default [
  // ...angular-eslint, ngrx and prettier configs
  {
    files: ["src/**/*.ts"],
    plugins: { boundaries },
    settings: {
      "import/resolver": { typescript: { project: "tsconfig.json" } },
      "boundaries/elements": [
        { type: "domain", pattern: "src/app/core/domain" },
        { type: "application", pattern: "src/app/core/application" },
        { type: "infrastructure", pattern: "src/app/infrastructure" },
        { type: "feature", pattern: "src/app/features/*", capture: ["feature"] },
        { type: "ui", pattern: "src/app/shared/ui" },
        { type: "lib", pattern: "src/app/shared/lib" },
        { type: "root", pattern: "src/app/app.*", mode: "file" },
      ],
    },
    rules: {
      "boundaries/element-types": [
        "error",
        {
          default: "disallow",
          rules: [
            { from: "domain", allow: ["domain", "lib"] },
            { from: "application", allow: ["application", "domain", "lib"] },
            { from: "infrastructure", allow: ["infrastructure", "application", "domain", "lib"] },
            { from: "feature", allow: ["application", "domain", "ui", "lib", ["feature", { feature: "${from.feature}" }]] },
            { from: "ui", allow: ["ui", "lib"] },
            { from: "lib", allow: ["lib"] },
            { from: "root", allow: ["root", "domain", "application", "infrastructure", "feature", "ui", "lib"] },
          ],
        },
      ],
    },
  },
];
```

- `["feature", { feature: "${from.feature}" }]` lets a feature import only its own files, never another feature's.
- `root` is the composition root (`app.config.ts`, `app.routes.ts`), the only place that wires infrastructure implementations to ports.

## Package and global rules (import-scanning test)

Boundaries cover folders. These checks cover packages and globals, using the helper from [arg-base.md](arg-base.md) section 4 with `SOURCE_ROOT = "src/app"` and `LAYERS = ["core", "infrastructure", "features", "shared"]`:

```js
// test/architecture/angular.spec.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { filesUnder, importSpecifiers, stripComments } from "./layers.js";

const outsideInfrastructure = filesUnder("src/app").filter((file) => !file.startsWith("src/app/infrastructure/"));

test("only infrastructure imports HttpClient", () => {
  const offenders = outsideInfrastructure.filter((file) => /\bHttpClient\b/.test(stripComments(readFileSync(file, "utf8"))));
  assert.deepEqual(offenders, []);
});

test("only infrastructure touches browser storage and globals", () => {
  const pattern = /\b(localStorage|sessionStorage|document\.cookie|window\.)/;
  const offenders = outsideInfrastructure.filter((file) => pattern.test(stripComments(readFileSync(file, "utf8"))));
  assert.deepEqual(offenders, []);
});

test("domain imports no Angular, RxJS or NgRx", () => {
  const offenders = filesUnder("src/app/core/domain").flatMap((file) =>
    importSpecifiers(readFileSync(file, "utf8"))
      .filter((specifier) => /^(@angular|rxjs|@ngrx)/.test(specifier))
      .map((specifier) => `${file} -> ${specifier}`),
  );
  assert.deepEqual(offenders, []);
});
```

`npm run lint` runs these tests after `ng lint`, so they are part of verify.

## Test runner

- Recent Angular CLI versions support Vitest (`@angular/build:unit-test`). Use it for new projects. For older projects, move from Karma to Jest with `jest-preset-angular`, then to Vitest when you upgrade.
- Use `@testing-library/angular` and `@testing-library/user-event` for components.
- NgRx testing: `provideMockStore({ initialState, selectors: [...] })`, `provideMockActions(() => actions$)`, and `overrideSelector` for container tests.

Effects test (Vitest or Jest syntax):

```ts
it("maps a failed request to OeeLoadFailed", async () => {
  TestBed.configureTestingModule({
    providers: [provideMockActions(() => of(OeePageActions.filterChanged({ filter }))), { provide: MachineApi, useValue: { getOee: () => throwError(() => new Error("boom")) } }],
  });

  const action = await firstValueFrom(TestBed.runInInjectionContext(() => loadOee()));

  expect(action).toEqual(OeeApiActions.oeeLoadFailed({ message: "boom" }));
});
```

## CI `verify` job

```yaml
  verify:
    name: verify
    runs-on: ubuntu-latest
    timeout-minutes: 20
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version-file: .nvmrc
          cache: npm
      - run: npm ci
      - run: npm run verify
      - run: npx playwright install --with-deps chromium
      - run: npm run e2e
      - if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-report
          path: playwright-report/
```

Playwright's `webServer` config starts the mock API and `ng serve` (or serves the built output), so the e2e step needs no extra services.

## Releases

```json
{
  "$schema": "https://raw.githubusercontent.com/googleapis/release-please/main/schemas/config.json",
  "packages": {
    ".": { "release-type": "node", "bump-minor-pre-major": true, "include-component-in-tag": false }
  }
}
```

- The build writes the version from `package.json` into `public/config.json` (a small `prebuild` script) so the UI can show it. Nobody edits it by hand.
- The release workflow builds `dist/<app>/browser` and attaches it to the GitHub release, or triggers the deployment workflow for the tag.

## Upgrading Angular and NgRx

1. Create `chore/angular-<major>` from the default branch.
2. Check [angular.dev/update-guide](https://angular.dev/update-guide) for the current and target versions.
3. Run `ng update @angular/core@<next> @angular/cli@<next>`, then `ng update @ngrx/store@<next>` (its schematics migrate the NgRx packages together). Move one major at a time.
4. Run the optional migrations when they apply: standalone, control flow, signal inputs, `inject()`.
5. Run verify and the e2e tests after each major, and commit each major separately.
6. The PR title is `chore(deps): upgrade to Angular <major>`, or `feat!:` if user-visible behaviour changed.
