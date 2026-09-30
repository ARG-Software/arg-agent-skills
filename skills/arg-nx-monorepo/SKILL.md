---
name: arg-nx-monorepo
description: How ARG builds scalable Nx + pnpm TypeScript monorepos with NestJS microservices and a Next.js front end. Each service owns its data and business rules stay apart from frameworks, so the workspace grows without tangling. Use when scaffolding or extending an Nx workspace, adding an app, library, bounded context, microservice, command, query, repository, message producer or consumer, choosing Kafka or RabbitMQ, naming services, topics and queues, enforcing module boundaries with tags, setting up CI with nx affected, Docker images, environment variables and secrets (.env), versioning with release-please, or preparing a branch and pull request. Enforces domain/application/infrastructure layers as tagged Nx libraries, CQRS with Result types, one service per bounded context that owns its data, asynchronous messaging with versioned contracts, an outbox and idempotent consumers, a dependency-free utils library, feature/fix branches, reviewed PRs, and CI before merge.
license: MIT
metadata:
  author: ARG Software
  homepage: https://arg.software
---

# Scalable Nx monorepos, the ARG way

Guidance for Nx monorepos that hold several NestJS services and a Next.js front end, and scale as the number of services grows. It is distilled from ARG Software's Nx-Monorepo-Boilerplate. The weak spots found there (unenforced boundaries, application importing infrastructure, thin tests, no `nx affected`) are fixed here as rules.

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

| Base term | In an Nx monorepo |
| --- | --- |
| **verify** | `pnpm nx affected -t lint test build typecheck` (locally: `pnpm nx run-many -t lint test build typecheck` before a large PR) plus `pnpm nx run workspace:check-tags` |
| **lib folder** | `packages/shared/utils` (alias `@<org>/utils`), tagged `type:shared` |
| **arch-test tool** | `@nx/enforce-module-boundaries` with `type:*` and `scope:*` tags, plus a tag-coverage check. See [references/boundaries.md](references/boundaries.md) |
| **config module** | `packages/infrastructure/configuration`: a typed, validated `ConfigurationService` |
| **release type** | release-please `node` with the `node-workspace` plugin, one package per deployable app. See [references/ci-release-docker.md](references/ci-release-docker.md) |

---

## 1. Workspace layout

```
apps/
  <context>-api/             NestJS HTTP edge for one bounded context (e.g. client-api)
  <context>-service/         NestJS message consumer / worker (e.g. action-log-service)
  frontend/                  Next.js app (React Query, BFF proxy to the APIs)
packages/                    workspaceLayout.libsDir = "packages"
  domain/                    entities, value objects, domain errors, Result, repository ports
    src/modules/<context>/
  application/               CQRS commands and queries, handlers, ports, IBus
    src/usecases/<context>/<aggregate>/{commands,queries}/
  infrastructure/
    persistence/             ORM schemas, repositories, migrations per context
    messaging/               Kafka / RabbitMQ adapters, outbox relay, consumer registry
    cache/ queue/ email/ cronjob/ health/ log/ configuration/
  contracts/<context>/       message classes, topic names, public DTOs (the only cross-service code)
  shared/
    utils/                   the base lib: dependency-free helpers
    dtos/                    request/response DTOs used by the apps
infra/                       docker compose for Postgres, Redis, the broker, pgAdmin
```

- **One Nx project per library**, with an import alias `@<org>/<lib>` in `tsconfig.base.json`. Remove the alias when you remove a library. A dead path is a lint failure waiting to happen.
- **Pin the toolchain**: `packageManager: "pnpm@<version>"`, a Node `engines` range, and Nx, TypeScript and plugin versions moved together with `nx migrate`.
- **`namedInputs.production`** excludes specs, test configs and ESLint configs, so cache hits stay honest.
- Generate projects with the Nx generators (`nx g @nx/nest:library`, `@nx/js:library`, `@nx/nest:application`) and set tags at creation time.

---

## 2. Layers and enforced boundaries

| Tag `type:` | May depend on | Must never depend on | Owns |
| --- | --- | --- | --- |
| `domain` | `shared` | application, infrastructure, app, contracts, NestJS, ORM, broker clients | entities, value objects, domain errors, `Result`, repository port interfaces + DI symbols |
| `application` | `domain`, `shared`, `contracts` | infrastructure, app | commands, queries, handlers, ports (`ILogger`, `IProducer`, `IClock`), `IBus` |
| `infrastructure` | `application`, `domain`, `shared`, `contracts` | app | ORM schemas and repositories, broker adapters, cache, queues, email, config, logging |
| `contracts` | `shared` | everything else | message classes, topic/queue names, public DTOs |
| `shared` | `shared` | everything else | `utils` (the lib), `dtos` |
| `app` | everything | (nothing depends on an app) | controllers, consumers, NestJS modules, `main.ts` |

