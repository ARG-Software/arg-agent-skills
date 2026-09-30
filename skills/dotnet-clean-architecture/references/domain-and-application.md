# Domain and application: worked examples

## SharedKernel: `Error` and `Result`

```csharp
namespace SharedKernel;

public enum ErrorType { Failure, Validation, NotFound, Conflict, Problem }

public record Error(string Code, string Description, ErrorType Type)
{
    public static readonly Error None = new(string.Empty, string.Empty, ErrorType.Failure);
    public static readonly Error NullValue = new("General.Null", "A required value was null", ErrorType.Failure);

    public static Error Failure(string code, string description) => new(code, description, ErrorType.Failure);
    public static Error NotFound(string code, string description) => new(code, description, ErrorType.NotFound);
    public static Error Conflict(string code, string description) => new(code, description, ErrorType.Conflict);
    public static Error Problem(string code, string description) => new(code, description, ErrorType.Problem);
}

public sealed record ValidationError(Error[] Errors)
    : Error("General.Validation", "One or more validation errors occurred", ErrorType.Validation);

public class Result
{
    protected Result(bool isSuccess, Error error)
    {
        if (isSuccess != (error == Error.None))
        {
            throw new ArgumentException("A success has no error, and a failure needs one.", nameof(error));
        }

        IsSuccess = isSuccess;
        Error = error;
    }

    public bool IsSuccess { get; }
    public bool IsFailure => !IsSuccess;
    public Error Error { get; }

    public static Result Success() => new(true, Error.None);
    public static Result Failure(Error error) => new(false, error);
    public static Result<TValue> Success<TValue>(TValue value) => new(value, true, Error.None);
    public static Result<TValue> Failure<TValue>(Error error) => new(default, false, error);

    public static implicit operator Result(Error error) => Failure(error);
}

public sealed class Result<TValue> : Result
{
    private readonly TValue? _value;

    internal Result(TValue? value, bool isSuccess, Error error) : base(isSuccess, error) => _value = value;

    public TValue Value => IsSuccess
        ? _value!
        : throw new InvalidOperationException("A failure result has no value.");

    public static implicit operator Result<TValue>(TValue value) =>
        value is null ? Failure<TValue>(Error.NullValue) : Success(value);

    public static implicit operator Result<TValue>(Error error) => Failure<TValue>(error);
}
```

## Domain: entity, events, value objects, error catalog

```csharp
namespace Domain.Abstractions;

public abstract class Entity
{
    private readonly List<IDomainEvent> _domainEvents = [];

    protected Entity(Guid id) => Id = id;

    protected Entity() { } // EF Core

    public Guid Id { get; init; }

    public IReadOnlyList<IDomainEvent> GetDomainEvents() => _domainEvents.ToList();
    public void ClearDomainEvents() => _domainEvents.Clear();
    protected void RaiseDomainEvent(IDomainEvent domainEvent) => _domainEvents.Add(domainEvent);
}

public interface IDomainEvent;
```

```csharp
namespace Domain.Bookings;

public sealed class Booking : Entity
{
    private Booking(Guid id, Guid apartmentId, Guid userId, DateRange duration, PricingDetails price, DateTime createdOnUtc)
        : base(id)
    {
        ApartmentId = apartmentId;
        UserId = userId;
        Duration = duration;
        Price = price;
        Status = BookingStatus.Reserved;
        CreatedOnUtc = createdOnUtc;
    }

    private Booking() { } // EF Core

    public Guid ApartmentId { get; private set; }
    public Guid UserId { get; private set; }
    public DateRange Duration { get; private set; } = null!;
    public PricingDetails Price { get; private set; } = null!;
    public BookingStatus Status { get; private set; }
    public DateTime CreatedOnUtc { get; private set; }
    public DateTime? ConfirmedOnUtc { get; private set; }

    public static Booking Reserve(Apartment apartment, Guid userId, DateRange duration, DateTime utcNow, PricingService pricing)
    {
        var booking = new Booking(Guid.CreateVersion7(), apartment.Id, userId, duration, pricing.CalculatePrice(apartment, duration), utcNow);
        booking.RaiseDomainEvent(new BookingReservedDomainEvent(booking.Id));
        apartment.LastBookedOnUtc = utcNow;
        return booking;
    }

    public Result Confirm(DateTime utcNow)
    {
        if (Status != BookingStatus.Reserved)
        {
            return BookingErrors.NotReserved;
        }

        Status = BookingStatus.Confirmed;
        ConfirmedOnUtc = utcNow;
        RaiseDomainEvent(new BookingConfirmedDomainEvent(Id));
        return Result.Success();
    }
}

public sealed record BookingReservedDomainEvent(Guid BookingId) : IDomainEvent;
public sealed record BookingConfirmedDomainEvent(Guid BookingId) : IDomainEvent;

public static class BookingErrors
{
    public static readonly Error NotFound = Error.NotFound("Booking.NotFound", "The booking was not found");
    public static readonly Error Overlap = Error.Conflict("Booking.Overlap", "The dates overlap an existing booking");
    public static readonly Error NotReserved = Error.Conflict("Booking.NotReserved", "The booking is not pending");
}
```

