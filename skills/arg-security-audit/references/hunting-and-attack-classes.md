# Hunting and attack classes

Phase 2 of a full audit, and the toolkit for guidance mode. Each attack class below is written as a prompt: hand it, with `architecture.md` and the assigned units, to whoever hunts (you, a helper agent, a second pass).

## Contents

- [The hunting method](#the-hunting-method)
- [The candidate gate](#the-candidate-gate)
- [Hunter result](#hunter-result)
- [Coverage review](#coverage-review)
- [Core attack classes](#core-attack-classes)
- [Obvious things](#obvious-things)

## The hunting method

1. **Read at depth.** Start at the unit's starting path and follow the data to the sink. Read middleware, decorators, base classes, framework defaults and config on the way; most bugs hide in what a handler assumes someone else checked.
2. **Name the invariant.** Write one line: "only `<principal>` may `<action>` on `<resource>`, enforced at `<file:line>`". If you cannot find where it is enforced, that is the lead.
3. **Walk the sad paths.** Missing and extra fields, wrong types, empty and huge values, unicode and encoding tricks, duplicate keys and parameters, reordered steps, concurrent requests, another tenant's id, a lower role, an expired or revoked credential, a replayed request.
4. **Hunt variants.** When you find a root cause (a helper that skips a check, a pattern copied across controllers), search the codebase for every other use: `rg -n "<pattern>"`, callers of the function, other handlers built from the same template.
5. **Prove narrowly.** Use the smallest local check that shows the result: a unit test, a script calling the function, a request against a server started in the sandbox. Never a deployed system.
6. **Stop at the deployment line.** When the result depends on something the repo does not show (a proxy strips the header, the bucket is private, the flag is off in production), stop and file `needs_validation` with what would decide it.

## The candidate gate

A candidate goes to validation only when all of these hold:

- A complete source trace from entry point to sink, each step a `file:line`.
- The six elements: principal, input, control, boundary, resource, observed result.
- For a proposed `confirmed`: a bounded local result you actually observed (test output, script output, a response from the sandboxed server). Reasoning alone is `needs_validation`.
- Every condition listed (authentication level, role, user interaction, configuration, timing, data state).
- No visible layer that prevents it (check the global middleware, the schema validator, the ORM's escaping, the framework's default).
- A **fingerprint**: a stable, short id built from the root cause and location, matching `^[A-Za-z0-9][A-Za-z0-9._:/@+-]*$`, for example `idor:src/api/invoices/share.controller.ts:share`.

Anything else is either more hunting, a hardening note, or nothing.

## Hunter result

A hunting pass returns one JSON object and nothing else, so the coordinator can merge it into the ledger and findings:

```json
{
  "units": [
    {
      "coverage_id": "http:POST /api/invoices/:id/share::tenant-isolation::access-control",
      "status": "candidate",
      "reviewed_paths": ["src/api/invoices/share.controller.ts", "src/application/invoices/share-invoice.usecase.ts"],
      "checks": ["share-invoice.usecase.ts:31 loads the invoice by id without tenantId; sandbox test as tenant B shares tenant A's invoice"],
      "fingerprints": ["idor:src/application/invoices/share-invoice.usecase.ts:execute"],
      "unresolved": []
    }
  ],
  "candidates": [ { "proposed_verdict": "confirmed", "fingerprint": "idor:...", "...": "the record fields from validation-and-reporting.md" } ],
  "hardening": [ { "title": "Session cookie lacks SameSite", "location": "src/infrastructure/http/session.ts:12", "why": "defence in depth; no CSRF-reachable state change found" } ],
  "uncovered": [ { "surface": "queue:invoice.exported", "why": "found during hunting, not in the ledger" } ]
}
```

## Coverage review

After each hunting pass, review the ledger with fresh eyes (a helper that did not hunt, or a deliberate second read) and return:

```json
{
  "missing_units": [ { "surface": "...", "boundary": "...", "attack_class": "...", "why": "..." } ],
  "reopen": [ { "coverage_id": "...", "why": "checks do not reach the sink" } ],
  "stop": false
}
```

Look for surfaces in the code but not in the ledger, boundaries with no access-control unit, `covered` units whose checks never reach a sink, classes the comparable software suffered that nobody hunted, and `uncovered` items from hunters. `stop: true` only when nothing is missing or reopened. The `standard` profile needs one clean review before it claims full coverage; `deep` needs two in a row.

---

## Core attack classes

Every target gets these classes, applied to the units where they fit. Domain-specific classes are in [domain-companions.md](domain-companions.md).

### Injection

Trace every untrusted input to every interpreter: SQL and NoSQL queries, shell commands, `eval` and `Function`, template engines, LDAP, XPath, regular expressions built from input, HTML and URL contexts, log lines, headers (CRLF), CSV and spreadsheet formulas, GraphQL, and LLM prompts that drive tools.

- Look for string concatenation and interpolation into queries and commands, raw-query escape hatches in ORMs (`$queryRawUnsafe`, `.raw()`, `FromSqlRaw`), `shell: true`, and `exec` with a joined string.
- Follow **second-order** paths: input stored now and used unsafely later (a username rendered in an admin page, a filename passed to a converter job).
- Check that escaping matches the context (HTML body vs attribute vs URL vs JS), and that allow-lists are applied after decoding.

### Access control

For every action, check three things: the **right permission** (is the role checked?), on the **right resource** (does the object belong to the caller or their tenant?), through the **right mechanism** (is it enforced on the server, in the layer that owns the rule?).

- Object references from the request (ids in paths, bodies, queries, GraphQL arguments) loaded without an ownership filter.
- Batch and bulk endpoints, exports, search, and "list" endpoints that skip the check the "get" endpoint has.
- Admin and internal routes outside the auth middleware, or protected only by the UI hiding a button.
- Mass assignment: request bodies bound straight to entities, letting a user set `role`, `tenantId`, `ownerId`, `price`, `isVerified`.
- Privilege changes (invites, role edits, ownership transfer) that a lower role can trigger, or that skip re-authentication.

### Resource and file handling

- **Path traversal**: user input joined into file paths without resolving and checking the result stays under the root; `..`, absolute paths, encoded separators, symlinks.
- **Archive extraction** (zip slip, tar), with entries that escape the target directory or are symlinks; decompression bombs.
- **SSRF**: server-side fetches of user-supplied URLs (webhooks, link previews, imports, image proxies, PDF renderers) without an allow-list that is checked after DNS resolution and on every redirect; access to `169.254.169.254`, `localhost`, internal hostnames.
- **Unsafe deserialization**: `pickle`, Java/.NET binary serializers, `YAML.load`, `BinaryFormatter`, `TypeNameHandling.All`, `unserialize`, prototype-polluting merges.
- **TOCTOU**: a check on a path or record followed by a use that can see a different one.
- Uploads: type checked by extension or client MIME only, files served from the app origin, user-controlled storage keys.

### Cryptography and secrets

- Hardcoded secrets, keys and tokens in source, config, fixtures, test data and git history (`git log -p -S`).
- Predictable randomness for tokens, ids, reset links and nonces (`Math.random`, `rand`, time-based seeds).
- Non-constant-time comparison of secrets, signatures and tokens.
- JWT problems: `alg: none` accepted, algorithm not pinned, HS/RS confusion, signature not verified, expiry not checked, `kid` used as a path.
- Weak or misused primitives: MD5/SHA-1 for passwords, unsalted hashes, ECB, static IVs, missing authentication on encryption.
- Failure fallbacks: when verification throws, does the code continue as if it passed?

### Business logic

- State machines: can a step be skipped, repeated, reversed, or done out of order (pay after ship, refund twice, approve your own request)?
- **Races**: check-then-act on balances, quotas, coupons, inventory, invites and one-time tokens without a transaction, lock or unique constraint.
- Numbers: negative quantities, zero, overflow, rounding, currency mixing, floating point for money.
- Implicit trust: prices, totals, roles or flags taken from the client; webhook payloads trusted without a signature.
- Time: expiry checked on the client, time zones, clock skew, tokens that never expire.
- Defaults: new resources public by default, features enabled when config is missing, fail-open error handling.

### Feature abuse and data leakage

- Export, import, backup and report features that include other users' data or more fields than the UI shows.
- Search, filter, sort and autocomplete as **oracles** (sorting by a hidden field, counts that reveal existence).
- Enumeration through different responses or timings for existing vs missing users, emails, ids.
- Previews and thumbnails that render private content, or fetch URLs server-side.
- Webhooks and integrations as SSRF or as a way to exfiltrate events.
- Verbose errors, debug endpoints, stack traces, and logs that capture tokens or personal data.

### Chained vulnerabilities and trust boundaries

Low findings that combine into a high one. Ask: what does each small capability give an attacker, and what does it unlock next?

- Multi-step chains (an open redirect plus an OAuth flow, a stored XSS plus a CSRF-able admin action, a file write plus a path that is later executed).
- Cross-component trust: service A trusts headers that the edge does not strip; an internal API assumes the caller already checked.
- Second-order effects and capability growth: a low role can create an object that a higher role later processes unsafely.
- Rollback and downgrade: older API versions, legacy endpoints, or fallback auth paths still reachable.

### Wildcard

Find what the other classes missed. Start from questions like:

- What is the strangest or most complex code in the codebase, and who can reach it?
- Where did the authors write their own parser, crypto, auth, sanitizer or retry logic?
- What does a recent large refactor or a "temporary" comment leave behind?
- Which feature would the comparable software's attackers try first?
- What would you attack if you had one hour and a normal user account?

## Obvious things

A quick sweep for common mistakes. **Each hit is only a lead**: verify the full code path and reachability before reporting it, and report it as hardening when no boundary is crossed.

- Hardcoded secrets, private keys and tokens (`rg -n "(api[_-]?key|secret|token|password|BEGIN .* PRIVATE KEY)" -i`), and committed `.env` files.
- Debug modes, admin consoles, GraphQL introspection or Swagger UI enabled outside development without auth.
- Dangerous calls: `eval`, `exec`, `child_process` with `shell: true`, `os.system`, `Runtime.exec`, `Process.Start` with joined strings, `innerHTML`/`dangerouslySetInnerHTML` with untrusted data.
- CORS reflecting the `Origin` header with credentials, or `*` with credentials.
- Session and auth cookies without `Secure`, `HttpOnly` or `SameSite`.
- Open redirects from `next`, `returnUrl`, `redirect_uri` parameters.
- TLS verification disabled (`rejectUnauthorized: false`, `verify=False`, `ServerCertificateCustomValidationCallback` returning true).
- Stack traces or internal errors returned to clients in production paths.
- Known-vulnerable dependencies (`npm audit`, `pnpm audit`, `dotnet list package --vulnerable`, `pip-audit`, `govulncheck`, `cargo audit`), run in the sandbox without network only if a local advisory database is available; otherwise ask before using the network. A vulnerable package is a finding only when the vulnerable function is reachable.