Every project carries one `type:*` tag and one `scope:*` tag (`scope:<context>` or `scope:shared`). `@nx/enforce-module-boundaries` turns the table into lint errors, and a `scope:<a>` project may depend only on `scope:<a>`, `scope:shared` and the contracts it consumes:

```js
// eslint.config.mjs (root): passed to @nx/enforce-module-boundaries
const depConstraints = [
  { sourceTag: "type:domain", onlyDependOnLibsWithTags: ["type:shared"] },
  { sourceTag: "type:application", onlyDependOnLibsWithTags: ["type:domain", "type:shared", "type:contracts"] },
  { sourceTag: "type:infrastructure", onlyDependOnLibsWithTags: ["type:application", "type:domain", "type:shared", "type:contracts"] },
  { sourceTag: "type:contracts", onlyDependOnLibsWithTags: ["type:shared"] },
  { sourceTag: "type:shared", onlyDependOnLibsWithTags: ["type:shared"] },
  { sourceTag: "type:app", onlyDependOnLibsWithTags: ["type:domain", "type:application", "type:infrastructure", "type:contracts", "type:shared"] },
];
```

- **Never keep the `{ sourceTag: "*", onlyDependOnLibsWithTags: ["*"] }` wildcard** that generators create. It disables every rule.
- **No untagged project.** A small check fails CI when any `project.json` lacks a `type:` or `scope:` tag.
- **Framework bans per layer** use `bannedExternalImports` on the same constraints. Domain bans `@nestjs/*`, `typeorm`, `kafkajs` and `amqplib`. Application bans ORM and broker clients.

[references/boundaries.md](references/boundaries.md) has the full ESLint config, the project tags, the per-context scope rules, and the tag-coverage check.

---

## 3. Domain

- **Framework-free.** Domain has no decorators, no NestJS, and no ORM. ORM mapping lives in persistence as `EntitySchema` definitions, never as decorators on domain classes.
- **Entities extend a base** (`id`, `createdAt`, `modifiedAt`). Every date field has one clear type (`Date`), never `Date | string`.
- **Repository ports** are interfaces paired with a DI symbol of the same name: `export const IUserRepository = Symbol("IUserRepository")` beside `export interface IUserRepository`.
- **Domain errors** are classes with a stable `code` (`UserNotFoundError`, `EmailAlreadyUsedError`).
- **`Result<T, E>`** carries expected failures. Throwing is for bugs and infrastructure failures only.
- **Split by bounded context** (`src/modules/<context>/`), and never import another context's domain.

## 4. Application: CQRS on `@nestjs/cqrs`

- **One file per use case** under `usecases/<context>/<aggregate>/{commands,queries}/<verb>-<noun>.command.ts` (or `.query.ts`), holding the command class and its handler.
- **Handlers return `Result<T>`** built from domain errors. They never throw NestJS HTTP exceptions, which belong to the app layer.
- **Depend on ports only.** Handlers inject `@Inject(IUserRepository) repo: IUserRepository`, `ILogger`, `IProducer`, `IClock`, never an infrastructure class. The logger is a port, not the log library.
- **`IBus` facade** (`execute(command)`, `query(query)`) wraps `CommandBus`/`QueryBus`, and its signatures match its implementation exactly. Controllers and consumers depend on `IBus`, not on the buses.
- **Register per context**: each context exports a handlers array and an `ApplicationModule.register<Context>()` dynamic module, so an app loads only the contexts it serves.

[references/cqrs-and-domain.md](references/cqrs-and-domain.md) has complete examples: entity, `Result`, port + symbol, command + handler, controller mapping, and a handler test.

---

## 5. Microservices: naming and ownership

