---
name: arg-security-audit
description: Audit a codebase for security vulnerabilities from its source, defensively, so every finding names a real trust boundary, a reproducible result and the smallest fix. Use when asked for a security audit, security review, pen-test style review, vulnerability hunt, threat model or security report on a repository, API, service, CLI, library, extension, mobile app or MCP server, or for focused questions such as whether a route is exploitable, whether input reaches a dangerous sink, or how to triage a reported vulnerability. Answers focused questions in guidance mode, and runs the full workflow (reconnaissance, a coverage ledger, hunting by attack class, independent verification, a validated findings.json and a report) only when a full audit or report is asked for. Runs target code only in a sandbox, never probes deployed systems, and gives severity to confirmed findings only. When the audit leads to fixes, the ARG base applies, with fix branches, reviewed PRs, and CI before merge.
license: MIT
metadata:
  author: ARG Software
  homepage: https://arg.software
---

# Security Audit

A source-first method for finding vulnerabilities that a lower-trust principal can really exploit across a trust boundary, and for handing the owners what they need to act: the source trace, a safe local reproduction, a priority, and the smallest fix that closes the hole. The workflow is ARG Software's own and is inspired by Cloudflare's MIT-licensed [`security-audit-skill`](https://github.com/cloudflare/security-audit-skill) (see [Credits](#credits)), reorganised and rewritten for the ARG base.

Three rules come before everything else:

1. **Defensive and local.** Read the source, run the target's own tests, and reproduce only in a sandbox on your machine. Never send payloads to a deployed, shared or third-party system, even one the user owns, unless they give written authorization for that exact system and scope.
2. **A finding needs a boundary and a result.** Name who the attacker is, what they control, which control should stop them, what they reach, and what you observed. A checklist item with no reachable violation is a hardening note, not a vulnerability.
3. **Unknown is not bad, and absent is not unknown.** If a deployment fact decides exploitability and the source does not show it, the record is **needs validation**, never confirmed and never given a severity.

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

The base's git and release rules apply when the audit turns into fixes. A read-only audit writes its output outside the target repository and changes nothing in it.

## Stack profile

This skill works on any stack, so it fills the base terms from the repository under audit:

| Base term | In an audit |
| --- | --- |
| **verify** | the audited project's verify command, run only inside the sandbox (section 3); for the audit itself, `node <skill-dir>/scripts/validate-audit.mjs <output-dir>` |
| **lib folder** | the audited project's `lib` folder; security helpers (escaping, path joining, URL allow-lists, constant-time compare) belong there, used everywhere instead of copied |
| **arch-test tool** | the audited project's architecture tests; add a rule when a fix depends on a boundary (for example "only `infrastructure/http` may call `fetch`") |
| **config module** | the audited project's config module; a fix that adds a secret or a limit adds it there and to `.env.example` |
| **release type** | the audited project's release-please type; a security fix is `fix(<scope>): ...`, and a fix that changes an API contract is breaking |

---

## 1. Modes

| Mode | When | What you do |
| --- | --- | --- |
| **Guidance** (default) | a question, a focused review of one route, file, PR or feature, triage of a reported issue | Apply the principles (section 2) and the attack classes that fit. Answer in the conversation. Create no files, and do not run the six phases. |
| **Full audit** | the user asks for a security audit, pen-test style review, full / end-to-end / comprehensive review of a repo, or a written report | Run section 5 end to end and write the output files (section 4). |

If you cannot tell which the user wants, ask one short question ("a quick answer, or a full audit with a written report?") before creating any file.

## 2. Principles

1. **Boundary and result.** Every candidate states six things: the lower-trust **principal** (anonymous user, other tenant, low-privilege user, web page, untrusted file, malicious dependency), the **input** they control, the **control** meant to stop them, the **boundary** crossed, the **resource** affected, and the **observed result**. If one is missing, keep hunting or file it as hardening.
2. **Bounded local evidence.** Prefer the narrowest check that proves the claim: reading the code path, a unit test, a script that calls the function with the payload, a local server in the sandbox. Never more than that.
3. **Respect what the source can show.** Do not assume a WAF, a reverse proxy, a feature flag, an IAM policy or a header that is not in the repo. When such a fact decides the outcome, say so and file the record as needs validation with a plan to check it.
4. **Priority is not certainty.** `confirmed` records get a severity and a confidence. `needs_validation` records get blockers and a validation plan, never a severity. `rejected` records keep their reason so they are not re-reported.
5. **Smallest effective fix, at the owning layer.** Fix the root cause where the boundary lives (the authorization check in the use case, the escaping in the renderer, the path check in the file adapter), reuse the `lib` helper, and add the test that would have caught it. Defence in depth comes after, as hardening.
6. **Self-impact is not a finding.** An attacker who can only hurt their own account, their own browser, or a machine they already control has crossed no boundary.
7. **Do not overstate.** Report what you showed. "Reads any tenant's invoices" is not "full database access".

### Severity

Severity is the impact of a confirmed finding under its stated conditions, combined with how likely those conditions are:

| Severity | Anchor |
| --- | --- |
| **critical** | an unauthenticated or anonymous actor gets code execution, full data-store access, or takes over any account |
| **high** | a low-privilege actor reaches other users' or tenants' sensitive data or actions, or escalates to admin; or an unauthenticated actor reaches meaningful but bounded data |
| **medium** | a real boundary violation that needs significant conditions (user interaction, a specific role, a non-default setting) or has bounded impact |
| **low** | a violation with minor impact, such as limited information disclosure or a hard-to-reach precondition |
| **informational** | a confirmed behaviour worth knowing that crosses no boundary today; most of these belong in hardening notes instead |

## 3. Execution safety (both modes)

Target code is untrusted. Its tests, build scripts, `postinstall` hooks, and fixtures can do anything. Run any of it only inside an OS-enforced sandbox (a container or VM such as `docker run --network none --read-only`, a devcontainer without credentials, `bwrap`, `sandbox-exec`) that has:

- **no network access**, and no access to the host's credentials, SSH keys, cloud CLIs, or `.env` files;
- an **empty environment** with only the variables the check needs, all dummy values;
- the target and toolchain **mounted read-only**, with writes only to a scratch directory;
- **limits** on CPU, memory, processes, file size, disk, and wall-clock time.

If you cannot enforce these, **do not execute target code**: rely on reading, and record the check as blocked. Never install new dependencies into the target, never run its deploy, migration or release scripts, and never contact a deployed instance. Ask the user before anything that leaves the machine, including uploading code to a third-party scanner.

Never copy a real secret you find into notes, prompts or the report. Record its type, file and line, and say it should be rotated.

## 4. Output (full audit)

Write everything to an output directory **outside the target repository**, by default `~/arg-security-audit/<repo-name>/run-<N>/` (the next free number). Ask before writing elsewhere.

| File | What it holds |
| --- | --- |
| `run-metadata.json` | run id, target path, source ref (commit and whether the tree is dirty), profile, scope paths, budget, the execution policy, prior runs read, `run_status` (`in_progress`, `complete`, `incomplete`) |
| `architecture.md` | the reconnaissance summary, at most about 1,000 words |
| `coverage-ledger.json` | one unit per (entry surface, boundary, attack class), with its status and what was checked |
| `findings.json` | every confirmed, needs-validation and rejected record, sorted by fingerprint |
| `REPORT.md` | the human report |
| `FINDINGS-DETAIL.md` | the full trace and reproduction of each confirmed medium, high or critical finding |
| `NEEDS-VALIDATION.md` | every unresolved record with its blockers and validation plan |

The formats are in [references/validation-and-reporting.md](references/validation-and-reporting.md). Run `node <skill-dir>/scripts/validate-audit.mjs <output-dir>` before you call the audit complete; it checks `findings.json` and `coverage-ledger.json` and exits non-zero on any problem.

If you work with helper agents or sub-tasks, only the coordinating agent writes the shared files above. Each helper returns structured JSON, and the coordinator merges it.

## 5. Full audit workflow

### Setup

1. Resolve the target directory, the repo name, the source ref (`git rev-parse HEAD`, `git status --porcelain`), and the output directory.
2. Pick a **profile** with the user, `standard` by default:
   - `quick`: one hunting pass over the highest-priority units and one coverage review; verification merged into validation.
   - `standard`: the full workflow, with coverage reviews until one comes back clean.
   - `deep`: split each subsystem into its own units, repeat the coverage review until clean twice, and re-hunt covered high-value units with a fresh view.
3. Agree the **scope** (whole repo, or listed paths). A scoped run says in every report that coverage is partial.
4. Read **prior runs** in the output root. Carry forward confirmed records only when their cited source is unchanged; changed source becomes revalidation work; prior needs-validation, deferred and blocked units become current work; rejected records stay rejected unless the source changed.
5. Write `run-metadata.json` with `run_status: "in_progress"`.

### Phase 1. Reconnaissance

Map the product before hunting: what it does and for whom, the principals and their authority, every entry surface, the trust boundaries, the dangerous sinks, how it is built, tested and deployed, and what the sandbox can run. Compare it with similar software and their known vulnerability history. Write `architecture.md`, then build `coverage-ledger.json` from the entry surfaces, boundaries and the attack classes that apply.

[references/reconnaissance.md](references/reconnaissance.md) has the four reconnaissance questions, the `architecture.md` outline, and the ledger format and status rules.

### Phase 2. Hunting by attack class

Work through the ledger in priority order: lowest-trust entry surfaces first, then the boundaries protecting the most valuable resources, then prior gaps and changed code, then the classes that historically hit this kind of target. For each unit:

1. Read the code in depth from the entry point to the sink, including middleware, decorators, base classes and config.
2. State the invariant: who may do what to which resource, and where that is enforced.
3. Try the sad paths: missing, malformed, oversized, duplicated, reordered, concurrent, other-tenant and other-role inputs.
4. When you find a root cause, search for its variants across the codebase.
5. Prove it with the narrowest local check (section 3), or mark it needs validation when a deployment fact decides it.
6. Update the unit: `covered` with the paths read and checks run, `candidate` with the candidate record, or `blocked` with the reason.

After each pass, review coverage with fresh eyes: which surfaces, boundaries or classes have no unit, and which `covered` units were checked too shallowly? Add or reopen units, and repeat until a review finds nothing new or the budget ends; then mark the rest `deferred`.

[references/hunting-and-attack-classes.md](references/hunting-and-attack-classes.md) has the hunting method, the candidate gate, the core attack classes with their prompts, and the "obvious things" checklist. [references/domain-companions.md](references/domain-companions.md) has the extra classes for web and identity, client-side, AI and LLM, cloud and deployment, supply chain, protocols and messaging, data isolation, desktop and mobile, native code, and resource exhaustion. Load a companion only when its boundary exists in the target.

### Phase 3. Validation

Validate each unique candidate with a fresh view, not the one that found it. **Try to refute it**: re-read every cited line, look for the layer that would stop it (a guard, a schema, a framework default, a proxy rule in the repo), and reproduce the minimum result in the sandbox. Decide `confirmed`, `needs_validation` or `rejected`, and write the record.

### Phase 4. Structured findings

Write `findings.json` with every record, using the shape for its verdict, and run the validator. Fix the file until it passes.

### Phase 5. Independent verification

Give each confirmed and needs-validation record one more independent check that did not take part in it: does the trace hold, is the severity justified, is the fix the smallest effective one? Keep it, or replace it with the corrected record. A record promoted to a higher severity or from needs validation to confirmed gets another independent check. The `quick` profile folds this into Phase 3.

### Phase 6. Reports

Write `REPORT.md`, `FINDINGS-DETAIL.md` and `NEEDS-VALIDATION.md` from `findings.json` and the ledger, never from memory. The reports describe the target neutrally, cite `file:line`, and never contain live secrets or working exploits against deployed systems.

The run ends in exactly one of two states: all Phase 6 files written, the validator passing, and `run_status: "complete"`; or `run_status: "incomplete"` with the reason (budget, sandbox unavailable, user stopped it) and what is left.

[references/validation-and-reporting.md](references/validation-and-reporting.md) has the verdict shapes, the `findings.json` and ledger schemas, the report skeletons, and an example finding.

## 6. Fixing what the audit found

Fixes are a separate step, done only when the user asks. Follow the base:

1. One `fix/<slug>` branch and one PR per root cause, titled `fix(<scope>): ...`. Ask the user before creating the branch.
2. Start with a failing test that reproduces the finding at the owning boundary, then fix the root cause there. Reuse or add the `lib` helper; add an architecture rule when the fix depends on a boundary.
3. Do not put exploit details for an unpatched issue in a public PR, issue or commit message. Ask the user how the project handles security fixes (a private advisory, a private fork, `SECURITY.md`) and follow it.
4. Re-run the audit unit for that finding and attach the before/after evidence to the PR description.

## 7. Anti-patterns

- Reporting a checklist item ("no rate limiting", "CORS is set") as a vulnerability without a reachable violation.
- Defence-in-depth advice presented as a finding.
- Testing a live system when a local check would prove the same thing.
- Guessing how production is deployed and reporting the guess as fact.
- Counting self-impact as a cross-boundary result.
- Overstating the effect, or giving severity to a needs-validation record.
- Prose-only results with no `file:line` trace.
- Re-reporting a prior confirmed record as new, or reviving a rejected one without new evidence.
- Writing the report before verification, or from memory instead of `findings.json`.

---

## References

| File | Read it when |
| --- | --- |
| [references/arg-base.md](references/arg-base.md) | the audit turns into fixes: branches, PRs, CI, releases |
| [references/reconnaissance.md](references/reconnaissance.md) | starting a full audit: mapping principals, surfaces, boundaries and sinks, and building the coverage ledger |
| [references/hunting-and-attack-classes.md](references/hunting-and-attack-classes.md) | hunting a unit, deciding whether a candidate is ready, or answering a focused question in guidance mode |
| [references/domain-companions.md](references/domain-companions.md) | the target has a web/identity, client-side, AI, cloud, supply-chain, protocol, multi-tenant, desktop/mobile, native or availability boundary |
| [references/validation-and-reporting.md](references/validation-and-reporting.md) | validating candidates, writing `findings.json`, verifying records, writing the reports |
| [scripts/validate-audit.mjs](scripts/validate-audit.mjs) | checking `findings.json` and `coverage-ledger.json` before calling the audit complete |

## Audit checklist

- [ ] Mode chosen; for a full audit, profile, scope and output directory agreed, and `run-metadata.json` written.
- [ ] No target code run outside a sandbox with no network, an empty environment and resource limits; no deployed system contacted.
- [ ] `architecture.md` and the coverage ledger written; companions chosen from boundaries that exist.
- [ ] Every candidate names principal, input, control, boundary, resource and observed result, with a `file:line` trace.
- [ ] Every candidate validated by a fresh view that tried to refute it; every final record verified independently.
- [ ] Severity only on confirmed records; needs-validation records have blockers and a plan.
- [ ] `validate-audit.mjs` passes; reports written from `findings.json`; no live secrets in any output.
- [ ] `run_status` is `complete`, or `incomplete` with the reason.

---

## Credits

The workflow is inspired by cloudflare/security-audit-skill (MIT, © Cloudflare, Inc.): the guidance and full-audit modes, the coverage ledger, attack-class hunting, independent verification, and the confirmed / needs-validation / rejected verdicts. This skill reorganises those ideas around the ARG base and rewrites them in its own words; any mistakes are ours.

## About

This skill is maintained by **[ARG Software](https://arg.software)**. We use it to review our own products and our clients' code before release. Want a senior security and architecture review of your codebase? Visit [arg.software](https://arg.software).
