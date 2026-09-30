# Evidence collection

All commands here run locally. Anything that sends the URL to another service (PageSpeed Insights, SSL Labs, securityheaders.com, DNS-over-HTTPS or RDAP lookups) needs the user's permission first.

## Headers and redirects

```bash
# Every hop, with headers; -A sets a normal browser UA so bot protections answer as they would for a visitor
curl -sSIL --max-redirs 10 -A "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36" "https://example.com/" -o /dev/null -D headers.txt
grep -iE "^(HTTP/|location:|content-security-policy|strict-transport-security|x-frame-options|x-content-type-options|referrer-policy|permissions-policy|cross-origin-opener-policy|access-control-allow-origin|set-cookie|server|x-powered-by|cache-control)" headers.txt
```

- Some servers answer `HEAD` differently. If a header looks missing, confirm with `curl -sS -D - -o /dev/null <url>` (a GET).
- A `403`, a challenge page or a CAPTCHA means the headers you got are not the site's real ones: mark header checks unknown.
- Keep duplicate headers (several `Set-Cookie` or `Content-Security-Policy` lines); they all apply.
- When printing cookies in the report, show names and flags only, never values.

## A Playwright collector

One script collects timings, Web Vitals, requests and DOM counts for N measured runs after a warm-up. Install `playwright` in a scratch folder (pin the version), then run `node collect.mjs https://example.com 3`.

```js
// collect.mjs
import { chromium } from "playwright";

const url = process.argv[2];
const runs = Number(process.argv[3] ?? 3);
const VIEWPORT = { width: 1350, height: 940 };

const vitalsObserver = () => {
  window.__vitals = { lcp: null, cls: 0, longTasks: [] };
  new PerformanceObserver((list) => {
    const entries = list.getEntries();
    window.__vitals.lcp = entries[entries.length - 1].startTime;
  }).observe({ type: "largest-contentful-paint", buffered: true });
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) if (!entry.hadRecentInput) window.__vitals.cls += entry.value;
  }).observe({ type: "layout-shift", buffered: true });
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) window.__vitals.longTasks.push([entry.startTime, entry.duration]);
  }).observe({ type: "longtask", buffered: true });
};

async function measure(page) {
  return page.evaluate(() => {
    const nav = performance.getEntriesByType("navigation")[0];
    const fcp = performance.getEntriesByName("first-contentful-paint")[0]?.startTime ?? null;
    const tbt = window.__vitals.longTasks
      .filter(([start]) => fcp === null || start >= fcp)
      .reduce((sum, [, duration]) => sum + Math.max(0, duration - 50), 0);
    return {
      ttfb: nav.responseStart - nav.startTime,
      dcl: nav.domContentLoadedEventEnd - nav.startTime,
      fcp,
      lcp: window.__vitals.lcp,
      cls: window.__vitals.cls,
      tbt,
      protocol: nav.nextHopProtocol,
    };
  });
}

function median(values) {
  const sorted = values.filter((value) => value !== null).sort((a, b) => a - b);
  if (sorted.length !== values.length) return null; // a run without the metric makes it unknown
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: VIEWPORT });
await context.addInitScript(vitalsObserver);
const page = await context.newPage();
const client = await context.newCDPSession(page);

await page.goto(url, { waitUntil: "load" }); // warm-up, discarded
await client.send("Network.setCacheDisabled", { cacheDisabled: true });

const samples = [];
for (let run = 0; run < runs; run += 1) {
  const requests = [];
  const onResponse = async (response) => {
    const request = response.request();
    const sizes = await request.sizes().catch(() => null);
    requests.push({
      url: request.url().split("?")[0],
      type: request.resourceType(),
      status: response.status(),
      mime: response.headers()["content-type"] ?? null,
      cacheControl: response.headers()["cache-control"] ?? null,
      encoding: response.headers()["content-encoding"] ?? null,
      transferBytes: sizes ? sizes.responseHeadersSize + sizes.responseBodySize : null,
    });
  };
  page.on("response", onResponse);
  const response = await page.goto(url, { waitUntil: "load" });
  await page.waitForTimeout(3000); // same settle window for every run
  page.off("response", onResponse);

  if (new URL(page.url()).origin !== new URL(url).origin && run === 0) {
    console.error(`Redirected to ${page.url()}; audit that URL instead.`);
  }
  samples.push({ status: response?.status(), metrics: await measure(page), requests });
}

const dom = await page.evaluate(() => {
  const all = document.querySelectorAll("*");
  const depth = (element) => { let d = 0; while (element.parentElement) { d += 1; element = element.parentElement; } return d; };
  const ids = {};
  for (const el of document.querySelectorAll("[id]")) ids[el.id] = (ids[el.id] ?? 0) + 1;
  return {
    nodes: all.length,
    maxDepth: Math.max(...[...all].map(depth)),
    externalScripts: [...document.scripts].filter((s) => s.src).map((s) => s.src.split("?")[0]),
    inlineHandlers: [...all].filter((el) => [...el.attributes].some((a) => a.name.startsWith("on"))).length,
    imagesWithoutAlt: [...document.images].filter((img) => !img.hasAttribute("alt")).map((img) => img.currentSrc.split("?")[0]),
    h1Count: document.querySelectorAll("h1").length,
    headings: [...document.querySelectorAll("h1,h2,h3,h4,h5,h6")].map((h) => Number(h.tagName[1])),
    lang: document.documentElement.lang || null,
    duplicateIds: Object.entries(ids).filter(([, count]) => count > 1),
    iframesWithoutTitle: [...document.querySelectorAll("iframe:not([title])")].map((f) => f.src.split("?")[0]),
    positiveTabindex: document.querySelectorAll("[tabindex]:not([tabindex='0']):not([tabindex^='-'])").length,
    jsonLdTypes: [...document.querySelectorAll('script[type="application/ld+json"]')].map((s) => {
      try { return JSON.parse(s.textContent)["@type"] ?? null; } catch { return "invalid"; }
    }),
    ogTitle: document.querySelector('meta[property="og:title"]')?.content ?? null,
  };
});

const keys = ["ttfb", "dcl", "fcp", "lcp", "cls", "tbt"];
const medians = Object.fromEntries(keys.map((key) => [key, median(samples.map((s) => s.metrics[key]))]));
console.log(JSON.stringify({ url, runs, viewport: VIEWPORT, medians, samples, dom }, null, 2));
await browser.close();
```

