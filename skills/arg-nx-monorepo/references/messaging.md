# Messaging between services

## Contracts library (`packages/contracts/<context>`)

Names, envelope and payloads are the only code services share.

```ts
// packages/contracts/shared/src/envelope.ts
export interface MessageEnvelope<TPayload> {
  readonly messageId: string; // UUID, unique per message, used for idempotency
  readonly messageType: string; // e.g. "billing.invoice.paid"
  readonly version: number; // payload schema version
  readonly occurredAt: string; // ISO 8601
  readonly correlationId: string; // the originating request or workflow
  readonly causationId: string | null; // the messageId that caused this one
  readonly source: string; // producing service, e.g. "billing-service"
  readonly payload: TPayload;
}
```

```ts
// packages/contracts/billing/src/billing.topics.ts
export const BILLING_TOPICS = {
  invoicePaid: "billing.invoice.paid",
  invoiceVoided: "billing.invoice.voided",
} as const;

export const BILLING_COMMANDS = {
  chargeCustomer: "billing.customer.charge",
} as const;

/** Queue / consumer-group name for a consuming service: "<service>.<topic>". */
export const queueFor = (service: string, topic: string) => `${service}.${topic}`;
export const deadLetterFor = (queue: string) => `${queue}.dlq`;
```

```ts
// packages/contracts/billing/src/invoice-paid.v1.ts
import { z } from "zod";

export const InvoicePaidV1 = z.object({
  invoiceId: z.string().uuid(),
  customerId: z.string().uuid(),
  amountCents: z.number().int().nonnegative(),
  currency: z.string().length(3),
  paidAt: z.string().datetime(),
});
export type InvoicePaidV1 = z.infer<typeof InvoicePaidV1>;
```

Versioning rules:
- Inside a version, only add **optional** fields. Consumers ignore unknown fields.
- A breaking change creates `invoice-paid.v2.ts`, and the producer publishes both v1 and v2 until every consumer has moved. Then v1 is removed in a release marked `BREAKING CHANGE`.
- The contract schema is the single source for validation on both sides. Contracts may use `zod`, since validation is their job.

## Ports (application)

```ts
// packages/application/src/ports/messaging.port.ts
import type { MessageEnvelope } from "@org/contracts-shared";

export const IProducer = Symbol("IProducer");

export interface PublishOptions<TPayload> {
  readonly key: string; // partition / routing key, usually the aggregate id
  readonly correlationId: string;
  readonly causationId?: string;
  readonly version?: number;
  readonly payload: TPayload;
}

export interface IProducer {
  publish<TPayload>(topic: string, options: PublishOptions<TPayload>): Promise<void>;
}

export const IConsumer = Symbol("IConsumer");

export type MessageHandler = (message: MessageEnvelope<unknown>) => Promise<void>;

export interface IConsumer {
  subscribe(topic: string, queue: string, handler: MessageHandler): Promise<void>;
  stop(): Promise<void>;
}
```

## Transactional outbox (producer side)

The handler saves the state change and the outgoing message in **one** transaction. A relay publishes committed rows.

```sql
create table billing.outbox (
  message_id     uuid primary key,
  topic          text        not null,
  message_key    text        not null,
  envelope       jsonb       not null,
  created_at     timestamptz not null default now(),
  published_at   timestamptz,
  attempts       int         not null default 0,
  last_error     text
);
create index outbox_unpublished on billing.outbox (created_at) where published_at is null;
```

- `OutboxProducer implements IProducer` inserts a row using the current transaction (a unit-of-work or `EntityManager` passed through the request scope).
- The relay (a `@nestjs/schedule` interval or a dedicated worker) selects unpublished rows with `for update skip locked`, publishes them through the real broker adapter, and sets `published_at`. On failure it increments `attempts`, stores `last_error`, and backs off. After a maximum number of attempts, it alerts instead of retrying forever.
- Old published rows are purged by a cron job.

## Kafka adapter (kafkajs)

```ts
// packages/infrastructure/messaging/src/kafka/kafka.producer.ts
import { Injectable, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { Kafka, type Producer } from "kafkajs";
import { randomUUID } from "node:crypto";
import type { IProducer, PublishOptions } from "@org/application";
import type { MessageEnvelope } from "@org/contracts-shared";
import { ConfigurationService } from "@org/configuration";

@Injectable()
export class KafkaProducer implements IProducer, OnModuleInit, OnModuleDestroy {
  private readonly producer: Producer;

  constructor(private readonly config: ConfigurationService) {
    const kafka = new Kafka({
      clientId: config.serviceName,
      brokers: config.kafkaBrokers,
      retry: { initialRetryTime: 300, retries: 8 },
    });
    this.producer = kafka.producer({ idempotent: true, maxInFlightRequests: 1 });
  }

  onModuleInit() {
    return this.producer.connect();
  }

  onModuleDestroy() {
    return this.producer.disconnect();
  }

  async publish<TPayload>(topic: string, options: PublishOptions<TPayload>): Promise<void> {
    const envelope: MessageEnvelope<TPayload> = {
      messageId: randomUUID(),
      messageType: topic,
      version: options.version ?? 1,
      occurredAt: new Date().toISOString(),
      correlationId: options.correlationId,
      causationId: options.causationId ?? null,
      source: this.config.serviceName,
      payload: options.payload,
    };
    await this.producer.send({
      topic,
      messages: [{
        key: options.key,
        value: JSON.stringify(envelope),
        headers: { "correlation-id": options.correlationId, "message-type": topic },
      }],
    });
  }
}
```