```csharp
namespace Domain.Shared;

public sealed record DateRange
{
    private DateRange(DateOnly start, DateOnly end) => (Start, End) = (start, end);

    public DateOnly Start { get; }
    public DateOnly End { get; }
    public int LengthInDays => End.DayNumber - Start.DayNumber;

    public static Result<DateRange> Create(DateOnly start, DateOnly end) =>
        start > end
            ? Error.Failure("DateRange.Invalid", "The end date precedes the start date")
            : new DateRange(start, end);
}

public sealed record Money(decimal Amount, Currency Currency)
{
    public static Money Zero(Currency currency) => new(0, currency);

    public static Money operator +(Money first, Money second)
    {
        if (first.Currency != second.Currency)
        {
            throw new InvalidOperationException("Cannot add amounts in different currencies.");
        }

        return first with { Amount = first.Amount + second.Amount };
    }
}
```

Adding two currencies is a programming error, so it throws. Invalid user input (a bad date range) is an expected failure, so it returns `Result`.

## Application: command, validator, handler

```csharp
namespace Application.Bookings.ReserveBooking;

public sealed record ReserveBookingCommand(Guid ApartmentId, Guid UserId, DateOnly StartDate, DateOnly EndDate)
    : ICommand<Guid>;

internal sealed class ReserveBookingCommandValidator : AbstractValidator<ReserveBookingCommand>
{
    public ReserveBookingCommandValidator()
    {
        RuleFor(c => c.UserId).NotEmpty();
        RuleFor(c => c.ApartmentId).NotEmpty();
        RuleFor(c => c.StartDate).LessThan(c => c.EndDate);
    }
}

internal sealed class ReserveBookingCommandHandler(
    IUserRepository users,
    IApartmentRepository apartments,
    IBookingRepository bookings,
    IUnitOfWork unitOfWork,
    PricingService pricing,
    TimeProvider time) : ICommandHandler<ReserveBookingCommand, Guid>
{
    public async Task<Result<Guid>> Handle(ReserveBookingCommand command, CancellationToken cancellationToken)
    {
        if (await users.GetByIdAsync(command.UserId, cancellationToken) is null)
        {
            return UserErrors.NotFound;
        }

        var apartment = await apartments.GetByIdAsync(command.ApartmentId, cancellationToken);
        if (apartment is null)
        {
            return ApartmentErrors.NotFound;
        }

        var duration = DateRange.Create(command.StartDate, command.EndDate);
        if (duration.IsFailure)
        {
            return duration.Error;
        }

        if (await bookings.IsOverlappingAsync(apartment, duration.Value, cancellationToken))
        {
            return BookingErrors.Overlap;
        }

        try
        {
            var booking = Booking.Reserve(apartment, command.UserId, duration.Value, time.GetUtcNow().UtcDateTime, pricing);
            bookings.Add(booking);
            await unitOfWork.SaveChangesAsync(cancellationToken);
            return booking.Id;
        }
        catch (ConcurrencyException)
        {
            return BookingErrors.Overlap;
        }
    }
}
```

## Query with Dapper and caching

