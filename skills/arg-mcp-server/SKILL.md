---
name: arg-mcp-server
description: How ARG builds scalable MCP servers that expose an application's existing capabilities to AI agents through the Model Context Protocol, without duplicating business logic, so the app and its agent interface grow together. Use when asked to add MCP support to an API or back end, make an app usable from Claude, Cursor, Copilot, Codex or OpenCode, expose endpoints or use cases to AI agents, add, review or secure an MCP tool, resource or prompt, choose between stdio and Streamable HTTP, add OAuth to a remote MCP server, test an MCP server, write MCP client setup docs, or prepare a branch and pull request for any of these. Works for Node.js/TypeScript back ends, with NestJS as the worked example. Enforces MCP as a thin adapter where each tool calls one use case, authorization in the application layer shared with REST, OAuth resource-server auth for remote servers, typed tool errors, architecture checks, real MCP tests, feature/fix branches, reviewed PRs, and CI before merge.
license: MIT
metadata:
  author: ARG Software
  homepage: https://arg.software
  version: 1.0.0 # x-release-please-version
---

# Scalable MCP servers, the ARG way

Use this skill to let AI agents do what your application already does. An MCP server is another adapter next to your REST API: it translates agent requests into calls to the same use cases, with the same authorization and the same errors. The business rules stay where they are.

It is distilled from ARG Software's NestJS MCP starter, a support desk served over REST, MCP and a queue worker from one application layer. The job is the same for any Node.js/TypeScript back end, so the steps are framework-neutral and NestJS is the worked example in the references. The examples use the MCP TypeScript SDK v2 (`@modelcontextprotocol/server`, `/client`, `/express`, `/node`) with zod 4.

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

| Base term | For an MCP server on Node.js/TypeScript |
| --- | --- |
| **verify** | the repo's lint, typecheck, architecture check, unit, integration and e2e tests, and build, for example `pnpm lint && pnpm typecheck && pnpm architecture:check && pnpm test && pnpm build` |
| **lib folder** | the repo's existing pure-helper folder (`src/lib/`, or `packages/shared/src/lib/` in a workspace) |
| **arch-test tool** | an import-scanning script built on the base helper plus ESLint `no-restricted-imports`. See [references/testing-ci-and-clients.md](references/testing-ci-and-clients.md) |
| **config module** | the one module that parses `process.env` with zod (`loadEnvironment()`) and fails fast |
| **release type** | release-please `node` (or `node-workspace` with one package per deployable app) |

---

## The procedure

Follow these steps in order when adding MCP to an application or extending an MCP server. For a single new tool, start at step 2.

### 1. Scope the server

Ask the user, unless the repo already answers it:

- **Who connects?** A developer's local agent (Claude Code, Cursor, Claude Desktop) on their machine → **stdio**. Remote or shared users, a hosted product, or several machines → **Streamable HTTP**. Many products ship both from the same factory. Do not use the deprecated SSE transport.
- **What should agents be able to do?** Collect the tasks in the user's words ("find unresolved high-priority tickets for a customer", "assign a ticket"), not a list of endpoints.
- **Which SDK is installed?** Check `package.json`. v1 (`@modelcontextprotocol/sdk`) has different imports and transports; do not mix the two.

### 2. Map tasks to use cases

Write the tool inventory before any code, in the PR description or `docs/mcp.md`:

| Agent task | Use case | Exposed as | Name | Effect |
| --- | --- | --- | --- | --- |
| Find tickets by status, priority or customer | `ListTicketsUseCase` | tool | `list_tickets` | read-only |
| Assign a ticket to an agent | `AssignTicketUseCase` | tool | `assign_ticket` | write, idempotent |
| Read a help-centre article | `GetArticleUseCase` | resource | `kb://articles/{slug}` | read-only |
| Triage a ticket end to end | (uses the tools above) | prompt | `triage_ticket` | none |

Rules:

