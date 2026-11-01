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

## Database

Migrations in `src/database/migrations/` are plain SQL and run automatically when the application starts. With `DB_SEED=true` (the default in `.env.example`), demo reference data is inserted on startup; existing rows are left untouched, so restarts are safe.

Seeded ids used in the examples:

| Entity                           | Id                                     |
| -------------------------------- | -------------------------------------- |
| Dealership (3 technicians/bays)  | `10000000-0000-4000-8000-000000000001` |
| Dealership (1 technician/bay)    | `10000000-0000-4000-8000-000000000002` |
| Service type: oil change, 60 min | `30000000-0000-4000-8000-000000000001` |
| Customer: An Nguyen              | `60000000-0000-4000-8000-000000000001` |
| Vehicle: An's Toyota Vios        | `70000000-0000-4000-8000-000000000001` |

The full list is in [`src/database/seed.ts`](src/database/seed.ts). To start from an empty database, remove the volume: `docker compose down -v`.

## Endpoints

| Method | Path                       | Description                                                                       |
| ------ | -------------------------- | --------------------------------------------------------------------------------- |
| GET    | `/health/live`             | Liveness probe. Returns 200 while the process is running.                         |
| GET    | `/health/ready`            | Readiness probe. Returns 200 only when PostgreSQL is reachable, otherwise 503.    |
| GET    | `/docs`                    | Interactive API reference (Scalar).                                               |
| POST   | `/api/v1/appointments`     | Book an appointment. Requires an `Idempotency-Key` header (UUID).                 |
| GET    | `/api/v1/appointments/:id` | Appointment with customer, vehicle, dealership, service type, technician and bay. |

Errors share one shape, `{ "error": { "code", "message", "correlationId" } }`; the codes are listed in [`docs/SPEC.md`](docs/SPEC.md) (Error catalog).

### Examples

Book a 60-minute oil change at the main seeded dealership (the start must be in the future, Monday to Saturday, 08:00 to 17:00 local time, on a 15-minute boundary):

```bash
curl -i -X POST http://localhost:3000/api/v1/appointments \
  -H 'Content-Type: application/json' \
  -H "Idempotency-Key: $(uuidgen)" \
  -d '{
    "vehicleId": "70000000-0000-4000-8000-000000000001",
    "serviceTypeId": "30000000-0000-4000-8000-000000000001",
    "dealershipId": "10000000-0000-4000-8000-000000000001",
    "startAt": "2031-03-03T10:00:00+07:00"
  }'
```

Fetch it by the returned id:

```bash
curl http://localhost:3000/api/v1/appointments/<id>
```

Booking the same slot again with another vehicle assigns the next free technician and bay; once all three are taken the response is `409 SLOT_UNAVAILABLE`.

Sending the same request again with the same `Idempotency-Key` within 24 hours returns the original appointment with `200` and the header `Idempotent-Replayed: true`, instead of booking twice. Reusing a key with a different payload returns `422 IDEMPOTENCY_KEY_REUSED`. Failed attempts are not stored, so a retry after an error is evaluated again.

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
