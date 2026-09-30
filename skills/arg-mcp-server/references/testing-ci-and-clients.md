# Architecture checks, tests, CI, Docker, clients and releases

## Architecture check script

It adapts the base import-scanning helper ([arg-base.md](arg-base.md) section 4) to a workspace with `packages/<feature>/src/<layer>` and `apps/<app>`. It reads every import form, not only lines that start with `import `.

```ts
// scripts/check-architecture.ts
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SCOPE = '@acme';
const FRAMEWORKS = [/^@nestjs\//, /^@prisma\//, /^@modelcontextprotocol\//, /^bullmq$/, /^(io)?redis$/, /^express$/, /^pino/];
const DATA_ACCESS = [/^@prisma\//, /^bullmq$/, /^(io)?redis$/];
const MCP_SDK = [/^@modelcontextprotocol\//];

function filesUnder(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === 'node_modules' || name === 'dist' ? [] : filesUnder(path);
    return /\.(ts|tsx|mts)$/.test(name) && !/\.spec\.ts$/.test(name) ? [path.replace(/\\/g, '/')] : [];
  });
}

function stripComments(code: string): string {
  return code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:\\'"])\/\/[^\n]*$/gm, '$1');
}

function importSpecifiers(code: string): string[] {
  const patterns = [
    /\bfrom\s+["']([^"']+)["']/g,
    /\bimport\s+["']([^"']+)["']/g,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
    /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g,
  ];
  const source = stripComments(code);
  return patterns.flatMap((pattern) => [...source.matchAll(pattern)].map((match) => match[1] ?? ''));
}

const packages = readdirSync('packages');
const layerFiles = (layer: string) => packages.flatMap((pkg) => filesUnder(`packages/${pkg}/src/${layer}`));

type Rule = { name: string; files: string[]; forbidden: (specifier: string, file: string) => boolean };

const featureOf = (file: string) => /^packages\/([^/]+)\//.exec(file)?.[1];
const otherFeature = (allowed: string[]) => (specifier: string, file: string) => {
  const target = new RegExp(`^${SCOPE}/([^/]+)`).exec(specifier)?.[1];
  return target !== undefined && target !== featureOf(file) && !allowed.includes(target);
};

const rules: Rule[] = [
  { name: 'domain imports no framework, SDK, ORM or queue', files: layerFiles('domain'), forbidden: (s) => FRAMEWORKS.some((p) => p.test(s)) },
  { name: 'domain imports only its own feature and shared', files: layerFiles('domain'), forbidden: otherFeature(['shared']) },
  { name: 'application imports no framework, SDK, ORM or queue', files: layerFiles('application'), forbidden: (s) => FRAMEWORKS.some((p) => p.test(s)) },
  { name: 'application imports no infrastructure', files: layerFiles('application'), forbidden: (s) => /\/infrastructure(\/|$)/.test(s) },
  { name: 'application imports only its own feature, shared and auth', files: layerFiles('application'), forbidden: otherFeature(['shared', 'auth']) },
  { name: 'infrastructure never imports the MCP SDK', files: layerFiles('infrastructure'), forbidden: (s) => MCP_SDK.some((p) => p.test(s)) },
  { name: 'packages never import apps', files: packages.flatMap((pkg) => filesUnder(`packages/${pkg}/src`)), forbidden: (s) => /(^|\/)apps\//.test(s) },
  { name: 'apps/mcp never imports Prisma, BullMQ or Redis', files: filesUnder('apps/mcp/src'), forbidden: (s) => DATA_ACCESS.some((p) => p.test(s)) },
  { name: 'apps/api and apps/worker never import the MCP SDK', files: [...filesUnder('apps/api/src'), ...filesUnder('apps/worker/src')], forbidden: (s) => MCP_SDK.some((p) => p.test(s)) },
  { name: 'apps use package entry points, not internal paths', files: filesUnder('apps'), forbidden: (s) => new RegExp(`^${SCOPE}/[^/]+/src/`).test(s) },
  { name: 'lib imports nothing', files: filesUnder('packages/shared/src/lib'), forbidden: (s) => !s.startsWith('.') },
];

const contentRules: { name: string; files: string[]; pattern: RegExp }[] = [
  {
    name: 'only the configuration module reads process.env',
    files: [...filesUnder('packages'), ...filesUnder('apps')].filter((f) => !f.includes('/infrastructure/configuration/')),
    pattern: /\bprocess\.env\b/,
  },
  { name: 'apps/mcp never writes to stdout with console', files: filesUnder('apps/mcp/src'), pattern: /\bconsole\.(log|info|debug)\s*\(/ },
];

let failed = false;
for (const rule of rules) {
  const hits = rule.files.flatMap((file) =>
    importSpecifiers(readFileSync(file, 'utf8'))
      .filter((specifier) => rule.forbidden(specifier, file))
      .map((specifier) => `  ${file} -> ${specifier}`),
  );
  if (hits.length > 0) {
    failed = true;
    console.error(`FAIL ${rule.name}\n${hits.join('\n')}`);
  }
}
for (const rule of contentRules) {
  const hits = rule.files.filter((file) => rule.pattern.test(stripComments(readFileSync(file, 'utf8'))));
  if (hits.length > 0) {
    failed = true;
    console.error(`FAIL ${rule.name}\n${hits.map((file) => `  ${file}`).join('\n')}`);
  }
}

if (failed) process.exit(1);
console.log(`Architecture checks passed (${rules.length + contentRules.length} rules)`);
```

