# Infrastructure and Api: worked examples

## DbContext as the unit of work, with the outbox

```csharp
namespace Infrastructure.Database;

public sealed class ApplicationDbContext(DbContextOptions<ApplicationDbContext> options, DomainEventTypeRegistry eventTypes, TimeProvider time)
    : DbContext(options), IUnitOfWork
{
    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(ApplicationDbContext).Assembly);
    }

    public override async Task<int> SaveChangesAsync(CancellationToken cancellationToken = default)
    {
        AddDomainEventsAsOutboxMessages();

        try
        {
            return await base.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateConcurrencyException exception)
        {
            throw new ConcurrencyException("The data was changed by someone else.", exception);
        }
    }

    private void AddDomainEventsAsOutboxMessages()
    {
        var messages = ChangeTracker.Entries<Entity>()
            .Select(entry => entry.Entity)
            .SelectMany(entity =>
            {
                var events = entity.GetDomainEvents();
                entity.ClearDomainEvents();
                return events;
            })
            .Select(domainEvent => new OutboxMessage(
                Guid.CreateVersion7(),
                time.GetUtcNow().UtcDateTime,
                eventTypes.NameOf(domainEvent.GetType()),
                JsonSerializer.Serialize(domainEvent, domainEvent.GetType())))
            .ToList();

        AddRange(messages);
    }
}
```

Registered with `options.UseNpgsql(connectionString).UseSnakeCaseNamingConvention()`.

## The event type registry (instead of `TypeNameHandling`)

```csharp
namespace Infrastructure.Outbox;

/// Maps stable names to domain event types. Only types in this registry can be deserialized.
public sealed class DomainEventTypeRegistry
{
    private readonly Dictionary<string, Type> _byName;
    private readonly Dictionary<Type, string> _byType;

    public DomainEventTypeRegistry()
    {
        _byType = typeof(IDomainEvent).Assembly.GetTypes()
            .Where(type => type is { IsAbstract: false, IsInterface: false } && typeof(IDomainEvent).IsAssignableFrom(type))
            .ToDictionary(type => type, type => type.Name);
        _byName = _byType.ToDictionary(pair => pair.Value, pair => pair.Key);
    }

    public string NameOf(Type type) => _byType[type];

    public IDomainEvent? Deserialize(string name, string json) =>
        _byName.TryGetValue(name, out var type) ? (IDomainEvent?)JsonSerializer.Deserialize(json, type) : null;
}
```

Event type names are stable identifiers: renaming an event class is a breaking change for stored messages, so keep the old name registered (an alias) until old rows are processed.

## Outbox processor

```csharp
internal sealed class ProcessOutboxMessagesJob(
    ISqlConnectionFactory connections,
    IPublisher publisher,
    DomainEventTypeRegistry eventTypes,
    TimeProvider time,
    IOptions<OutboxOptions> options,
    ILogger<ProcessOutboxMessagesJob> logger) : IJob
{
    public async Task Execute(IJobExecutionContext context)
    {
        using var connection = connections.CreateConnection();
        using var transaction = connection.BeginTransaction();

        var messages = await connection.QueryAsync<OutboxMessageRow>(
            """
            SELECT id AS Id, type AS Type, content AS Content, attempts AS Attempts
            FROM outbox_messages
            WHERE processed_on_utc IS NULL AND attempts < @MaxAttempts
            ORDER BY occurred_on_utc
            LIMIT @BatchSize
            FOR UPDATE SKIP LOCKED
            """,
            new { options.Value.MaxAttempts, options.Value.BatchSize },
            transaction);

        foreach (var message in messages)
        {
            string? error = null;
            try
            {
                var domainEvent = eventTypes.Deserialize(message.Type, message.Content)
                    ?? throw new InvalidOperationException($"Unknown event type '{message.Type}'");
                await publisher.Publish(domainEvent, context.CancellationToken);
            }
            catch (Exception exception)
            {
                logger.LogError(exception, "Outbox message {MessageId} failed", message.Id);
                error = exception.ToString();
            }

            await connection.ExecuteAsync(
                """
                UPDATE outbox_messages
                SET processed_on_utc = CASE WHEN @Error IS NULL THEN @Now ELSE NULL END,
                    attempts = attempts + 1,
                    error = @Error
                WHERE id = @Id
                """,
                new { message.Id, Now = time.GetUtcNow().UtcDateTime, Error = error },
                transaction);
        }

        transaction.Commit();
    }
}
```

- Handlers of domain events are **idempotent**: store `(outbox_message_id, handler_name)` in an `outbox_message_consumers` table, or make the side effect naturally idempotent.
- Messages that reach `MaxAttempts` stay unprocessed with their error, and a health check or alert reports them.

## Entity configuration

