# Testing, CI, Docker and releases

## Architecture tests (NetArchTest)

```csharp
namespace ArchitectureTests;

public abstract class BaseTest
{
    protected static readonly Assembly DomainAssembly = typeof(Entity).Assembly;
    protected static readonly Assembly ApplicationAssembly = typeof(Application.DependencyInjection).Assembly;
    protected static readonly Assembly InfrastructureAssembly = typeof(ApplicationDbContext).Assembly;
    protected static readonly Assembly ApiAssembly = typeof(Program).Assembly;
}

public sealed class LayerTests : BaseTest
{
    [Fact]
    public void Domain_does_not_depend_on_other_layers() =>
        Types.InAssembly(DomainAssembly)
            .ShouldNot().HaveDependencyOnAny(ApplicationAssembly.GetName().Name, InfrastructureAssembly.GetName().Name, ApiAssembly.GetName().Name)
            .GetResult().IsSuccessful.Should().BeTrue();

    [Fact]
    public void Application_does_not_depend_on_infrastructure_or_api() =>
        Types.InAssembly(ApplicationAssembly)
            .ShouldNot().HaveDependencyOnAny(InfrastructureAssembly.GetName().Name, ApiAssembly.GetName().Name)
            .GetResult().IsSuccessful.Should().BeTrue();

    [Fact]
    public void Domain_and_application_do_not_reference_ef_core_or_aspnet() =>
        Types.InAssemblies([DomainAssembly, ApplicationAssembly])
            .ShouldNot().HaveDependencyOnAny("Microsoft.EntityFrameworkCore", "Microsoft.AspNetCore")
            .GetResult().IsSuccessful.Should().BeTrue();

    [Fact]
    public void Endpoints_do_not_depend_on_infrastructure() =>
        Types.InAssembly(ApiAssembly)
            .That().ResideInNamespace("Api.Endpoints")
            .ShouldNot().HaveDependencyOn(InfrastructureAssembly.GetName().Name)
            .GetResult().IsSuccessful.Should().BeTrue();
}

public sealed class ConventionTests : BaseTest
{
    [Fact]
    public void Command_handlers_are_internal_sealed_and_named() =>
        Types.InAssembly(ApplicationAssembly)
            .That().ImplementInterface(typeof(ICommandHandler<,>))
            .Should().NotBePublic().And().BeSealed().And().HaveNameEndingWith("CommandHandler")
            .GetResult().IsSuccessful.Should().BeTrue();

    [Fact]
    public void Validators_are_internal_and_named() =>
        Types.InAssembly(ApplicationAssembly)
            .That().Inherit(typeof(AbstractValidator<>))
            .Should().NotBePublic().And().HaveNameEndingWith("Validator")
            .GetResult().IsSuccessful.Should().BeTrue();

    [Fact]
    public void Domain_events_are_sealed_and_named() =>
        Types.InAssembly(DomainAssembly)
            .That().ImplementInterface(typeof(IDomainEvent))
            .Should().BeSealed().And().HaveNameEndingWith("DomainEvent")
            .GetResult().IsSuccessful.Should().BeTrue();

    [Fact]
    public void Entities_have_a_private_parameterless_constructor()
    {
        var missing = Types.InAssembly(DomainAssembly)
            .That().Inherit(typeof(Entity)).GetTypes()
            .Where(type => !type.GetConstructors(BindingFlags.NonPublic | BindingFlags.Instance)
                .Any(ctor => ctor.IsPrivate && ctor.GetParameters().Length == 0))
            .Select(type => type.Name)
            .ToList();

        missing.Should().BeEmpty();
    }
}
```

When a rule fails, print `GetResult().FailingTypeNames` in the assertion message so the reviewer sees which type broke it.

## Unit tests

- Domain: construct through the factory, call the transition, assert on the `Result` and on `GetDomainEvents()`.
- Handlers: NSubstitute fakes for repositories and `IUnitOfWork`, a `FakeTimeProvider` (`Microsoft.Extensions.TimeProvider.Testing`) for time, and one test per error path (`UserErrors.NotFound`, `BookingErrors.Overlap`, the concurrency catch).

