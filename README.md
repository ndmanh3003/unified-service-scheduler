# Unified Service Scheduler

Backend for Scenario A of the Keyloop Technical Assessment: an appointment scheduler that books a service for a vehicle at a dealership, assigning a qualified technician and a service bay that are both free for the whole service duration.

NestJS and PostgreSQL. Everything runs in Docker; no Node.js installation is required on the host.

**Highlights**

- No double booking under any concurrency: PostgreSQL `EXCLUDE` constraints on time ranges are the guarantee, not application checks.
- Automatic allocation across technician and bay pairs, with savepoints so a lost race moves on to the next free pair.
- Idempotent booking with an `Idempotency-Key` header: duplicate submissions and retries never create a second appointment.
- Availability endpoint that lists bookable starts for a day; booking re-checks everything in its transaction.
- Structured JSON logs with a correlation id on every request and every error.

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
| GET    | `/health/ready`            | Readiness probe. Returns 503 when PostgreSQL is unreachable.                      |
| GET    | `/docs`                    | Interactive API reference (Scalar).                                               |
| POST   | `/api/v1/appointments`     | Book an appointment. Requires an `Idempotency-Key` header (UUID).                 |
| GET    | `/api/v1/availability`     | Bookable starts for a day with free technician and bay counts.                    |
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

Check availability for a day first (optional):

```bash
curl 'http://localhost:3000/api/v1/availability?dealershipId=10000000-0000-4000-8000-000000000001&serviceTypeId=30000000-0000-4000-8000-000000000001&date=2031-03-03'
```

Fetch a booked appointment by the returned id:

```bash
curl http://localhost:3000/api/v1/appointments/<id>
```

Booking the same slot again with another vehicle assigns the next free technician and bay; once all three are taken the response is `409 SLOT_UNAVAILABLE`.

Sending the same request again with the same `Idempotency-Key` within 24 hours returns the original appointment with `200` and the header `Idempotent-Replayed: true`, instead of booking twice. Reusing a key with a different payload returns `422 IDEMPOTENCY_KEY_REUSED`. Failed attempts are not stored, so a retry after an error is evaluated again.

## Race-condition demo

Twenty parallel requests for the same slot at the seeded dealership with one technician and one bay:

```bash
docker compose exec app node scripts/race-demo.mjs
```

Expected output: one `201`, nineteen `409 SLOT_UNAVAILABLE`, and one row in the database. Each run picks a fresh future slot; pass an ISO start time as an argument to choose one. The test suite also runs a naive check-then-insert implementation under the same load to show that it double books.

## Tests

| Suite                             | Command                    | Covers                                                                                                                                                 |
| --------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Unit (`src/**/*.spec.ts`)         | `npm run test`             | Opening hours and slot rules in the dealership timezone, slot generation, candidate order, time ranges                                                 |
| Integration (`test/integration/`) | `npm run test:integration` | Exclusion constraints, seed, booking API, idempotency, concurrency (20 parallel requests, 3×3 resources, same key), naive double booking, availability |
| End-to-end (`test/e2e/`)          | `npm run test:e2e`         | Health probes and correlation ids against the Compose stack                                                                                            |

Integration tests run against a real PostgreSQL 18 started by Testcontainers; the acceptance list they implement is in [`docs/SPEC.md`](docs/SPEC.md) (Acceptance Tests).

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

## AI Collaboration Narrative

This project was built with Claude Code as the implementation agent. I kept the design authority and the final say on every step; the detailed record is in [`docs/ai-log.md`](docs/ai-log.md), and the design-phase summary is in [`docs/SYSTEM_DESIGN.md`](docs/SYSTEM_DESIGN.md) (GenAI Usage).

**Strategy: give the agent context and rules, then work in small steps.**

- Before any code, I had the agent turn the brief into a specification ([`docs/SPEC.md`](docs/SPEC.md)) with explicit assumptions, an error catalog and acceptance tests, and a design ([`docs/SYSTEM_DESIGN.md`](docs/SYSTEM_DESIGN.md)). I reviewed both and made the key calls myself: an `Idempotency-Key` on bookings so duplicate submissions and retries are safe, and PostgreSQL as the only backing service.
- [`AGENTS.md`](AGENTS.md) holds the rules every session follows: read the plan first, one step at a time with a checkpoint, tests before code, PostgreSQL constraints for double-booking prevention, nothing outside the specification. [`docs/PLAN.md`](docs/PLAN.md) tracks the steps.

**Verification: nothing was accepted on the agent's word.**

- Every behavior started as a failing test; the history shows a `test:` commit before each `feat:` commit.
- Integration and concurrency tests run against real PostgreSQL, because the correctness of this system lives in constraints, transactions and locks that mocks cannot reproduce.
- After each step I ran the stack: cURL calls, the race demo, and the logs.

**Where I corrected the agent.**

| What the agent did                                                          | How it was caught                                 | Outcome                                                                                           |
| --------------------------------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Built a Clean Architecture with ports, use-case classes and in-memory fakes | My code review: too hard to follow for this scope | Rebuilt as standard NestJS modules and services; fakes replaced by PostgreSQL tests               |
| Committed tests and code together, hiding test-first                        | My review of the commit list                      | History split into `test:` and `feat:` commits                                                    |
| Parallel bookings returned `500 deadlock detected`                          | Concurrency tests                                 | First fix (retry only) failed under repeated runs; replaced by a per-dealership-day advisory lock |

**Quality gates.** TypeScript strict mode, type-aware oxlint (no floating promises, no `any`, no `console`), Prettier, Conventional Commits enforced by a Git hook, and the full test suite in the container before each commit.