- **One deployable per bounded context.** Name it `<context>-api` for the synchronous HTTP edge, or `<context>-service` for an asynchronous worker or consumer: `client-api`, `billing-service`, `action-log-service`. Always kebab-case, singular context names.
- **One name everywhere.** The same `<context>` string is the Nx project name, the `scope:<context>` tag, the database schema, the Docker image tag (`<registry>/<repo>:<context>-service-<version>`), the release-please component, and the log `service` field.
- **Each service owns its data.** It has its own schema or database and migrations, and never reads or writes another service's tables. No ORM entity is shared across contexts.
- **Services share only contracts.** The `packages/contracts/<context>` library holds the message classes, topic names and public DTOs. Services never import each other's domain or application code, and the scope constraints enforce it.
- **A new service** gets: an app project with tags, its contracts library, its schema and migration scripts (`migration:<context>:generate|up|down`), a Dockerfile, a compose entry, a release-please package, and a README section.

## 6. Communication between services: messaging first

Services talk through a message broker. Direct service-to-service HTTP calls are not used for workflows. Synchronous HTTP is only for the edge (client → `*-api`) or for an explicit, documented query with a timeout, retries and a circuit breaker.

| Choose | When |
| --- | --- |
| **Kafka** | event streams many consumers read, replay and audit, high throughput, ordering per key (partition by aggregate id) |
| **RabbitMQ** | work queues and task distribution, routing with topic exchanges, per-message acknowledgement, delayed retries, request/reply only when unavoidable |

If the choice is unclear, **ask the user**. Both sit behind the same ports, so the choice is an infrastructure decision.

- **Names** are constants in the contracts library:
  - Events are past tense: `<context>.<aggregate>.<event>`, e.g. `billing.invoice.paid`.
  - Commands are imperative: `<context>.<aggregate>.<verb>`, e.g. `email.message.send`.
  - Consumer groups and queues are `<consuming-service>.<topic>`, e.g. `action-log-service.billing.invoice.paid`.
  - Dead-letter queues and topics are `<queue>.dlq`.
- **Every message has an envelope**: `messageId` (UUID), `messageType`, `version`, `occurredAt`, `correlationId`, `causationId`, `source` (the service name), and `payload`.
- **Contracts are versioned.** Within a version, only add optional fields. A breaking change means a new `version`, a period where both versions are published, and a `BREAKING CHANGE` in the producing service's release.
- **Validate at the consumer** against the contract schema, once, before the handler runs.
- **Delivery is at-least-once, so consumers are idempotent.** Store processed `messageId`s and skip duplicates. Retry with exponential backoff and a cap, then send the message to the DLQ. Never requeue forever.
- **Producers use a transactional outbox.** The state change and the outgoing message are saved in the same database transaction, and a relay publishes them. No event is lost, and no event is published for a rolled-back change.
- **Ordering**: when order matters, the partition or routing key is the aggregate id.
- **Ports and adapters**: `IProducer` and `IConsumer` live in application. `KafkaProducer`/`KafkaConsumer` (kafkajs) and `RabbitProducer`/`RabbitConsumer` (amqplib) live in `infrastructure/messaging`. Reconnect with backoff, never recursion. Shut down gracefully: stop fetching, finish in-flight messages, commit offsets or ack, then disconnect.
- **The consumer app maps `messageType` to a command** through a handler registry, not a growing `switch`, and dispatches it through `IBus`.
- **Observability**: the correlation id flows from the HTTP request into message headers and every log line. Health checks report broker connectivity, consumer lag and DLQ depth.

[references/messaging.md](references/messaging.md) has the envelope and contract code, the ports, both adapters, the outbox relay, the idempotent consumer, the registry, and the Testcontainers setup.

---

## 7. Infrastructure

- **Bind ports to adapters** in the infrastructure module: `{ provide: IUserRepository, useClass: UserRepository }`, with the default singleton scope unless a request-scoped provider is really needed.
- **Configuration** is a typed `ConfigurationService` over `@nestjs/config` that validates every key at startup (a zod or Joi schema) and fails fast. ORM CLI configs read the same variables. No credentials are ever hard-coded in a data-source file.
- **Persistence**: one data source and migrations folder per context, `EntitySchema` mappings, and migrations generated and reviewed, never `synchronize: true` outside a throwaway local database.
- **Logging**: structured JSON (winston or pino) behind the `ILogger` port, with a correlation-id middleware and redaction of secrets and tokens.
- **Queues, email, cache, cron, health**: Bull or BullMQ on Redis, an email processor with one copy of each handlebars template, the cache module, `@nestjs/schedule`, and `@nestjs/terminus` health checks (database, Redis, broker).

## 8. Apps (presentation)

