# Browser adapters: from port to wiring

This is how one browser capability travels through the layers. The example is "read the current tab", used by the popup.

## 1. The port (application)

The application layer declares what it needs, in its own vocabulary. It contains no `chrome` types.

```ts
// src/application/interfaces/browser/tabs.interface.ts
export interface IBrowserTab {
  readonly id: number;
  readonly url: string;
  readonly title: string;
  readonly faviconUrl: string | null;
}

export interface ITabs {
  /** The active tab of the focused window, or null when none is readable (browser pages, no permission). */
  current(): Promise<IBrowserTab | null>;
  listOpen(): Promise<readonly IBrowserTab[]>;
}
```

## 2. The use case (application) and the service (services)

```ts
// src/application/use-cases/getcurrenttab.usecase.ts
import type { IBrowserTab, ITabs } from "@application/interfaces/browser/tabs.interface";
import { isHttpUrl } from "@lib/url";

export class GetCurrentTabUseCase {
  constructor(private readonly tabs: ITabs) {}

  async execute(): Promise<IBrowserTab | null> {
    const tab = await this.tabs.current();
    return tab && isHttpUrl(tab.url) ? tab : null;
  }
}
```

```ts
// src/services/page.service.ts
import type { GetCurrentTabUseCase } from "@application/use-cases/getcurrenttab.usecase";
import type { IBrowserTab } from "@application/interfaces/browser/tabs.interface";

export type { IBrowserTab };

export interface IPageService {
  getCurrentTab(): Promise<IBrowserTab | null>;
}

export class PageService implements IPageService {
  constructor(private readonly getCurrentTabUseCase: GetCurrentTabUseCase) {}

  getCurrentTab(): Promise<IBrowserTab | null> {
    return this.getCurrentTabUseCase.execute();
  }
}
```

## 3. The adapter (infrastructure): the only place that calls the browser

Put the shared logic in a base class. Per-browser subclasses override only what really differs.

```ts
// src/infrastructure/browser/base/basetabs.adapter.ts
import type { IBrowserTab, ITabs } from "@application/interfaces/browser/tabs.interface";

export class BaseTabsAdapter implements ITabs {
  async current(): Promise<IBrowserTab | null> {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    return tab ? this.toBrowserTab(tab) : null;
  }

  async listOpen(): Promise<readonly IBrowserTab[]> {
    const tabs = await chrome.tabs.query({ currentWindow: true });
    return tabs.flatMap((tab) => {
      const mapped = this.toBrowserTab(tab);
      return mapped ? [mapped] : [];
    });
  }

  protected toBrowserTab(tab: chrome.tabs.Tab): IBrowserTab | null {
    if (tab.id === undefined || !tab.url) return null;
    return { id: tab.id, url: tab.url, title: tab.title ?? tab.url, faviconUrl: tab.favIconUrl ?? null };
  }
}
```

```ts
// src/infrastructure/browser/chrome/chrometabs.adapter.ts
import { BaseTabsAdapter } from "@infrastructure/browser/base/basetabs.adapter";

export class ChromeTabsAdapter extends BaseTabsAdapter {}
```

```ts
// src/infrastructure/browser/firefox/firefoxtabs.adapter.ts
import { BaseTabsAdapter } from "@infrastructure/browser/base/basetabs.adapter";

/** Firefox reports `about:` pages with a URL the extension cannot use, so they read as "no tab". */
export class FirefoxTabsAdapter extends BaseTabsAdapter {
  protected override toBrowserTab(tab: chrome.tabs.Tab) {
    return tab.url?.startsWith("about:") ? null : super.toBrowserTab(tab);
  }
}
```

Presence guards also live here. For example, a notifications adapter checks `typeof chrome.notifications?.create === "function"` and returns `{ available: false }` instead of throwing, so the application can show "unavailable".

## 4. Wiring (bootstrap)

```ts
// src/bootstrap/chrome/adapters.ts
import { ChromeTabsAdapter } from "@infrastructure/browser/chrome/chrometabs.adapter";
import type { BrowserAdapters } from "@bootstrap/shared/browseradapters";

export function createChromeAdapters(): BrowserAdapters {
  return { tabs: new ChromeTabsAdapter() /* , storage, channel, scripting, ... */ };
}
```

```ts
// src/bootstrap/shared/panelwiring.ts
import { GetCurrentTabUseCase } from "@application/use-cases/getcurrenttab.usecase";
import { PageService } from "@services/page.service";
import type { BrowserAdapters } from "@bootstrap/shared/browseradapters";

export function wirePanel(adapters: BrowserAdapters) {
  const getCurrentTab = new GetCurrentTabUseCase(adapters.tabs);
  return { page: new PageService(getCurrentTab) /* , audit, history, ... */ };
}
```

The Firefox entry calls the same `wirePanel` with `createFirefoxAdapters()`. The popup component receives the services object and calls `services.page.getCurrentTab()`.

## 5. Messaging between popup and background

- The protocol (action constants, request/response map, decoder) lives in `application/messaging/`.
- The transport lives in infrastructure: a `RuntimeMessageChannel implements IBackgroundChannel`, where `send(message)` wraps `chrome.runtime.sendMessage` and `listen(route)` wraps `chrome.runtime.onMessage`. The reply shape is `{ ok: true, value } | { ok: false, error }`, and `send` unwraps it, so callers never check `ok`.
- The router (application) receives decoded messages and calls use cases. It never sees `chrome.runtime`.

## 6. Injected page scripts

Functions passed to `chrome.scripting.executeScript` run inside the page and are serialized, so they cannot import. Keep them in `infrastructure/browser/page/`. Pass every constant through `args`, and return plain JSON. The adapter that injects them maps the result to an application DTO, and maps "blocked by page CSP" to an unavailable result.

## 7. Testing adapters

Mock the `chrome` global once in the test setup file (`globalThis.chrome = { tabs: { query: jest.fn() }, ... }`). Test each adapter against it: the mapping, the presence guards, and the Firefox override. Use-case tests never need the mock, because they receive a fake `ITabs`.
