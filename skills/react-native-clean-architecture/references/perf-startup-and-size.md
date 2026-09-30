# Startup and size: TTI, Hermes, bundle, app size, Android build, remote chunks

## Measure time to interactive (TTI)

TTI here means the time from the process starting to the first screen the user can use. Only **cold starts** count: exclude warm starts, starts from a background notification, and iOS prewarmed launches, which make the numbers meaningless.

`react-native-performance` records native marks (`nativeLaunchStart`/`End`, `appCreationStart`/`End`, `runJSBundleStart`/`End`, `contentAppeared`) after its native setup. Add one JS mark when the first real screen has content:

```tsx
// src/presentation/screens/HomeScreen.tsx
import performance from "react-native-performance";

export function HomeScreen() {
  const { data } = useHomeFeed();

  useEffect(() => {
    if (data) performance.mark("screenInteractive");
  }, [data]);

  // ...
}
```

Report the phases through an analytics port (never call the analytics SDK from the screen):

```ts
// src/infrastructure/performance/startupmetrics.ts
import performance from "react-native-performance";

function between(start: string, end: string): number | null {
  const [a] = performance.getEntriesByName(start);
  const [b] = performance.getEntriesByName(end);
  return a && b ? b.startTime - a.startTime : null;
}

export function startupMetrics() {
  return {
    nativeInitMs: between("nativeLaunchStart", "nativeLaunchEnd"),
    bundleLoadMs: between("runJSBundleStart", "runJSBundleEnd"),
    ttiMs: between("nativeLaunchStart", "screenInteractive"),
  };
}
```

Compare TTI per release on the same device class. A regression in `bundleLoadMs` points at bundle size or module evaluation; in the JS-to-interactive gap, at work done before the first screen.

## Do less before the first screen

- Initialise SDKs (analytics, crash reporting, remote config) after the first screen renders unless they must capture startup.
- No top-level work in modules that the entry imports: no big JSON parsing, no synchronous storage scans.
- Native navigation (`react-native-screens` with a native stack). Load rarely used screens lazily, and preload the one the user most likely opens next.
- Show cached data first (TanStack Query persistence through an MMKV storage port) and refresh in the background.

## Hermes and bundle compression (Android)

Hermes memory-maps its bytecode so it loads only the pages it touches. A compressed bundle inside the APK cannot be mapped and must be inflated first, which slows startup.

- **React Native 0.79 and later** ship the Android bundle uncompressed by default. Check that nobody turned compression back on (`react { enableBundleCompression = ... }` in `android/app/build.gradle`).
- **0.78 and earlier**: add the bundle to the no-compress list and rebuild:

```groovy
// android/app/build.gradle
android {
    androidResources {
        noCompress += ["bundle"]
    }
}
```

The trade-off is a slightly larger install for a faster start. Measure both.

## Analyse the JS bundle

```bash
npx react-native bundle --entry-file index.js --platform android --dev false --minify true \
  --bundle-output /tmp/main.jsbundle --sourcemap-output /tmp/main.jsbundle.map
npx source-map-explorer /tmp/main.jsbundle --no-border-checks
```

With Expo, use Expo Atlas (`EXPO_ATLAS=true npx expo export`, then `npx expo-atlas`). Record the bundle size before and after each change.

### Direct imports, not barrels

```ts
// Bad: evaluates every module the barrel re-exports
import { Button } from "@presentation/components";
// Good
import { Button } from "@presentation/components/Button";
```

Barrel files make Metro include and evaluate everything they re-export, slow down startup, and cause circular imports. Enforce direct imports with ESLint (see the arch reference). The same applies to libraries: import `date-fns/format`, not `date-fns`, unless the library ships a Babel plugin or tree shaking removes the rest.

### Tree shaking

- Expo SDK 52+: experimental production tree shaking (`EXPO_UNSTABLE_METRO_OPTIMIZE_GRAPH=1` and `EXPO_UNSTABLE_TREE_SHAKING=1` in the build environment, with `experimentalImportSupport: true` in `metro.config.js`). Follow the docs for the installed SDK; these flags are experimental.
- Bare React Native: only with a bundler that supports it (metro-serializer-esbuild, or Re.Pack if the project already uses it).
- Import `Platform` directly (`import { Platform } from "react-native"`) so `Platform.OS` checks can be removed per platform. `import * as RN from "react-native"` defeats it.
- Modules must be ESM and side-effect free (`"sideEffects": false` where true).
- Verify by searching the production bundle for a function you know is unused.

### Before adding a dependency

- Check its size and what it pulls in (bundlephobia or `npx source-map-explorer` after installing on a branch), its native footprint, and whether it supports the New Architecture.
- Prefer the platform: Hermes implements most of `Intl` (check the methods you need before removing a polyfill), and native SDKs (`expo-crypto`, platform date and number formatting) beat large JS polyfills.

## App size

- Measure the shipped artifact, not the bundle: Android App Bundle download size (Play Console, `bundletool get-size total`) or Ruler; iOS App Store Connect size report, App Thinning report or Emerge.
- **Android R8**: enable code and resource shrinking in release, then test the release build thoroughly, because R8 can remove code only reached by reflection:

```groovy
// android/app/build.gradle
def enableProguardInReleaseBuilds = true

android {
    buildTypes {
        release {
            minifyEnabled enableProguardInReleaseBuilds
            shrinkResources enableProguardInReleaseBuilds
            proguardFiles getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro"
        }
    }
}
```

  Add keep rules only for libraries that document them. R8 obfuscation raises reverse-engineering effort; it is not a security boundary, so no secrets in the app either way.
- **iOS assets** go in an Asset Catalog so App Thinning ships only the needed scale. Compress images (WebP/AVIF where supported) and remove unused assets.
- Ship only the ABIs you need; the Play Store splits AABs per device automatically.

## Android 16 KB page-size alignment

Google Play requires native libraries in new apps and updates targeting Android 15+ to support 16 KB memory pages. React Native upgrades do not rebuild third-party native binaries, so check every release APK in CI:

```bash
zipalign -c -P 16 -v 4 app-release.apk 2>&1 | tee alignment.log
if grep -q "Verification FAILED" alignment.log; then exit 1; fi
```

- Check release builds, not debug. For AABs, produce device APKs with `bundletool` first.
- Only 64-bit ABIs (`arm64-v8a`, `x86_64`) matter. `-P 16` is required; without it zipalign checks 4 KB.
- Trace a failing `libfoo.so` with `find node_modules -name libfoo.so`, then update or replace the package. Repackaging does not fix alignment; the library must be rebuilt.
- Test at runtime on the 16 KB emulator image or a Pixel with "Boot with 16KB page size".

## Remote code chunks

Splitting code into chunks downloaded at runtime is rarely worth it in a store-distributed app. Consider it only after bundle analysis, direct imports, lazy screens and asset work, and only when the project already uses Re.Pack or the requirement is explicit.

Chunks are executable code, so:

- Prefer chunks packaged with the app. Hosted chunks must come from an HTTPS origin you control and be produced by the same release pipeline as the app.
- Resolve chunk locations from a fixed allowlist or a signed release manifest, never from user input, query parameters or third-party domains.
- Enable code signing for hosted chunks (Re.Pack supports it) with strict verification in production, and fail closed when a chunk is missing or unexpected.
- Respect the store rules on downloaded code.