- Adjust `SCOPE`, the allowed cross-feature list and `FRAMEWORKS` to the repo. If `zod` is used in application for input validation, say so in `AGENTS.md` and leave it off the list.
- Prove each rule once: add a forbidden import in a scratch file, run `pnpm architecture:check`, and see it fail.
- When a new app, package or owned library (a new queue, a payment SDK) arrives, add its rule in the same PR.

## ESLint boundaries (editor feedback)

```js
// eslint.config.js (excerpt)
const frameworks = ['@nestjs/*', '@prisma/*', '@modelcontextprotocol/*', 'bullmq', 'redis', 'ioredis', 'express'];

export default [
  {
    files: ['packages/*/src/domain/**/*.ts', 'packages/*/src/application/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [{ group: frameworks, message: 'Domain and application stay framework-free. Add a port.' }, { group: ['**/infrastructure/**'], message: 'Depend on a port, not an adapter.' }] }],
    },
  },
  {
    files: ['apps/mcp/src/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [{ group: ['@prisma/*', 'bullmq', 'redis', 'ioredis'], message: 'MCP tools call use cases. Data access belongs in infrastructure.' }] }],
      'no-console': 'error',
    },
  },
  {
    files: ['apps/api/src/**/*.ts', 'apps/worker/src/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [{ group: ['@modelcontextprotocol/*'], message: 'Only apps/mcp speaks MCP.' }] }],
    },
  },
];
```

## MCP adapter test (in-memory, no network, no database)

```ts
// apps/mcp/src/server/mcp-server.spec.ts
import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { NotFoundError } from '@acme/shared/application';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildMcpServer, type McpDependencies } from './mcp-server.factory.js';

const ticket = {
  id: '9f1c7a52-4a5e-4f0e-9a51-5b2c3f6d7e80',
  subject: 'Cannot log in',
  status: 'OPEN',
  priority: 'HIGH',
  assignee: 'ana@acme.test',
  customerId: '2b0a7c1e-3d4f-4a6b-8c9d-0e1f2a3b4c5d',
  updatedAt: '2026-09-30T10:00:00.000Z',
};

function fakeDependencies(): McpDependencies {
  return {
    listTickets: { execute: vi.fn().mockResolvedValue({ items: [ticket], total: 1, page: 1 }) },
    getTicket: { execute: vi.fn().mockRejectedValue(new NotFoundError('Ticket x was not found')) },
    assignTicket: { execute: vi.fn().mockResolvedValue(ticket) },
    searchKnowledgeBase: { execute: vi.fn() },
    getArticle: { execute: vi.fn() },
  } as unknown as McpDependencies;
}

describe('MCP server', () => {
  const logger = { error: vi.fn() };
  let client: Client;
  let deps: McpDependencies;

  beforeEach(async () => {
    deps = fakeDependencies();
    const server = buildMcpServer(deps, { id: 'agent-1', role: 'AGENT' }, logger);
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    client = new Client({ name: 'test-client', version: '1.0.0' });
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  });

  afterEach(async () => {
    await client.close();
  });

  it('lists tools with annotations and output schemas', async () => {
    const { tools } = await client.listTools();
    const listTickets = tools.find((tool) => tool.name === 'list_tickets');
    expect(listTickets?.annotations?.readOnlyHint).toBe(true);
    expect(listTickets?.outputSchema).toBeDefined();
    expect(tools.map((tool) => tool.name)).toEqual(expect.arrayContaining(['list_tickets', 'get_ticket', 'assign_ticket']));
  });

  it('passes the actor to the use case and returns structured content', async () => {
    const result = await client.callTool({ name: 'list_tickets', arguments: { unresolved: true, priority: 'HIGH' } });
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toEqual({ items: [ticket], total: 1, page: 1 });
    expect(deps.listTickets.execute).toHaveBeenCalledWith(
      expect.objectContaining({ actor: { id: 'agent-1', role: 'AGENT' }, unresolved: true, priority: 'HIGH', pageSize: 20 }),
    );
  });

  it('maps an application error to an isError result with its code', async () => {
    const result = await client.callTool({ name: 'get_ticket', arguments: { id: ticket.id } });
    expect(result.isError).toBe(true);
    expect(JSON.parse((result.content as [{ text: string }])[0].text)).toEqual({ error: 'NOT_FOUND', message: 'Ticket x was not found' });
  });

  it('rejects invalid input before the use case runs', async () => {
    const result = await client.callTool({ name: 'assign_ticket', arguments: { ticketId: 'not-a-uuid', assignee: 'ana@acme.test' } });
    expect(result.isError).toBe(true);
    expect(deps.assignTicket.execute).not.toHaveBeenCalled();
  });

  it('hides unexpected errors', async () => {
    vi.mocked(deps.assignTicket.execute).mockRejectedValue(new Error('connect ECONNREFUSED 10.0.0.5:5432'));
    const result = await client.callTool({ name: 'assign_ticket', arguments: { ticketId: ticket.id, assignee: 'ana@acme.test' } });
    expect(JSON.stringify(result.content)).not.toContain('10.0.0.5');
    expect(logger.error).toHaveBeenCalled();
  });
});
```

