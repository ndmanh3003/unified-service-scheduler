# Build Plan

Build order, progress and definition of done. Requirements are in [`SPEC.md`](SPEC.md); design is in [`SYSTEM_DESIGN.md`](SYSTEM_DESIGN.md).

The agent updates this file at every checkpoint. A step is marked done only after the owner confirms it.

## Current step

**Step 3: Booking service** (not started)

## Build order

Each step ends with a checkpoint: summarize what changed, which tests pass, and remaining risks, then wait for review.

| #   | Step                                                                                                                                                                                 | Status      |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------- |
| 1   | Scaffold NestJS feature modules, Docker Compose (PostgreSQL), configuration, health endpoints, structured logging with correlation IDs, Testcontainers.                              | Done        |
| 2   | Data model: plain SQL migrations with exclusion constraints, TypeORM entities, demo seed data. Constraint tests first.                                                               | Done        |
| 3   | Booking service: rules in `src/scheduling/` (unit tests first), unified error format, `POST /appointments` and `GET /appointments/:id` with allocation and savepoint retry, OpenAPI. | Not started |
| 4   | Idempotency and its tests.                                                                                                                                                           | Not started |
| 5   | Concurrency tests, including the naive check-then-insert regression evidence.                                                                                                        | Not started |
| 6   | Availability service: `GET /availability` and its tests.                                                                                                                             | Not started |
| 7   | Race-condition demo script, README with AI Collaboration Narrative, system design completion, AI log.                                                                                | Not started |

## Step notes

### Step 1: Scaffold

- [x] NestJS project, Docker Compose with PostgreSQL, watch mode.
- [x] Environment validation.
- [x] Health endpoints (`/health/live`, `/health/ready`) and Scalar at `/docs`.
- [x] Structured JSON logging (pino) with a correlation id per request, echoed in `X-Correlation-Id`.
- [x] Conventional Commits `commit-msg` hook.
- [x] Testcontainers access from the `app` container verified.

### Step 2: Data model and seed data

- [x] Plain SQL migration: reference tables, `appointments` with generated `tstzrange` and three exclusion constraints, `idempotency_keys`.
- [x] TypeORM entities for reads; migrations run on startup.
- [x] Idempotent demo seed with fixed ids, enabled by `DB_SEED`.
- [x] Tests written first: 10 constraint tests and 4 seed tests against PostgreSQL 18 (Testcontainers).
- Open question: whether a vehicle must belong to the customer in the request. To be decided before step 3.

## Definition of done

- [ ] `docker compose up` starts everything; migrations and seeds run automatically.
- [ ] All acceptance tests in `SPEC.md` pass.
- [ ] Demo script: 20 parallel requests produce one `201`, nineteen `409`, and exactly one database row.
- [ ] OpenAPI specification and cURL examples are provided.
- [ ] README documents build, run and test, and contains an **AI Collaboration Narrative** section.
- [ ] `SYSTEM_DESIGN.md` contains: architecture diagram, component roles, data flow, technology choices with justification, observability strategy, scalability notes, and a dedicated GenAI usage section.