```csharp
[Fact]
public async Task Returns_overlap_when_dates_are_taken()
{
    _bookings.IsOverlappingAsync(_apartment, Arg.Any<DateRange>(), Arg.Any<CancellationToken>()).Returns(true);

    var result = await _handler.Handle(Command, CancellationToken.None);

    result.Error.Should().Be(BookingErrors.Overlap);
    await _unitOfWork.DidNotReceive().SaveChangesAsync(Arg.Any<CancellationToken>());
}
```

## Integration and functional tests

```csharp
public sealed class ApiFactory : WebApplicationFactory<Program>, IAsyncLifetime
{
    private readonly PostgreSqlContainer _postgres = new PostgreSqlBuilder().WithImage("postgres:17-alpine").Build();
    private readonly RedisContainer _redis = new RedisBuilder().WithImage("redis:7-alpine").Build();
    private Respawner _respawner = null!;

    public async Task InitializeAsync()
    {
        await Task.WhenAll(_postgres.StartAsync(), _redis.StartAsync());
        using var scope = Services.CreateScope();
        await scope.ServiceProvider.GetRequiredService<ApplicationDbContext>().Database.MigrateAsync();

        await using var connection = new NpgsqlConnection(_postgres.GetConnectionString());
        await connection.OpenAsync();
        _respawner = await Respawner.CreateAsync(connection, new RespawnerOptions { DbAdapter = DbAdapter.Postgres, SchemasToInclude = ["public"] });
    }

    public async Task ResetDatabaseAsync()
    {
        await using var connection = new NpgsqlConnection(_postgres.GetConnectionString());
        await connection.OpenAsync();
        await _respawner.ResetAsync(connection);
    }

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseSetting("ConnectionStrings:Database", _postgres.GetConnectionString());
        builder.UseSetting("ConnectionStrings:Cache", _redis.GetConnectionString());
        builder.ConfigureTestServices(services =>
            services.AddAuthentication(TestAuthHandler.Scheme)
                .AddScheme<AuthenticationSchemeOptions, TestAuthHandler>(TestAuthHandler.Scheme, _ => { }));
    }

    public new async Task DisposeAsync() => await Task.WhenAll(_postgres.DisposeAsync().AsTask(), _redis.DisposeAsync().AsTask());
}
```

- Integration tests (handlers against the real database) and functional tests (HTTP through `CreateClient()`) share this fixture as an xUnit collection fixture, and reset the database between tests with Respawn.
- Swap in a test auth handler for most functional tests. Keep one suite that runs a Keycloak container (`Testcontainers.Keycloak`, realm imported from `.files/realm-export.json`) to prove the real JWT flow.
- Pin container image tags; never use `latest`.
- Tests that need Docker run in CI (GitHub-hosted Ubuntu runners have it). Locally they need Docker running, and the README says so.

## CI

```yaml
name: CI
on:
  pull_request:
  push:
    branches: [main]
permissions:
  contents: read
concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true
jobs:
  verify:
    runs-on: ubuntu-latest
    timeout-minutes: 20
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-dotnet@v4
        with:
          global-json-file: global.json
          cache: true
          cache-dependency-path: "**/packages.lock.json"
      - run: dotnet restore --locked-mode
      - run: dotnet format --verify-no-changes --no-restore
      - run: dotnet build -c Release --no-restore -warnaserror
      - run: dotnet test -c Release --no-build --logger trx --results-directory TestResults
      - run: dotnet list package --vulnerable --include-transitive 2>&1 | tee vulnerable.txt && ! grep -q "has the following vulnerable packages" vulnerable.txt
      - if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: test-results
          path: TestResults
  pr-title:
    if: github.event_name == 'pull_request'
    runs-on: ubuntu-latest
    permissions:
      pull-requests: read
    steps:
      - uses: amannn/action-semantic-pull-request@v5
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

- `--locked-mode` needs `<RestorePackagesWithLockFile>true</RestorePackagesWithLockFile>` in `Directory.Build.props` and committed `packages.lock.json` files.
- The ruleset requires `verify` and `pr-title` (see `arg-base.md`).

## `global.json` and `Directory.Build.props`

```json
{
  "sdk": {
    "version": "10.0.100",
    "rollForward": "latestFeature"
  }
}
```

```xml
<Project>
  <PropertyGroup>
    <TargetFramework>net10.0</TargetFramework>
    <Nullable>enable</Nullable>
    <ImplicitUsings>enable</ImplicitUsings>
    <TreatWarningsAsErrors>true</TreatWarningsAsErrors>
    <AnalysisLevel>latest-recommended</AnalysisLevel>
    <EnforceCodeStyleInBuild>true</EnforceCodeStyleInBuild>
    <RestorePackagesWithLockFile>true</RestorePackagesWithLockFile>
    <Version>0.0.0</Version> <!-- x-release-please-version -->
  </PropertyGroup>
