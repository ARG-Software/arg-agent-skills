# Domain, CQRS and apps: worked examples

The examples use a `client` context with a `User` aggregate. The same shape applies to every context.

## Result and domain errors (domain)

```ts
// packages/domain/src/core/result.ts
export type Result<T, E extends DomainError = DomainError> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });
export const fail = <E extends DomainError>(error: E): Result<never, E> => ({ ok: false, error });

export type DomainErrorKind = "not-found" | "validation" | "conflict" | "forbidden";

export abstract class DomainError {
  abstract readonly code: string;
  abstract readonly kind: DomainErrorKind;
  constructor(readonly message: string) {}
}
```

```ts
// packages/domain/src/modules/client/user.errors.ts
import { DomainError } from "../../core/result";

export class UserNotFoundError extends DomainError {
  readonly code = "client.user.not_found";
  readonly kind = "not-found";
  constructor(id: string) {
    super(`User ${id} was not found`);
  }
}

export class InvalidEmailError extends DomainError {
  readonly code = "client.user.invalid_email";
  readonly kind = "validation";
  constructor(email: string) {
    super(`'${email}' is not a valid email`);
  }
}

export class EmailAlreadyUsedError extends DomainError {
  readonly code = "client.user.email_already_used";
  readonly kind = "conflict";
  constructor() {
    super("That email is already registered");
  }
}
```

## Entity and repository port (domain)

```ts
// packages/domain/src/modules/client/user.entity.ts
import { BaseEntity } from "../../core/base.entity";
import { fail, ok, type Result } from "../../core/result";
import { InvalidEmailError } from "./user.errors";

export class User extends BaseEntity {
  private constructor(
    id: string,
    public readonly email: string,
    public name: string,
    createdAt: Date,
    modifiedAt: Date,
  ) {
    super(id, createdAt, modifiedAt);
  }

  static register(id: string, email: string, name: string, now: Date): Result<User, InvalidEmailError> {
    if (!email.includes("@")) return fail(new InvalidEmailError(email));
    return ok(new User(id, email.toLowerCase(), name.trim(), now, now));
  }

  rename(name: string, now: Date): void {
    this.name = name.trim();
    this.touch(now);
  }
}
```

```ts
// packages/domain/src/modules/client/user.repository.ts
import type { User } from "./user.entity";

export const IUserRepository = Symbol("IUserRepository");

export interface IUserRepository {
  findById(id: string): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  save(user: User): Promise<void>;
}
```

The ORM mapping for `User` is an `EntitySchema` in `packages/infrastructure/persistence/src/client/user.schema.ts`, never decorators on the entity.

## Command and handler (application)

```ts
// packages/application/src/usecases/client/user/commands/register-user.command.ts
import { Inject } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import { EmailAlreadyUsedError, IUserRepository, User, fail, ok, type Result } from "@org/domain";
import { IClock, IIdGenerator, IProducer } from "../../../../ports";
import { CLIENT_TOPICS, type UserRegisteredV1 } from "@org/contracts-client";

export class RegisterUserCommand {
  constructor(
    readonly email: string,
    readonly name: string,
    readonly correlationId: string,
  ) {}
}

@CommandHandler(RegisterUserCommand)
export class RegisterUserHandler implements ICommandHandler<RegisterUserCommand, Result<{ id: string }>> {
  constructor(
    @Inject(IUserRepository) private readonly users: IUserRepository,
    @Inject(IProducer) private readonly producer: IProducer,
    @Inject(IClock) private readonly clock: IClock,
    @Inject(IIdGenerator) private readonly ids: IIdGenerator,
  ) {}

  async execute(command: RegisterUserCommand): Promise<Result<{ id: string }>> {
    if (await this.users.findByEmail(command.email.toLowerCase())) return fail(new EmailAlreadyUsedError());

    const registered = User.register(this.ids.next(), command.email, command.name, this.clock.now());
    if (!registered.ok) return registered;

    await this.users.save(registered.value);
    await this.producer.publish<UserRegisteredV1>(CLIENT_TOPICS.userRegistered, {
      key: registered.value.id,
      correlationId: command.correlationId,
      payload: { userId: registered.value.id, email: registered.value.email },
    });
    return ok({ id: registered.value.id });
  }
}
```