The consumer uses `kafka.consumer({ groupId: queueFor(serviceName, topic) })`, commits offsets only after the handler succeeded, and on shutdown calls `consumer.disconnect()` so in-flight messages finish first. Retries use a retry topic with a delay or in-process backoff, then publish to `<group>.dlq` with the error in headers.

## RabbitMQ adapter (amqplib)

- One **topic exchange** per producing context (`billing`), with routing keys equal to the message type (`billing.invoice.paid`).
- Each consuming service declares a durable queue `queueFor(service, topic)` bound to the exchange, with `x-dead-letter-exchange` pointing to a DLX that routes to `<queue>.dlq`.
- Use publisher confirms (`createConfirmChannel`), persistent messages (`deliveryMode: 2`), and `messageId`/`correlationId` properties set from the envelope.
- Consumers use `prefetch(n)` and `ack` after the handler succeeds. On failure, `nack(message, false, false)` sends the message to the DLX. Delayed retries use a retry queue with `x-message-ttl` that dead-letters back to the main exchange, with the attempt count in a header.
- Reconnect with exponential backoff on `close`/`error` events, never by recursion, and re-declare the topology after reconnecting.

## Idempotent consumer and handler registry (consumer app)

```ts
// apps/action-log-service/src/messaging/message-registry.ts
import type { MessageEnvelope } from "@org/contracts-shared";
import { BILLING_TOPICS, InvoicePaidV1 } from "@org/contracts-billing";
import { RecordActionCommand } from "@org/application";
import type { ZodType } from "zod";

export interface RegisteredMessage {
  readonly schema: ZodType;
  readonly toCommand: (message: MessageEnvelope<unknown>) => object;
}

/** messageType -> "v<version>" -> how to validate and dispatch it. */
export const MESSAGE_REGISTRY: Record<string, Record<string, RegisteredMessage>> = {
  [BILLING_TOPICS.invoicePaid]: {
    v1: {
      schema: InvoicePaidV1,
      toCommand: (message) =>
        new RecordActionCommand("invoice-paid", (message.payload as InvoicePaidV1).customerId, message.correlationId),
    },
  },
};
```

```ts
// apps/action-log-service/src/messaging/dispatch-message.ts
import type { MessageEnvelope } from "@org/contracts-shared";
import type { IBus, IProcessedMessages, ILogger } from "@org/application";
import { MESSAGE_REGISTRY } from "./message-registry";

export async function dispatchMessage(
  message: MessageEnvelope<unknown>,
  deps: { bus: IBus; processed: IProcessedMessages; logger: ILogger },
): Promise<void> {
  if (await deps.processed.has(message.messageId)) return; // duplicate delivery

  const entry = MESSAGE_REGISTRY[message.messageType]?.[`v${message.version}`];
  if (!entry) throw new Error(`No handler for ${message.messageType} v${message.version}`); // -> retry, then DLQ

  const parsed = entry.schema.safeParse(message.payload);
  if (!parsed.success) throw new Error(`Invalid ${message.messageType} payload: ${parsed.error.message}`); // -> DLQ

  // keep the command instance: @nestjs/cqrs finds the handler by its class
  const result = await deps.bus.execute(entry.toCommand({ ...message, payload: parsed.data }));
  if (!result.ok) deps.logger.warn("message rejected by domain", { messageId: message.messageId, code: result.error.code });

  await deps.processed.add(message.messageId);
}
```

- `IProcessedMessages` is a port backed by a `processed_messages(message_id primary key, processed_at)` table. Write it in the same transaction as the handler's changes when possible.
- A domain rejection (`Result` failure) is a business outcome. It is logged and acknowledged, not retried.
- An exception (infrastructure failure, invalid payload, unknown version) is retried with backoff and then dead-lettered.

## Correlation and observability

- An HTTP middleware reads `x-correlation-id` or creates one, stores it in `AsyncLocalStorage`, and the logger adds it to every line.
- Producers copy it into the envelope and headers. Consumers restore it into `AsyncLocalStorage` before dispatching.
- Health checks (`@nestjs/terminus`) report broker connectivity. Metrics report consumer lag (Kafka) or queue depth (RabbitMQ) and DLQ depth, with alerts on sustained growth.

## Local and test setup

- `infra/docker-compose.yml` runs the broker (Kafka in KRaft mode, or RabbitMQ with the management plugin) bound to `127.0.0.1`.
- Integration tests start the real broker with Testcontainers (`@testcontainers/kafka` or `@testcontainers/rabbitmq`), publish through the adapter, and assert on consumption, retry and DLQ behaviour.
- A contract test per message type checks that a v1 payload produced by the producer's code validates against the consumer's registered schema.
