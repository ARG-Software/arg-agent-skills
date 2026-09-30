# Checks and thresholds

Thresholds and weights are ARG Architect's scoring policy. Numeric rows use graded credit: **1 at GOOD, 0.25 at WARN, 0 at BAD, linear in between**, and the status comes from GOOD/WARN (good ≤ GOOD, warn ≤ WARN, bad beyond). For "higher is better" rows the direction flips. "Weight" is the check's points inside its category; unknown rows drop out of both earned and available points.

## Security (category weight 30%)

| Check | Weight | Good | Warn / partial | Bad | Unknown when |
| --- | --- | --- | --- | --- | --- |
| Content-Security-Policy | 12 | present, no issues | minor issues (0.6 credit): missing `object-src`/`base-uri`, broad host sources | high severity (0.2): `script-src` with `unsafe-eval`, or `unsafe-inline` without a nonce, hash or `strict-dynamic`; missing header = 0 | headers not captured |
| Strict-Transport-Security | 12 | `max-age` ≥ 31536000 (1 year), `includeSubDomains` | shorter `max-age` (0.6) | `max-age` under 1 day (0.2); missing = 0 | not HTTPS-captured |
| Frame protection | 8 | CSP `frame-ancestors`, or `X-Frame-Options: DENY/SAMEORIGIN` | | neither | headers not captured |
| X-Content-Type-Options | 6 | `nosniff` | | missing or other value | headers not captured |
| CORS | 8 | specific origin, no credentials with `*` | | `*` with credentials, or reflected arbitrary origin | absent `Access-Control-Allow-Origin` = not applicable (neutral) |
| Cross-Origin-Opener-Policy | 5 | `same-origin` | `same-origin-allow-popups` | missing | headers not captured |
| Mixed content | 5 | no `http:` subresources on an HTTPS page | passive mixed content (images) | active mixed content (scripts, styles, frames) | |
| API request security | 7 | API calls over HTTPS, no credentials in URLs | | tokens or keys in query strings, HTTP APIs | no API requests observed |
| Authentication signals / token expiry | 3 / 3 | short-lived tokens, no JWT in `localStorage` | 1-2 JWTs in web storage | 3+ JWTs in storage, long-lived tokens | no auth observed |
| Sensitive data exposure | 10 | no secret formats in page or scripts | suspicious high-entropy named assignments | known secret formats (private keys, cloud secret keys, service tokens) | script bodies not readable |
| Referrer-Policy | 6 | `strict-origin-when-cross-origin`, `no-referrer`, `same-origin`, `strict-origin` | weaker explicit value | missing = 0 | headers not captured |
| Permissions-Policy | 4 | present | | missing = 0 | headers not captured |
| Cookie security | 6 | credit = share of cookies with `Secure`, `HttpOnly` (session cookies) and `SameSite` | | | cookies not observable |
| Client library vulnerabilities | 8 | 0 vulnerable libraries | 1-3 | 6+ (0 credit) | check not run, or no versioned library visible |
| Integrity metadata (SRI) | report-only | every version-pinned cross-origin file has `integrity` | any pinned file without it | | no pinned cross-origin files (no row) |

Notes:

- **Public-by-design identifiers are not secrets**: Stripe `pk_` keys, Supabase publishable/anon keys, captcha site keys, Web3Forms access keys, analytics ids, Firebase web config. Known secret formats always outrank a public-sounding variable name.
- **SRI** applies only to cross-origin files the page's HTML declares with an exact `x.y.z` version in the path (`pkg@3.7.1/`, `/3.7.1/`, `lib-3.7.1.min.js`). Ranges, `@latest`, `?ver=` and files inserted by other scripts do not count, because files that change in place cannot carry a hash.
- **Vulnerable libraries**: resolve versions from script URLs, license banners (`/*!` comments survive minification) and runtime globals; match against Retire.js data. Say "visible versioned client libraries" in the report, never "no vulnerable dependencies".
- **Obfuscated first-party code** (eval packers, dense `_0x` names, `Function(atob(...))`) is a report-only warning; third-party-only obfuscation is an info note.
- **Server version disclosure** (`Server: nginx/1.18`, `X-Powered-By: PHP/7.2`) is worth an info finding, not a score.

## Performance (20%)

