# Unified Service Scheduler

NestJS backend with PostgreSQL. Everything runs in Docker; no Node.js installation is required on the host.

## Documentation

| Document                                         | Contents                                                                      |
| ------------------------------------------------ | ----------------------------------------------------------------------------- |
| [`docs/ASSESSMENT.md`](docs/ASSESSMENT.md)       | Summary of the assessment brief (original PDF in `docs/assessment/`)          |
| [`docs/SPEC.md`](docs/SPEC.md)                   | Requirements, assumptions, REST API, error catalog, acceptance tests          |
| [`docs/SYSTEM_DESIGN.md`](docs/SYSTEM_DESIGN.md) | Architecture, booking flow, data model, caching, observability, key decisions |
| [`docs/PLAN.md`](docs/PLAN.md)                   | Build order and progress                                                      |
| [`docs/ai-log.md`](docs/ai-log.md)               | Record of AI collaboration and human oversight                                |

## Getting started

```bash
cp .env.example .env
git config core.hooksPath .githooks
docker compose up --build
```

The `core.hooksPath` setting enables the repository's Git hooks; the `commit-msg` hook rejects messages that do not follow Conventional Commits.

The application runs in watch mode: the project directory is bind-mounted into the container, so source changes are recompiled and reloaded automatically.

## Endpoints

| Method | Path            | Description                                                                    |
| ------ | --------------- | ------------------------------------------------------------------------------ |
| GET    | `/health/live`  | Liveness probe. Returns 200 while the process is running.                      |
| GET    | `/health/ready` | Readiness probe. Returns 200 only when PostgreSQL is reachable, otherwise 503. |
| GET    | `/docs`         | Interactive API reference (Scalar).                                            |

## Logging

Logs are structured JSON (pino), one line per event. Every request carries a correlation id: the value of the `X-Correlation-Id` request header, or a generated UUID. The id is returned in the `X-Correlation-Id` response header and attached to every log line of that request. `LOG_LEVEL` sets the level (`info` by default; tests use `silent`).

## Common commands

All commands run inside the `app` container.

```bash
docker compose exec app npm run lint              # oxlint
docker compose exec app npm run build
docker compose exec app npm run test              # unit tests
docker compose exec app npm run test:integration  # PostgreSQL via Testcontainers
docker compose exec app npm run test:e2e          # HTTP tests against the Compose stack
```

Integration tests start throwaway PostgreSQL containers through the host Docker daemon; the `app` service mounts `/var/run/docker.sock` for this.

After changing dependencies, rebuild the image and recreate the `node_modules` volume:

```bash
docker compose up --build -V
```
