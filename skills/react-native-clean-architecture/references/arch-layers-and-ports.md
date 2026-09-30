# Layers, ports and adapters: worked examples

The examples follow one feature, "nearby stores": the app reads the device location, asks the API for stores near it, and caches the last result.

## Domain

```ts
// src/domain/stores/store.ts
export interface Coordinates {
  readonly latitude: number;
  readonly longitude: number;
}

export interface Store {
  readonly id: string;
  readonly name: string;
  readonly location: Coordinates;
  readonly openNow: boolean;
}

export function sortByOpenFirst(stores: readonly Store[]): Store[] {
  return [...stores].sort((a, b) => Number(b.openNow) - Number(a.openNow));
}
```

## Application: ports and a use case

```ts
// src/application/ports/location.port.ts
import type { Coordinates } from "@domain/stores/store";

export type LocationResult =
  | { status: "granted"; coordinates: Coordinates }
  | { status: "denied" }
  | { status: "unavailable" };

export interface ILocationPort {
  current(): Promise<LocationResult>;
}
```

```ts
// src/application/ports/stores.port.ts
import type { Coordinates, Store } from "@domain/stores/store";

export interface IStoresApi {
  near(coordinates: Coordinates, signal?: AbortSignal): Promise<Store[]>;
}
```

```ts
// src/application/stores/findnearbystores.usecase.ts
import { sortByOpenFirst, type Store } from "@domain/stores/store";
import type { ILocationPort } from "../ports/location.port";
import type { IStoresApi } from "../ports/stores.port";

export type NearbyStores =
  | { kind: "found"; stores: Store[] }
  | { kind: "location-denied" }
  | { kind: "location-unavailable" };

export class FindNearbyStoresUseCase {
  constructor(
    private readonly location: ILocationPort,
    private readonly api: IStoresApi,
  ) {}

  async execute(signal?: AbortSignal): Promise<NearbyStores> {
    const position = await this.location.current();
    if (position.status === "denied") return { kind: "location-denied" };
    if (position.status === "unavailable") return { kind: "location-unavailable" };

    const stores = await this.api.near(position.coordinates, signal);
    return { kind: "found", stores: sortByOpenFirst(stores) };
  }
}
```

- Expected outcomes (permission denied, no GPS) are values the screen renders. Unexpected failures (network down, 500) throw and TanStack Query exposes them as `error`.
- "Unavailable" is not "denied": a device with location off gets a different message and action than a user who refused permission.

```ts
// src/application/queries/keys.ts
export const queryKeys = {
  nearbyStores: ["stores", "nearby"] as const,
} as const;
```

## Infrastructure: adapters

```ts
// src/infrastructure/location/expolocation.adapter.ts
import * as Location from "expo-location";
import type { ILocationPort, LocationResult } from "@application/ports/location.port";

export class ExpoLocationAdapter implements ILocationPort {
  async current(): Promise<LocationResult> {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") return { status: "denied" };
    if (!(await Location.hasServicesEnabledAsync())) return { status: "unavailable" };

    const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    return {
      status: "granted",
      coordinates: { latitude: position.coords.latitude, longitude: position.coords.longitude },
    };
  }
}
```

```ts
// src/infrastructure/http/httpclient.ts
export class HttpError extends Error {
  constructor(readonly status: number, readonly path: string) {
    super(`HTTP ${status} for ${path}`);
  }
}

export class HttpClient {
  constructor(
    private readonly baseUrl: string,
    private readonly token: () => Promise<string | null>,
  ) {}

  async get<T>(path: string, signal?: AbortSignal): Promise<T> {
    const token = await this.token();
    const response = await fetch(`${this.baseUrl}${path}`, {
      headers: { Accept: "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      signal,
    });
    if (!response.ok) throw new HttpError(response.status, path);
    return (await response.json()) as T;
  }
}
```