Depending on the SDK version, invalid tool input surfaces either as an `isError` result or as a thrown `InvalidParams` protocol error. Assert whichever the installed version does, and keep the `not.toHaveBeenCalled` assertion either way.

## Cross-protocol test

One database, two adapters, one use case. Run it in the `integration` project with Postgres available.

```ts
// tests/integration/cross-protocol.spec.ts
import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { createApiApp } from '../../apps/api/src/app.factory.js';
import { bootstrapMcp, type McpBootstrap } from '../../apps/mcp/src/bootstrap.js';
import { buildMcpServer } from '../../apps/mcp/src/server/mcp-server.factory.js';
import { seedAgent } from '../support/seed.js';

let api: INestApplication;
let mcp: McpBootstrap;

beforeAll(async () => {
  api = await createApiApp();
  await api.init();
  mcp = await bootstrapMcp();
});

afterAll(async () => {
  await api.close();
  await mcp.close();
});

it('a ticket created over REST reads the same over MCP', async () => {
  const { apiKey, actor, customerId } = await seedAgent();
  const created = await request(api.getHttpServer())
    .post('/tickets')
    .set('x-api-key', apiKey)
    .send({ customerId, subject: 'Refund not received', priority: 'HIGH' })
    .expect(201);

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'cross-protocol', version: '1.0.0' });
  await Promise.all([buildMcpServer(mcp.dependencies, actor, { error: () => {} }).connect(serverTransport), client.connect(clientTransport)]);

  const result = await client.callTool({ name: 'get_ticket', arguments: { id: created.body.id } });
  expect(result.structuredContent).toMatchObject({ id: created.body.id, subject: 'Refund not received', priority: 'HIGH' });
  await client.close();
});
```

## e2e over Streamable HTTP with real tokens

Start a throwaway issuer in the test so tokens are real signed JWTs, then start `main.ts` against it (`OAUTH_ISSUER` pointing at the test issuer).

```ts
// tests/support/test-issuer.ts
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';

export interface TestIssuer {
  readonly issuer: string;
  sign(claims: { sub: string; aud: string; scope: string; expiresIn?: string }): Promise<string>;
  close(): Promise<void>;
}

export async function startTestIssuer(): Promise<TestIssuer> {
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  const jwk = { ...(await exportJWK(publicKey)), kid: 'test', alg: 'RS256', use: 'sig' };
  let issuer = '';
  const server: Server = createServer((req, res) => {
    res.setHeader('content-type', 'application/json');
    if (req.url === '/.well-known/oauth-authorization-server') {
      res.end(JSON.stringify({ issuer, authorization_endpoint: `${issuer}/authorize`, token_endpoint: `${issuer}/token`, jwks_uri: `${issuer}/jwks`, response_types_supported: ['code'] }));
    } else if (req.url === '/jwks') {
      res.end(JSON.stringify({ keys: [jwk] }));
    } else {
      res.statusCode = 404;
      res.end('{}');
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  issuer = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return {
    issuer,
    sign: ({ sub, aud, scope, expiresIn = '5m' }) =>
      new SignJWT({ scope }).setProtectedHeader({ alg: 'RS256', kid: 'test' }).setIssuer(issuer).setSubject(sub).setAudience(aud).setIssuedAt().setExpirationTime(expiresIn).sign(privateKey),
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}
```

