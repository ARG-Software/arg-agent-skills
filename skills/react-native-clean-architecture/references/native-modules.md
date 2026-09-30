# Native modules: Turbo Modules, threading, native memory

## Where native code sits in the architecture

```
modules/biometric-vault/        the Turbo Module (spec, iOS, Android), a local library
src/application/ports/vault.port.ts
src/infrastructure/vault/nativevault.adapter.ts   the only file that imports the module
```

Add the module's package name (`biometric-vault`) to `OUTSIDE_WORLD` in the architecture tests, so only infrastructure can import it.

The module's TypeScript spec is a transport contract, not a port. The adapter translates it into the port's types and errors, so the rest of the app never sees native error codes or nullable platform values.

## Scaffold

```bash
# a module inside the app repo
npx create-react-native-library@latest biometric-vault --local
# a publishable package
npx create-react-native-library@latest biometric-vault
```

Choose a Turbo Module with Kotlin and Swift/Objective-C (or C++ for shared logic). The scaffold sets up Codegen from the spec:

```ts
// modules/biometric-vault/src/NativeBiometricVault.ts
import type { TurboModule } from "react-native";
import { TurboModuleRegistry } from "react-native";

export interface Spec extends TurboModule {
  isAvailable(): Promise<boolean>;
  read(key: string, prompt: string): Promise<string | null>;
  write(key: string, value: string): Promise<void>;
}

export default TurboModuleRegistry.getEnforcing<Spec>("BiometricVault");
```

```ts
// src/infrastructure/vault/nativevault.adapter.ts
import NativeBiometricVault from "biometric-vault";
import type { IVault, VaultReadResult } from "@application/ports/vault.port";

export class NativeVaultAdapter implements IVault {
  async read(key: string, prompt: string): Promise<VaultReadResult> {
    if (!(await NativeBiometricVault.isAvailable())) return { status: "unavailable" };
    try {
      const value = await NativeBiometricVault.read(key, prompt);
      return value === null ? { status: "empty" } : { status: "ok", value };
    } catch (error) {
      if (isUserCancel(error)) return { status: "cancelled" };
      throw error;
    }
  }
}

function isUserCancel(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "E_USER_CANCEL";
}
```

## Threading rules

| Method kind | Runs on | Rule |
| --- | --- | --- |
| Synchronous | the JS thread | trivial and deterministic only: no I/O, locks, big allocations; well under one frame |
| Asynchronous (Promise) | the native modules thread | fine for moderate work |
| Heavy asynchronous | your own background queue or coroutine | CPU work, disk, network, crypto, image processing |

- **Async by default.** A slow synchronous method freezes the whole app because JS waits for it.
- **UI work** (presenting a view, touching UIKit/Android views) dispatches back to the main thread.
- **iOS**: `DispatchQueue.global(qos: .userInitiated).async { ... }` for heavy work; implement `invalidate` to stop timers and observers.
- **Android**: a module-owned `CoroutineScope(Dispatchers.Default + SupervisorJob())` (or `Dispatchers.IO` for disk and network), cancelled in `invalidate()`. Never `GlobalScope.launch`.

```kotlin
class BiometricVaultModule(context: ReactApplicationContext) : NativeBiometricVaultSpec(context) {
    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())

    override fun write(key: String, value: String, promise: Promise) {
        scope.launch {
            try {
                vault.write(key, value)
                promise.resolve(null)
            } catch (error: Exception) {
                promise.reject("E_WRITE_FAILED", error.message, error)
            }
        }
    }

    override fun invalidate() {
        scope.cancel()
        super.invalidate()
    }
}
```

- Every async method resolves or rejects exactly once, with a stable error code the adapter can map.
- **Batch crossings**: one call with an array beats a thousand calls in a loop, especially over JNI on Android. Logic shared by both platforms and called very often is a candidate for a C++ Turbo Module, which JS calls through JSI without JNI.

## Native SDKs and polyfills

- Prefer the platform SDK (or a maintained native wrapper) over a large JS reimplementation for crypto, image processing, date and number formatting, and compression.
- Hermes supports most of `Intl`; check the specific APIs you use before adding or keeping `@formatjs` polyfills.

## Native memory

- **Swift / Objective-C (ARC)**: closures that capture `self` in long-lived callbacks use `[weak self]`. Use `unowned` only when the lifetime is guaranteed. Remove observers and invalidate timers in `invalidate`/`deinit`.
- **Kotlin**: never keep an `Activity` or `View` in a static field or a long-lived object; hold the `ReactApplicationContext` or a `WeakReference`. Cancel coroutines and unregister listeners in `invalidate()`.
- **C++**: stack values or `std::unique_ptr` for single ownership, `std::shared_ptr` only for real shared ownership, `std::weak_ptr` to break cycles. No raw `new`/`delete`.
- **Finding leaks**: Xcode Instruments (Leaks, Allocations with generations while repeating a flow), Android Studio Memory Profiler, and LeakCanary in debug builds.

## Profiling native code

- **iOS**: Xcode Instruments → Time Profiler on a release build, filtered to your module's symbols.
- **Android**: Android Studio CPU Profiler (system trace for thread activity), or Perfetto.
- **View hierarchy**: React Native flattens layout-only views. When debugging deep or slow view trees, inspect the native hierarchy (Xcode "Debug View Hierarchy", Android Layout Inspector) rather than the React tree, and prefer fewer wrapper views over `collapsable={false}` everywhere.

## Testing native modules

- The adapter's unit tests mock the module at its import and cover every result mapping and error code.
- The module itself gets platform tests where logic lives natively (XCTest, JUnit), and at least one e2e flow that exercises it on a device or emulator in CI before release.
