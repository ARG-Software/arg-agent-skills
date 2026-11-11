# Local stack: database, observability and a container UI

An optional piece of the setup: one `compose.yaml` that starts what the app needs to run and be watched on a developer machine. It has the database (and cache or broker if the app uses them), Prometheus and Grafana for metrics, and Portainer to see the running containers. It also adds the app's `/metrics` endpoint, so there is something to watch.

This stack is for **local development only**. Production observability and hosting belong to the deployment platform and need their own reviewed setup.

## Contents

- [When to add it](#when-to-add-it)
- [Rules](#rules)
- [Layout](#layout)
- [compose.yaml](#composeyaml)
- [Prometheus](#prometheus)
- [Grafana](#grafana)
- [Portainer](#portainer)
- [App metrics per stack](#app-metrics-per-stack)
- [Verify](#verify)

## When to add it

| Piece | Add when | Skip when |
| --- | --- | --- |
| **Database / cache / broker** | the code uses one (see [detection](#detecting-the-services)) and there is no compose file or dev container for it | the repo already runs it (existing `docker-compose.yml`, `compose.yaml`, `.devcontainer/`, Testcontainers-only tests are fine to keep) |
| **Prometheus + Grafana** | the app is a long-running service (API, worker, server) | a library, CLI or static site; there is nothing to scrape |
| **Portainer** | the user asks for a container UI, or the stack has several containers | the user prefers `docker compose ps` / Docker Desktop's own UI |

Ask the user which pieces they want; each one is opt-in.

### Detecting the services

| Code signal | Service |
| --- | --- |
| `pg`, `postgres`, `prisma` with `postgresql`, `Npgsql`, `psycopg`, `asyncpg`, `pgx`, `sqlx` with `postgres` | PostgreSQL |
| `mysql2`, `MySqlConnector`, `Pomelo.EntityFrameworkCore.MySql`, `PyMySQL`, `go-sql-driver/mysql` | MySQL |
| `Microsoft.Data.SqlClient`, `mssql`, `tedious`, `pyodbc` with SQL Server | SQL Server |
| `mongodb`, `mongoose`, `MongoDB.Driver`, `pymongo`, `motor` | MongoDB |
| `ioredis`, `redis`, `StackExchange.Redis`, `go-redis` | Redis |
| `amqplib`, `RabbitMQ.Client`, `MassTransit.RabbitMQ`, `pika`, `aio-pika` | RabbitMQ |
| `kafkajs`, `Confluent.Kafka`, `confluent-kafka`, `sarama` | Kafka |

Use the same major version the app targets in production when the repo says (IaC, connection strings in docs); otherwise the current stable major, and say so.

## Rules

1. **Pin every image to a version tag**, never `latest`, so every developer runs the same thing. Use the current stable tag at setup time (check the registry) and let Dependabot's `docker-compose` ecosystem update it. Tags in this file are examples.
2. **Bind ports to `127.0.0.1`** (`"127.0.0.1:5432:5432"`), so nothing is reachable from the local network.
3. **Credentials come from `.env`**, with dummy values in `.env.example`. Never hard-code a password in `compose.yaml`.
4. **Profiles keep it light**: `docker compose up -d` starts only the services the app needs; `--profile observability` and `--profile tools` add the rest.
5. **Named volumes** for data, so `docker compose down` keeps it and `docker compose down -v` resets it.
6. **Healthchecks** on stateful services, and `depends_on: condition: service_healthy` where order matters.
7. **The app reads connection strings through its config module**, and `.env.example` carries the local values (`DATABASE_URL=postgres://app:app@localhost:5432/app`).
8. **Never commit `.env`**, and never reuse these credentials anywhere else.
9. **Starting containers pulls images from the network.** Ask before the first `docker compose up`.

## Layout

```
compose.yaml
ops/
  prometheus/prometheus.yml
  grafana/provisioning/datasources/prometheus.yml
  grafana/provisioning/dashboards/dashboards.yml
  grafana/dashboards/service-overview.json
```

Keep all local-ops config under one folder (`ops/` or the repo's existing `deploy/`, `docker/`, `infra/`). If the repo already has a compose file, add the new services to it instead of creating a second one.

## compose.yaml

```yaml
name: orders-service

services:
  db:
    image: postgres:17-alpine
    environment:
      POSTGRES_USER: ${POSTGRES_USER:?set in .env}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?set in .env}
      POSTGRES_DB: ${POSTGRES_DB:?set in .env}
    ports: ["127.0.0.1:5432:5432"]
    volumes: [db-data:/var/lib/postgresql/data]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U $${POSTGRES_USER} -d $${POSTGRES_DB}"]
      interval: 5s
      timeout: 3s
      retries: 10

  prometheus:
    image: prom/prometheus:v3.5.0
    profiles: [observability]
    command:
      - --config.file=/etc/prometheus/prometheus.yml
      - --storage.tsdb.retention.time=7d
    ports: ["127.0.0.1:9090:9090"]
    volumes:
      - ./ops/prometheus/prometheus.yml:/etc/prometheus/prometheus.yml:ro
      - prometheus-data:/prometheus
    extra_hosts: ["host.docker.internal:host-gateway"]

  grafana:
    image: grafana/grafana:12.1.0
    profiles: [observability]
    depends_on: [prometheus]
    environment:
      GF_SECURITY_ADMIN_USER: ${GRAFANA_ADMIN_USER:?set in .env}
      GF_SECURITY_ADMIN_PASSWORD: ${GRAFANA_ADMIN_PASSWORD:?set in .env}
      GF_USERS_ALLOW_SIGN_UP: "false"
    ports: ["127.0.0.1:3001:3000"]
    volumes:
      - ./ops/grafana/provisioning:/etc/grafana/provisioning:ro
      - ./ops/grafana/dashboards:/var/lib/grafana/dashboards:ro
      - grafana-data:/var/lib/grafana

  portainer:
    image: portainer/portainer-ce:2.27.0
    profiles: [tools]
    ports: ["127.0.0.1:9443:9443"]
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - portainer-data:/data

volumes:
  db-data:
  prometheus-data:
  grafana-data:
  portainer-data:
```

Grafana is mapped to `3001` because many front ends use `3000`; pick a free port and write it in `AGENTS.md`. Add these to `.env.example`:

```dotenv
# Local database (compose.yaml), development only
POSTGRES_USER=app
POSTGRES_PASSWORD=app
POSTGRES_DB=app
DATABASE_URL=postgres://app:app@localhost:5432/app
# Local Grafana login, development only
GRAFANA_ADMIN_USER=admin
GRAFANA_ADMIN_PASSWORD=change-me
```

Other services follow the same shape: `mysql:8.4` (`mysqladmin ping`), SQL Server `mcr.microsoft.com/mssql/server` pinned to a `2022-CU<n>-ubuntu-22.04` tag, `mongo:8` (`mongosh --eval "db.adminCommand('ping')"`), `redis:7-alpine` (`redis-cli ping`), `rabbitmq:4-management-alpine` (management UI on `127.0.0.1:15672`), and for Kafka `apache/kafka:3.9.0` in KRaft mode.

Add the `docker-compose` ecosystem to `.github/dependabot.yml` with `directory: /` so image tags in `compose.yaml` get update PRs.

## Prometheus

`ops/prometheus/prometheus.yml` scrapes the app running on the host (`npm run dev`, `dotnet run`), and Prometheus itself:

```yaml
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: app
    metrics_path: /metrics
    static_configs:
      - targets: ["host.docker.internal:3000"]   # the app's local port
        labels: { service: orders-service, env: local }

  - job_name: prometheus
    static_configs:
      - targets: ["localhost:9090"]
```

If the app itself runs in compose, target its service name instead (`app:3000`). Add exporters only when asked: `prometheuscommunity/postgres-exporter`, `oliver006/redis_exporter`, RabbitMQ's built-in `rabbitmq_prometheus` plugin.

## Grafana

Provision everything as files, so a fresh `docker compose up` has the data source and dashboard with no clicking.

`ops/grafana/provisioning/datasources/prometheus.yml`:

```yaml
apiVersion: 1
datasources:
  - name: Prometheus
    uid: prometheus
    type: prometheus
    access: proxy
    url: http://prometheus:9090
    isDefault: true
```

`ops/grafana/provisioning/dashboards/dashboards.yml`:

```yaml
apiVersion: 1
providers:
  - name: local
    folder: Local
    type: file
    allowUiUpdates: true
    options:
      path: /var/lib/grafana/dashboards
```

`ops/grafana/dashboards/service-overview.json`: a starter dashboard with the four golden signals, using the metric names from [App metrics per stack](#app-metrics-per-stack). Adjust the metric names to the library you used:

```json
{
  "uid": "service-overview",
  "title": "Service overview",
  "schemaVersion": 39,
  "time": { "from": "now-1h", "to": "now" },
  "refresh": "10s",
  "panels": [
    {
      "type": "timeseries", "title": "Requests per second",
      "gridPos": { "x": 0, "y": 0, "w": 12, "h": 8 },
      "datasource": { "type": "prometheus", "uid": "prometheus" },
      "targets": [{ "expr": "sum by (route) (rate(http_request_duration_seconds_count{job=\"app\"}[5m]))", "legendFormat": "{{route}}" }]
    },
    {
      "type": "timeseries", "title": "p95 latency (s)",
      "gridPos": { "x": 12, "y": 0, "w": 12, "h": 8 },
      "datasource": { "type": "prometheus", "uid": "prometheus" },
      "targets": [{ "expr": "histogram_quantile(0.95, sum by (le, route) (rate(http_request_duration_seconds_bucket{job=\"app\"}[5m])))", "legendFormat": "{{route}}" }]
    },
    {
      "type": "timeseries", "title": "5xx error ratio",
      "gridPos": { "x": 0, "y": 8, "w": 12, "h": 8 },
      "datasource": { "type": "prometheus", "uid": "prometheus" },
      "targets": [{ "expr": "sum(rate(http_request_duration_seconds_count{job=\"app\",status_code=~\"5..\"}[5m])) / sum(rate(http_request_duration_seconds_count{job=\"app\"}[5m]))", "legendFormat": "errors" }]
    },
    {
      "type": "timeseries", "title": "Resident memory (bytes)",
      "gridPos": { "x": 12, "y": 8, "w": 12, "h": 8 },
      "datasource": { "type": "prometheus", "uid": "prometheus" },
      "targets": [{ "expr": "process_resident_memory_bytes{job=\"app\"}", "legendFormat": "{{instance}}" }]
    }
  ]
}
```

## Portainer

Portainer shows the running containers, their logs, stats and volumes in a browser at `https://localhost:9443` (a self-signed certificate; the first visit creates the admin account, within a few minutes of start).

- **Mounting the Docker socket gives Portainer root-equivalent control of the machine.** Keep it in the `tools` profile, bound to `127.0.0.1`, and never in a compose file used on a shared or production host. Tell the user this when proposing it.
- On Windows with Docker Desktop, the socket path above works with the Linux engine. On rootless Docker or Podman, use the user's socket path (`$XDG_RUNTIME_DIR/docker.sock`, `podman.sock`).
- If the user only wants to see containers, `docker compose ps`, `docker compose logs -f` and Docker Desktop's own dashboard need no extra container; offer them as the lighter option.

## App metrics per stack

The `/metrics` endpoint is an **adapter**: register the metrics library in infrastructure, expose the endpoint from the presentation layer or the composition root, and never import the metrics library from domain or application code. If a use case needs a business metric (orders placed), declare a small port (`OrderMetrics.recordPlaced()`) in application and implement it in infrastructure. Add an architecture rule that only infrastructure imports the metrics package.

Adding the library is a new dependency: ask before installing it (it is a network install).

| Stack | Library | Endpoint and HTTP metrics |
| --- | --- | --- |
| Node (Express, Fastify, NestJS) | `prom-client` | `collectDefaultMetrics()`, a `http_request_duration_seconds` histogram with `method`, `route`, `status_code` labels recorded in middleware, `GET /metrics` returning `register.metrics()`. NestJS: `@willsoto/nestjs-prometheus`. Fastify: `fastify-metrics` |
| .NET | `OpenTelemetry.Extensions.Hosting` + `OpenTelemetry.Instrumentation.AspNetCore` + `OpenTelemetry.Exporter.Prometheus.AspNetCore` | `.WithMetrics(m => m.AddAspNetCoreInstrumentation().AddRuntimeInstrumentation().AddPrometheusExporter())` and `app.MapPrometheusScrapingEndpoint()`; metric names differ (`http_server_request_duration_seconds`), so adjust the dashboard |
| Python (FastAPI, Flask, Django) | `prometheus-client`; `prometheus-fastapi-instrumentator`, `prometheus-flask-exporter`, `django-prometheus` | the instrumentator exposes `/metrics` with request duration histograms |
| Go | `github.com/prometheus/client_golang` | `promhttp.Handler()` on `/metrics`, a `promauto` histogram in an HTTP middleware |
| Rust (axum, actix) | `metrics` + `metrics-exporter-prometheus`, or `axum-prometheus` | the exporter's handle rendered on `/metrics` |

Rules for metrics:

- **Label with the route template, never the raw path** (`/orders/:id`, not `/orders/42`), and never with user ids, emails or tokens; unbounded labels break Prometheus.
- **Do not expose `/metrics` publicly in production.** Serve it on a separate port or behind the platform's network policy; locally it is fine.
- A test asserts that `GET /metrics` returns `200` and contains `http_request_duration_seconds`.

## Verify

1. `docker compose config --quiet` validates the file and the `.env` interpolation (no output means it is valid). Without Docker, at least parse the YAML files.
2. With the user's approval: `docker compose --profile observability --profile tools up -d`, then `docker compose ps` shows every service `running` (and `healthy` where there is a healthcheck).
3. Start the app, open `http://localhost:9090/targets`: the `app` target is `UP`.
4. Open Grafana on the mapped port: the "Service overview" dashboard shows data after a few requests.
5. Add a **Local stack** section to `AGENTS.md` and the README with the commands, the URLs and ports, and the reset command (`docker compose down -v`).
