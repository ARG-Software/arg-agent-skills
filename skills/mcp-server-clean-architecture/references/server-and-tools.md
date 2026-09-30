# Server factory, tools, resources and prompts

The examples follow a support desk: customers, tickets and a knowledge base. Package names use `@acme/*`; replace them with the workspace scope.

NestJS is the worked example for composition. Everything from "Server info" onward is framework-neutral, and [Composition without NestJS](#composition-without-nestjs) shows the same bootstrap with plain constructors.

## Use case (application layer, shared by REST and MCP)

```ts
// packages/tickets/src/application/use-cases/assign-ticket.use-case.ts
import { assertCan, type Actor } from '@acme/auth/application';
import { ConflictError, NotFoundError, type ClockPort } from '@acme/shared/application';
import { TicketAlreadyResolvedError } from '../../domain/errors/ticket.errors.js';
import type { TicketRepository } from '../../domain/repositories/ticket.repository.js';
import { toTicketResult, type TicketResult } from '../results/ticket.result.js';

export interface AssignTicketInput {
  readonly actor: Actor;
  readonly ticketId: string;
  readonly assignee: string;
}

export class AssignTicketUseCase {
  constructor(
    private readonly tickets: TicketRepository,
    private readonly clock: ClockPort,
  ) {}

  async execute(input: AssignTicketInput): Promise<TicketResult> {
    assertCan(input.actor, 'tickets:update');
    const ticket = await this.tickets.findById(input.ticketId);
    if (!ticket) throw new NotFoundError(`Ticket ${input.ticketId} was not found`);
    try {
      ticket.assignTo(input.assignee, this.clock.now());
    } catch (error) {
      if (error instanceof TicketAlreadyResolvedError) throw new ConflictError(error.message);
      throw error;
    }
    await this.tickets.save(ticket);
    return toTicketResult(ticket);
  }
}
```

```ts
// packages/shared/src/application/errors/application-error.ts
export type ApplicationErrorCode = 'NOT_FOUND' | 'UNAUTHORIZED' | 'FORBIDDEN' | 'CONFLICT' | 'VALIDATION';

export abstract class ApplicationError extends Error {
  abstract readonly code: ApplicationErrorCode;

  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class NotFoundError extends ApplicationError {
  readonly code = 'NOT_FOUND' as const;
}

export class ForbiddenError extends ApplicationError {
  readonly code = 'FORBIDDEN' as const;
}

export class ConflictError extends ApplicationError {
  readonly code = 'CONFLICT' as const;
}
```

The REST controller maps the same codes to 404/403/409; the MCP adapter maps them to `isError` results.

## Composition with NestJS (infrastructure layer)

```ts
// packages/tickets/src/infrastructure/dependency-injection/nest/tickets.module.ts
import { Module } from '@nestjs/common';
import { CLOCK_PORT, type ClockPort } from '@acme/shared/application';
import { SharedInfrastructureModule } from '@acme/shared/infrastructure';
import { AssignTicketUseCase, GetTicketUseCase } from '@acme/tickets/application';
import { TICKET_REPOSITORY, type TicketRepository } from '@acme/tickets/domain';
import { PrismaTicketRepository } from '../../persistence/prisma/repositories/prisma-ticket.repository.js';

@Module({
  imports: [SharedInfrastructureModule],
  providers: [
    { provide: TICKET_REPOSITORY, useClass: PrismaTicketRepository },
    {
      provide: GetTicketUseCase,
      useFactory: (tickets: TicketRepository) => new GetTicketUseCase(tickets),
      inject: [TICKET_REPOSITORY],
    },
    {
      provide: AssignTicketUseCase,
      useFactory: (tickets: TicketRepository, clock: ClockPort) => new AssignTicketUseCase(tickets, clock),
      inject: [TICKET_REPOSITORY, CLOCK_PORT],
    },
  ],
  exports: [GetTicketUseCase, AssignTicketUseCase],
})
export class TicketsModule {}
```

## Bootstrap (apps/mcp)

```ts
// apps/mcp/src/bootstrap.ts
import { NestFactory } from '@nestjs/core';
import { AuthenticateApiKeyUseCase } from '@acme/auth/application';
import type { Actor } from '@acme/auth/domain';
import { SearchKnowledgeBaseUseCase, GetArticleUseCase } from '@acme/knowledge/application';
import { loadEnvironment, type AppEnvironment } from '@acme/shared/infrastructure';
import { AssignTicketUseCase, GetTicketUseCase, ListTicketsUseCase } from '@acme/tickets/application';
import { McpAppModule } from './app.module.js';
import type { McpDependencies } from './server/mcp-server.factory.js';

export interface McpBootstrap {
  readonly env: AppEnvironment;
  readonly authenticateApiKey: AuthenticateApiKeyUseCase;
  readonly dependencies: McpDependencies;
  readonly close: () => Promise<void>;
}

export async function bootstrapMcp(): Promise<McpBootstrap> {
  const env = loadEnvironment();
  const app = await NestFactory.createApplicationContext(McpAppModule, { logger: false });
  return {
    env,
    authenticateApiKey: app.get(AuthenticateApiKeyUseCase),
    dependencies: {
      listTickets: app.get(ListTicketsUseCase),
      getTicket: app.get(GetTicketUseCase),
      assignTicket: app.get(AssignTicketUseCase),
      searchKnowledgeBase: app.get(SearchKnowledgeBaseUseCase),
      getArticle: app.get(GetArticleUseCase),
    },
    close: () => app.close(),
  };
}

/** Maps verified token scopes to the application's actor. Unknown scopes grant nothing. */
export function actorFromScopes(subject: string, scopes: readonly string[]): Actor {
  return { id: subject, role: scopes.includes('support:admin') ? 'ADMIN' : 'AGENT' };
}
```

`McpAppModule` imports only the feature modules the MCP app exposes. It never lists Prisma or BullMQ providers itself; those come from the feature modules.

## Composition without NestJS

An Express, Fastify or Hono back end usually already has a composition root that builds its use cases. Reuse it; the MCP app must not build a second, different graph.

```ts
// src/bootstrap/container.ts (shared by the REST app and the MCP app)
import { PrismaClient } from '@prisma/client';
import { AssignTicketUseCase, GetTicketUseCase, ListTicketsUseCase } from '../application/tickets/index.js';
import { SystemClock } from '../infrastructure/clock/system-clock.js';
import { PrismaTicketRepository } from '../infrastructure/persistence/prisma-ticket.repository.js';
import type { AppEnvironment } from '../infrastructure/configuration/env.js';

export function createContainer(env: AppEnvironment) {
  const prisma = new PrismaClient({ datasourceUrl: env.DATABASE_URL });
  const tickets = new PrismaTicketRepository(prisma);
  const clock = new SystemClock();
  return {
    useCases: {
      listTickets: new ListTicketsUseCase(tickets),
      getTicket: new GetTicketUseCase(tickets),
      assignTicket: new AssignTicketUseCase(tickets, clock),
    },
    close: () => prisma.$disconnect(),
  };
}
```

`bootstrapMcp()` then calls `createContainer(loadEnvironment())` and picks the use cases into `McpDependencies`. In a single-package app, the MCP adapter lives in `src/presentation/mcp/` (or `src/adapters/mcp/`) beside the REST controllers, and the architecture rules name those folders instead of `apps/mcp`.

## Server info from package.json

```ts
// apps/mcp/src/server/server-info.ts
import { readFileSync } from 'node:fs';

const manifest = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as {
  readonly name: string;
  readonly version: string;
};

export const SERVER_INFO = { name: manifest.name, version: manifest.version } as const;
```

Adjust the relative URL to where the bundler puts `dist/` (with tsup and a single `dist/` folder, `../package.json`). A unit test asserts `SERVER_INFO.version` equals the `package.json` version, so a wrong path fails CI instead of shipping `undefined`.

## Result mapping

```ts
// apps/mcp/src/server/mcp-result.ts
import type { CallToolResult } from '@modelcontextprotocol/server';
import { ApplicationError } from '@acme/shared/application';

export interface ToolLogger {
  error(details: object, message: string): void;
}

export function toolResult<T extends Record<string, unknown>>(structured: T, summary: string): CallToolResult {
  return { content: [{ type: 'text', text: summary }], structuredContent: structured };
}

export function toolError(error: unknown, logger: ToolLogger, tool: string): CallToolResult {
  if (error instanceof ApplicationError) {
    return {
      isError: true,
      content: [{ type: 'text', text: JSON.stringify({ error: error.code, message: error.message }) }],
    };
  }
  logger.error({ err: error, tool }, 'tool failed');
  return {
    isError: true,
    content: [{ type: 'text', text: JSON.stringify({ error: 'INTERNAL_ERROR', message: 'The tool failed. Try again later.' }) }],
  };
}

export async function runTool<T extends Record<string, unknown>>(
  tool: string,
  logger: ToolLogger,
  operation: () => Promise<T>,
  summarize: (value: T) => string,
): Promise<CallToolResult> {
  try {
    const value = await operation();
    return toolResult(value, summarize(value));
  } catch (error) {
    return toolError(error, logger, tool);
  }
}
```

- `ApplicationError` messages are written for callers: no ids of other tenants, no SQL, no stack.
- Validation errors from the input schema are produced by the SDK before the handler runs; do not re-validate in the handler.

## Server factory

```ts
// apps/mcp/src/server/mcp-server.factory.ts
import { McpServer } from '@modelcontextprotocol/server';
import type { Actor } from '@acme/auth/domain';
import type { GetArticleUseCase, SearchKnowledgeBaseUseCase } from '@acme/knowledge/application';
import type { AssignTicketUseCase, GetTicketUseCase, ListTicketsUseCase } from '@acme/tickets/application';
import type { ToolLogger } from './mcp-result.js';
import { registerKnowledgeResources } from './resources/knowledge.resources.js';
import { registerTriagePrompt } from './prompts/triage.prompt.js';
import { SERVER_INFO } from './server-info.js';
import { registerTicketTools } from './tools/tickets.tools.js';

export interface McpDependencies {
  readonly listTickets: ListTicketsUseCase;
  readonly getTicket: GetTicketUseCase;
  readonly assignTicket: AssignTicketUseCase;
  readonly searchKnowledgeBase: SearchKnowledgeBaseUseCase;
  readonly getArticle: GetArticleUseCase;
}

export interface ToolContext {
  readonly deps: McpDependencies;
  readonly actor: Actor;
  readonly logger: ToolLogger;
}

export function buildMcpServer(deps: McpDependencies, actor: Actor, logger: ToolLogger): McpServer {
  const server = new McpServer(SERVER_INFO);
  const context: ToolContext = { deps, actor, logger };
  registerTicketTools(server, context);
  registerKnowledgeResources(server, context);
  registerTriagePrompt(server);
  return server;
}
```

## Tools

```ts
// apps/mcp/src/server/tools/tickets.tools.ts
import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { ticketPriorities, ticketStatuses } from '@acme/tickets/domain';
import { runTool } from '../mcp-result.js';
import type { ToolContext } from '../mcp-server.factory.js';

const ticketShape = z.object({
  id: z.uuid(),
  subject: z.string(),
  status: z.enum(ticketStatuses),
  priority: z.enum(ticketPriorities),
  assignee: z.email().nullable(),
  customerId: z.uuid(),
  updatedAt: z.iso.datetime(),
});

export function registerTicketTools(server: McpServer, { deps, actor, logger }: ToolContext): void {
  server.registerTool(
    'list_tickets',
    {
      title: 'List tickets',
      description:
        'List support tickets, newest first unless order is "oldest". Use the filters to find, for example, unresolved high-priority tickets for one customer. Returns at most pageSize tickets and the total count.',
      inputSchema: z.object({
        status: z.enum(ticketStatuses).optional(),
        unresolved: z.boolean().optional().describe('true to exclude resolved and closed tickets'),
        priority: z.enum(ticketPriorities).optional(),
        customerId: z.uuid().optional(),
        assignedTo: z.email().optional(),
        order: z.enum(['oldest', 'newest']).default('newest'),
        page: z.number().int().positive().default(1),
        pageSize: z.number().int().positive().max(100).default(20),
      }),
      outputSchema: z.object({ items: z.array(ticketShape), total: z.number().int(), page: z.number().int() }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    (input) =>
      runTool(
        'list_tickets',
        logger,
        () => deps.listTickets.execute({ actor, ...input }),
        (result) => `${result.items.length} of ${result.total} tickets`,
      ),
  );

  server.registerTool(
    'assign_ticket',
    {
      title: 'Assign ticket',
      description: 'Assign an open ticket to a support agent by email. Fails with CONFLICT when the ticket is already resolved.',
      inputSchema: z.object({ ticketId: z.uuid(), assignee: z.email() }),
      outputSchema: ticketShape,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    (input) =>
      runTool(
        'assign_ticket',
        logger,
        () => deps.assignTicket.execute({ actor, ticketId: input.ticketId, assignee: input.assignee }),
        (ticket) => `Ticket ${ticket.id} assigned to ${ticket.assignee}`,
      ),
  );
}
```

- The use-case result type must match the output schema. When it does not, map it in the adapter (`toTicketOutput(result)`), never by changing the use case to suit MCP.
- A delete or irreversible tool (`close_account`) sets `destructiveHint: true`, says "This cannot be undone" in the description, and requires an explicit confirmation field only if the product wants it; the client already asks the user based on the hint.
- Long lists: page with bounded `pageSize`. Large text: return a summary plus a resource link instead of megabytes of text.

## Resources

```ts
// apps/mcp/src/server/resources/knowledge.resources.ts
import { ResourceTemplate, type McpServer } from '@modelcontextprotocol/server';
import type { ToolContext } from '../mcp-server.factory.js';

export function registerKnowledgeResources(server: McpServer, { deps, actor }: ToolContext): void {
  server.registerResource(
    'knowledge_article',
    new ResourceTemplate('kb://articles/{slug}', { list: undefined }),
    { title: 'Knowledge base article', description: 'One published help-centre article as Markdown.', mimeType: 'text/markdown' },
    async (uri, { slug }) => {
      const article = await deps.getArticle.execute({ actor, slug: String(slug) });
      return { contents: [{ uri: uri.href, mimeType: 'text/markdown', text: article.body }] };
    },
  );
}
```

A resource read that throws an `ApplicationError` surfaces as a protocol error. Keep resources for data the actor may read; authorization still happens in the use case.

## Prompts

```ts
// apps/mcp/src/server/prompts/triage.prompt.ts
import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';

export function registerTriagePrompt(server: McpServer): void {
  server.registerPrompt(
    'triage_ticket',
    {
      title: 'Triage a ticket',
      description: 'Review one ticket, search the knowledge base, and propose priority, assignee and a reply.',
      argsSchema: z.object({ ticketId: z.uuid() }),
    },
    ({ ticketId }) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Call get_ticket for ${ticketId}, then search_knowledge_base with its subject. Propose a priority, an assignee and a short reply. Do not call assign_ticket until I confirm.`,
          },
        },
      ],
    }),
  );
}
```

Prompts only describe a workflow over existing tools. They never embed business rules the use cases do not enforce.
