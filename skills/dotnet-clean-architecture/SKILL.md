---
name: dotnet-clean-architecture
description: Clean architecture for .NET / ASP.NET Core back ends with DDD and CQRS. Use when scaffolding or extending a .NET solution, adding an entity, value object, domain event, command, query, handler, validator, pipeline behaviour, repository, EF Core configuration, Dapper query, outbox, endpoint or controller, choosing a mediator library, mapping Result errors to HTTP, configuring authentication, caching, options or health checks, writing unit, architecture (NetArchTest), integration or functional tests with Testcontainers, setting up CI, Docker, environment variables and secrets (.env, user-secrets), versioning with release-please, or preparing a branch and pull request. Enforces Domain/Application/Infrastructure/Api projects with architecture tests, rich domain models returning Result, vertical-slice use cases, a transactional outbox, a dependency-free SharedKernel, feature/fix branches, reviewed PRs, and CI before merge.
license: MIT
metadata:
  author: ARG Software
  homepage: https://arg.software
  version: 0.0.0 # x-release-please-version
---

# .NET Clean Architecture

Guidance for ASP.NET Core back ends that keep business rules in a rich domain model and every dependency pointing inward. It is distilled from ARG Software's Clean-Architecture reference solution ("Bookify": apartment bookings with DDD, CQRS, an outbox, Keycloak auth and Testcontainers), and modernised. The source targets .NET 8, which reaches end of support in November 2026, uses MediatR (commercially licensed from v13), and serializes the outbox with `TypeNameHandling.All`. All three are fixed here.

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

| Base term | In a .NET solution |
| --- | --- |
| **verify** | `dotnet format --verify-no-changes && dotnet build -c Release -warnaserror && dotnet test -c Release --no-build` |
| **lib folder** | `src/SharedKernel` (`Result`, `Error`, guards, small helpers), which references no other project and no package |
| **arch-test tool** | NetArchTest (or ArchUnitNET) in `tests/ArchitectureTests`. See [references/testing-and-ci.md](references/testing-and-ci.md) |
| **config module** | strongly typed options bound in `Infrastructure/DependencyInjection.cs` with `ValidateDataAnnotations().ValidateOnStart()` |
| **release type** | release-please `simple`, with `<Version>` in `Directory.Build.props` updated through `extra-files` |

---

## 1. Toolchain

