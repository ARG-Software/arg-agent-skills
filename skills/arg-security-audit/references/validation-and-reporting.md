# Validation, findings and reports

Phases 3 to 6 of a full audit: validate candidates, write `findings.json`, verify every record independently, and write the reports. In guidance mode, use the same verdicts and record fields in the conversation, without files.

## Contents

- [Phase 3. Validation](#phase-3-validation)
- [Phase 4. findings.json](#phase-4-findingsjson)
- [Phase 5. Independent verification](#phase-5-independent-verification)
- [Phase 6. Reports](#phase-6-reports)
- [Example confirmed record](#example-confirmed-record)

## Phase 3. Validation

Each unique candidate (merge duplicates by fingerprint first) is validated by a fresh view that did not hunt it. The validator's job is to **refute** the candidate:

1. Re-read every cited `file:line`. Does the code still say that, at the current source ref?
2. Look for the layer that stops it: global middleware, route guards, schema validation, ORM parameterisation, framework auto-escaping, a proxy or CDN rule that is in the repo, a unique constraint, a transaction.
3. Check every condition. Is the principal really lower-trust? Is the role really reachable by signup? Is the setting really the default?
4. Reproduce the minimum result in the sandbox. If execution is blocked, the best possible verdict is `needs_validation`.
5. Decide:

| Decision | When |
| --- | --- |
| `confirmed` | the trace holds, nothing stops it, and you observed the result locally |
| `needs_validation` | the trace holds as far as the source shows, but a deployment fact, missing code, or blocked execution decides it |
| `rejected` | something stops it, the principal already has that authority, it is self-impact, or the trace breaks |

The validator returns `{"decision": "confirmed" | "needs_validation" | "rejected", "record": { ... }}` with the record in the shape below.

## Phase 4. findings.json

A top-level JSON array of records, **sorted by `fingerprint`**, fingerprints unique. Every record has a `verdict` and only the fields its verdict allows. Run `node <skill-dir>/scripts/validate-audit.mjs <output-dir>` and fix the file until it passes.

### Shared shapes

| Field | Shape |
| --- | --- |
| `fingerprint` | string matching `^[A-Za-z0-9][A-Za-z0-9._:/@+-]*$`, stable across runs, for example `sqli:src/repo/user.repository.ts:findByEmail` |
| `title` | one line, the result in plain words ("Any tenant can share another tenant's invoice") |
| `boundary` | the boundary crossed, matching the ledger (`tenant-isolation`, `anonymous-to-authenticated`, `user-to-admin`, `page-to-extension`, ...) |
| `coverage_ids` | the ledger units that produced it |
| `trace` | array of `{ "kind": "entrypoint" \| "propagation" \| "sink", "location": "path:line", "description": "..." }`, in order from entry to sink |
| `evidence` | array of `{ "location": "path:line", "description": "...", "snippet": "optional, at most a few lines, never a real secret" }` |
| `conditions` | array of `{ "kind": "...", "description": "..." }`, where kind is one of `authentication_level`, `authorization_role`, `user_interaction`, `system_configuration`, `network_position`, `environment`, `data_state`, `timing`, `third_party` |

### `confirmed`

| Field | Required | Notes |
| --- | --- | --- |
| `verdict` | yes | `"confirmed"` |
| `fingerprint`, `title`, `boundary`, `coverage_ids` | yes | |
| `root_cause` | yes | the defect in one or two sentences |
| `intended_behavior` | yes | what the code should enforce |
| `trace` | yes | at least one `entrypoint` and one `sink` |
| `evidence` | yes | non-empty |
| `conditions` | yes | may be empty when none apply |
| `reproduction` | yes | `{ "attacker": "who, with what access", "steps": [...], "payloads": [...], "observed_result": "what you saw in the sandbox" }` (`payloads` optional) |
| `remediation` | yes | `{ "strategy": "the smallest effective fix at the owning layer", "code_changes": [ { "location": "path:line", "change": "..." } ] }` (`code_changes` optional) |
| `severity` | yes | `{ "likelihood": L, "impact": L, "overall": L }`, each one of `informational`, `low`, `medium`, `high`, `critical` |
| `confidence` | yes | `{ "score": "low" \| "medium" \| "high", "rationale": "..." }` |

### `needs_validation`

| Field | Required | Notes |
| --- | --- | --- |
| `verdict` | yes | `"needs_validation"` |
| `fingerprint`, `title`, `boundary`, `coverage_ids` | yes | |
| `claimed_root_cause` | yes | the suspected defect |
| `trace`, `evidence` | yes | as far as the source shows |
| `conditions` | no | |
| `blockers` | yes | non-empty: what stopped a decision ("proxy config not in repo", "sandbox could not start the database") |
| `validation_plan` | yes | `{ "local": [...], "deployment": [...] }`, at least one non-empty: the exact checks that would decide it, safe to run |

No `severity`, `confidence` or `reproduction`. A needs-validation record is a lead, not a rated finding.

### `rejected`

| Field | Required | Notes |
| --- | --- | --- |
| `verdict` | yes | `"rejected"` |
| `fingerprint`, `title` | yes | |
| `claimed_root_cause` | yes | what was suspected |
| `trace`, `evidence` | yes | what was checked |
| `reason` | yes | what stops it, with `file:line` when it is code |
| `coverage_ids` | no | |

Rejected records stay in the file so later runs do not hunt them again.

## Phase 5. Independent verification

Each final `confirmed` and `needs_validation` record gets one more check by a fresh view that took part in neither its hunting nor its validation. The verifier re-reads the trace, re-runs the reproduction when possible, and challenges the severity and the fix. It returns either:

```json
{ "decision": "verified", "fingerprint": "idor:src/application/invoices/share-invoice.usecase.ts:execute" }
```

or:

```json
{ "decision": "replace", "fingerprint": "...", "record": { "...": "the corrected record" }, "why": "severity overstated: requires an admin role" }
```

A replacement that raises severity, or moves a record from `needs_validation` to `confirmed`, needs one more independent verifier. Mark `run_status: "incomplete"` rather than skipping verification when the budget runs out.

## Phase 6. Reports

Write the reports from `findings.json` and `coverage-ledger.json`. Use plain hyphens, cite `file:line`, and never include live secrets, real user data, or steps aimed at a deployed system.

### REPORT.md

```markdown
# Security audit: <repo-name>

| | |
| --- | --- |
| Source ref | <commit> (<clean / dirty>) |
| Date | <YYYY-MM-DD> |
| Profile | quick / standard / deep |
| Scope | whole repository / <paths> (partial coverage) |
| Execution | sandboxed: <container, network none, limits> / blocked: <reason> |
| Status | complete / incomplete: <reason> |

## Summary

<3-5 sentences: what the product is, the most serious result in plain words, the overall posture, and what to fix first.>

## Confirmed findings

| # | Severity | Title | Boundary | Result |
| --- | --- | --- | --- | --- |
| 1 | high | Any tenant can share another tenant's invoice | tenant-isolation | tenant B created a public link to tenant A's invoice |

### 1. <title>

- **Severity**: high (likelihood high, impact high); confidence high
- **Where**: `src/application/invoices/share-invoice.usecase.ts:31`
- **Root cause**: ...
- **Conditions**: authenticated user in any tenant
- **Result**: ...
- **Fix**: ...

Full trace and reproduction: FINDINGS-DETAIL.md#1

## Needs validation

| # | Title | Boundary | Blocker | How to decide |
| --- | --- | --- | --- | --- |

## Hardening notes

<Defence-in-depth items with no reachable violation today, one line each with location.>

## Coverage

| Status | Units |
| --- | --- |
| covered | 42 |
| candidate | 3 |
| blocked | 1 |
| deferred | 4 |
| not applicable / out of scope | 9 |

<Which surfaces or classes were blocked or deferred, and why. Say "full coverage" only when the ledger allows it.>
```

Sort confirmed findings by severity, then confidence, then fingerprint.

### FINDINGS-DETAIL.md

One section per confirmed finding of medium severity or higher, numbered as in `REPORT.md`: the full trace (each step with `file:line` and a short snippet), the conditions, the sandboxed reproduction (attacker, steps, payloads, observed result), the remediation with code changes, and the test that should be added at the owning boundary.

### NEEDS-VALIDATION.md

One section per needs-validation record: the claimed root cause, the trace, the evidence, the blockers, and the validation plan split into local checks and deployment checks for the owners to run. No severity.

## Example confirmed record

```json
{
  "verdict": "confirmed",
  "fingerprint": "idor:src/application/invoices/share-invoice.usecase.ts:execute",
  "title": "Any tenant can share another tenant's invoice",
  "boundary": "tenant-isolation",
  "coverage_ids": ["http:POST /api/invoices/:id/share::tenant-isolation::access-control"],
  "root_cause": "ShareInvoiceUseCase loads the invoice by id alone; the repository's tenant-scoped finder is not used.",
  "intended_behavior": "Only members of the invoice's tenant may create a share link.",
  "trace": [
    { "kind": "entrypoint", "location": "src/api/invoices/share.controller.ts:18", "description": "POST /api/invoices/:id/share passes the path id to the use case" },
    { "kind": "propagation", "location": "src/application/invoices/share-invoice.usecase.ts:31", "description": "invoiceRepository.findById(id) with no tenantId" },
    { "kind": "sink", "location": "src/application/invoices/share-invoice.usecase.ts:38", "description": "creates a public share token for the loaded invoice" }
  ],
  "evidence": [
    { "location": "src/infrastructure/db/invoice.repository.ts:44", "description": "findByIdForTenant exists and is used by every other invoice use case" }
  ],
  "conditions": [
    { "kind": "authentication_level", "description": "any signed-in user" },
    { "kind": "data_state", "description": "attacker knows or guesses an invoice id; ids are sequential integers" }
  ],
  "reproduction": {
    "attacker": "signed-up user in tenant B",
    "steps": ["start the API in the sandbox with the seed data", "sign in as tenant B", "POST /api/invoices/1/share (invoice 1 belongs to tenant A)"],
    "payloads": ["POST /api/invoices/1/share"],
    "observed_result": "201 Created with a share URL; GET on the URL returns tenant A's invoice"
  },
  "remediation": {
    "strategy": "Load the invoice with findByIdForTenant(id, currentUser.tenantId) and return NotFound when it is missing; add a use-case test with another tenant's id.",
    "code_changes": [
      { "location": "src/application/invoices/share-invoice.usecase.ts:31", "change": "replace findById(id) with findByIdForTenant(id, ctx.tenantId)" }
    ]
  },
  "severity": { "likelihood": "high", "impact": "high", "overall": "high" },
  "confidence": { "score": "high", "rationale": "reproduced locally against the seed data" }
}
```