- **Controllers depend only on `IBus`.** They map a request DTO to a command, send it, and map the `Result` to HTTP with an explicit table: not found → 404, validation → 400, conflict → 409, forbidden → 403, unauthenticated → 401. Never 401 for everything.
- **Explicit mappers** convert domain objects to response DTOs. Never patch prototypes or return entities.
- **Every HTTP app** has a global `ValidationPipe` (`whitelist`, `forbidNonWhitelisted`, `transform`), `helmet`, a CORS allow-list from config, a JWT guard (passport), Swagger tags per controller, and graceful shutdown hooks.
- **The Next.js front end** uses React Query for server state and a catch-all API route that proxies to the backend (a BFF), so tokens stay in HTTP-only cookies and the browser never calls the services directly. Only `NEXT_PUBLIC_*` values reach the browser, so they must be public.

---

## 9. Testing

- **Every project has a `test` target**, so `nx affected -t test` covers it.
- **Handlers** get unit tests with fake ports (in-memory repositories, a recording producer, a fixed clock).
- **Persistence and messaging adapters** get integration tests with Testcontainers (Postgres, Redis, Kafka or RabbitMQ). Never mock the ORM to test a repository.
- **Contract tests** check that every consumer accepts every message version its producer publishes.
- **Each app has working e2e tests** (supertest against the NestJS app, with containers).
- **Architecture** is enforced by module-boundary lint plus the tag-coverage check, in CI.

## 10. CI, Docker and releases (summary)

- CI runs `nx affected` with `nrwl/nx-set-shas`, `fetch-depth: 0`, the Nx cache, `pnpm install --frozen-lockfile`, lint, typecheck, test and build. It adds `pnpm audit --audit-level=high` and a secret scan (gitleaks), and sets `permissions: contents: read`.
- Dependabot (or Renovate) runs weekly for npm (with Nx and NestJS grouped), GitHub Actions and Docker. A pnpm `overrides` block pins transitive fixes for CVEs, each with a comment.
- Each app has a multi-stage Dockerfile: a pinned Node alpine image, `generatePackageJson` to prune dependencies, `pnpm install --prod --frozen-lockfile`, and a non-root `USER node`.
- Compose is split into `infra/` (databases, Redis, the broker, pgAdmin, bound to `127.0.0.1`, required variables written as `${VAR:?}`) and `apps/` (dev and prod).
- Environment files: a root `.env.example` for shared values plus `apps/<app>/.env.example` for each app.
- release-please creates one Release PR per app. Tags are `<app>-vX.Y.Z`, and the Docker image tag comes from the app version. Publishing refuses to overwrite an existing image tag.

The workflows, Dockerfile, compose and release config are in [references/ci-release-docker.md](references/ci-release-docker.md).

## 11. Formatting, lint and docs

- Prettier (single quotes, width 80) and an ESLint flat config: a root base that each project extends, with `unused-imports/no-unused-imports: "error"`. Every plugin a project config imports is installed at the root.
- The README's scripts, folder names and service list must match `package.json` and the tree. Check them in every PR that renames something.

---

## References

| File | Read it when |
| --- | --- |
| [references/arg-base.md](references/arg-base.md) | setting up the repo, opening a PR, releasing |
| [references/boundaries.md](references/boundaries.md) | adding a project, a tag, a context, or changing lint rules |
| [references/cqrs-and-domain.md](references/cqrs-and-domain.md) | writing an entity, a repository, a command, a query, or a controller |
| [references/messaging.md](references/messaging.md) | producing or consuming messages, adding a service, choosing Kafka or RabbitMQ |
| [references/ci-release-docker.md](references/ci-release-docker.md) | CI, Dockerfiles, compose, environment files, releases |

## Nx checklist (on top of the base checklists)

- [ ] New projects were generated with Nx and have one `type:*` and one `scope:*` tag. The tag check passes.
- [ ] No `*` → `*` boundary rule, and no deep imports past a library's `index.ts`.
- [ ] Handlers depend on ports only and return `Result`. Controllers map `Result` to the right status code.
- [ ] A new service follows the naming rule and owns its schema, migrations, contracts, Dockerfile and release package.
- [ ] Cross-service communication goes through messages with an envelope, a versioned contract, an outbox on the producer side, and an idempotent consumer with a DLQ.
- [ ] Repositories and broker adapters have Testcontainers tests.
- [ ] `pnpm nx affected -t lint test build typecheck` passes.

---

## About

This skill is maintained by **[ARG Software](https://arg.software)** and distilled from ARG's Nx-Monorepo-Boilerplate and the microservice platforms we build and review. Need help designing or scaling a monorepo or a microservice platform? Visit [arg.software](https://arg.software).