| Check | Weight | GOOD | WARN | BAD |
| --- | --- | --- | --- | --- |
| TTFB | 20 | 200 ms | 600 ms | 1200 ms |
| DOMContentLoaded | 16 | 1 s | 2 s | 4 s |
| Cacheability (share of cacheable static responses fresh ≥ 7 days or `immutable`) | 14 | ≥ 80% | ≥ 50% | lower |
| LCP | 15 | 1.2 s | 2.4 s | 4 s |
| TBT | 10 | 150 ms | 350 ms | 600 ms |
| Render-blocking scripts | 5 | 0 | 2 | 5 |
| Blocking stylesheets | 5 | confirmed blocking CSS under 50 KiB, fewer than 3 sheets, `@import` depth < 2 | 50 KiB / 3 sheets / depth 2 | 150 KiB / 5 / depth 3 |
| CLS | 5 | 0.1 | 0.25 | 0.4 |
| FCP | 5 | 0.9 s | 1.6 s | 3 s |
| Redirect hops before the document | 5 | 0 | 1 | 3 |

- These are **Lighthouse desktop** thresholds for unthrottled desktop runs. Use Lighthouse mobile thresholds only for throttled mobile runs.
- A metric is scored only when **every** measured run supplied it; otherwise it is unknown.
- CLS of a layout-stable page is a measured 0 (good), not unknown.
- **Cacheability** reads `Cache-Control`/validators only, because audits bypass the cache. A bare `304` without `Cache-Control` is unknown, not a violation.
- **Load Event** (`loadEventEnd`) is context only: on client-rendered apps it can fire before the first paint.
- **LCP recommendations follow the dominant cause**: a late-discovered image (preload it or put it in the HTML), a slow fetch (compress, CDN), render delay after load (blocking JS/CSS), or slow TTFB. **TTFB** splits into DNS, connect, TLS and server time: connection-dominated delays need connection reuse, a closer edge or preconnect; server-dominated delays need caching or backend work.
- **Preconnect** advice needs evidence: a third-party origin on the LCP path or a render-blocking request before FCP, with observed connection setup. Call the saving a potential upper bound.

## Payload (8%)

| Check | Weight | GOOD | WARN | BAD |
| --- | --- | --- | --- | --- |
| Total transfer | 20 | 800 KiB | 1600 KiB | 4000 KiB |
| JavaScript | 20 | 300 KiB | 500 KiB | 1000 KiB |
| Compression ratio (text resources, encoded/decoded savings) | 12 | ≥ 0.5 | ≥ 0.3 | 0 |
| Images (largest / total image weight) | 10 | 200 KiB | 500 KiB | 1000 KiB |
| Image sizing (bytes wasted by images larger than displayed) | 10 | 30 KiB | 100 KiB | 400 KiB |
| API responses | 10 | 50 KiB | 200 KiB | 500 KiB |
| Image formats (WebP/AVIF share of raster images) | 8 | ≥ 80% | ≥ 50% | 0% |
| Fonts | 5 | 100 KiB | 200 KiB | 400 KiB |
| CSS | 5 | 50 KiB | 150 KiB | 300 KiB |

- Measure the **observed journey** (the measured load), not every URL in the final DOM. Images the page never requested are diagnostic only.
- **Never estimate transfer bytes from `Content-Length`.** Use transfer sizes the browser reports. Cache and service-worker deliveries are a confirmed 0.
- Cross-origin responses without `Timing-Allow-Origin` hide their sizes. When they are the only gap, score the visible bytes and scale the row's coverage by known/total files, and say "X KiB visible (K of N files; R third-party sizes hidden)". Any other gap keeps the row unknown.
- Beacons, CSP reports and websockets are not payload. A request that failed before any response transferred 0 bytes.
- Classify image formats by **response MIME type** first and the URL extension only as a fallback.

## Efficiency (9%)

| Check | Weight | GOOD | WARN | BAD |
| --- | --- | --- | --- | --- |
| Duplicate requests (same URL fetched more than once) | 30 | 0 | 3 | 8 |
| HTTP version mix | 20 | all HTTP/2 or HTTP/3 | mixed (0.5 credit) | all HTTP/1.x (0) |
| Requests in the measured load | 20 | 50 | 100 | 200 |
| Wasted bytes | 15 | 0 KiB | 150 KiB | 750 KiB |
| Wasted time | 15 | 0 ms | 500 ms | 1500 ms |

A truncated capture makes the request count unknown.

## Architecture (15%)

| Check | Weight | GOOD | WARN | BAD |
| --- | --- | --- | --- | --- |
| Third-party origins / requests | 35 | 3 / 10 | 6 / 25 | 10 / 50 |
| Third-party critical CSS delay | 25 | 100 ms | 500 ms | 1000 ms |
| Runtime API origins | 20 | 2 | 4 | 8 |
| Dependency redirect hops | 20 | 0 | 2 | 6 |

