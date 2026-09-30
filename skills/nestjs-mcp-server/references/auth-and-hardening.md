# Entry points, auth, logging and configuration

## Configuration

```ts
// packages/shared/src/infrastructure/configuration/env.ts
import * as z from 'zod/v4';

const csv = z
  .string()
  .default('')
  .transform((value) => value.split(',').map((item) => item.trim()).filter(Boolean));

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  MCP_HOST: z.string().default('127.0.0.1'),
  MCP_PORT: z.coerce.number().int().positive().default(3001),
  MCP_PUBLIC_URL: z.url().default('http://127.0.0.1:3001/mcp'),
  MCP_ALLOWED_HOSTS: csv,
  MCP_ALLOWED_ORIGINS: csv,
  MCP_REQUIRED_SCOPES: z
    .string()
    .default('mcp:tools')
    .transform((value) => value.split(',').map((item) => item.trim()).filter(Boolean))
    .pipe(z.array(z.string()).min(1)),
  MCP_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(120),
  OAUTH_ISSUER: z.url().optional(),
  MCP_STDIO_API_KEY: z.string().min(32).optional(),
  DATABASE_URL: z.url(),
  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.coerce.number().int().positive().default(6379),
  OTEL_ENABLED: z.stringbool().default(false),
  OTEL_SERVICE_NAME: z.string().default('acme-mcp'),
  OTEL_EXPORTER_OTLP_ENDPOINT: z.url().default('http://localhost:4318'),
});

export type AppEnvironment = z.infer<typeof envSchema>;

export function loadEnvironment(source: NodeJS.ProcessEnv = process.env): AppEnvironment {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    throw new Error(`Invalid environment:\n${z.prettifyError(parsed.error)}`);
  }
  return parsed.data;
}
```

```dotenv
# .env.example - copy to .env (untracked) and fill in real values
NODE_ENV=development
LOG_LEVEL=info

# MCP HTTP server. Keep 127.0.0.1 unless it runs behind a proxy; then set MCP_ALLOWED_HOSTS.
MCP_HOST=127.0.0.1
MCP_PORT=3001
# The public URL clients use. Tokens must be minted for exactly this resource.
MCP_PUBLIC_URL=http://127.0.0.1:3001/mcp
# Comma-separated hostnames accepted in the Host header when not bound to localhost.
MCP_ALLOWED_HOSTS=
# Comma-separated origins for browser-based clients. Empty rejects cross-origin browsers.
MCP_ALLOWED_ORIGINS=
# Scopes every token must carry.
MCP_REQUIRED_SCOPES=mcp:tools
MCP_RATE_LIMIT_PER_MINUTE=120

# OAuth 2.1 authorization server (Keycloak, Auth0, Entra ID, WorkOS, ...).
OAUTH_ISSUER=https://auth.example.com/realms/acme

# Local stdio only: an API key for a service account. At least 32 characters.
MCP_STDIO_API_KEY=replace-with-a-long-random-local-key-000000

DATABASE_URL=postgresql://acme:acme@localhost:5432/acme
REDIS_HOST=localhost
REDIS_PORT=6379

OTEL_ENABLED=false
OTEL_SERVICE_NAME=acme-mcp
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
```

## Logger

```ts
// packages/shared/src/infrastructure/observability/logging.ts
import pino, { type DestinationStream, type Logger } from 'pino';

const SENSITIVE_PATHS = ['req.headers.authorization', 'req.headers["x-api-key"]', 'req.headers.cookie', '*.token', '*.password'];

export function createLogger(name: string, level: string, destination?: DestinationStream): Logger {
  return pino({ name, level, redact: { paths: SENSITIVE_PATHS, censor: '[REDACTED]' } }, destination);
}
```

The level comes from `loadEnvironment()`, not from `process.env` inside the logger.

## JWT verifier (OAuth resource server)

