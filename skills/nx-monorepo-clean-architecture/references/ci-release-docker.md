# CI, Docker, environments and releases for an Nx monorepo

## CI (`.github/workflows/ci.yml`)

```yaml
name: CI

on:
  pull_request:
    types: [opened, edited, synchronize, reopened]
  push:
    branches: [main]

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

permissions:
  contents: read

jobs:
  verify:
    name: verify
    runs-on: ubuntu-latest
    timeout-minutes: 30
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version-file: .nvmrc
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - uses: nrwl/nx-set-shas@v4
      - run: pnpm nx run workspace:check-tags
      - run: pnpm nx affected -t lint typecheck test build --parallel=3
      - run: pnpm audit --audit-level=high

  secrets:
    name: secrets
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: gitleaks/gitleaks-action@v2
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}

  pr-title:
    name: pr-title
    if: github.event_name == 'pull_request'
    runs-on: ubuntu-latest
    permissions:
      pull-requests: read
    steps:
      - uses: amannn/action-semantic-pull-request@v5
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

- `pnpm/action-setup` reads the pnpm version from `packageManager` in `package.json`.
- Integration tests with Testcontainers run in the `test` target of the adapter projects. GitHub-hosted Ubuntu runners have Docker, so no service containers are needed.
- Add `secrets` to the ruleset's required checks together with `verify` and `pr-title`. gitleaks needs a license key for organization repos; if the user has none, use `trufflesecurity/trufflehog` instead.
- Enable Nx remote caching only after asking the user, because it sends build artifacts to a third party.

## Dependabot (`.github/dependabot.yml`)

```yaml
version: 2
updates:
  - package-ecosystem: npm
    directory: /
    schedule: { interval: weekly }
    groups:
      nx: { patterns: ["nx", "@nx/*"] }
      nestjs: { patterns: ["@nestjs/*"] }
  - package-ecosystem: github-actions
    directory: /
    schedule: { interval: weekly }
  - package-ecosystem: docker
    directories: ["/apps/*"]
    schedule: { interval: weekly }
```

Upgrade Nx with `pnpm nx migrate latest` on a `chore/nx-migrate` branch, not through Dependabot bumps of single packages. Pin transitive CVE fixes in `pnpm.overrides`, each with a comment naming the advisory, and remove them when the parent package catches up.

## Dockerfile per app (`apps/<app>/Dockerfile`)

Build the app with `generatePackageJson: true` in its build target, so `dist/apps/<app>` contains a pruned `package.json` and lockfile.

```dockerfile
# syntax=docker/dockerfile:1
FROM node:24-alpine AS build
WORKDIR /workspace
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm nx build billing-service --prod

FROM node:24-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
RUN corepack enable
COPY --from=build /workspace/dist/apps/billing-service ./
RUN pnpm install --prod --frozen-lockfile
USER node
EXPOSE 3000
CMD ["node", "main.js"]
```

- Pin the base image to a digest in production (`node:24-alpine@sha256:...`) and let Dependabot bump it.
- Never copy `.env` files into images. Runtime configuration comes from the orchestrator's environment and secrets.
- Add `.dockerignore` with `node_modules`, `dist`, `.env*`, `.git` and `.nx`.

## Compose

```yaml
# infra/docker-compose.yml: local infrastructure only
services:
  postgres:
    image: postgres:17-alpine
    environment:
      POSTGRES_USER: ${POSTGRES_USER:?set POSTGRES_USER in .env}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?set POSTGRES_PASSWORD in .env}
      POSTGRES_DB: ${POSTGRES_DB:?set POSTGRES_DB in .env}
    ports: ["127.0.0.1:5432:5432"]
    volumes: [postgres-data:/var/lib/postgresql/data]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U $${POSTGRES_USER}"]
      interval: 5s
  redis:
    image: redis:7-alpine
    ports: ["127.0.0.1:6379:6379"]
  kafka:
    image: apache/kafka:3.9.0
    ports: ["127.0.0.1:9092:9092"]
    environment:
      KAFKA_NODE_ID: 1
      KAFKA_PROCESS_ROLES: broker,controller
      KAFKA_LISTENERS: PLAINTEXT://:9092,CONTROLLER://:9093
      KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://localhost:9092
      KAFKA_CONTROLLER_LISTENER_NAMES: CONTROLLER
      KAFKA_LISTENER_SECURITY_PROTOCOL_MAP: CONTROLLER:PLAINTEXT,PLAINTEXT:PLAINTEXT
      KAFKA_CONTROLLER_QUORUM_VOTERS: 1@localhost:9093
      KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR: 1
volumes:
  postgres-data:
```

`apps/docker-compose.yml` (dev and prod profiles) runs the services themselves, with `env_file: ../apps/<app>/.env`. Swap the `kafka` service for `rabbitmq:4-management-alpine` when the platform uses RabbitMQ.

## Environment files

| File | Tracked | Contents |
| --- | --- | --- |
| `.env.example` | yes | values shared by compose and every app: database host, broker URLs, Redis |
| `apps/<app>/.env.example` | yes | the app's own values: port, JWT audience, topic subscriptions |
| `.env`, `apps/<app>/.env` | no | real values |

The `ConfigurationService` validates every key at startup with a schema and fails with a list of the missing ones. A config test compares each app's `.env.example` with the keys its schema reads.

## Releases: one package per app

```json
{
  "$schema": "https://raw.githubusercontent.com/googleapis/release-please/main/schemas/config.json",
  "release-type": "node",
  "bump-minor-pre-major": true,
  "include-component-in-tag": true,
  "separate-pull-requests": true,
  "plugins": ["node-workspace"],
  "packages": {
    "apps/client-api": { "component": "client-api" },
    "apps/billing-service": { "component": "billing-service" },
    "apps/frontend": { "component": "frontend" }
  }
}
```

- `.release-please-manifest.json` lists each app at `0.0.0`. Tags are `client-api-v1.4.0`, and each app has its own `CHANGELOG.md`.
- A PR scope names the app or context (`feat(billing-service): ...`). release-please assigns commits to packages by the paths they change, so a change to a shared library is released with every app that lists it as a dependency in its `package.json`.
- The release workflow builds and pushes the Docker image for each created release, tagged `<registry>/<repo>:<component>-<version>`. It fails if that tag already exists; published tags are never overwritten.
- Deployments pull a specific version tag, never `latest`.
- This replaces `@jscutlery/semver` or `nx release` commit-based versioning, so the whole ARG catalogue uses one release tool.