```csharp
internal sealed class BookingConfiguration : IEntityTypeConfiguration<Booking>
{
    public void Configure(EntityTypeBuilder<Booking> builder)
    {
        builder.ToTable("bookings");
        builder.HasKey(booking => booking.Id);

        builder.OwnsOne(booking => booking.Duration);
        builder.OwnsOne(booking => booking.Price, price =>
        {
            price.OwnsOne(p => p.Total, money =>
                money.Property(m => m.Currency).HasConversion(currency => currency.Code, code => Currency.FromCode(code)));
        });

        builder.HasOne<Apartment>().WithMany().HasForeignKey(booking => booking.ApartmentId);
        builder.HasOne<User>().WithMany().HasForeignKey(booking => booking.UserId);

        builder.Property<uint>("Version").IsRowVersion(); // Postgres xmin
    }
}
```

## Options validated at startup

```csharp
public sealed class OutboxOptions
{
    [Range(1, 3600)] public int IntervalInSeconds { get; init; }
    [Range(1, 1000)] public int BatchSize { get; init; }
    [Range(1, 50)] public int MaxAttempts { get; init; }
}

services.AddOptions<OutboxOptions>()
    .Bind(configuration.GetSection("Outbox"))
    .ValidateDataAnnotations()
    .ValidateOnStart();
```

## Permission-based authorization

```csharp
public sealed class HasPermissionAttribute(string permission) : AuthorizeAttribute(permission);

internal sealed class PermissionAuthorizationPolicyProvider(IOptions<AuthorizationOptions> options)
    : DefaultAuthorizationPolicyProvider(options)
{
    public override async Task<AuthorizationPolicy?> GetPolicyAsync(string policyName) =>
        await base.GetPolicyAsync(policyName)
        ?? new AuthorizationPolicyBuilder().AddRequirements(new PermissionRequirement(policyName)).Build();
}
```

A `PermissionAuthorizationHandler` loads the user's permissions (cached per user in `ICacheService`) and succeeds when the requirement's permission is present. Permission names are constants (`Permissions.BookingsRead = "bookings:read"`), never string literals at call sites.

## Endpoints and the `Result` → ProblemDetails mapping

```csharp
public static class BookingEndpoints
{
    public static IEndpointRouteBuilder MapBookingEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("api/v{version:apiVersion}/bookings").WithTags("Bookings");

        group.MapPost("/", async (ReserveBookingRequest request, ISender sender, IUserContext user, CancellationToken ct) =>
            {
                var result = await sender.Send(new ReserveBookingCommand(request.ApartmentId, user.UserId, request.StartDate, request.EndDate), ct);
                return result.Match(id => Results.CreatedAtRoute("GetBooking", new { id }, id), ApiResults.Problem);
            })
            .RequireAuthorization(Permissions.BookingsWrite);

        group.MapGet("/{id:guid}", async (Guid id, ISender sender, CancellationToken ct) =>
            {
                var result = await sender.Send(new GetBookingQuery(id), ct);
                return result.Match(Results.Ok, ApiResults.Problem);
            })
            .WithName("GetBooking")
            .RequireAuthorization(Permissions.BookingsRead);

        return app;
    }
}

public static class ApiResults
{
    public static IResult Problem(Result result) =>
        Results.Problem(
            title: result.Error.Code,
            detail: result.Error.Description,
            statusCode: result.Error.Type switch
            {
                ErrorType.Validation => StatusCodes.Status400BadRequest,
                ErrorType.NotFound => StatusCodes.Status404NotFound,
                ErrorType.Conflict => StatusCodes.Status409Conflict,
                ErrorType.Problem => StatusCodes.Status400BadRequest,
                _ => StatusCodes.Status500InternalServerError,
            },
            extensions: result.Error is ValidationError validation
                ? new Dictionary<string, object?> { ["errors"] = validation.Errors }
                : null);
}
```

`Match` is a small extension on `Result<T>` in the Api project (`onSuccess(result.Value)` or `onFailure(result)`). `ISender` is MediatR's; with another mediator or the hand-rolled dispatcher, inject that sender or the handler instead.

## `Program.cs` (composition root)

```csharp
var builder = WebApplication.CreateBuilder(args);

builder.Host.UseSerilog((context, logger) => logger.ReadFrom.Configuration(context.Configuration));

builder.Services
    .AddApplication()
    .AddInfrastructure(builder.Configuration)
    .AddApiVersioning(options => options.DefaultApiVersion = new ApiVersion(1))
    .AddApiExplorer(options => options.GroupNameFormat = "'v'V");

builder.Services.AddOpenApi();
builder.Services.AddProblemDetails();
builder.Services.AddExceptionHandler<GlobalExceptionHandler>();

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
    app.MapScalarApiReference();
    await app.ApplyMigrationsAsync();
    await app.SeedDataAsync();
}

app.UseExceptionHandler();
app.UseSerilogRequestLogging();
app.UseAuthentication();
app.UseAuthorization();

app.NewVersionedApi().MapBookingEndpoints();
app.MapHealthChecks("/health");

await app.RunAsync();

public partial class Program;
```