- **Few, purpose-built tools.** One tool per agent task, not one per REST endpoint. Filters on one list tool beat five list tools.
- **Tools** do things or query with parameters. **Resources** are read-only context a client can attach by URI. **Prompts** are reusable workflows over existing tools.
- Mark every write as destructive or not, and idempotent or not. This becomes the tool annotations in step 4.

### 3. Fill the gaps in the application layer

For every row without a use case, add one in the application layer, with its authorization check (`assertCan(actor, 'tickets:update')`) and typed errors (`NotFoundError`, `ConflictError`, ...), and a unit test with in-memory port fakes. Expose it from REST as well when REST clients need it.

Never put the rule in the tool handler. If you are writing an `if` about business state inside a tool, it belongs in a use case.

### 4. Write the adapter

- **One factory**, `buildMcpServer(deps, actor, logger)`, creates a new `McpServer` per HTTP request or stdio connection and registers every tool, resource and prompt. `deps` is a plain object of use cases. The actor is closed over.
- **Composition**: take the use cases from the application's existing composition root. With NestJS, `NestFactory.createApplicationContext(Module, { logger: false })`; otherwise the same `createContainer()` the REST app uses. No MCP decorator libraries, and no second copy of the wiring.
- **Each tool calls exactly one use case** and maps its result. Nothing else.
- **Names**: `snake_case` `verb_noun`. **Descriptions**: what it does, when to use it, what it returns, in one or two sentences; the model chooses tools from them.
- **Input**: `z.object({...})` with domain enums, strict formats (`z.uuid()`, `z.email()`), `.describe()` on non-obvious fields, bounded pages, safe defaults.
- **Output**: `outputSchema` plus matching `structuredContent`, and a one-line text summary. Never return ORM entities.
- **Annotations**: `readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint` from the inventory. Destructive tools also say so in the description.
- **Errors**: `ApplicationError`s become `isError: true` with `{ error: code, message }` so the model can correct itself. Anything else becomes `INTERNAL_ERROR` with a generic message, logged with the tool name; no stack traces, SQL or hostnames reach the client.
- **Version**: the server's name and version come from `package.json`, which release-please bumps.

[references/server-and-tools.md](references/server-and-tools.md) has the use case, both composition styles, the factory, a tool module, resources, prompts and the error mapping.

### 5. Secure it