In a real service, `save` and `publish` go through the outbox in one transaction (see [messaging.md](messaging.md)); `IProducer` then writes to the outbox table instead of the broker.

`@nestjs/common` and `@nestjs/cqrs` are allowed in application for DI and the buses. ORM and broker clients are not.

## IBus facade (application port, infrastructure implementation)

```ts
// packages/application/src/ports/bus.port.ts
import type { Result } from "@org/domain";

export const IBus = Symbol("IBus");

export interface IBus {
  execute<T>(command: object): Promise<Result<T>>;
  query<T>(query: object): Promise<Result<T>>;
}
```

```ts
// packages/infrastructure/cqrs/src/nest-bus.ts
import { Injectable } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";
import type { Result } from "@org/domain";
import type { IBus } from "@org/application";

@Injectable()
export class NestBus implements IBus {
  constructor(
    private readonly commands: CommandBus,
    private readonly queries: QueryBus,
  ) {}

  execute<T>(command: object): Promise<Result<T>> {
    return this.commands.execute(command);
  }

  query<T>(query: object): Promise<Result<T>> {
    return this.queries.execute(query);
  }
}
```

## Controller: Result to HTTP (app)

```ts
// apps/client-api/src/users/users.controller.ts
import { Body, Controller, HttpException, Inject, Post, Req } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { IBus, RegisterUserCommand } from "@org/application";
import type { DomainError, DomainErrorKind } from "@org/domain";
import { RegisterUserRequest, RegisterUserResponse } from "@org/dtos";

const STATUS_BY_KIND: Record<DomainErrorKind, number> = {
  "not-found": 404,
  validation: 400,
  conflict: 409,
  forbidden: 403,
};

export function toHttpError(error: DomainError): HttpException {
  return new HttpException({ code: error.code, message: error.message }, STATUS_BY_KIND[error.kind]);
}

@ApiTags("users")
@Controller("users")
export class UsersController {
  constructor(@Inject(IBus) private readonly bus: IBus) {}

  @Post()
  async register(@Body() body: RegisterUserRequest, @Req() request: { correlationId: string }): Promise<RegisterUserResponse> {
    const result = await this.bus.execute<{ id: string }>(new RegisterUserCommand(body.email, body.name, request.correlationId));
    if (!result.ok) throw toHttpError(result.error);
    return { id: result.value.id };
  }
}
```

`toHttpError` lives in one shared app-layer file, so every controller maps errors the same way. Authentication failures (401) come from the JWT guard, not from domain errors.

## Handler test with fake ports

```ts
// packages/application/src/usecases/client/user/commands/register-user.command.spec.ts
import { RegisterUserCommand, RegisterUserHandler } from "./register-user.command";
import { InMemoryUserRepository, RecordingProducer, fixedClock, sequentialIds } from "../../../../testing";

describe("RegisterUserHandler", () => {
  it("rejects an email that is already registered", async () => {
    const users = new InMemoryUserRepository();
    const handler = new RegisterUserHandler(users, new RecordingProducer(), fixedClock("2026-01-01"), sequentialIds());
    await handler.execute(new RegisterUserCommand("a@b.com", "Ann", "corr-1"));

    const second = await handler.execute(new RegisterUserCommand("A@b.com", "Ann", "corr-2"));

    expect(second.ok).toBe(false);
    expect(second.ok ? null : second.error.code).toBe("client.user.email_already_used");
  });

  it("publishes UserRegistered with the correlation id", async () => {
    const producer = new RecordingProducer();
    const handler = new RegisterUserHandler(new InMemoryUserRepository(), producer, fixedClock("2026-01-01"), sequentialIds());

    await handler.execute(new RegisterUserCommand("a@b.com", "Ann", "corr-1"));

    expect(producer.published).toEqual([
      expect.objectContaining({ topic: "client.user.registered", correlationId: "corr-1" }),
    ]);
  });
});
```

The fakes live in `packages/application/src/testing/` and are exported only for tests, never used by apps.
