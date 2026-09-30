# Rendering performance: FPS, re-renders, lists, state, animations, JS memory

Every section follows the same loop: **measure → change one thing → re-measure → keep or revert.** Put the numbers in the PR description ("scroll FPS 41 → 58 on Pixel 6a, release build").

## Measuring

### FPS

- **Perf Monitor** (Dev Menu → Perf Monitor) shows UI and JS thread FPS. A healthy UI FPS with a low JS FPS means JS work is the bottleneck; low UI FPS means native rendering or layout is.
- **Flashlight** (Android) runs a scripted flow and reports average FPS, CPU and RAM, with JSON output you can compare in CI. Install it from its official release channel and pin the version.
- **Turn dev mode off** (Dev Menu → Settings → JS Dev Mode off, or run a release build). Dev mode adds validation work and makes everything look slower.
- Budgets: 16.6 ms per frame at 60 Hz, 8.3 ms at 120 Hz.

### Renders

- **React DevTools Profiler** (from Metro press `j`, or the Dev Menu): record exactly the interaction you are fixing, then read the commit timeline, the slowest components and "why did this render".
- The evidence for a render problem is **commits and render durations during the interaction**. Component count or tree depth alone is not evidence.
- Do not report stale closures or missing `useCallback` dependencies without a reproduction or a profile.

## Lists

Anything longer than a screen or two must be virtualized.

```tsx
// Bad: every row mounts up front
<ScrollView>{items.map((item) => <Row key={item.id} item={item} />)}</ScrollView>
```

```tsx
// Good: FlashList v2 (New Architecture), no size estimates needed
import { FlashList } from "@shopify/flash-list";

const renderRow = ({ item }: { item: Item }) => <Row item={item} />;
const rowKey = (item: Item) => item.id;
const rowType = (item: Item) => item.kind; // "header" | "product" | "ad"

<FlashList data={items} renderItem={renderRow} keyExtractor={rowKey} getItemType={rowType} />;
```

- **FlashList v2** needs the New Architecture and computes sizes itself: `estimatedItemSize` is gone, so never flag it as missing on v2. On v1, give a realistic `estimatedItemSize`.
- **Legend List** (`@legendapp/list`) is a pure-JS alternative with no native dependency.
- **FlatList** is fine for moderate lists; with fixed-height rows add `getItemLayout` so it skips measuring:

```tsx
const ROW_HEIGHT = 56;
const getItemLayout = (_: unknown, index: number) => ({ length: ROW_HEIGHT, offset: ROW_HEIGHT * index, index });
```

- Keep `renderItem` and `keyExtractor` stable (module-level or memoised), keep rows cheap (no heavy work or new objects per render), and use `getItemType` when rows differ in structure so recycling reuses the right views.
- Images in rows: a caching image component (`expo-image` or equivalent) with explicit dimensions.

## State and re-renders

A broad Context value re-renders every consumer whenever its identity changes. Replace app-state Context with a store read through selectors when the profile shows unrelated components rendering.

```ts
// src/application/cart/cart.store.ts
import { create } from "zustand";

interface CartState {
  items: Record<string, number>;
  add(productId: string): void;
  remove(productId: string): void;
}

export const useCartStore = create<CartState>()((set) => ({
  items: {},
  add: (productId) => set((state) => ({ items: { ...state.items, [productId]: (state.items[productId] ?? 0) + 1 } })),
  remove: (productId) =>
    set((state) => {
      const { [productId]: _removed, ...items } = state.items;
      return { items };
    }),
}));
```

```tsx
// Re-renders only when this product's quantity changes
const quantity = useCartStore((state) => state.items[productId] ?? 0);
const add = useCartStore((state) => state.add);
```

- A selector that returns a **new object or array** re-renders every time; select primitives, or use `useShallow` from `zustand/react/shallow`.
- Jotai: one atom per independent piece of state, derived atoms for computed values, `useSetAtom` in components that only write.
- Keep stores in `application`. A store that persists goes through a storage port (see the arch reference), never `AsyncStorage` imported directly.

### Concurrent React

```tsx
const [query, setQuery] = useState("");
const deferredQuery = useDeferredValue(query);
const results = useMemo(() => search(catalog, deferredQuery), [catalog, deferredQuery]);
```

`useTransition` marks non-urgent updates (switching a tab's content) so input stays responsive.

### Uncontrolled inputs

```tsx
// Controlled inputs round-trip every keystroke through React state.
const valueRef = useRef("");
<TextInput defaultValue="" onChangeText={(text) => (valueRef.current = text)} />;
```

Use a controlled input only when every keystroke must be transformed (masks, formatting).

## React Compiler

The compiler memoises components and hooks automatically, so manual `memo` / `useMemo` / `useCallback` become unnecessary where it runs.

1. Run `npx react-compiler-healthcheck@latest` and fix Rules-of-React violations.
2. Enable the lint rules that match the React/Expo version (Expo SDK 55+ ships them in `eslint-config-expo`; older SDKs need `eslint-plugin-react-compiler`).
3. Enable it for one directory first:

```js
// babel.config.js (bare React Native)
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ["module:@react-native/babel-preset"],
    plugins: [
      ["babel-plugin-react-compiler", { target: "19", sources: (filename) => filename.includes("src/presentation/stores") }],
      "react-native-worklets/plugin",
    ],
  };
};
```

The compiler plugin goes first and the worklets plugin last. Expo projects configure the compiler through `babel-preset-expo` and `experiments.reactCompiler` in `app.json`, following the docs for the installed SDK.

4. Profile before and after; widen `sources` when the numbers improve, and delete manual memoisation in compiled directories.

## Animations

Animations run on the UI thread with Reanimated so JS work cannot drop their frames.

```tsx
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";

export function FadeIn({ onShown, children }: { onShown: () => void; children: React.ReactNode }) {
  const opacity = useSharedValue(0);
  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));

  useEffect(() => {
    opacity.value = withTiming(1, { duration: 250 }, (finished) => {
      if (finished) scheduleOnRN(onShown);
    });
  }, [opacity, onShown]);

  return <Animated.View style={style}>{children}</Animated.View>;
}
```

- Reanimated 4 needs the New Architecture and `react-native-worklets`, whose Babel plugin must be the **last** plugin. On the old architecture stay on Reanimated 3 until you migrate.
- Animated values are shared values, never `useState`. Keep worklets small and free of heavy computation.
- Call JS from a completion callback or `useAnimatedReaction`, not from `useAnimatedStyle` (it can run on every frame).
- Gestures: `react-native-gesture-handler` with gesture callbacks running as worklets.
- **Bottom sheets**: render the sheet lazily, keep its content light (virtualize long content with the sheet library's list component), avoid state updates on every drag frame (drive the position with shared values), and profile opening and dragging.

## JS memory

```tsx
useEffect(() => {
  const subscription = AppState.addEventListener("change", onChange);
  const timer = setInterval(poll, 30_000);
  return () => {
    subscription.remove();
    clearInterval(timer);
  };
}, [onChange, poll]);
```

- Every listener, subscription, timer and interval registered in an effect is removed in its cleanup. Abort in-flight requests with the `signal` TanStack Query passes.
- Hunt leaks with the React Native DevTools memory tools: record allocations on a timeline while repeating the suspect flow (open and close a screen ten times), then look for allocations that are never collected and for objects with a large retained size but a small shallow size (closures holding big data).
- Module-level caches need a bound (LRU or size cap).
- Native leaks (Xcode Leaks, LeakCanary) are in [native-modules.md](native-modules.md).