- **Remote (HTTP) servers use OAuth 2.1 resource-server auth**, as the MCP authorization spec requires: `requireBearerAuth` with a JWT verifier (JWKS signature, issuer, audience equal to this server's URL, expiry), non-empty `requiredScopes`, `resourceMetadataUrl`, and `mcpAuthMetadataRouter` for `/.well-known/oauth-protected-resource`. Never wrap an API key in `AuthInfo` with an invented expiry: clients show an OAuth flow that cannot work, and the key never expires.
- **stdio servers** resolve one service-account actor at start-up from an API key in the client's environment.
- **Authorization stays in the use cases.** Scopes map to the actor; tools never check roles.
- **Hardening**: bind `127.0.0.1` by default; set `allowedHosts` (and `allowedOrigins` for browser clients) for any other bind, or DNS-rebinding protection is off; `jsonLimit`; a rate limit on `/mcp`; `/health` without auth or internals; graceful shutdown.
- **Logs**: pino with the authorization, API-key and cookie headers redacted. On stdio, every log goes to stderr and nothing calls `console.log`, because stdout is the protocol channel.

[references/auth-and-hardening.md](references/auth-and-hardening.md) has the env schema, `.env.example`, the JWT verifier, `main.ts`, `stdio.ts`, logging and OpenTelemetry.

### 6. Enforce the boundary

Add these rules to the architecture check in the same PR, one rule per check:

- domain and application import no framework, SDK, ORM, queue or HTTP package
- only the MCP adapter imports `@modelcontextprotocol/*`; the REST app and the worker never do
- the MCP adapter never imports the ORM, queue or cache clients; it reaches data only through use cases
- the MCP adapter never calls `console.log`
- only the config module reads `process.env`

Scan every import form (multi-line imports, `export ... from`, `import()`, `require`), not only lines starting with `import `. Prove each new rule once by adding a forbidden import and watching it fail.

### 7. Test

Placeholder tests (`it('works', () => {})`, `expect(true).toBe(true)`) fail review.

- **Use cases**: unit tests with in-memory fakes, including authorization and error paths (step 3).
- **Adapter**: an in-memory `Client` over `InMemoryTransport.createLinkedPair()`. Assert the listed tools, schemas and annotations; that `callTool` passes the actor and returns `structuredContent`; that a use-case error returns `isError` with its code; that invalid input never reaches the use case; that unexpected errors leak nothing.
- **Cross-protocol**: one test that writes through REST and reads through MCP (or the reverse), proving both share one use case.
- **HTTP e2e**: real signed tokens from a throwaway issuer. 401 with a resource-metadata pointer without a token or with another audience, 403 without the scope, success with a valid token, 403 for a disallowed `Host`.
- **Manual**: the MCP Inspector against stdio and HTTP before a release.

[references/testing-ci-and-clients.md](references/testing-ci-and-clients.md) has the architecture script, the ESLint rules, all three test files, and the test issuer.

### 8. Ship it

- **Client setup** in the README for Claude Code, Claude Desktop, Cursor, VS Code / Copilot, Codex, OpenCode and the Inspector. Every README command and script must exist.
- **CI** runs verify plus the PR-title check, with database and cache service containers for integration and e2e tests.
- **Docker**: multi-stage, non-root, and the runtime image must contain its production dependencies.
- **Versioning**: removing or renaming a tool, making an optional input required, or changing an output field incompatibly breaks agents that use it. Mark it as a breaking change (`feat(mcp)!:` with a `BREAKING CHANGE:` footer). Adding a tool or an optional input is a `feat`.

---

## References

| File | Read it when |
| --- | --- |
| [references/arg-base.md](references/arg-base.md) | setting up the repo, opening a PR, releasing |
| [references/server-and-tools.md](references/server-and-tools.md) | steps 3 and 4: use cases, composition (NestJS or plain), the factory, tools, resources, prompts, errors |
| [references/auth-and-hardening.md](references/auth-and-hardening.md) | step 5: configuration, OAuth, HTTP and stdio entry points, logging, telemetry |
| [references/testing-ci-and-clients.md](references/testing-ci-and-clients.md) | steps 6 to 8: architecture checks, tests, CI, Docker, client setup, releases |

## MCP checklist (on top of the base checklists)

- [ ] The tool inventory is written, and every tool, resource and prompt maps to an agent task.
- [ ] Each tool calls exactly one use case; rules and authorization live in the application layer and REST shares them.
- [ ] `snake_case` names, clear descriptions, bounded `z.object` input, `outputSchema` + `structuredContent`, annotations, destructive tools marked.
- [ ] Use-case errors map to `isError` codes; unknown errors leak nothing.
- [ ] Remote servers use real OAuth (issuer, audience, expiry, scopes, resource metadata); API keys only on stdio.
- [ ] Non-localhost binds set `allowedHosts`; `/mcp` has a rate limit and a body limit; stdio writes nothing but protocol to stdout.
- [ ] The architecture check covers the MCP adapter; the in-memory, cross-protocol and e2e tests pass; no placeholder tests.
- [ ] New env vars are in `.env.example` and the config module; the README client snippets work; breaking tool changes are marked.

## Credits

Built from ARG Software's NestJS MCP starter (MIT), with the MCP TypeScript SDK v2 API verified against its installed packages.

---

## About

This skill is maintained by **[ARG Software](https://arg.software)**. We build MCP servers and agent integrations on clean architecture, so AI agents and people use the same, tested business rules. Need an MCP server for your product, or a review of one? Visit [arg.software](https://arg.software).