- **First party** = the page's registrable domain (public-suffix aware), plus domains with the same site name under another suffix (`static.whatsapp.net` for `web.whatsapp.com`). Never keep a vendor list. A brand CDN with another name (`twimg.com` for `x.com`) stays third-party; say so when it dominates.
- An empty request capture is unknown, not proof of zero dependencies.
- **Technology profile** (framework, renderer, CMS, CDN, server, analytics, tag manager, consent tool): zero weight. Report it; never score it.

## DOM (5%)

| Check | Weight | GOOD | WARN | BAD |
| --- | --- | --- | --- | --- |
| External scripts | 25 | 10 | 20 | 40 |
| Inline event handlers (`onclick=`...) | 15 | 5 | 15 | more |
| DOM nodes | 15 | 800 | 1400 | more |
| Max DOM depth | 10 | 32 | 60 | more |
| Authored inline styles (`style=` in the delivered HTML) | 10 | 10 | 30 | more |

Node count and depth pass on size alone only up to GOOD. Above that, they need measured TBT: good TBT passes, otherwise the verdict is the milder of the size tier and the TBT tier; without TBT the row is unknown. Style attributes added by scripts at runtime are informational, not authored.

## Accessibility (7%)

| Check | Weight | Good | Warn | Bad |
| --- | --- | --- | --- | --- |
| Image alt coverage | 20 | ≥ 95% | ≥ 80% | lower |
| Form label coverage | 20 | ≥ 95% | ≥ 80% | lower |
| One `h1` | 12 | exactly one | | none |
| Heading hierarchy (skipped levels) | 12 | 0 | 1 | 3 |
| Accessible names on buttons and links | 10 | ≥ 95% | ≥ 80% | lower |
| Landmarks (`main`, `nav`, `header`, `footer`) | 8 | `main` plus navigation | partial | none |
| Document language (`<html lang>`) | 8 | valid | | missing |
| Positive `tabindex` | 4 | 0 | 3 | 10 |
| Duplicate ids | 3 | 0 | 3 | 10 |
| Iframe titles | 3 | 100% | ≥ 50% | lower |

This is a structural baseline, not a WCAG conformance audit. Recommend axe-core and manual keyboard and screen-reader testing for conformance.

## AI readiness (6%)

Each row's core signals sum to 0.8 (the "Served" line); rare or optional signals are bonuses that never gate a verdict.

| Check | Weight | Core signals | Bonus signals |
| --- | --- | --- | --- |
| AI discoverability | 25 | robots.txt available (0.25), sitemap (0.25), `Link` header relations (0.2) | markdown negotiation, robots meta, DNS-AID; penalties for `nofollow` robots meta and blanket AI blocks |
| Bot access control | 10 | wildcard rules (0.3), Content-Signal (0.5) | AI-specific rules, Web Bot Auth |
| Agent instructions | 20 | valid `llms.txt` or `llms-full.txt` (0.65), sections relevant to the page (0.15) | both files, `ai-plugin.json`, clean file; penalties for issues |
| API/Auth/MCP discovery | 20 | `/.well-known/api-catalog` (0.3), MCP surface (0.25), `auth.md` (0.25) | second MCP surface, agent skills, OAuth metadata, protected-resource metadata |
| Structured knowledge | 15 | valid JSON-LD (0.3), useful types (0.15), `og:title` (0.1), `og:description` (0.1), metadata matches the page (0.15) | Twitter card, `og:image` |
| Content extractability | 5 | title, meta description, `h1`, 150+ words of paragraph text, semantic structure | |
| Citation readiness | 5 | canonical, author, publisher, published/modified date | Article schema, hreflang, feed |

- **Invalid agent files**: a `200 text/html` app shell, a redirect away from the path, an empty, placeholder or truncated file, or the wrong content type is not a valid `llms.txt`.
- **Relevance**: judge `llms.txt` section by section against the page's own text with a real semantic comparison (embeddings). The verdict is the share of relevant sections (≥ 75% good, ≥ 50% partial, else weak). Filler of any length is not useful instructions. **If you cannot run a semantic comparison, relevance is unknown**; never substitute keyword matching.
- A completed fetch without the signal is a 0; a fetch that never completed is unknown.
- Fetch only canonical paths: `/robots.txt`, `/sitemap.xml`, `/llms.txt`, `/llms-full.txt`, `/auth.md`, and the `/.well-known/` agent, MCP and OAuth documents. Never crawl.

## Consent behaviour (report-only)

From the pre-choice load and the post-reject load, report the consent tool, the action chosen (reject-all or essential-only), whether the choice held on reload, and whether analytics or advertising requests fired before consent or after rejection. Traffic after rejection can warn; incomplete evidence with no traffic stays unknown. Never test accept-all.
