---
name: arg-code-review
description: Review a pull request, branch or diff against the ARG base rules for any stack. Use when asked to review code, a PR, a branch, a diff or a commit, check whether a change is ready to merge, check layer boundaries, architecture tests, helper reuse, magic numbers, unknown-versus-failure handling, test coverage at the owning boundary, secrets and .env hygiene, documentation and AGENTS.md updates, Conventional Commit PR titles, release impact (patch, minor or breaking), or CI status. Detects the stack, loads the matching ARG skill's rules when installed, verifies every finding against the code, and reports findings ranked by severity with file and line, a concrete fix, and blocking or suggestion. Never approves or merges; posts review comments only when the user asks.
license: MIT
metadata:
  author: ARG Software
  homepage: https://arg.software
  version: 0.0.0 # x-release-please-version
---

# ARG Code Review

A review procedure that applies the ARG base (the rules every ARG skill carries) to a change in any stack. It is the reviewer's side of the base: the base tells an agent how to make a change, this skill checks that a change was made that way.

The review produces findings for a human. **It never approves, requests changes on your behalf, or merges.** The human reviewer decides.

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

## Stack profile

This skill works on any stack, so it fills the base terms from the repository under review:

| Base term | How to find it in the reviewed repo |
| --- | --- |
| **verify** | the installed ARG stack skill's profile, else `AGENTS.md`/`CONTRIBUTING.md`, else the CI workflow's main job (`package.json` scripts, `dotnet test`, `nx affected`) |
| **lib folder** | the stack skill's profile, else the folder `AGENTS.md` names for shared helpers (`src/lib`, `src/libs`, `packages/shared/utils`, `SharedKernel`) |
| **arch-test tool** | the stack skill's profile, else the architecture tests in the repo (`test/architecture`, `ArchitectureTests`, `@nx/enforce-module-boundaries`, `eslint-plugin-boundaries`) |
| **config module** | the stack skill's profile, else the one module that reads `process.env` / `IConfiguration` / `import.meta.env` |
| **release type** | `release-please-config.json`, else the project's documented release process |

If no ARG stack skill is installed and the repo documents none of these, review against the base alone and say which terms you could not resolve.

---

## 1. Procedure

1. **Get the change.** Identify the base and head: a PR (`gh pr view <n> --json title,body,baseRefName,headRefName,files,commits,statusCheckRollup`, then `gh pr diff <n>`), a branch (`git diff $(git merge-base origin/<default> HEAD)...HEAD`), or a diff the user pasted. Read the PR description and linked issue.
2. **Load the rules.** Read `AGENTS.md` (and `CLAUDE.md`, `CONTRIBUTING.md`, `docs/`) in the repo. Detect the stack (manifest files, frameworks) and, when the matching ARG skill is installed (`browser-extension-clean-architecture`, `nx-monorepo-clean-architecture`, `angular-ngrx-clean-architecture`, `dotnet-clean-architecture`, `react-native-clean-architecture`, `nestjs-mcp-server`), read its SKILL.md layer table and checklist. Repository rules outrank the generic base when they conflict.
3. **Read the changed code in context.** For each changed file, read the surrounding code, the callers, and the tests. A diff alone hides most layering and reuse problems.
4. **Run the checks** in section 2. Run the verify command and the architecture tests locally when you can and they are safe (no deploys, no network writes); otherwise read the CI results.
5. **Verify every finding.** Before reporting, re-read the exact lines and confirm the problem is real: the import really crosses a layer, the helper really exists in `lib`, the test really does not cover the path. Drop anything you cannot confirm, or report it as a question.
6. **Report** in the format of section 3.
7. **Post comments only when the user asks**, and show them what will be posted first.

## 2. What to check

