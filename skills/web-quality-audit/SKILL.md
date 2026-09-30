---
name: web-quality-audit
description: Audit a website or your own web app for security, performance, payload, efficiency, architecture, DOM, accessibility and AI readiness with evidence-based scoring. Use when asked to audit, review, score or benchmark a site or page, check security headers (CSP, HSTS, frame protection, cookies, CORS, SRI), Core Web Vitals (LCP, CLS, TBT, FCP, TTFB), caching, page weight, images, fonts, compression, third-party dependencies, request counts, accessibility basics (alt text, labels, headings, landmarks), robots.txt, sitemap, llms.txt, structured data or agent discovery files, compare two audits, or write an audit report with fixes. Uses passive, browser-observable evidence only, treats unobservable evidence as unknown instead of failing it, grades numeric checks without cliffs, names the offending items, and pairs every problem with a recommendation. When the audit leads to code changes, the ARG base applies, with feature/fix branches, reviewed PRs, and CI before merge.
license: MIT
metadata:
  author: ARG Software
  homepage: https://arg.software
  version: 1.0.0 # x-release-please-version
---

# Web Quality Audit

A method for auditing a web page the way [ARG Architect](https://arg.software) does: collect passive evidence the browser can observe, turn it into checks with explicit thresholds, score each category by what was actually observed, and report every problem with the evidence that proves it and the fix that resolves it. Use it to audit any public site, or your own app before a release.

Two rules come before everything else:

1. **Passive only.** Read what a normal visit exposes: responses, headers, the DOM, timings, public files. Never send attack payloads, brute-force paths, or probe for server vulnerabilities; that is penetration testing and needs written authorization.
2. **Unknown is not bad, and absent is not unknown.** If you could not observe something, the check is unknown and lowers coverage. If you observed it and it is missing, that is a real negative.

<!-- arg-base:start -->
## ARG base: rules for every task

These rules are the same in every ARG skill. The **Stack profile** table in this skill fills in the stack-specific parts: the verify command, the `lib` folder, the architecture-test tool, the config module, and the release type. The full procedures, templates and checklists are in [references/arg-base.md](references/arg-base.md). Read it when you set up a project, open a PR, or release.

These rules work with any coding agent (Claude Code, Cursor, Codex, OpenCode, GitHub Copilot). Commands are plain `git`, `gh` and the stack's own CLI. Wherever a step says **ask the user**, stop and get confirmation first.

### Principles

1. **Dependencies point inward.** Domain knows nothing. Application knows the domain. Infrastructure and presentation sit at the edges. Only the composition root builds concrete classes and wires them together.
2. **Architecture is tested, not hoped for.** Every layer rule is an automated test or lint rule that runs in CI.
3. **Nothing reaches the default branch without a branch, a PR, a human review, and green CI.**
4. **Reusable, domain-neutral helpers live in the `lib` folder**, never copied between files.
5. **Unknown is not bad, and absent is not unknown.** If something could not be observed, report it as unknown. If it was observed and is missing, that is a real negative result.
6. **Versions come from commits.** Conventional Commits drive release-please: fix → patch, feat → minor, breaking → major.
7. **Secrets never live in git.** A tracked `.env.example` documents every variable. An untracked `.env` holds the real values.
8. **Follow the local style.** Read the neighbouring files before writing new ones, and match their naming, comment density, and idioms.

### On every task

1. **Branch first.** Detect the default branch, and never assume it is `main`. If you are on the default branch, or on a branch meant for other work, advise a new branch and ask before creating it:
   - `feature/<slug>` for a feature
   - `fix/<slug>` for a bug
   - `hotfix/<slug>` for an urgent fix
   - `refactor/<slug>` when behaviour does not change
   - `chore/<slug>` / `docs/<slug>` for everything else

   Never commit to the default branch. Never force-push a shared branch.
2. **Find the owning layer** for each part of the change. Put ports inward, adapters outward, and wire them in the composition root.
3. **Search the `lib` folder** before writing a small helper. Add a helper there only if it is generic and has more than one consumer.
4. **Put constants in policy or config.** Thresholds, limits, weights and timeouts go in policy/config files, never as magic numbers.
5. **Test at the owning boundary.** A bug fix starts with a failing test that reproduces it. Extend the architecture tests when you add a layer, alias, project, or owned package.
6. **New configuration** goes in `.env.example` (with a dummy value and a comment) and is read only through the stack's config module.
7. **Run the stack's verify command** before you push.
8. **Open a PR** whose title is a Conventional Commit: `feat(<scope>): ...`, `fix(<scope>): ...`, or `!` / `BREAKING CHANGE:` for breaking changes. Ask the user when you are unsure whether a change is breaking. Request a reviewer, who can be a teammate or the user reviewing their own diff.
9. **Never merge the PR yourself**, never bypass branch protection, and never merge a Release PR. Tell the user the PR is waiting for review and give them the link.
10. **Update `AGENTS.md` and `docs/`** in the same PR when a rule or behaviour changes.

### When a piece is missing

If the project lacks any of the following, propose adding it on a `chore/project-setup` branch, using the templates in [references/arg-base.md](references/arg-base.md):
- a CI workflow running verify plus a PR-title check
- a ruleset protecting the default branch
- squash-only merges
- a PR template and `CODEOWNERS`
- `AGENTS.md` as the single agent rulebook, with `CLAUDE.md` importing it
- release-please with a `RELEASE_PLEASE_TOKEN` secret
- `.env.example` plus the `.gitignore` rules for `.env`
- a `lib` folder
- architecture tests

Anything outward-facing needs the user's approval first: rulesets, repository settings, secrets, pushes, and PR comments.
<!-- arg-base:end -->

The base's git and release rules apply when the audit turns into code changes in a repository. A read-only audit of a public site only needs the method below.

## Stack profile

| Base term | In an audit |
| --- | --- |
| **verify** | the audited project's own verify command (when fixing code); for the audit itself, re-run the failing checks and compare |
| **lib folder** | the audited project's `lib` folder (when fixing code) |
| **arch-test tool** | the audited project's architecture tests (when fixing code) |
| **config module** | thresholds and weights in [references/checks-and-thresholds.md](references/checks-and-thresholds.md); in your own app, keep performance budgets in one policy/config file |
| **release type** | the audited project's release-please type (when fixing code) |

---

## 1. Workflow

1. **Scope.** Confirm the URL(s), whether the site is yours, and the environment (production, staging). Audit the exact URL given; follow redirects and record them.
2. **Ask before contacting third parties.** Tools such as PageSpeed Insights, SSL Labs, securityheaders.com, or DNS/RDAP lookups send the URL to another service. Ask first. Local tools (curl, Lighthouse CLI, a local browser, axe-core) need no permission beyond running commands.
3. **Collect evidence** (section 2): headers, document, resources, timings, public files, repeated measured runs.
4. **Evaluate checks** per category with the thresholds in [references/checks-and-thresholds.md](references/checks-and-thresholds.md).
5. **Score** with coverage (section 3). Exclude fully unknown categories.
6. **Report** (section 5) with findings sorted by what to fix first.
7. **If you fix code**, follow the base: a branch, one concern per PR, before/after evidence in the PR description.

## 2. Evidence

| Evidence | How to get it | Feeds |
| --- | --- | --- |
| Main document response headers | `curl -sSIL <url>` (follow redirects, keep every hop), or the browser's network panel | security, caching, protocol, redirects |
| Rendered DOM | a real browser (Playwright/Puppeteer, DevTools) after load and a scroll to trigger lazy content | DOM, accessibility, AI readiness, SRI |
| Requests and timings | DevTools/HAR, Playwright request events, `PerformanceResourceTiming` | payload, efficiency, architecture, caching |
| Core Web Vitals and timings | Lighthouse (desktop preset) or a `PerformanceObserver` in the page, repeated runs | performance |
| Public files | `curl` on `/robots.txt`, `/sitemap.xml`, `/llms.txt`, `/llms-full.txt`, `/.well-known/*` | AI readiness |
| Client libraries | script URLs, banners, runtime globals (`jQuery.fn.jquery`) matched against Retire.js data | security |
| Accessibility | axe-core on the rendered DOM, plus the DOM counts | accessibility |

Evidence rules:

- **Measure repeatedly.** One discarded warm-up load, then N cache-bypassed measured loads (3 by default, 5 for thorough work) in the same unthrottled desktop window with a fixed viewport. Report the **median** of all runs. If any run fails (navigation interrupted, a challenge page, a different origin), the measurement is inconclusive: say so, do not compute a shorter median.
- **Judge desktop measurements against desktop thresholds** (Lighthouse desktop values). Use mobile thresholds only for throttled mobile runs, and say which you used.
- **Separate unavailable from missing.** Headers you could not capture, a fetch that timed out, cross-origin timing without `Timing-Allow-Origin`, or a truncated capture are unknown, never failures.
- **Only the page's own evidence counts.** Exclude browser-extension URLs (`chrome-extension:`, `moz-extension:`) and anything your tooling injected.
- **Consent banners**: to see the page as a new visitor, choose reject-all or essential-only, never accept-all, and note the choice. A CAPTCHA or access-denied page ends the audit for that URL: report it, never try to bypass it.
- **Never keep secrets.** Do not copy tokens, cookie values or credential-looking strings into notes or the report; record the type and location only. Strip query strings and credentials from URLs you print.

[references/evidence-collection.md](references/evidence-collection.md) has the commands and scripts: header capture, a Playwright collector for timings, resources and DOM counts, repeated runs, and axe-core.

## 3. Scoring

- **Checks** produce a status (good / warn / bad / unknown / not applicable) and a numeric credit.
- **Graded credit, no cliffs.** For numeric checks: 1 at the GOOD threshold or better, 0.25 at WARN, 0 at BAD, linear in between. Status comes from the thresholds (good ≤ GOOD, warn ≤ WARN, bad beyond), so a value just over a line loses a little credit, not half.
- **Severity-graded presence.** A security header that is present but weak keeps partial credit: clean 1, minor issues 0.6, high-severity issues 0.2.
- **Observed absence scores 0.** A captured response without Referrer-Policy, a completed robots.txt fetch with no usable rules, no structured data.
- **Unknown checks are excluded** from both earned and available points and lower the category's **coverage**.
- **Category score** = earned points / available known points. **Overall** = Σ (category weight × coverage × category score) / Σ (category weight × coverage). A fully unknown category is excluded. If every category is unknown, the overall result is "Insufficient evidence", never 0.
- **Weights** (ARG Architect's policy): Security 30%, Performance 20%, Architecture 15%, Efficiency 9%, Payload 8%, Accessibility 7%, AI readiness 6%, DOM 5%.
- **Bands**: bad below 50, warn 50-79, good 80+. Overall labels: Critical < 50, Needs work 50-59, Good 60-79, Excellent 80+.
- No category caps another. A bad LCP shows as a bad row and lowers Performance through graded credit.
- **Profile rows** (detected framework, CMS, CDN, server, analytics) carry zero weight. Technology choice never earns or loses points by itself.

## 4. Categories

A summary; every check, threshold and edge case is in [references/checks-and-thresholds.md](references/checks-and-thresholds.md).

- **Security**: CSP (with `unsafe-inline` without nonce/hash/`strict-dynamic` or `unsafe-eval` as high severity), HSTS (max-age at least one year; under one day is high severity), frame protection (`X-Frame-Options` not needed when CSP has `frame-ancestors`), `X-Content-Type-Options: nosniff`, Referrer-Policy, Permissions-Policy, CORS (absent `Access-Control-Allow-Origin` is not applicable; broad or credentialed access is bad), cookie flags (`Secure`, `HttpOnly`, `SameSite`), mixed content, exposed secrets in scripts (known secret formats, never public-by-design keys), obfuscated first-party code (report-only), known-vulnerable client libraries (graded by count), and SRI on version-pinned cross-origin files (report-only).
- **Performance**: LCP, FCP, TBT, CLS, TTFB, DOMContentLoaded, render-blocking scripts and stylesheets, redirect hops, header-based cacheability. Load Event is context only.
- **Payload**: total transfer, JavaScript, CSS, fonts, images, API responses, compression ratio, modern image formats (by response MIME type), oversized images.
- **Efficiency**: request count, duplicate requests, wasted bytes and time, HTTP/1.x origins.
- **Architecture**: third-party origins and requests, runtime API origins, dependency redirect hops, third-party critical CSS; plus the zero-weight technology profile.
- **DOM**: external scripts, inline event handlers, authored inline styles, node count and depth (judged together with TBT above the good size).
- **Accessibility**: image alt coverage, form labels, accessible names, heading skips, landmarks, iframe titles, positive tabindex, duplicate ids.
- **AI readiness**: robots.txt policy for AI crawlers (with Content-Signal), sitemap, valid `llms.txt`/`llms-full.txt` and whether its sections describe the page, structured data and Open Graph alignment, extractable content, citation signals, and `/.well-known` agent/MCP/OAuth discovery.
- **Attack exposure** (report-only): group the security rows by browser-side threat (XSS, clickjacking, CSRF, session theft, man-in-the-middle, third-party script tampering, reverse tabnabbing, cross-origin leaks, secret exposure, vulnerable libraries); each threat takes its weakest known defence. Server-side classes (SQL injection, command injection, SSRF, authentication flaws) are **Not tested**.

## 5. Report

- Lead with the overall score and label, the per-category score and coverage, the audit setup (date, URL, runs, browser, viewport, consent choice), and which categories were excluded.
- **Every warn or bad row has a finding** with four parts: **Measured** (the value), **Problem** (why it matters), **Evidence** (the offending items by name: the script URLs, the images without alt, the cookies without `Secure`, the duplicate ids with counts; up to 10 in the text, with the full list in an appendix), and **Recommended** (a concrete fix).
- **Fix first**: sort findings by severity, then by points lost (weight × missing credit).
- Unknown rows say what could not be observed and how to observe it; they are not findings.
- Plain hyphens, no em dashes. Never print credentials, tokens, cookie values or URL query strings.
- For comparisons, always read "B relative to A", show unchanged rows as `=`, and flag differences in setup (runs, browser, viewport) that limit the comparison.

[references/report-template.md](references/report-template.md) has the report skeleton, the finding format, a ticket-draft format, and a comparison table.

## 6. Auditing your own app

- Turn the thresholds into **budgets** in CI (Lighthouse CI assertions, bundle-size limits, a header test) so regressions fail a PR instead of waiting for the next audit.
- Fix one concern per PR and attach before/after evidence from the same method.
- Security headers belong in one place (the server, CDN or framework middleware config) with a test that asserts them.

---

## References

| File | Read it when |
| --- | --- |
| [references/arg-base.md](references/arg-base.md) | the audit becomes code changes: branches, PRs, CI, releases |
| [references/evidence-collection.md](references/evidence-collection.md) | collecting headers, timings, resources, DOM counts, public files, accessibility results |
| [references/checks-and-thresholds.md](references/checks-and-thresholds.md) | evaluating any check, choosing a status, or explaining a threshold |
| [references/report-template.md](references/report-template.md) | writing the report, findings, tickets or a comparison |

## Audit checklist

- [ ] Scope confirmed, and permission asked before any third-party service received the URL.
- [ ] Warm-up plus N measured runs completed; the median uses every run, or the measurement is reported inconclusive.
- [ ] Unavailable evidence is unknown, observed absence is a negative, and fully unknown categories are excluded.
- [ ] Every warn/bad row has Measured, Problem, Evidence (named items) and Recommended.
- [ ] No active probing, no accept-all consent, no bypassed challenges.
- [ ] No secrets, cookie values or query strings in the report.

---

## About

This skill is maintained by **[ARG Software](https://arg.software)** and distilled from the detection and scoring rules of **ARG Architect**, ARG's browser extension that runs this audit automatically in a dedicated browser window, keeps every report on your device, and compares runs over time. Want the automated version, or help fixing what the audit found? Visit [arg.software](https://arg.software).
