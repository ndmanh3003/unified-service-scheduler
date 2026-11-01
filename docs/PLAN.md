# Build Plan

Build order, progress and definition of done. Requirements are in [`SPEC.md`](SPEC.md); design is in [`SYSTEM_DESIGN.md`](SYSTEM_DESIGN.md).

The agent updates this file at every checkpoint. A step is marked done only after the owner confirms it.

## Current step

**Step 7: Demo, documentation and submission** (not started)

## Build order

Each step ends with a checkpoint: summarize what changed, which tests pass, and remaining risks, then wait for review.

| #   | Step                                                                                                                                                                                                      | Status      |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| 1   | Scaffold NestJS feature modules, Docker Compose (PostgreSQL), configuration, health endpoints, structured logging with correlation IDs, Testcontainers.                                                   | Done        |
| 2   | Data model: plain SQL migrations with exclusion constraints, TypeORM entities, demo seed data. Constraint tests first.                                                                                    | Done        |
| 3   | Booking service: `BookingPolicyService` and `CandidateAllocator` (unit tests first), unified error format, `POST /appointments` and `GET /appointments/:id` with allocation and savepoint retry, OpenAPI. | Done        |
| 4   | Idempotency and its tests.                                                                                                                                                                                | Done        |
| 5   | Concurrency tests, including the naive check-then-insert regression evidence.                                                                                                                             | Done        |
| 6   | Availability service: `GET /availability` and its tests.                                                                                                                                                  | Done        |
| 7   | Race-condition demo script, README with AI Collaboration Narrative, system design completion, AI log.                                                                                                     | Not started |

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

### Step 3: Booking service

- [x] `BookingPolicyService` (A4, A5), `CandidateAllocator` and time utilities in `common/time/`, with 28 colocated unit tests written first.
- [x] `GlobalExceptionFilter` with the unified error body and correlation id; global `ValidationPipe`; `/api/v1` prefix.
- [x] `POST /api/v1/appointments`: one transaction, candidate pairs tried in savepoints, conflicts resolved by constraint name.
- [x] `GET /api/v1/appointments/:id` with related records; OpenAPI decorators; cURL examples in the README.
- [x] The customer is the vehicle's owner (A8 revised); the request carries only the inputs the brief names.
- [x] Integration tests through HTTP against PostgreSQL (27), written first.

### Step 4: Idempotency

- [x] `IdempotencyService`: key claimed in the booking transaction with `INSERT ... ON CONFLICT DO NOTHING`; SHA-256 of the payload; 24-hour retention (A12).
- [x] Same key and payload: `200` with `Idempotent-Replayed: true` and the original appointment. Different payload: `422 IDEMPOTENCY_KEY_REUSED`.
- [x] Failed attempts roll the key back with the booking, so retries are re-evaluated (A11). Expired keys are treated as new.
- [x] Tests written first: 7 integration tests. Parallel requests with one key are covered in step 5.

### Step 5: Concurrency tests

- [x] 20 parallel requests, one technician and one bay: one `201`, nineteen `409`, one row.
- [x] 10 parallel requests, three technicians and three bays: exactly three succeed, no resource used twice.
- [x] Two parallel requests with one key: one row, same appointment id. One vehicle in parallel, at one dealership and at two: one booking.
- [x] Naive check-then-insert double (test-only) double books under the same load.
- [x] Bug found by these tests: parallel inserts deadlocked (`40P01`) and returned `500`. Fixed with an advisory lock per dealership and local day, plus a bounded same-pair retry on deadlock.

### Step 6: Availability service

- [x] `GET /api/v1/availability`: slot starts from `BookingPolicyService.slotStarts`, free counts from one SQL query.
- [x] Tests written first: 3 unit and 8 availability integration tests.
- [x] Live stack: availability returns `200` for the seeded dealership.

## Definition of done

- [ ] `docker compose up` starts everything; migrations and seeds run automatically.
- [ ] All acceptance tests in `SPEC.md` pass.
- [ ] Demo script: 20 parallel requests produce one `201`, nineteen `409`, and exactly one database row.
- [ ] OpenAPI specification and cURL examples are provided.
- [ ] README documents build, run and test, and contains an **AI Collaboration Narrative** section.
- [ ] `SYSTEM_DESIGN.md` contains: architecture diagram, component roles, data flow, technology choices with justification, observability strategy, scalability notes, and a dedicated GenAI usage section.