```csharp
namespace Application.Bookings.GetBooking;

public sealed record GetBookingQuery(Guid BookingId) : ICachedQuery<BookingResponse>
{
    public string CacheKey => $"bookings-{BookingId}";
    public TimeSpan? Expiration => TimeSpan.FromMinutes(5);
}

public sealed record BookingResponse(Guid Id, Guid ApartmentId, int Status, decimal TotalAmount, string Currency, DateOnly Start, DateOnly End);

internal sealed class GetBookingQueryHandler(ISqlConnectionFactory connections, IUserContext user)
    : IQueryHandler<GetBookingQuery, BookingResponse>
{
    public async Task<Result<BookingResponse>> Handle(GetBookingQuery query, CancellationToken cancellationToken)
    {
        using var connection = connections.CreateConnection();
        const string sql = """
            SELECT id AS Id, apartment_id AS ApartmentId, status AS Status,
                   total_price_amount AS TotalAmount, total_price_currency AS Currency,
                   duration_start AS Start, duration_end AS End
            FROM bookings
            WHERE id = @BookingId AND user_id = @UserId
            """;

        var booking = await connection.QueryFirstOrDefaultAsync<BookingResponse>(
            new CommandDefinition(sql, new { query.BookingId, UserId = user.UserId }, cancellationToken: cancellationToken));

        return booking is null ? BookingErrors.NotFound : booking;
    }
}
```

Filtering by `user_id` in the query is the authorization rule for this read. Never return another user's booking and rely on the UI to hide it.

## Behaviours (mediator-neutral shape)

```csharp
internal sealed class ValidationBehavior<TRequest, TResponse>(IEnumerable<IValidator<TRequest>> validators)
    : IPipelineBehavior<TRequest, TResponse>
    where TRequest : IBaseCommand
    where TResponse : Result
{
    public async Task<TResponse> Handle(TRequest request, RequestHandlerDelegate<TResponse> next, CancellationToken cancellationToken)
    {
        var failures = (await Task.WhenAll(validators.Select(v => v.ValidateAsync(request, cancellationToken))))
            .SelectMany(result => result.Errors)
            .Select(failure => Error.Failure(failure.PropertyName, failure.ErrorMessage))
            .ToArray();

        if (failures.Length == 0)
        {
            return await next(cancellationToken);
        }

        return ValidationFailure.Create<TResponse>(new ValidationError(failures));
    }
}
```

- `ValidationFailure.Create<TResponse>` builds `Result` or `Result<T>` failures through a small cached factory, so validation never throws.
- The caching behaviour applies to `ICachedQuery<T>` only. It reads the cache first, calls `next`, and stores the value **only when the result is a success**.
- The logging behaviour logs the request name at start, and on failure logs the error code and type with `LogContext.PushProperty("Error", result.Error, true)`.
- The `IPipelineBehavior` / `RequestHandlerDelegate` names above are MediatR's (v13 passes the token to `next`; v12 calls `next()`). With another mediator, keep the same logic in its behaviour or decorator type.

## A hand-rolled dispatcher (no mediator package)

```csharp
public interface ICommandHandler<in TCommand, TResponse> where TCommand : ICommand<TResponse>
{
    Task<Result<TResponse>> Handle(TCommand command, CancellationToken cancellationToken);
}

// Application/DependencyInjection.cs
services.Scan(scan => scan.FromAssembliesOf(typeof(DependencyInjection))
    .AddClasses(classes => classes.AssignableTo(typeof(ICommandHandler<,>)), publicOnly: false)
        .AsImplementedInterfaces().WithScopedLifetime()
    .AddClasses(classes => classes.AssignableTo(typeof(IQueryHandler<,>)), publicOnly: false)
        .AsImplementedInterfaces().WithScopedLifetime());

services.Decorate(typeof(ICommandHandler<,>), typeof(ValidationDecorator.CommandHandler<,>));
services.Decorate(typeof(ICommandHandler<,>), typeof(LoggingDecorator.CommandHandler<,>));
services.Decorate(typeof(IQueryHandler<,>), typeof(LoggingDecorator.QueryHandler<,>));
```

Endpoints then inject `ICommandHandler<ReserveBookingCommand, Guid>` directly. The decorators run in the reverse order of registration (the last one registered runs first), so register validation before logging to log first.