- **Target the current LTS (.NET 10).** Never start on an out-of-support version; check [dotnet.microsoft.com/platform/support/policy](https://dotnet.microsoft.com/platform/support/policy). Pin the SDK in `global.json` with `"rollForward": "latestFeature"`.
- **`Directory.Build.props`**: `<Nullable>enable</Nullable>`, `<ImplicitUsings>enable</ImplicitUsings>`, `<TreatWarningsAsErrors>true</TreatWarningsAsErrors>`, `<AnalysisLevel>latest-recommended</AnalysisLevel>`, and `<Version>` for release-please.
- **`Directory.Packages.props`** (central package management) holds every package version in one place.
- **`.editorconfig`** holds the style rules, enforced by `dotnet format` in CI.
- Never commit `*.user`, `*.DotSettings.user`, `bin/`, `obj/`, `appsettings.*.local.json` or `.env`.

## 2. Solution layout

```
src/
  SharedKernel/        Result, Error, ErrorType, Ensure guards (no references, no packages)
  Domain/              entities, value objects, domain events, domain services, repository interfaces, *Errors catalogs
  Application/         vertical slices (commands, queries, handlers, validators), behaviours, ports
  Infrastructure/      EF Core, Dapper, outbox, cache, auth, email, clock, options, DI
  Api/                 endpoints/controllers, middleware, Program.cs (composition root)
tests/
  Domain.UnitTests/  Application.UnitTests/  ArchitectureTests/
  Application.IntegrationTests/  Api.FunctionalTests/
```

| Project | References | Must never reference | Owns |
| --- | --- | --- | --- |
| `SharedKernel` | nothing | every project, every package | `Result`, `Error`, guards |
| `Domain` | `SharedKernel` | Application, Infrastructure, Api, EF Core, ASP.NET Core, any mediator | the model and its rules |
| `Application` | `Domain`, `SharedKernel`, FluentValidation, the mediator abstractions | Infrastructure, Api, EF Core, ASP.NET Core | use cases, behaviours, ports |
| `Infrastructure` | `Application`, `Domain` | Api | adapters for every port |
| `Api` | `Application`, `Infrastructure` (composition only) | | HTTP, auth wiring, `Program.cs` |

- **Api references Infrastructure only to call `AddInfrastructure()`.** Endpoints and controllers never use Infrastructure types; an architecture test enforces it.
- **Every project exposes one `DependencyInjection.cs`** (`AddApplication()`, `AddInfrastructure(configuration)`), and `Program.cs` calls them in order.

## 3. Domain

- **`Entity` base** with an `Id`, a private list of domain events, `RaiseDomainEvent`, `GetDomainEvents` and `ClearDomainEvents`.
- **Entities are `sealed`**, with a private constructor, a private parameterless constructor for EF Core, `private set` properties, and **static factories** that enforce invariants: `Booking.Reserve(apartment, userId, duration, utcNow, pricingService)`.
- **State transitions return `Result`** and raise events: `booking.Confirm(utcNow)` returns `BookingErrors.NotReserved` when the status is wrong, otherwise sets the status and raises `BookingConfirmedDomainEvent`.
- **Value objects are records**, and creation that can fail returns `Result`: `Email.Create(value)`, `DateRange.Create(start, end)`. `Money` has operators and refuses to add different currencies.
- **Domain services** hold rules that span entities (`PricingService`).
- **Error catalogs** are static classes of `static readonly Error` values with unique codes: `BookingErrors.NotFound = Error.NotFound("Booking.NotFound", "The booking was not found")`. Each code appears once, and a test checks that codes are unique.
- **Repository interfaces** (`IBookingRepository`) and `IUnitOfWork` live in Domain. Repositories exist only for aggregate roots.
- **Time is injected.** Methods take `DateTime utcNow` (or `DateTimeOffset`), and the application passes `TimeProvider.GetUtcNow()`. The domain never calls `DateTime.UtcNow`.

## 4. Application: vertical slices

```
Application/Bookings/
  ReserveBooking/  ReserveBookingCommand.cs  ReserveBookingCommandHandler.cs  ReserveBookingCommandValidator.cs  BookingReservedDomainEventHandler.cs
  GetBooking/      GetBookingQuery.cs  GetBookingQueryHandler.cs  BookingResponse.cs
```

- **`ICommand<TResponse>` / `IQuery<TResponse>` return `Result<TResponse>`**, with an implicit conversion from `TResponse`, so handlers `return booking.Id;` on success and `return BookingErrors.Overlap;` on failure.
- **Handlers and validators are `internal sealed`.** Only commands, queries and responses are public.
- **Pipeline behaviours**, in order:
  1. logging (the request name, the outcome, and the error code on failure)
  2. validation (FluentValidation, **commands only**), returning a validation `Result` instead of throwing
  3. query caching (`ICachedQuery` with `CacheKey` and `Expiration`), which caches **successful** results only
- **Reads use Dapper** through `ISqlConnectionFactory` and return response DTOs directly. **Writes use repositories + `IUnitOfWork`.**
- **Ports** declared here: `ISqlConnectionFactory`, `ICacheService`, `IEmailService`, `IUserContext`, and `IJwtService`/`IAuthenticationService` when the app issues tokens. Use the framework `TimeProvider` instead of a custom clock interface.
- **Domain event handlers** (`BookingReservedDomainEventHandler`) run from the outbox, not inside the request, and are idempotent.

### Choosing the mediator (ask the user)

MediatR is commercially licensed from version 13. Before adding or upgrading it, **ask the user** which option they want:

| Option | Trade-off |
| --- | --- |
| MediatR 13+ with a licence | the familiar API; the licence cost is the user's decision |
| MediatR pinned to 12.x | free, but frozen: no fixes, so plan a migration |
| An MIT-licensed source-generated mediator (e.g. `Mediator` by martinothamar) | free and fast, with a similar API and pipeline behaviours |
| A small hand-rolled dispatcher | no dependency: `ICommandHandler<,>` resolved from DI, with behaviours as decorators (Scrutor `Decorate`) |

The layering and the behaviours stay the same whichever option is chosen. Only the registration and the base interfaces change.

[references/domain-and-application.md](references/domain-and-application.md) has `Result`/`Error`, an entity, a value object, a command + handler + validator, the behaviours, a Dapper query, and a hand-rolled dispatcher.

## 5. Infrastructure

- **`ApplicationDbContext : DbContext, IUnitOfWork`** applies every `IEntityTypeConfiguration<T>` from the assembly, and uses snake_case naming (`EFCore.NamingConventions`).
- **Value objects** are mapped as owned types or complex properties, or with value conversions. Entities stay free of EF attributes.
- **Repositories**: a generic `Repository<T>` base plus `internal sealed` concrete repositories.
- **Optimistic concurrency**: a concurrency token (`xmin` row version on Postgres). `DbUpdateConcurrencyException` becomes an application `ConcurrencyException`, which the handler maps to a conflict `Result`.
- **Transactional outbox**: `SaveChangesAsync` turns the domain events of tracked entities into `outbox_messages` rows in the same transaction. A background job (Quartz or a `BackgroundService`) reads batches with `FOR UPDATE SKIP LOCKED`, publishes each event through the mediator, and records `processed_on_utc` or `error`. Failed messages retry with backoff up to a limit, then stay marked as failed for investigation.
- **Serialize outbox events with System.Text.Json and an explicit type registry** (event type name → CLR type). **Never** use Newtonsoft `TypeNameHandling.All` or `Auto` on stored data: it allows arbitrary type instantiation when the data is tampered with.
- **Caching**: Redis through `IDistributedCache` (or `HybridCache`) behind `ICacheService`.
- **Authentication and authorization**: JWT bearer against an identity provider (Keycloak in the source), and permission-based authorization: `[HasPermission(Permissions.BookingsRead)]` or `.RequireAuthorization(Permissions.BookingsRead)`, with a policy provider that loads the user's permissions (cached).
- **Options**: `services.AddOptions<OutboxOptions>().Bind(configuration.GetSection("Outbox")).ValidateDataAnnotations().ValidateOnStart()`. Configuration sections are the only way code reads settings.
- **Split `AddInfrastructure`** into `AddPersistence`, `AddCaching`, `AddAuthentication`, `AddAuthorization`, `AddBackgroundJobs` and `AddHealthChecks`.

## 6. Api

- **Endpoints per feature**: minimal-API endpoint groups (`app.MapGroup("api/v1/bookings").MapBookingEndpoints()`) or thin controllers. Both map the request DTO to a command, send it, and map the `Result`.
- **One mapping from `Result` to HTTP** via `ErrorType`: `NotFound` → 404, `Validation` → 400 (with the validation errors), `Conflict` → 409, `Problem`/`Failure` → 400 or 500, all as RFC 9457 **ProblemDetails**. Endpoints call one extension such as `result.Match(Results.Ok, ApiResults.Problem)`.
- **Unexpected exceptions** go through `IExceptionHandler` + `AddProblemDetails()`: log with the trace id, and return a generic 500 without internals.
- **API versioning** in the URL segment (`Asp.Versioning.Http`).
- **OpenAPI** with the built-in `Microsoft.AspNetCore.OpenApi` (`AddOpenApi` / `MapOpenApi`) and a UI such as Scalar in Development, instead of Swashbuckle.
- **Logging and health**: Serilog with request logging and a correlation id, Seq locally, and `MapHealthChecks("/health")` covering the database, Redis and the identity provider.
- **Migrations and seeding run only in Development** (`if (app.Environment.IsDevelopment())`). Production applies migrations from a reviewed migration bundle in the deployment pipeline.
- `public partial class Program;` at the end of `Program.cs`, for `WebApplicationFactory<Program>`.

[references/infrastructure-and-api.md](references/infrastructure-and-api.md) has the DbContext, the outbox, the type registry, options, permission auth, endpoints, and the `Result` → ProblemDetails mapping.

## 7. Testing

- **Domain unit tests** for every factory, transition and value object, including the failure `Result`s.
- **Application unit tests** for handlers with NSubstitute fakes and `FakeTimeProvider`.
- **Architecture tests** (NetArchTest), one rule per test:
  - the layer direction from the table
  - Api types never depend on Infrastructure namespaces, except `DependencyInjection`
  - command and query handlers are `internal sealed` and named `*CommandHandler` / `*QueryHandler`, and validators are named `*Validator`
  - domain events are `sealed` and end in `DomainEvent`
  - entities have a private parameterless constructor
  - SharedKernel depends on nothing
- **Integration tests** (`Application.IntegrationTests`) and **functional tests** (`Api.FunctionalTests`) use `WebApplicationFactory<Program>` with Testcontainers for Postgres, Redis and Keycloak, and reset data between tests (Respawn).
- **Assertions**: FluentAssertions v8+ needs a commercial licence for commercial use. Ask the user, and use Shouldly or plain xUnit asserts otherwise.

## 8. CI, Docker, environments and releases

- The `verify` job uses `actions/setup-dotnet` with `global-json-file: global.json`, then restore, format check, build with warnings as errors, and test. Testcontainers works on GitHub-hosted Ubuntu runners.
- Multi-stage Dockerfile (`sdk` → `aspnet` images), running as the non-root `app` user.
- `docker-compose.yml` for Postgres, Redis, Keycloak (with a realm import) and Seq, bound to `127.0.0.1`.
- **Secrets**: `dotnet user-secrets` locally, `.env` (untracked, with a tracked `.env.example`) for compose, and `Section__Key` environment variables in containers. Never put secrets in `appsettings*.json`.
- release-please `simple` updates `<Version>` in `Directory.Build.props` through `extra-files` with the generic `x-release-please-version` annotation, and the release workflow builds and pushes the image tagged with the version.

[references/testing-and-ci.md](references/testing-and-ci.md) has the architecture tests, the Testcontainers fixture, the CI job, the Dockerfile, compose, and the release config.

---

## References

| File | Read it when |
| --- | --- |
| [references/arg-base.md](references/arg-base.md) | setting up the repo, opening a PR, releasing |
| [references/domain-and-application.md](references/domain-and-application.md) | writing entities, value objects, errors, commands, queries, handlers, validators, behaviours |
| [references/infrastructure-and-api.md](references/infrastructure-and-api.md) | EF Core, Dapper, outbox, caching, auth, options, endpoints, error mapping |
| [references/testing-and-ci.md](references/testing-and-ci.md) | architecture, integration and functional tests, CI, Docker, compose, secrets, releases |

## .NET checklist (on top of the base checklists)

- [ ] Invariants live in the entity or value object, and expected failures return `Result` with a catalogued `Error`.
- [ ] The use case is a vertical slice with an `internal sealed` handler, and commands have a validator.
- [ ] Writes go through repositories and `IUnitOfWork`, reads through Dapper, and domain events through the outbox with idempotent handlers.
- [ ] No Newtonsoft `TypeNameHandling`, no `DateTime.UtcNow` in the domain, and no secrets in `appsettings*.json`.
- [ ] The endpoint maps `Result` through the shared ProblemDetails mapping.
- [ ] Architecture tests pass, and new tests cover the domain rule, the handler, and the endpoint (with Testcontainers).
- [ ] `dotnet format --verify-no-changes`, the warnings-as-errors build and `dotnet test` pass.

---

## About

This skill is maintained by **[ARG Software](https://arg.software)** and distilled from ARG's Clean-Architecture reference solution and the .NET back ends we build and review. Need help designing, modernising or reviewing a .NET platform? Visit [arg.software](https://arg.software).