```ts
// apps/mcp/src/http/jwt-verifier.ts
import type { OAuthTokenVerifier } from '@modelcontextprotocol/express';
import { OAuthError, OAuthErrorCode, type AuthInfo } from '@modelcontextprotocol/server';
import { createRemoteJWKSet, jwtVerify } from 'jose';

export interface JwtVerifierOptions {
  readonly issuer: string;
  readonly jwksUri: string;
  /** This server's public MCP URL. Tokens minted for any other resource are rejected. */
  readonly resource: string;
}

export function createJwtVerifier({ issuer, jwksUri, resource }: JwtVerifierOptions): OAuthTokenVerifier {
  const jwks = createRemoteJWKSet(new URL(jwksUri));
  return {
    async verifyAccessToken(token: string): Promise<AuthInfo> {
      try {
        const { payload } = await jwtVerify(token, jwks, { issuer, audience: resource, requiredClaims: ['exp', 'sub'] });
        const scope = typeof payload['scope'] === 'string' ? payload['scope'] : '';
        return {
          token,
          clientId: String(payload['azp'] ?? payload['client_id'] ?? payload.sub),
          scopes: scope.split(' ').filter(Boolean),
          expiresAt: payload.exp,
          resource: new URL(resource),
          extra: { subject: payload.sub },
        };
      } catch {
        throw new OAuthError(OAuthErrorCode.InvalidToken, 'Invalid or expired access token');
      }
    },
  };
}
```

- The authorization server must put this server's URL in `aud` (RFC 8707 resource indicators). If yours cannot, compare a dedicated claim instead; never skip the audience check, or a token for any other API works here.
- `requireBearerAuth` rejects tokens with no `expiresAt` or a past one, and returns 403 `insufficient_scope` when `requiredScopes` are missing.
- Map scopes to the actor in `actorFromScopes` (see [server-and-tools.md](server-and-tools.md)). Fine-grained permissions stay in application policies.

## HTTP entry point

```ts
// apps/mcp/src/main.ts
import 'reflect-metadata';
import {
  createMcpExpressApp,
  getOAuthProtectedResourceMetadataUrl,
  mcpAuthMetadataRouter,
  requireBearerAuth,
} from '@modelcontextprotocol/express';
import { toNodeHandler } from '@modelcontextprotocol/node';
import { createMcpHandler, type OAuthMetadata } from '@modelcontextprotocol/server';
import { rateLimit } from 'express-rate-limit';
import { pinoHttp } from 'pino-http';
import { createLogger } from '@acme/shared/infrastructure/observability';
import { actorFromScopes, bootstrapMcp } from './bootstrap.js';
import { createJwtVerifier } from './http/jwt-verifier.js';
import { buildMcpServer } from './server/mcp-server.factory.js';

const boot = await bootstrapMcp();
const { env } = boot;
const logger = createLogger('mcp', env.LOG_LEVEL);
const publicUrl = new URL(env.MCP_PUBLIC_URL);
if (!env.OAUTH_ISSUER) throw new Error('OAUTH_ISSUER is required for the HTTP server');

const discovery = await fetch(new URL('.well-known/oauth-authorization-server', `${env.OAUTH_ISSUER.replace(/\/$/, '')}/`));
if (!discovery.ok) throw new Error(`OAuth discovery failed: ${discovery.status}`);
const oauthMetadata = (await discovery.json()) as OAuthMetadata & { jwks_uri: string };

const verifier = createJwtVerifier({ issuer: oauthMetadata.issuer, jwksUri: oauthMetadata.jwks_uri, resource: publicUrl.href });

const handler = createMcpHandler(({ authInfo }) => {
  const subject = String(authInfo?.extra?.['subject'] ?? authInfo?.clientId);
  return buildMcpServer(boot.dependencies, actorFromScopes(subject, authInfo?.scopes ?? []), logger);
});
const nodeHandler = toNodeHandler(handler);

const app = createMcpExpressApp({
  host: env.MCP_HOST,
  ...(env.MCP_ALLOWED_HOSTS.length > 0 ? { allowedHosts: env.MCP_ALLOWED_HOSTS } : {}),
  ...(env.MCP_ALLOWED_ORIGINS.length > 0 ? { allowedOrigins: env.MCP_ALLOWED_ORIGINS } : {}),
  jsonLimit: '1mb',
});

app.use(pinoHttp({ logger }));
app.use(
  mcpAuthMetadataRouter({
    oauthMetadata,
    resourceServerUrl: publicUrl,
    scopesSupported: env.MCP_REQUIRED_SCOPES,
    resourceName: 'Acme support desk',
  }),
);
app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

const limiter = rateLimit({
  windowMs: 60_000,
  limit: env.MCP_RATE_LIMIT_PER_MINUTE,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
});
const auth = requireBearerAuth({
  verifier,
  requiredScopes: env.MCP_REQUIRED_SCOPES,
  resourceMetadataUrl: getOAuthProtectedResourceMetadataUrl(publicUrl),
});

app.all('/mcp', limiter, auth, (req, res) => {
  void nodeHandler(req, res, (req as typeof req & { body?: unknown }).body);
});

const server = app.listen(env.MCP_PORT, env.MCP_HOST, () => {
  logger.info({ host: env.MCP_HOST, port: env.MCP_PORT }, 'MCP HTTP server listening');
});

function shutdown(): void {
  server.close(() => {
    void boot.close().finally(() => process.exit(0));
  });
}

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
```