| Area | Check | Usually |
| --- | --- | --- |
| **Branch and PR** | the branch is not the default branch and matches the change (`feature/`, `fix/`, `hotfix/`, `refactor/`, `chore/`, `docs/`) | suggestion |
| | the PR title is a Conventional Commit whose type matches the change (a bug fix is `fix`, a new capability `feat`, no behaviour change `refactor`/`chore`) | blocking (it drives the release) |
| | one concern per PR; unrelated changes are split out | suggestion |
| **Release impact** | a breaking change (removed or renamed public API, changed message or file format, changed config key, dropped platform version) is marked with `!` or `BREAKING CHANGE:` | blocking |
| | the version is not edited by hand in files release-please owns | blocking |
| **Layers** | every new import follows the layer table: domain imports nothing outward, application never imports infrastructure/presentation, UI never reaches adapters | blocking |
| | new ports are declared inward (application/domain) and implemented in infrastructure; wiring happens in the composition root only | blocking |
| | framework, browser, device, ORM and HTTP APIs stay in their owning layer | blocking |
| | the architecture tests were extended when a layer, alias, project or owned package was added | blocking |
| **Reuse** | no private copy or one-line rename of a helper that exists in the `lib` folder; a new generic helper with more than one consumer goes into `lib` | suggestion (blocking when it duplicates real logic) |
| | no new class, file or interface for single-use code the repo's rules say to inline | suggestion |
| **Policy** | thresholds, limits, weights, timeouts and magic numbers live in policy or config files | suggestion |
| **Semantics** | code that cannot observe something reports unknown/unavailable, not a failure or a zero; observed absence is not treated as unknown | blocking when it changes a user-facing verdict |
| | errors are handled at the boundary that owns them; no swallowed exceptions, no `console.log` error handling | blocking |
| **Tests** | behaviour is tested at its owning boundary; a bug fix has a test that failed before the fix | blocking for fixes |
| | no placeholder tests (empty bodies, `expect(true)`), no tests that only assert mocks were called | blocking |
| | no private methods called or monkey-patched to reach code | suggestion |
| **Secrets and config** | no credentials, tokens, keys or `.env` files committed; new variables are in `.env.example` with a dummy value and read only through the config module | blocking |
| | nothing secret is bundled into client code (browser, mobile, extension) | blocking |
| **Docs** | `AGENTS.md`/`docs/` updated in the same PR when a rule or documented behaviour changed; README commands still exist | suggestion (blocking when docs now lie) |
| **Clean code** | names match the local style; functions do one thing; no dead code, commented-out code or leftover debug output | suggestion |
| **CI** | the required checks (verify, PR title) are green on the latest commit | blocking |

Also check correctness in the ordinary sense: logic errors, off-by-one, null handling, race conditions, resource leaks, injection and authorization gaps. Those are usually the most important findings, and the ARG checks do not replace them.

[references/review-checks.md](references/review-checks.md) has how to detect each check (commands, grep patterns, what a real violation looks like, and false positives to avoid).

## 3. Report format

Start with a one-paragraph summary: what the change does, whether it looks ready for a human to approve, and the count of blocking findings. Then list findings ranked by severity:

```
1. [blocking] src/application/cart/checkout.usecase.ts:42 - application imports infrastructure
   `import { StripeClient } from "@infrastructure/payments/stripe.client"` makes the use case depend on the SDK adapter.
   Fix: declare `IPaymentGateway` in `src/application/ports/`, have `StripeClient` implement it, and inject it from `bootstrap/`.
```

- **Severity**: `blocking` (must change before merge), `suggestion` (worth doing, the author decides), `question` (you could not confirm; ask the author), `praise` (optional, specific and short).
- Every finding has `file:line`, what is wrong, why it matters when not obvious, and a concrete fix (code when short).
- Group repeated instances of the same problem into one finding with all locations.
- End with the checks you could not run (for example "architecture tests not run locally: needs Docker") and what the human reviewer should look at by hand.
- Do not pad the review: no generic advice, no restating the diff, no findings you did not verify.

[references/review-output.md](references/review-output.md) has a full example review, the `gh` commands for posting inline comments when asked, and a reply template for follow-up rounds.

## 4. Boundaries

- **Never** approve, request changes, merge, close, push commits to the author's branch, or resolve threads unless the user explicitly asks for that specific action.
- Posting review comments is outward-facing: show the comments and get the user's go-ahead first.
- Review the change, not the author. Keep comments factual and specific.
- When the user is the author, the same rules apply: report findings, and let them decide what to fix.

---

## References

| File | Read it when |
| --- | --- |
| [references/arg-base.md](references/arg-base.md) | checking the base rules in detail: git workflow, CI, ruleset, release-please, `.env`, lib, architecture tests |
| [references/review-checks.md](references/review-checks.md) | detecting a specific problem and avoiding false positives |
| [references/review-output.md](references/review-output.md) | writing the review, posting comments, follow-up rounds |

## Review checklist

- [ ] Base, head, description and linked issue read; repo rules and the stack skill loaded.
- [ ] Changed code read in context, with callers and tests.
- [ ] Every section 2 area considered, plus ordinary correctness and security.
- [ ] Every finding verified against the code, with `file:line`, severity and a concrete fix.
- [ ] Unrun checks listed. Nothing posted, approved or merged without the user's explicit request.

---

## About

This skill is maintained by **[ARG Software](https://arg.software)**. It turns the ARG base, the engineering rules we apply to every project, into a review procedure any team can run. Want a senior review of your architecture or codebase? Visit [arg.software](https://arg.software).