```ts
// tests/e2e/mcp-http.spec.ts (excerpt; MCP_URL is the started server's MCP_PUBLIC_URL)
it('answers 401 with a resource-metadata pointer when no token is sent', async () => {
  const response = await fetch(MCP_URL, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' }, body: '{}' });
  expect(response.status).toBe(401);
  expect(response.headers.get('www-authenticate')).toContain('resource_metadata=');
});

it('rejects a token minted for another resource', async () => {
  const token = await issuer.sign({ sub: 'agent-1', aud: 'https://other-api.example.com', scope: 'mcp:tools' });
  const response = await fetch(MCP_URL, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: '{}' });
  expect(response.status).toBe(401);
});

it('rejects a token without the required scope', async () => {
  const token = await issuer.sign({ sub: 'agent-1', aud: MCP_URL, scope: 'profile' });
  const response = await fetch(MCP_URL, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: '{}' });
  expect(response.status).toBe(403);
});

it('serves tools with a valid token', async () => {
  const token = await issuer.sign({ sub: 'agent-1', aud: MCP_URL, scope: 'mcp:tools' });
  const client = new Client({ name: 'e2e', version: '1.0.0' });
  await client.connect(new StreamableHTTPClientTransport(new URL(MCP_URL), { requestInit: { headers: { authorization: `Bearer ${token}` } } }));
  const { tools } = await client.listTools();
  expect(tools.length).toBeGreaterThan(0);
  await client.close();
});
```

Add a check that a request with `Host: evil.example` gets 403 when the server runs with `MCP_ALLOWED_HOSTS` set.

## Vitest projects

```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      { test: { name: 'unit', include: ['packages/**/*.spec.ts', 'apps/**/*.spec.ts'], exclude: ['**/*.integration.spec.ts'] } },
      { test: { name: 'integration', include: ['tests/integration/**/*.spec.ts', '**/*.integration.spec.ts'], hookTimeout: 120_000, testTimeout: 120_000 } },
      { test: { name: 'e2e', include: ['tests/e2e/**/*.spec.ts'], hookTimeout: 120_000, testTimeout: 120_000 } },
    ],
  },
});
```

## MCP Inspector

```bash
pnpm --filter @acme/mcp build
# stdio
npx @modelcontextprotocol/inspector node --env-file=.env apps/mcp/dist/stdio.js
# HTTP: start the server, then connect the Inspector UI to http://127.0.0.1:3001/mcp with a bearer token
npx @modelcontextprotocol/inspector
```

Pin the Inspector version in the README once the team agrees on one; `npx` without a version runs whatever is latest.

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
    timeout-minutes: 25
    services:
      postgres:
        image: postgres:17-alpine
        env:
          POSTGRES_USER: acme
          POSTGRES_PASSWORD: acme
          POSTGRES_DB: acme
        ports: ["5432:5432"]
        options: >-
          --health-cmd "pg_isready -U acme" --health-interval 5s --health-timeout 5s --health-retries 10
      redis:
        image: redis:8-alpine
        ports: ["6379:6379"]
        options: >-
          --health-cmd "redis-cli ping" --health-interval 5s --health-timeout 5s --health-retries 10
    env:
      DATABASE_URL: postgresql://acme:acme@localhost:5432/acme
      REDIS_HOST: localhost
      REDIS_PORT: "6379"
      OAUTH_ISSUER: http://127.0.0.1:9999
      MCP_REQUIRED_SCOPES: mcp:tools
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version-file: package.json
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm prisma:generate
      - run: pnpm architecture:check
      - run: pnpm lint
      - run: pnpm format:check
      - run: pnpm typecheck
      - run: pnpm test:unit
      - run: pnpm db:migrate
      - run: pnpm test:integration
      - run: pnpm test:e2e
      - run: pnpm build
      - run: pnpm audit --audit-level=high
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