- Some authorization servers publish only OpenID discovery (`/.well-known/openid-configuration`). Fetch that instead; the fields used here are the same.
- Behind a reverse proxy, set `app.set('trust proxy', 1)` so the rate limiter sees client IPs, and set `MCP_ALLOWED_HOSTS` to the public hostname.
- `createMcpExpressApp` bound to `127.0.0.1` or `localhost` applies Host and Origin validation automatically. Bound to `0.0.0.0` with no `allowedHosts`, it applies none; treat that as a bug.

## stdio entry point

```ts
// apps/mcp/src/stdio.ts
import 'reflect-metadata';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import pino from 'pino';
import { createLogger } from '@acme/shared/infrastructure/observability';
import { bootstrapMcp } from './bootstrap.js';
import { buildMcpServer } from './server/mcp-server.factory.js';

const boot = await bootstrapMcp();
const logger = createLogger('mcp-stdio', boot.env.LOG_LEVEL, pino.destination(2));

if (!boot.env.MCP_STDIO_API_KEY) {
  logger.fatal('MCP_STDIO_API_KEY is required for the stdio server');
  process.exit(1);
}

const actor = await boot.authenticateApiKey.execute(boot.env.MCP_STDIO_API_KEY);
const handle = serveStdio(() => buildMcpServer(boot.dependencies, actor, logger));
logger.info({ actor: actor.id }, 'MCP stdio server ready');

function shutdown(): void {
  void handle.close().then(boot.close).finally(() => process.exit(0));
}

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
```

- `pino.destination(2)` is stderr. Anything written to stdout that is not a JSON-RPC message breaks the client.
- Nest runs with `logger: false` (in `bootstrapMcp`) for the same reason. Prisma's query logging must also go to the pino logger, not stdout.
- The API key identifies a service account with its own role. Rotate it like any secret; it lives in the client's config on the user's machine.

## OpenTelemetry preload

```ts
// apps/mcp/src/instrumentation.ts
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { loadEnvironment } from '@acme/shared/infrastructure';

const env = loadEnvironment();

if (env.OTEL_ENABLED) {
  const sdk = new NodeSDK({
    serviceName: env.OTEL_SERVICE_NAME,
    traceExporter: new OTLPTraceExporter({ url: `${env.OTEL_EXPORTER_OTLP_ENDPOINT}/v1/traces` }),
    instrumentations: [getNodeAutoInstrumentations({ '@opentelemetry/instrumentation-fs': { enabled: false } })],
  });
  sdk.start();
  process.once('SIGTERM', () => void sdk.shutdown());
}
```

Start with `node --import ./dist/instrumentation.js dist/main.js` so HTTP, Express, Prisma and ioredis are patched before they load. On stdio, keep the OTel diagnostic logger off or pointed at stderr.
