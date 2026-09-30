# Detecting each check

For every check: how to find candidates, what makes it a real finding, and the false positives to drop.

## Getting the change

```bash
# PR metadata, files and checks
gh pr view 123 --json number,title,body,baseRefName,headRefName,author,files,commits,statusCheckRollup,reviewDecision
gh pr diff 123
gh pr checks 123

# A local branch against the default branch
DEFAULT=$(git symbolic-ref --short refs/remotes/origin/HEAD | sed 's#^origin/##')
git fetch origin "$DEFAULT"
git diff --stat "origin/$DEFAULT"...HEAD
git diff "origin/$DEFAULT"...HEAD
git log --oneline "origin/$DEFAULT"..HEAD
```

Use the three-dot form (`A...B`) so the diff is only the branch's own changes.

## Branch and PR title

- Title regex: `^(feat|fix|perf|refactor|docs|test|build|ci|chore|revert)(\([a-z0-9-]+\))?!?: .+`.
- Compare the type with the diff: a `refactor` that changes behaviour, or a `chore` that adds a feature, releases the wrong version.
- Monorepos with release-please components: the scope should name the package/app the change affects when the repo's convention says so.
- False positive: squash-merge repos only need the **PR title** to be conventional; individual commit messages may be free-form.

## Release impact

Signals of a breaking change:

- exported function/class/type removed or renamed, or a required parameter added
- HTTP route, status code, response field or message schema removed or changed incompatibly
- configuration key or environment variable renamed or made required
- database migration that drops or renames columns used by deployed code
- a minimum runtime/platform version raised (Node, .NET, browser, OS)
- a stored file or report format changed without a migrator

If present and the title has no `!` and the body no `BREAKING CHANGE:` footer, it is blocking. Versions in files release-please manages (`package.json` `version`, `Directory.Build.props` `<Version>`, SKILL.md `version`, manifests listed in `extra-files`) must not change by hand.

## Layers

1. Load the layer table (stack skill or `AGENTS.md`) and the path aliases (`tsconfig.json` `paths`, `vite.config`, project references, Nx tags).
2. List new imports in the diff:

```bash
git diff "origin/$DEFAULT"...HEAD -U0 | grep -E '^\+.*(\bfrom\s+["'\'']|\brequire\(|\bimport\(|^\+using\s)' 
```

3. For each, resolve the target layer from the importing file's path and the specifier (alias or relative path; resolve `../../` against the file's folder).
4. Report imports that point outward. Also check composition: `new SomeAdapter(...)` outside the composition root, or UI code importing a repository/gateway directly.

Stack hints:

- **Browser extensions**: `chrome.` / `browser.` outside `infrastructure` and `bootstrap`.
- **React Native**: device, storage and network packages (`expo-location`, `react-native-mmkv`, `axios`, `fetch(`) outside `infrastructure`.
- **Angular**: `HttpClient`, `localStorage`, `window` outside `infrastructure`; one feature importing another feature's internals.
- **Nx**: a missing or wrong `tags` entry in a new `project.json`; `depConstraints` loosened (`*` → `*`).
- **.NET**: `Microsoft.EntityFrameworkCore` or `Microsoft.AspNetCore` in `Domain`/`Application`; a new `ProjectReference` that points outward.
- **NestJS MCP servers**: `@modelcontextprotocol/*`, `@nestjs/*` or `@prisma/*` imported in domain/application; business logic inside tool handlers.

False positives: type-only imports that the repo's rules explicitly allow, test files (they may import across layers to build fakes, unless the repo says otherwise), and the composition root.

## Architecture tests

- New top-level folder, alias, project or owned package (ORM, HTTP client, SDK) in the diff, with no change under the architecture-test folder → blocking.
- Loosened rules (a pattern removed, a layer added to an allow-list, a test skipped) need a justification in the PR description.

## Reuse and the lib folder

```bash
# New small functions in the diff
git diff "origin/$DEFAULT"...HEAD | grep -E '^\+\s*(export\s+)?(function|const)\s+[a-zA-Z]+\s*(=\s*\(|\()' 
# Candidates in lib with a similar name or body
grep -rnE 'export (function|const) (unique|clamp|sum|pluralize|isString|debounce|chunk)' src/lib src/libs 2>/dev/null
```

Compare behaviour, not just names. A private `uniq` that equals `lib/unique` is a finding; a helper with different semantics (stable ordering, a custom key) is not. A one-line wrapper that only renames a lib function is a finding.

## Policy constants

Numbers in the diff that express a rule (thresholds, limits, retries, timeouts, weights, sizes) and are not in a policy/config file. Not findings: `0`, `1`, `-1`, array indexes, HTTP status codes used with a named helper, and test data.

## Unknown versus failure

Look for code that turns "could not observe" into a verdict:

- `catch { return false }` / `?? 0` / `|| []` where the caller shows the result as a negative or a score
- a missing header, timeout, or unreadable resource reported as "insecure", "missing" or "0"
- the reverse: an observed absence (a completed fetch returning 404, a captured response without the header) reported as unknown

A finding needs the path from the fallback to a user-facing verdict or score. A defensive default that never reaches a verdict is fine.

## Tests

- For each changed behaviour, find the test at the owning boundary: domain rule → domain test; use case → use case test with fakes; adapter → adapter test; UI flow → component or e2e test.
- For a fix: the PR should add or change a test that fails without the fix. Check by reading the test against the old code, or run it on the base commit when cheap:

```bash
git stash -u && git checkout "origin/$DEFAULT" -- src/path/changed.ts && npm test -- changed.test && git checkout HEAD -- src/path/changed.ts && git stash pop
```

  Only run this with the user's agreement, and never on a dirty tree you cannot restore.
- Placeholder tests: `it("works", () => {})`, `expect(true).toBe(true)`, snapshots of whole screens as the only assertion, tests whose only assertions are `toHaveBeenCalled` on mocks.

## Secrets and configuration

```bash
git diff "origin/$DEFAULT"...HEAD --name-only | grep -E '(^|/)\.env($|\.)' | grep -v '\.env\.example$'
git diff "origin/$DEFAULT"...HEAD | grep -nE '^\+.*((api|secret|private)[_-]?key|token|password|BEGIN (RSA|EC|OPENSSH) PRIVATE KEY|AKIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{36}|sk_live_)' 
```

- New `process.env.X` / `configuration["X"]` / `import.meta.env.X` must have a matching `.env.example` entry and be read through the config module.
- Publishable keys (`pk_`, Supabase anon, captcha site keys, Firebase web config) are public by design; do not flag them, but do flag secret keys in client bundles.
- Never paste a found secret into the review. Say where it is and that it must be rotated.

## Docs

- Behaviour described in `AGENTS.md`, `README.md` or `docs/` changed by the diff, with no doc change → finding.
- New scripts, commands or environment variables not documented where the repo documents them.
- Commands in the README that the diff removed from `package.json` or equivalent.

## CI

```bash
gh pr checks 123
```

Pending or failing required checks are blocking. Flaky failures unrelated to the diff: say so and suggest a re-run; do not call them green.