```ts
// src/infrastructure/stores/httpstores.api.ts
import type { IStoresApi } from "@application/ports/stores.port";
import type { Coordinates, Store } from "@domain/stores/store";
import type { HttpClient } from "../http/httpclient";

interface StoreDto {
  id: string;
  display_name: string;
  lat: number;
  lng: number;
  is_open: boolean;
}

export class HttpStoresApi implements IStoresApi {
  constructor(private readonly http: HttpClient) {}

  async near({ latitude, longitude }: Coordinates, signal?: AbortSignal): Promise<Store[]> {
    const dtos = await this.http.get<StoreDto[]>(`/stores?lat=${latitude}&lng=${longitude}`, signal);
    return dtos.map((dto) => ({
      id: dto.id,
      name: dto.display_name,
      location: { latitude: dto.lat, longitude: dto.lng },
      openNow: dto.is_open,
    }));
  }
}
```

- DTOs (the API's shape) never leave the adapter. The mapping is where API renames are absorbed.
- Tokens come from a `SecureStore` adapter behind an `ITokenStore` port. Never keep them in MMKV or AsyncStorage unencrypted.

## Bootstrap: the container and providers

```ts
// src/bootstrap/container.ts
import { FindNearbyStoresUseCase } from "@application/stores/findnearbystores.usecase";
import { env } from "@infrastructure/config/env";
import { HttpClient } from "@infrastructure/http/httpclient";
import { ExpoLocationAdapter } from "@infrastructure/location/expolocation.adapter";
import { SecureTokenStore } from "@infrastructure/storage/securetoken.store";
import { HttpStoresApi } from "@infrastructure/stores/httpstores.api";

export function createContainer() {
  const tokens = new SecureTokenStore();
  const http = new HttpClient(env.apiUrl, () => tokens.read());

  return {
    findNearbyStores: new FindNearbyStoresUseCase(new ExpoLocationAdapter(), new HttpStoresApi(http)),
  };
}

export type Container = ReturnType<typeof createContainer>;
```

```tsx
// src/bootstrap/AppProviders.tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { ContainerContext } from "@presentation/container";
import { createContainer } from "./container";

export function AppProviders({ children }: { children: ReactNode }) {
  const [container] = useState(createContainer);
  const [queryClient] = useState(() => new QueryClient({ defaultOptions: { queries: { staleTime: 60_000 } } }));

  return (
    <ContainerContext.Provider value={container}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </ContainerContext.Provider>
  );
}
```

`ContainerContext` is declared in presentation with a structural type (the use cases the UI needs), so presentation never imports `bootstrap`. Its value never changes, so it causes no re-renders.

```tsx
// src/presentation/container.ts
import { createContext, useContext } from "react";
import type { FindNearbyStoresUseCase } from "@application/stores/findnearbystores.usecase";

export interface UiContainer {
  findNearbyStores: FindNearbyStoresUseCase;
}

export const ContainerContext = createContext<UiContainer | null>(null);

export function useContainer(): UiContainer {
  const container = useContext(ContainerContext);
  if (!container) throw new Error("useContainer must be used inside AppProviders");
  return container;
}
```

## Presentation: hook and screen

```tsx
// src/presentation/stores/useNearbyStores.ts
import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@application/queries/keys";
import { useContainer } from "../container";

export function useNearbyStores() {
  const { findNearbyStores } = useContainer();
  return useQuery({
    queryKey: queryKeys.nearbyStores,
    queryFn: ({ signal }) => findNearbyStores.execute(signal),
  });
}
```

```tsx
// src/presentation/screens/NearbyStoresScreen.tsx
import { FlashList } from "@shopify/flash-list";
import { Text } from "react-native";
import type { Store } from "@domain/stores/store";
import { StoreRow } from "../stores/StoreRow";
import { useNearbyStores } from "../stores/useNearbyStores";
import { ErrorState, LoadingState, PermissionState } from "../components/states";

const renderStore = ({ item }: { item: Store }) => <StoreRow store={item} />;
const storeKey = (store: Store) => store.id;

export function NearbyStoresScreen() {
  const { data, error, isPending, refetch } = useNearbyStores();

  if (isPending) return <LoadingState />;
  if (error) return <ErrorState onRetry={refetch} />;
  if (data.kind === "location-denied") return <PermissionState reason="denied" />;
  if (data.kind === "location-unavailable") return <PermissionState reason="off" />;
  if (data.stores.length === 0) return <Text>No stores nearby</Text>;

  return <FlashList data={data.stores} renderItem={renderStore} keyExtractor={storeKey} />;
}
```

## Architecture tests

Start from the base helper (`test/architecture/layers.js` in [arg-base.md](arg-base.md)) with `LAYERS = ["domain", "application", "infrastructure", "presentation", "bootstrap", "lib"]` (add `"app"` for Expo Router). React Native needs package rules on top of the layer rules, because presentation may import `react-native` but not device packages:

```js
// test/architecture/packages.js
import { readFileSync } from "node:fs";
import { filesUnder, importSpecifiers } from "./layers.js";

/** `file -> import` pairs in `src/<layer>` whose package specifier matches `pattern`. */
export function packageImports(layer, pattern) {
  return filesUnder(`src/${layer}`).flatMap((file) =>
    importSpecifiers(readFileSync(file, "utf8"))
      .filter((specifier) => pattern.test(specifier))
      .map((specifier) => `${file} -> ${specifier}`),
  );
}

// Packages that reach the device, the network or storage. Extend when you add one.
export const OUTSIDE_WORLD =
  /^(expo-(?!router|status-bar|linear-gradient|image$|font$|splash-screen)[a-z-]+|react-native-(mmkv|config|permissions|device-info|keychain|biometrics|vision-camera|maps|geolocation-service)|@react-native-async-storage\/|@react-native-firebase\/|@react-native-community\/(geolocation|netinfo)|axios|@supabase\/|firebase(\/|$)|@sentry\/)/;

export const REACT_NATIVE = /^(react-native(-[a-z-]+)?|@react-native[a-z-]*|expo(-[a-z-]+)?)(\/|$)/;
```

```js
// test/architecture/layers.test.js  (node --test)
import assert from "node:assert/strict";
import { test } from "node:test";
import { EXTERNAL, OUTSIDE, usagesOutside, violations } from "./layers.js";
import { OUTSIDE_WORLD, REACT_NATIVE, packageImports } from "./packages.js";

test("domain imports only lib", () => {
  assert.deepEqual(violations("domain", ["application", "infrastructure", "presentation", "bootstrap", EXTERNAL, OUTSIDE]), []);
});

test("application does not import infrastructure, presentation or bootstrap", () => {
  assert.deepEqual(violations("application", ["infrastructure", "presentation", "bootstrap"]), []);
});

test("application does not import React Native or Expo", () => {
  assert.deepEqual(packageImports("application", REACT_NATIVE), []);
});

test("presentation does not import infrastructure or bootstrap", () => {
  assert.deepEqual(violations("presentation", ["infrastructure", "bootstrap"]), []);
});

test("only infrastructure imports device, network and storage packages", () => {
  for (const layer of ["domain", "application", "presentation", "lib"]) {
    assert.deepEqual(packageImports(layer, OUTSIDE_WORLD), [], layer);
  }
});

test("only infrastructure calls fetch or reads the environment", () => {
  assert.deepEqual(usagesOutside(["infrastructure"], /\bfetch\s*\(|\bprocess\.env\b/), []);
});

test("lib stays dependency-free", () => {
  assert.deepEqual(violations("lib", ["domain", "application", "infrastructure", "presentation", "bootstrap", EXTERNAL, OUTSIDE]), []);
});
```

- `usagesOutside` also scans `bootstrap`; keep `process.env` there out too by reading config only through `env.ts`.
- The `OUTSIDE_WORLD` list is an allow-by-default pattern: the `expo-*` exclusions are presentation-only packages. Review it when you add a dependency, in the same PR.
- These files are ES modules for `node --test` (use `.mjs` names or `"type": "module"` in `test/architecture/package.json`). With Jest instead, drop the `.js` extensions and assert with `expect(...).toEqual([])`.

## ESLint rules that support the architecture

```js
// eslint.config.js (excerpt)
export default [
  {
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [
          { group: ["@presentation/components", "@presentation/components/index"], message: "Import the component file directly (no barrel imports)." },
          { group: ["**/index"], message: "Import the module file directly (no barrel imports)." },
        ],
      }],
    },
  },
];
```

The architecture tests stay the source of truth; the lint rule only gives faster feedback in the editor.
