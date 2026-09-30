# Testing, environments, CI and releases

## Unit tests for use cases

```ts
// src/application/stores/findnearbystores.usecase.test.ts
import { FindNearbyStoresUseCase } from "./findnearbystores.usecase";
import type { ILocationPort } from "../ports/location.port";
import type { IStoresApi } from "../ports/stores.port";

const here = { latitude: 38.72, longitude: -9.14 };

function setup(location: Awaited<ReturnType<ILocationPort["current"]>>) {
  const api: IStoresApi = {
    near: jest.fn(async () => [
      { id: "a", name: "Closed", location: here, openNow: false },
      { id: "b", name: "Open", location: here, openNow: true },
    ]),
  };
  const useCase = new FindNearbyStoresUseCase({ current: async () => location }, api);
  return { api, useCase };
}

test("lists open stores first", async () => {
  const { useCase } = setup({ status: "granted", coordinates: here });
  const result = await useCase.execute();
  expect(result).toMatchObject({ kind: "found", stores: [{ id: "b" }, { id: "a" }] });
});

test("does not call the API when location is denied", async () => {
  const { api, useCase } = setup({ status: "denied" });
  expect(await useCase.execute()).toEqual({ kind: "location-denied" });
  expect(api.near).not.toHaveBeenCalled();
});
```

Fakes are plain objects typed by the port. No React Native, no module mocks.

## Component and screen tests

```tsx
// src/presentation/screens/NearbyStoresScreen.test.tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react-native";
import { ContainerContext, type UiContainer } from "../container";
import { NearbyStoresScreen } from "./NearbyStoresScreen";

function renderWith(container: Partial<UiContainer>) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <ContainerContext.Provider value={container as UiContainer}>
      <QueryClientProvider client={client}>
        <NearbyStoresScreen />
      </QueryClientProvider>
    </ContainerContext.Provider>,
  );
}

test("explains how to enable location when permission is denied", async () => {
  renderWith({ findNearbyStores: { execute: async () => ({ kind: "location-denied" }) } as never });
  expect(await screen.findByText(/allow location/i)).toBeOnTheScreen();
});
```

- Query by role, label and text, as a user would. Use `userEvent` for interactions.
- Do not snapshot whole screens; assert on what the user sees.
- Libraries with native parts need their official Jest mocks (Reanimated, gesture handler, FlashList) in `jest.setup.ts`.
- Use `jest-expo` as the preset for Expo apps and `@react-native/jest-preset` (or `react-native` preset on older versions) otherwise.

## E2E with Maestro

```yaml
# e2e/nearby-stores.yaml
appId: com.example.shop
---
- launchApp:
    clearState: true
    permissions:
      location: allow
- tapOn: "Stores"
- assertVisible: "Open now"
- scroll
- assertVisible:
    id: "store-row"
```

- One flow per critical journey (sign in, the main purchase or booking path, a permission-denied path).
- Stable selectors through `testID` on key elements, not copy that translators change.
- Detox is the alternative when the team needs gray-box synchronization; pick one per project.

## Configuration module

```ts
// src/infrastructure/config/env.ts
import { z } from "zod";

const schema = z.object({
  apiUrl: z.url(),
  sentryDsn: z.string().optional(),
  environment: z.enum(["development", "staging", "production"]),
});

// Expo inlines EXPO_PUBLIC_* at build time only for literal property access.
export const env = schema.parse({
  apiUrl: process.env.EXPO_PUBLIC_API_URL,
  sentryDsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
  environment: process.env.EXPO_PUBLIC_APP_ENV,
});
```

```bash
# .env.example  (tracked; copy to .env and fill in. Everything here ships inside the app bundle.)
# Base URL of the backend API
EXPO_PUBLIC_API_URL=https://api.example.test
# Sentry DSN (public by design); leave empty to disable
EXPO_PUBLIC_SENTRY_DSN=
# development | staging | production
EXPO_PUBLIC_APP_ENV=development
```

- For bare apps, `react-native-config` reads `.env` at build time; the same rules apply (public values only).
- Secrets that must never ship (API secret keys, signing credentials, store API keys) live in CI or EAS secrets and are used only by build and release jobs.

## CI

```yaml
name: CI
on:
  pull_request:
  push:
    branches: [main]
permissions:
  contents: read
concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true
jobs:
  verify:
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
  pr-title:
    if: github.event_name == 'pull_request'
    runs-on: ubuntu-latest
    permissions:
      pull-requests: read
    steps:
      - uses: amannn/action-semantic-pull-request@v5
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

```json
{
  "scripts": {
    "typecheck": "tsc --noEmit",
    "lint": "eslint .",
    "test": "jest --ci",
    "test:architecture": "node --test test/architecture/",
    "verify": "npm run typecheck && npm run lint && npm test && npm run test:architecture"
  }
}
```

- A second workflow builds a release artifact (EAS Build, or Gradle/Xcode on macOS runners) and runs Maestro on an emulator when native code changes and before every release. It also runs the Android 16 KB alignment check on the release APK.
- Dependabot or Renovate keeps dependencies current; React Native and Expo upgrades are their own PRs, following the upgrade helper or `npx expo install --fix`.

## Versions and releases

The marketing version (`1.4.0`) comes from release-please. Build numbers are separate and always increase.

```json
{
  "packages": {
    ".": {
      "release-type": "node",
      "extra-files": [
        { "type": "json", "path": "app.json", "jsonpath": "$.expo.version" }
      ]
    }
  }
}
```

- **Expo**: set `"appVersionSource": "remote"` under `cli` in `eas.json` and `"autoIncrement": true` on the production build profile, so EAS owns `versionCode` / `buildNumber`.
- **Bare React Native**: annotate the Android version line for the generic updater, and set the iOS marketing version in the release job:

```groovy
// android/app/build.gradle
versionName "1.4.0" // x-release-please-version
```

```json
{ "type": "generic", "path": "android/app/build.gradle" }
```

  For iOS, run `agvtool new-marketing-version "$(node -p "require('./package.json').version")"` (or Fastlane `increment_version_number`) in the release workflow, and take the build number from the CI run number.
- **Delivery**: EAS Build + EAS Submit, or Fastlane lanes, triggered when release-please creates a release. Store credentials live only in CI or EAS secrets.
- **Over-the-air updates** (EAS Update or equivalent) only for JS and asset changes compatible with the installed native runtime. Use a `runtimeVersion` policy (`appVersion` or `fingerprint`) so an update never reaches a binary it does not match. Any native change (new module, SDK upgrade, permission) ships through the stores.
- A change that forces users to update (a removed API version, a new minimum OS) is a `BREAKING CHANGE` for the app's release notes, even though the stores do not use SemVer.
