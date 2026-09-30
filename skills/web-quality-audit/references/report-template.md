# Report template

Write the report in Markdown unless the user asks for another format. Use plain hyphens (`-`), never em dashes, and `-` for an empty value.

## Skeleton

```markdown
# Web quality audit: example.com

**Overall: 68 / 100 - Good** (6 of 8 categories scored)

| Setup | |
| --- | --- |
| URL | https://www.example.com/pricing (redirected from https://example.com/pricing, 1 hop) |
| Date | 2026-09-30 14:10 UTC |
| Measurement | 1 warm-up + 3 cache-bypassed runs, median, unthrottled desktop, 1350x940 |
| Browser | Chromium 140 (Playwright 1.55) |
| Consent | OneTrust banner, "Reject all" selected, held on reload |
| Not observed | Architecture (request capture truncated), AI readiness semantic relevance (no embedding model) |

## Scores

| Category | Score | Coverage | Weight |
| --- | --- | --- | --- |
| Security | 54 | 100% | 30% |
| Performance | 81 | 100% | 20% |
| Architecture | - | 0% | excluded |
| Efficiency | 77 | 80% | 9% |
| Payload | 62 | 71% | 8% |
| Accessibility | 88 | 100% | 7% |
| AI readiness | 45 | 90% | 6% |
| DOM | 90 | 100% | 5% |

## Fix first

1. **Content-Security-Policy allows inline scripts** (Security, -9.6 points)
2. **LCP image discovered late** (Performance, -4.1 points)
3. ...

## Findings

### Security

#### Content-Security-Policy allows inline scripts - bad
- **Measured:** `script-src 'self' 'unsafe-inline' https://www.googletagmanager.com`
- **Problem:** `unsafe-inline` without a nonce, hash or `strict-dynamic` lets any injected inline script run, so the policy does not stop XSS.
- **Evidence:** 4 inline scripts in the document: the GTM bootstrap, the consent stub, two JSON-LD blocks (JSON-LD does not need `unsafe-inline`).
- **Recommended:** generate a per-response nonce, add it to the two executable inline scripts, and replace `'unsafe-inline'` with `'nonce-{value}' 'strict-dynamic'`. Roll out with `Content-Security-Policy-Report-Only` first.

## Attack exposure (report-only)

| Threat | Verdict | Weakest defence |
| --- | --- | --- |
| Cross-site scripting | Exposed | CSP: unsafe-inline |
| Clickjacking | Mitigated | frame-ancestors 'self' |
| Session theft | Partly mitigated | 2 of 5 cookies without HttpOnly |
| SQL injection, SSRF, auth flaws | Not tested | passive audit |

## Unknown checks

| Check | Why it is unknown | How to observe it |
| --- | --- | --- |
| Client library vulnerabilities | no versioned library visible | versions are bundled; scan the build's lockfile instead |

## Passing checks
A short list of good rows (name and value), no recommendations.

## Appendix: full evidence lists
Complete offender lists that were truncated above (up to 50 items each).
```

## Finding rules

- One finding per warn/bad row, titled with what is wrong in plain words, then the status.
- **Measured** is the row's full value (the row itself may be shortened in tables).
- **Evidence names the items**: URLs without query strings, selectors, cookie names with their flags, header values. Show up to 10 in the finding and the rest in the appendix with "+N more in the appendix".
- **Recommended** is specific to the evidence (which file, which header, which setting) and says how to verify the fix.
- Points lost = category weight × coverage-scaled row weight × (1 - credit), normalised to the overall score. Use it only for ordering "Fix first".
- Good rows get no finding. Unknown rows get an entry in "Unknown checks", never a finding.
- Headline counts ("12 findings") count only warn and bad findings.

## Ticket draft

When the user wants tickets, produce one per finding:

```markdown
**Title:** Replace 'unsafe-inline' in script-src with nonces
**Area:** Security - Content-Security-Policy
**Measured:** script-src 'self' 'unsafe-inline' https://www.googletagmanager.com
**Why:** inline script injection is not blocked, so the CSP offers no XSS protection.
**Evidence:** 2 executable inline scripts (GTM bootstrap, consent stub).
**Acceptance criteria:**
- script-src has no 'unsafe-inline'
- executable inline scripts carry the response nonce
- the audit's CSP row is good or minor-issues only
```

## Comparison

Compare two audits of the same page (over time) or two pages (versions or different sites). Every change reads **B relative to A**, with A the older run by default.

```markdown
| Measurement | A | B | Change |
| --- | --- | --- | --- |
| LCP | 2.9 s | 1.8 s | -1.1 s better |
| TTFB | 420 ms | 430 ms | = |
| CLS | 0.02 | 0.19 | +0.17 worse |

| Category | A | B | Change |
| --- | --- | --- | --- |
| Security | 54 | 71 | +17 better |
```

- Show every category, check and measurement, with unchanged rows as `=`, then a changed-only list of findings.
- Tone comes from direction: scores and coverage higher is better, timings and sizes lower is better.
- If the setup differs (number of runs, browser, viewport, coverage, consent choice, scoring version), add a "Limited comparison" note listing the differences before the tables.
