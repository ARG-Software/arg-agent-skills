---
name: nestjs-mcp-server
description: Clean architecture for Model Context Protocol (MCP) servers on Node.js and NestJS, where REST, MCP and background workers share one application layer. Use when building, scaffolding or extending an MCP server, adding an MCP tool, resource or prompt, exposing existing use cases to AI agents, choosing stdio versus Streamable HTTP, adding OAuth or API-key auth to an MCP endpoint, hardening an MCP HTTP server (DNS rebinding, origins, rate limits), logging on stdio, testing tools with an in-memory client, configuring MCP clients (Claude Code, Claude Desktop, Cursor, VS Code, Codex, OpenCode), setting up CI, Docker, environment variables and secrets (.env), versioning with release-please, or preparing a branch and pull request. Enforces domain/application/infrastructure packages with architecture checks, MCP as a thin adapter with no business logic, typed tool errors, OAuth resource-server auth, a dependency-free shared lib, feature/fix branches, reviewed PRs, and CI before merge.
license: MIT
metadata:
  author: ARG Software
  homepage: https://arg.software
  version: 0.0.0 # x-release-please-version
---

# NestJS MCP Server

Guidance for MCP servers that give AI agents the same capabilities as your REST API, without a second copy of the business rules. It is distilled from ARG Software's NestJS MCP starter (a support desk with customers, tickets and a knowledge base, served over REST, MCP and a BullMQ worker from one set of use cases) and fixes its gaps: API keys dressed up as OAuth tokens, no output schemas or tool annotations, an architecture check that skipped the MCP app and multi-line imports, a hard-coded server version, placeholder tests, a Docker image without runtime dependencies, and README scripts that did not exist.

The examples use the MCP TypeScript SDK v2 split packages (`@modelcontextprotocol/server`, `/client`, `/express`, `/node`) with zod 4. Check the installed SDK version before giving API advice: v1 (`@modelcontextprotocol/sdk`) has different imports and transports.

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

| Base term | In a NestJS MCP server |
| --- | --- |
| **verify** | `pnpm lint && pnpm typecheck && pnpm architecture:check && pnpm test:unit && pnpm test:integration && pnpm test:e2e && pnpm build` |
| **lib folder** | `packages/shared/src/lib/` (pure helpers; the rest of `shared` holds shared ports and errors) |
| **arch-test tool** | `scripts/check-architecture.ts` (import scanner built on the base helper, section 3 below) plus ESLint `no-restricted-imports` |
| **config module** | `packages/shared/src/infrastructure/configuration/env.ts` (`loadEnvironment()`, zod), the only reader of `process.env` |
| **release type** | release-please `node-workspace`, one package per deployable app. See [references/testing-ci-and-clients.md](references/testing-ci-and-clients.md) |

---

## 1. MCP is an adapter

MCP is one more way into the application, next to REST controllers and queue consumers. It is never where the rules live.

- A tool handler does three things: parse input (the SDK does it from the zod schema), call **one use case** with the actor, and map the result. No `if` about business state, no repository calls, no `*McpService` classes.
- If an agent needs a workflow the API lacks, add a use case and expose it from both REST and MCP. The same use case, the same authorization, the same errors.
- The MCP SDK is imported only in `apps/mcp`. Prisma, BullMQ and Redis are imported only in `packages/*/src/infrastructure`. Apps never reach the database directly.

## 2. Layout and layers

```text
apps/
  api/        NestJS HTTP controllers (REST)
  mcp/        MCP adapter: bootstrap.ts, server/ (factory, tools, resources, prompts), main.ts (HTTP), stdio.ts
  worker/     queue consumers
  web/        optional front end
packages/
  <feature>/src/
    domain/          entities, value objects, domain errors, repository interfaces
    application/     use cases, ports, results, authorization policies
    infrastructure/  persistence/prisma, messaging/bullmq, dependency-injection/nest/<feature>.module.ts
  shared/src/        lib/, application errors, clock and id ports, configuration, observability
```

| Layer | May import | Must not import |
| --- | --- | --- |
| `packages/*/domain` | own domain, `shared` domain and `lib` | application, infrastructure, apps, any framework (`@nestjs/*`, `@prisma/*`, `@modelcontextprotocol/*`, `bullmq`, `redis`, `express`) |
| `packages/*/application` | own domain and application, `shared`, `auth` application | infrastructure, apps, frameworks and SDKs |
| `packages/*/infrastructure` | own layers, `shared`, the ORM, queue and Nest | apps, `@modelcontextprotocol/*` |
| `apps/mcp` | `packages/*` public entry points, the MCP SDK, `express`, `pino`, Nest core (for the container) | `@prisma/*`, `bullmq`, `redis`, other apps, another package's internal paths |
| `apps/api`, `apps/worker` | `packages/*` public entry points, Nest | `@modelcontextprotocol/*`, other apps |
| `packages/shared/src/lib` | nothing | everything |

