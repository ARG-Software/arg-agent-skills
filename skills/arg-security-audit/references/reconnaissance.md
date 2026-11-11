# Reconnaissance and the coverage ledger

Phase 1 of a full audit. The goal is a map good enough to hunt from: who the principals are, where untrusted input enters, which boundaries protect what, and where the dangerous sinks are. Reconnaissance reads; it does not hunt.

## Contents

- [The four questions](#the-four-questions)
- [Prior runs](#prior-runs)
- [architecture.md](#architecturemd)
- [The coverage ledger](#the-coverage-ledger)
- [Unit statuses](#unit-statuses)

## The four questions

Answer each one separately. They can run in parallel (four helpers or four passes), each returning a short structured summary with `file:line` references.

### 1. Product, stack and baseline

- What the product does, who uses it, and what it is worth attacking for (money, data, compute, reputation, a foothold into users' machines).
- Languages, frameworks, runtimes, package managers, and versions (`package.json`, `*.csproj`, `go.mod`, `Cargo.toml`, `pyproject.toml`, lock files).
- Build and test commands, and which of them can run in the sandbox.
- **Comparable software**: two or three similar products or libraries, and the vulnerability classes that have hit them (their advisories, CVEs, changelogs). Those classes get priority.

### 2. Principals, authority and controls

- Every principal: anonymous visitor, signed-in user, roles, tenants, admins, service accounts, other services, webhooks, the CI system, a web page talking to an extension, a file the user opens, a prompt the model reads.
- What each one may do, and where that is enforced: authentication middleware, guards, policies, decorators, row-level filters, scopes, capability checks.
- How identity is established and carried: sessions, JWTs, API keys, OAuth, mTLS, signed URLs, cookies, extension messaging origins.
- Gaps to note: routes outside the middleware, handlers that read an id from the request and never check ownership, admin features guarded only in the UI.

### 3. Entry surfaces, transformations and sinks

- **Entry surfaces**: HTTP routes, GraphQL resolvers, RPC methods, queue consumers, webhooks, CLI arguments and environment, file and archive parsers, uploads, deep links, IPC and extension messages, MCP tools, scheduled jobs that read external data, LLM inputs.
- **Transformations**: parsing, deserialization, normalisation, decoding, templating, URL building, path joining, model calls.
- **Sinks**: SQL and NoSQL queries, shell and process execution, file system paths, outbound HTTP (SSRF), HTML rendering, redirects, `eval` and dynamic import, deserializers, template engines, crypto operations, logs, emails, LLM tool calls, payments.

For each surface, record the starting path (`file:line` of the handler) so hunting can start there.

### 4. Local execution and deployment visibility

- Which tests and scripts exist, and which are safe to run in the sandbox. List the prohibited ones (deploy, migrate, release, anything that needs real credentials or the network).
- Check the sandbox: can you start a container with `--network none`, a read-only mount and limits? If not, record that execution is blocked for this run.
- What the repo shows about deployment: Dockerfiles, IaC (Terraform, Pulumi, CloudFormation, Bicep), Kubernetes manifests, proxy and CDN config, CI workflows, environment templates. Anything not in the repo is **unknown**, and findings that depend on it become needs validation.

## Prior runs

Read every earlier `run-*` directory in the output root before building the ledger. For each prior unit and record, set a `prior_status`:

| `prior_status` | Meaning | What to do |
| --- | --- | --- |
| `none` | no prior run covered it | hunt normally |
| `prior_confirmed_same_source` | confirmed before, cited source unchanged | carry the record forward; do not re-report it as new |
| `prior_confirmed_changed_source` | confirmed before, cited source changed | revalidate: is it fixed, moved, or still there? |
| `prior_needs_validation` | left open before | make it current work |
| `prior_rejected` | rejected before | skip unless the source changed or new evidence exists |
| `prior_gap` | deferred, blocked or out of scope before | make it current work, highest priority after the lowest-trust surfaces |

Use `git diff <prior-ref>..HEAD -- <paths>` to decide whether source changed.

## architecture.md

At most about 1,000 words. It is the briefing every hunting pass reads, so keep it dense and factual:

1. **Product and principals**: what it does, the principals, and what each may do.
2. **Comparable baseline**: similar software and the classes that hit it.
3. **Stack and deployment**: languages, frameworks, and what the repo shows (and does not show) about deployment.
4. **Entry surfaces**: grouped by trust level, with starting paths.
5. **Trust boundaries**: each boundary, the control that enforces it, and where.
6. **Starting paths**: the ten or so most promising places to hunt first, and why.
7. **Prior gaps**: what earlier runs left open.
8. **Companions selected**: which domain companions apply, with the boundary that justifies each, and which were excluded and why.

## The coverage ledger

`coverage-ledger.json` is a top-level JSON array. Each element is one **unit**: one entry surface or subsystem, crossing one boundary, hunted for one attack class. Build it from the surfaces and boundaries in `architecture.md` and the attack classes that apply to each.

```json
[
  {
    "coverage_id": "http:POST /api/invoices/:id/share::tenant-isolation::access-control",
    "surface": "http:POST /api/invoices/:id/share",
    "boundary": "tenant-isolation",
    "attack_class": "access-control",
    "companions": ["data-isolation"],
    "starting_paths": ["src/api/invoices/share.controller.ts:18"],
    "priority": 1,
    "prior_status": "none",
    "status": "covered",
    "owner": "hunter-2",
    "reviewed_paths": [
      "src/api/invoices/share.controller.ts",
      "src/application/invoices/share-invoice.usecase.ts",
      "src/infrastructure/db/invoice.repository.ts"
    ],
    "checks": ["read the use case and repository; ownership enforced by tenantId filter at invoice.repository.ts:44", "unit test with another tenant's id returns NotFound"],
    "fingerprints": [],
    "unresolved": [],
    "reason": null,
    "attempts": []
  }
]
```

Rules:

- **`coverage_id`** is `<surface>::<boundary>::<attack_class>`, built from the same values as the fields. It is stable across runs so prior runs can be matched. Escape any `::` inside a value as `%3A%3A`.
- **`priority`** is 1 (hunt first) to 5. Lowest-trust surfaces and the most valuable resources get 1.
- **`attempts`** is append-only. When a unit is reopened or reassigned, push the previous `status`, `owner`, `checks` and `reason` into it before changing them.
- **`fingerprints`** lists the `findings.json` fingerprints this unit produced.
- Units the profile or budget cannot reach become `deferred`, never silently dropped.

## Unit statuses

| Status | Meaning | Required fields |
| --- | --- | --- |
| `planned` | in the ledger, not started | `starting_paths` |
| `in_progress` | a hunter owns it | `owner` |
| `covered` | hunted, nothing reportable found | `owner`, non-empty `reviewed_paths` and `checks`, empty `unresolved` |
| `candidate` | hunted, produced one or more records | `owner`, non-empty `reviewed_paths` and `fingerprints` |
| `blocked` | could not be completed (sandbox unavailable, code missing, generated code) | `reason` |
| `deferred` | not reached within the profile or budget | `reason` |
| `not_applicable` | the class cannot apply to this surface | `reason` |
| `out_of_scope` | outside the agreed scope | `reason` |

A run may claim full coverage only when every unit is `covered`, `candidate`, `not_applicable` or `out_of_scope`, and the last coverage review came back clean. Otherwise the report states the counts of `blocked` and `deferred` units.