</Project>
```

Package versions live only in `Directory.Packages.props` with `<ManagePackageVersionsCentrally>true</ManagePackageVersionsCentrally>`. A `Version=` attribute on a `PackageReference` fails review.

## Dockerfile

```dockerfile
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY global.json Directory.Build.props Directory.Packages.props ./
COPY src/*/*.csproj ./
RUN for file in *.csproj; do mkdir -p "src/${file%.*}" && mv "$file" "src/${file%.*}/"; done
RUN dotnet restore src/Api/Api.csproj
COPY src/ src/
RUN dotnet publish src/Api/Api.csproj -c Release -o /app/publish --no-restore /p:UseAppHost=false

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
WORKDIR /app
COPY --from=build /app/publish .
USER app
EXPOSE 8080
ENTRYPOINT ["dotnet", "Api.dll"]
```

The `aspnet` images ship the non-root `app` user and listen on 8080. Copying the project files before the sources keeps the restore layer cached; restore without `--locked-mode` here only if the lock files are not copied too.

## Compose and secrets

```yaml
services:
  api:
    build: .
    ports: ["127.0.0.1:5000:8080"]
    environment:
      ConnectionStrings__Database: Host=db;Database=${POSTGRES_DB:?};Username=${POSTGRES_USER:?};Password=${POSTGRES_PASSWORD:?}
      ConnectionStrings__Cache: cache:6379
      Authentication__Audience: ${AUTH_AUDIENCE:?}
    depends_on:
      db:
        condition: service_healthy
      cache:
        condition: service_started
  db:
    image: postgres:17-alpine
    environment:
      POSTGRES_DB: ${POSTGRES_DB:?}
      POSTGRES_USER: ${POSTGRES_USER:?}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?}
    ports: ["127.0.0.1:5432:5432"]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U $${POSTGRES_USER}"]
      interval: 5s
      retries: 10
  cache:
    image: redis:7-alpine
  seq:
    image: datalust/seq:2025.1
    environment:
      ACCEPT_EULA: "Y"
    ports: ["127.0.0.1:8081:80"]
```

- Local secrets: `dotnet user-secrets` for runs outside Docker; the untracked `.env` (from the tracked `.env.example`) for compose. `appsettings*.json` holds only non-secret defaults.
- `__` in an environment variable name maps to `:` in configuration.
- Add Keycloak (`quay.io/keycloak/keycloak` with `start-dev --import-realm` and the realm file mounted) when the app uses it locally.

## Release

`release-please-config.json` package entry:

```json
{
  "packages": {
    ".": {
      "release-type": "simple",
      "extra-files": [
        { "type": "generic", "path": "Directory.Build.props" }
      ]
    }
  }
}
```

- The generic updater rewrites the line annotated with `x-release-please-version`, so `<Version>` in `Directory.Build.props` always matches the tag.
- A release workflow can build and push the Docker image tagged with the release version when release-please creates a release (`steps.release.outputs.release_created`). It never overwrites an existing tag.