- Every run must succeed. If a run returns a challenge, a different origin, or an error status, report the measurement as inconclusive instead of using fewer runs.
- `transferBytes` is what Chromium reports, including headers; do not replace missing values with `Content-Length`.
- `longtask` entries give an approximation of TBT (sum of long-task time over 50 ms after FCP). Lighthouse's TBT stops at TTI; say which one you used.
- Scroll the page (`page.mouse.wheel`) before the final DOM sample when the site lazy-loads content, and wait for the network to go quiet.
- Consent banners: click the reject-all or essential-only control before the warm-up, then verify the banner stays away on reload. Never click accept.

## Lighthouse

```bash
npx lighthouse@12 https://example.com --preset=desktop --only-categories=performance,accessibility,best-practices,seo \
  --output=json --output-path=./lh-1.json --chrome-flags="--headless=new"
```

Run it N times and take the medians yourself; one Lighthouse run is one sample. Lighthouse's own scores use its weights, not the ones in this skill: use its raw metric values and audits as evidence.

## Accessibility

```js
// in the Playwright script, after the final load
import AxeBuilder from "@axe-core/playwright";
const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
// axe.violations[].nodes[].target names each offending element
```

Report axe violations by rule with the offending selectors. Automated tools find a fraction of accessibility problems; say so.

## Public files for AI readiness

```bash
for path in robots.txt sitemap.xml llms.txt llms-full.txt auth.md \
  .well-known/api-catalog .well-known/mcp.json .well-known/mcp/server-card.json \
  .well-known/oauth-authorization-server .well-known/oauth-protected-resource .well-known/ai-plugin.json; do
  printf '%s ' "$path"
  curl -sS -o "/tmp/audit-$(echo "$path" | tr '/' '_')" -w '%{http_code} %{content_type} %{url_effective} %{size_download}\n' \
    --max-time 10 "https://example.com/$path"
done
```

- A `200` with `text/html` for `llms.txt` is usually the app shell: invalid, not present.
- A redirect to another path (often the home page) means the file does not exist.
- A timeout or network error is unknown; a `404` is observed absence.

## Client libraries

- Collect script URLs from the requests and `document.scripts`, plus runtime versions (`window.jQuery?.fn?.jquery`, `window.React?.version`, `window.angular?.version?.full`, `window.Vue?.version`).
- Match them against the Retire.js repository data (`jsrepository.json` from the retire.js project) or run `npx retire` on downloaded bundles. Pin the data version in the report.

## Secrets in scripts

Download the page's own scripts and search for known secret formats (private key headers, cloud provider secret key formats, service tokens) with a scanner such as gitleaks (`gitleaks dir ./downloaded-scripts --no-git`). Record the type and the file, never the value. Treat publishable keys as public.