Features import each other only through `shared` and `auth` application code. Cross-feature data goes through a port (`CustomerAccessPort` in tickets, implemented in tickets' infrastructure), never another feature's repository.

## 3. Architecture checks

Two layers of enforcement, both in **verify**:

1. **ESLint `no-restricted-imports`** per folder, for fast editor feedback.
2. **`scripts/check-architecture.ts`**, one rule per check with `file -> import` output. It reuses the base helper's `importSpecifiers` (multi-line imports, `export ... from`, dynamic `import()`, `require`) instead of matching lines that start with `import `, which misses `} from '@prisma/client'`.

Rules:

- domain imports no framework, SDK, ORM, queue or HTTP package
- application imports no infrastructure, app, framework or SDK
- infrastructure never imports `@modelcontextprotocol/*` or an app
- `apps/mcp` never imports `@prisma/*`, `bullmq` or `redis`
- `apps/api` and `apps/worker` never import `@modelcontextprotocol/*`
- no package imports another feature's internals (`@org/tickets/src/...`); only the package entry points in `exports`
- only `packages/shared/src/infrastructure/configuration` reads `process.env`
- no `console.log` in `apps/mcp` (stdout is the stdio protocol channel)
- `packages/shared/src/lib` imports nothing

The script and the ESLint config are in [references/testing-ci-and-clients.md](references/testing-ci-and-clients.md).

## 4. Nest as the DI container only

- Use cases are plain classes with constructor parameters and no Nest decorators. Each feature's `infrastructure/dependency-injection/nest/<feature>.module.ts` binds ports to adapters with `{ provide: TOKEN, useClass }` and builds use cases with `useFactory` + `inject`.
- `apps/mcp/src/bootstrap.ts` calls `NestFactory.createApplicationContext(McpAppModule, { logger: false })` and copies the use cases into a plain `McpDependencies` object. No MCP decorator libraries, and no Nest HTTP layer inside the MCP app.
- `bootstrap.ts` returns `close()` so both entry points shut the container down on `SIGINT`/`SIGTERM`.

## 5. One server factory, two thin entry points

- `buildMcpServer(deps, actor)` creates a **new `McpServer` per request** (HTTP) or per connection (stdio) and registers tools, resources and prompts. The actor is closed over, so every handler knows who is calling.
- Name and version come from `apps/mcp/package.json` (read once in `server-info.ts`), never a literal `'0.1.0'`: release-please bumps that file.
- Split registration by feature (`server/tools/tickets.tools.ts`, `server/resources/knowledge.resources.ts`) once the factory passes about 150 lines.
- **`main.ts`**: Streamable HTTP. `createMcpExpressApp({ host, allowedHosts })` → auth metadata router → `/health` → rate limit → `requireBearerAuth` → `createMcpHandler(factory)` through `toNodeHandler` on `/mcp`. Bind `127.0.0.1` by default.
- **`stdio.ts`**: `serveStdio(() => buildMcpServer(deps, actor))` for local clients, with the actor resolved once at start-up from `MCP_STDIO_API_KEY`.
- **No SSE transport**: it is deprecated in the protocol. `createMcpHandler` serves stateless by default (`legacy: 'stateless'`); keep it unless you need server-initiated messages across requests, and then say so in `AGENTS.md` and add a session store and event store for resumability.

[references/server-and-tools.md](references/server-and-tools.md) has `bootstrap.ts`, the factory, a tool module, resources, prompts and the result mapping.

## 6. Designing tools, resources and prompts

- **Names** are `snake_case` `verb_noun`: `list_tickets`, `get_ticket`, `assign_ticket`, `search_knowledge_base`. Titles are human-readable. Descriptions are one or two sentences that say what the tool does, when to use it, and what it returns, because the model chooses tools from them.
- **Few, purpose-built tools**, not one per REST endpoint. A tool should match a task an agent performs (`list_tickets` with filters for "unresolved high-priority enterprise tickets") and return only the fields the agent needs.
- **Input schemas** are `z.object({...})` (the raw-shape form is deprecated in v2). Reuse domain enums (`z.enum(ticketStatuses)`), strict formats (`z.uuid()`, `z.email()`), `.describe()` on non-obvious fields, bounded pages (`pageSize: z.number().int().positive().max(100).default(20)`), and safe defaults.
- **Output**: declare `outputSchema` and return `structuredContent` that matches it, plus a short text `content` for clients that only read text. Map domain results to the output shape in the adapter; never return ORM entities.
- **Annotations** on every tool: `readOnlyHint` for reads, `destructiveHint` for deletes and irreversible changes, `idempotentHint` where a repeat call has no extra effect, `openWorldHint` when the tool reaches outside your system (email, third-party APIs). Clients use them to decide when to ask the user. Destructive tools also say so in the description.
- **Resources** for read-only context the client can attach (`kb://articles/{slug}`, `tickets://{id}`) through `ResourceTemplate`. **Prompts** for reusable workflows (`triage_ticket`). Both call use cases, like tools.
- **Errors**: use cases throw typed `ApplicationError`s (`NOT_FOUND`, `UNAUTHORIZED`, `FORBIDDEN`, `CONFLICT`, `VALIDATION`). `runTool` maps them to `isError: true` with `{ error, message }`, so the model can correct itself. Anything else becomes `INTERNAL_ERROR` with a generic message and is logged with the request id; stack traces, SQL and file paths never reach the client.

## 7. Identity and authorization

- Every use case takes the `actor` and authorizes in application code (`assertCan(actor, 'tickets:update')`). REST and MCP share the same policy. Tool handlers never check roles.
- **HTTP uses OAuth 2.1 resource-server auth**, as the MCP authorization spec requires:
  - `requireBearerAuth` with a verifier that validates a JWT against the authorization server's JWKS: signature, `iss`, `aud`/`resource` equal to this server's URL (reject tokens minted for another resource), `exp`, and scopes.
  - non-empty `requiredScopes` (for example `mcp:tools`), with per-tool permissions mapped from scopes to the actor
  - `resourceMetadataUrl: getOAuthProtectedResourceMetadataUrl(new URL(MCP_PUBLIC_URL))` so a 401 tells the client where to discover the authorization server
  - `mcpAuthMetadataRouter` serving `/.well-known/oauth-protected-resource/mcp`
  - never pass the incoming token through to downstream APIs; exchange it or use the server's own credentials
- **API keys are for stdio and local development only** (`MCP_STDIO_API_KEY`). Never wrap an API key in `AuthInfo` with an invented expiry and call it OAuth: clients then show an OAuth flow that cannot work, and keys never expire.
- An HTTP server without auth binds `127.0.0.1` only, and `AGENTS.md` says so.

## 8. Logging, observability and hardening

- **pino** with `redact: ['req.headers.authorization', 'req.headers["x-api-key"]', 'req.headers.cookie']` and a request id on every line. Log the tool name, actor id and outcome; never the arguments' secrets.
- **stdio**: logs go to stderr only (`pino.destination(2)`), the Nest logger is off, and there is no `console.log` anywhere in `apps/mcp`. One stray line on stdout corrupts the protocol.
- **OpenTelemetry** preloads with `node --import ./dist/instrumentation.js dist/main.js` so auto-instrumentation patches modules before they load.
- **HTTP hardening**:
  - `createMcpExpressApp` validates `Host` and `Origin` on localhost binds. On `0.0.0.0` or behind a proxy, pass `allowedHosts` (and `allowedOrigins` for browser clients) or DNS-rebinding protection is off.
  - `jsonLimit` (for example `'1mb'`), `express-rate-limit` keyed by token or IP on `/mcp`, `app.set('trust proxy', 1)` only behind a known proxy.
  - `/health` without auth, returning no internals.
  - Graceful shutdown: stop accepting, drain, then `close()` the container.

[references/auth-and-hardening.md](references/auth-and-hardening.md) has `main.ts`, the JWT verifier, the metadata router, `stdio.ts`, the logger, and the env schema.

## 9. Configuration

- `loadEnvironment()` parses `process.env` with zod once and fails fast. Everything else receives typed values.
- `.env.example` documents `MCP_HOST`, `MCP_PORT`, `MCP_PUBLIC_URL`, `MCP_ALLOWED_HOSTS`, `OAUTH_ISSUER`, `OAUTH_AUDIENCE`, `MCP_REQUIRED_SCOPES`, `MCP_STDIO_API_KEY`, `DATABASE_URL`, `REDIS_*`, `LOG_LEVEL`, `OTEL_*`.
- Exact-pinned dependency versions, `packageManager` pinned, Node `engines` on an active LTS, ESM, and strict TypeScript (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`).

## 10. Testing

Placeholder tests (`it('works', () => {})`, `expect(true).toBe(true)`) fail review.

- **Unit** (Vitest project `unit`): entities, value objects and use cases with in-memory port fakes, including the `ApplicationError` paths and authorization.
- **MCP adapter tests**: `InMemoryTransport.createLinkedPair()`, `server.connect()` and a `Client` from `@modelcontextprotocol/client`. Assert that `listTools()` exposes the expected names, schemas and annotations; that `callTool()` returns `structuredContent` matching the output schema; and that a `NOT_FOUND` use-case error returns `isError: true` with that code. Use fake use cases or in-memory repositories; no database.
- **Cross-protocol test**: create a ticket over REST and read it with `get_ticket` over MCP (or the reverse) to prove both adapters share one use case.
- **Integration** (project `integration`): Prisma repositories and BullMQ adapters against Postgres and Redis (Testcontainers or CI service containers).
- **e2e** (project `e2e`): real Streamable HTTP with `StreamableHTTPClientTransport`: 401 without a token (with a `WWW-Authenticate` header pointing at the resource metadata) or with a token for another audience, 403 without the required scope, success with a valid token, and 403 for a disallowed `Host`.
- **Manual**: `npx @modelcontextprotocol/inspector` against both stdio and HTTP before a release.

## 11. CI, Docker, clients and releases

- CI: pnpm with `--frozen-lockfile`, Postgres and Redis service containers, then `prisma generate` → architecture check → lint → typecheck → unit → migrate → integration → e2e → build, plus the base PR-title check. `permissions: contents: read`.
- Docker: multi-stage `node:24-alpine`, `pnpm deploy --prod` (or a bundle with no externals) so the runtime image **has its dependencies**, `USER node`, `NODE_ENV=production`, the OTel preload in `CMD`. One image per deployable. Compose runs the infrastructure and, with a profile, the apps.
- **Client setup docs** in the README for every server: Claude Code, Claude Desktop, Cursor, VS Code / Copilot, Codex, OpenCode, and the Inspector. Every script the README lists must exist in `package.json` (the starter listed `demo:*` scripts with no files).
- release-please `node-workspace`, one package per app (`apps/api`, `apps/mcp`, `apps/worker`), tags `<app>-vX.Y.Z`. The MCP server's reported version is its `package.json` version.

---

## References

| File | Read it when |
| --- | --- |
| [references/arg-base.md](references/arg-base.md) | setting up the repo, opening a PR, releasing |
| [references/server-and-tools.md](references/server-and-tools.md) | bootstrapping, the server factory, writing tools, resources, prompts and error mapping |
| [references/auth-and-hardening.md](references/auth-and-hardening.md) | HTTP and stdio entry points, OAuth, logging, rate limits, configuration |
| [references/testing-ci-and-clients.md](references/testing-ci-and-clients.md) | architecture checks, MCP tests, CI, Docker, client configuration, releases |

## MCP server checklist (on top of the base checklists)

- [ ] The tool calls exactly one use case with the actor; the rule and the authorization live in application code and REST uses the same use case.
- [ ] `snake_case` name, clear description, `z.object` input with bounds, `outputSchema` + `structuredContent`, and annotations (destructive tools marked).
- [ ] Use-case errors map to `isError` codes; unknown errors leak nothing.
- [ ] HTTP auth is real OAuth (JWKS, issuer, audience/resource, expiry, required scopes, resource metadata); API keys only on stdio.
- [ ] No `console.log` in `apps/mcp`; stdio logs go to stderr; secrets are redacted.
- [ ] `allowedHosts` set for any non-localhost bind; rate limit and body limit on `/mcp`.
- [ ] Architecture check passes, including `apps/mcp` never importing Prisma/BullMQ/Redis.
- [ ] Unit, in-memory MCP, e2e and cross-protocol tests cover the change; no placeholder tests.
- [ ] New env vars are in `.env.example` and `loadEnvironment()`; README client snippets and scripts still work.

## Credits

Built from ARG Software's NestJS MCP starter (MIT), with the MCP TypeScript SDK v2 API verified against its installed packages.

---

## About

This skill is maintained by **[ARG Software](https://arg.software)**. We build MCP servers and agent integrations on clean architecture, so AI agents and people use the same, tested business rules. Need an MCP server for your product, or a review of one? Visit [arg.software](https://arg.software).