- `node-version-file: package.json` reads `engines.node`; `pnpm/action-setup` reads `packageManager`.
- The e2e tests start their own issuer and override `OAUTH_ISSUER` for the server they start; the job-level value only satisfies `loadEnvironment()` for other steps.
- The ruleset requires `verify` and `pr-title` (see `arg-base.md`).

## Dockerfile (one per deployable)

```dockerfile
# apps/mcp/Dockerfile - build from the repo root: docker build -f apps/mcp/Dockerfile .
FROM node:24-alpine AS build
WORKDIR /repo
RUN corepack enable
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/mcp/package.json apps/mcp/
COPY packages/ packages/
RUN pnpm install --frozen-lockfile --filter @acme/mcp...
COPY . .
RUN pnpm prisma:generate && pnpm --filter @acme/mcp build
RUN pnpm --filter @acme/mcp deploy --prod /out

FROM node:24-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /out/package.json ./
COPY --from=build --chown=node:node /out/node_modules ./node_modules
COPY --from=build --chown=node:node /repo/apps/mcp/dist ./dist
USER node
EXPOSE 3001
HEALTHCHECK CMD wget -qO- http://127.0.0.1:3001/health || exit 1
CMD ["node", "--import", "./dist/instrumentation.js", "dist/main.js"]
```

- `pnpm deploy --prod` copies the app with only its production dependencies; without it (or a bundle with no externals) the runtime image starts and immediately fails on the first `import`.
- The Prisma client is generated at build time and must be inside the deployed `node_modules`; check the image with `docker run --rm <image> node -e "import('@prisma/client')"`.
- In a container, set `MCP_HOST=0.0.0.0` **and** `MCP_ALLOWED_HOSTS` to the public hostname.
- Ship stdio as `node dist/stdio.js` from the npm package or a separate image; clients start stdio servers themselves.

## Client configuration (put these in the README)

Claude Code:

```bash
# HTTP (the client runs the OAuth flow; /mcp in Claude Code shows the status)
claude mcp add --transport http acme-support https://mcp.acme.example/mcp
# stdio, local development
claude mcp add acme-support-local --env MCP_STDIO_API_KEY=... -- node /path/to/apps/mcp/dist/stdio.js
```

Claude Desktop (`claude_desktop_config.json`) and Cursor (`.cursor/mcp.json`) use the same shape:

```json
{
  "mcpServers": {
    "acme-support": {
      "command": "node",
      "args": ["/path/to/apps/mcp/dist/stdio.js"],
      "env": { "MCP_STDIO_API_KEY": "replace-me", "DATABASE_URL": "postgresql://..." }
    },
    "acme-support-remote": {
      "url": "https://mcp.acme.example/mcp"
    }
  }
}
```

VS Code / GitHub Copilot (`.vscode/mcp.json`):

```json
{
  "servers": {
    "acme-support": { "type": "http", "url": "https://mcp.acme.example/mcp" }
  }
}
```

Codex (`~/.codex/config.toml`):

```toml
[mcp_servers.acme-support]
command = "node"
args = ["/path/to/apps/mcp/dist/stdio.js"]
env = { MCP_STDIO_API_KEY = "replace-me" }
```

OpenCode (`opencode.json`):

```json
{
  "mcp": {
    "acme-support": { "type": "remote", "url": "https://mcp.acme.example/mcp" }
  }
}
```

Client config formats change; check each client's current docs when you update this section, and never commit a real key in a checked-in config (`.cursor/mcp.json`, `.vscode/mcp.json`).

## Releases

```json
{
  "plugins": ["node-workspace"],
  "packages": {
    "apps/api": { "release-type": "node", "component": "api" },
    "apps/mcp": { "release-type": "node", "component": "mcp" },
    "apps/worker": { "release-type": "node", "component": "worker" }
  }
}
```

- Tags are `api-vX.Y.Z`, `mcp-vX.Y.Z`, `worker-vX.Y.Z`. PR title scopes name the app or package (`feat(mcp): add triage_ticket prompt`).
- The MCP server reports `apps/mcp/package.json`'s version in `initialize`, so clients and logs show the released version.
- Removing or renaming a tool, making an optional input required, or changing an output field incompatibly breaks agents that use it: mark it `feat(mcp)!:` with a `BREAKING CHANGE:` footer.
- The release workflow builds and pushes each app's image tagged with its version when release-please creates that app's release, and never overwrites an existing tag.
