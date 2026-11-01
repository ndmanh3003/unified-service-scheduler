# Unified Service Scheduler: System Design

How the system meets the requirements in [`SPEC.md`](SPEC.md), and why it is built this way.
Assumptions (A1 to A12) are defined in `SPEC.md` and referenced here by ID.

**Stack:** NestJS 12 (TypeScript, ESM) on Node.js 24 LTS, TypeORM, PostgreSQL 18, pino, Docker Compose. Tooling: Vitest, Testcontainers, oxlint, Prettier. API reference: Scalar.

---

## 1. Architecture

A single NestJS application organized in feature modules. PostgreSQL is the only backing service and the single source of truth for correctness.

### Components

| Component               | Role                                                                                                                                                                         |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AppointmentsModule`    | `POST /appointments` and `GET /appointments/:id`. The service runs the booking transaction: idempotency claim, validation, allocation, guarded insert.                       |
| `AvailabilityModule`    | `GET /availability`. Computes bookable slots with free resource counts in one query per day.                                                                                 |
| `BookingPolicyService`  | Provider in `AppointmentsModule`, exported for availability. When an appointment may start and end: start time (A5) and opening hours (A4), both in the dealership timezone. |
| `CandidateAllocator`    | Plain class created per booking. Walks technician and bay pairs in a deterministic order and skips resources lost to a concurrent booking.                                   |
| `common/`               | Typed errors (`AppError` subclasses, one per error catalog code), the exception filter, and time utilities (`TimeRange`, zoned-time helpers on the standard `Intl` API).     |
| `DatabaseModule`        | TypeORM connection, entities, plain SQL migrations, demo seed data.                                                                                                          |
| `LoggerModule`          | Structured JSON logs with a correlation id per request.                                                                                                                      |
| `GlobalExceptionFilter` | Maps typed errors to HTTP codes using the error catalog in `SPEC.md`, and writes the unified error body.                                                                     |
| `HealthModule`          | Liveness and readiness probes.                                                                                                                                               |

Rules:

- Controllers are thin: validate input, call one service method, shape the response.
- Services own their transactions (`DataSource.transaction`). SQL that depends on PostgreSQL features (ranges, exclusion constraints, savepoints) is written as plain SQL inside the service.
- Business rules live in injectable services of their module; time arithmetic lives in `common/time/`. Neither touches the database, so both are unit tested without one.
- Errors are thrown as typed errors from `common/errors.ts` and mapped to HTTP codes in one place, `GlobalExceptionFilter`.

---

## 2. Booking Flow (`AppointmentsService.create`)

1. The controller validates the DTO and the mandatory `Idempotency-Key` header, then calls the service.
2. The service runs everything inside one `DataSource.transaction`.
3. `IdempotencyService` claims the key with `INSERT ... ON CONFLICT DO NOTHING` on `idempotency_keys`, storing a SHA-256 hash of the request payload (start normalized to UTC). If another transaction holds the same key, PostgreSQL blocks the insert until that transaction ends. If an unexpired key already exists: same hash replays the stored appointment (`200`, `Idempotent-Replayed: true`); different hash raises `IDEMPOTENCY_KEY_REUSED`. An expired key is overwritten and treated as new (A12).
4. The dealership, service type and vehicle are loaded; the vehicle's owner becomes the appointment's customer (A8). `BookingPolicyService` validates: start in the future, slot alignment, opening hours in the dealership timezone.
5. A transaction-level advisory lock on (dealership, local day) is taken, so overlapping bookings at one dealership queue instead of deadlocking on each other's uncommitted rows. Then the vehicle is checked (A7) and one query lists candidate technicians (qualified, active) and bays (active), excluding those busy in `[start, end)`. `CandidateAllocator` walks the pairs in a deterministic order (sorted by id).
6. For each candidate pair, the insert runs inside a **SAVEPOINT**. On exclusion violation (`23P01`) the savepoint is rolled back and the violated constraint name tells which resource was taken (technician, bay or vehicle, from the violated constraint). Every remaining pair that uses the taken technician or bay is skipped, and a taken vehicle ends the request with `VEHICLE_ALREADY_BOOKED`. Attempts are bounded (20). A savepoint is required because a failed statement otherwise aborts the whole PostgreSQL transaction. A deadlock (`40P01`), still possible when one vehicle is booked at two dealerships at once, is also rolled back to the savepoint and the same pair is retried (at most three times).
7. No pair succeeds: `SLOT_UNAVAILABLE`. No qualified technician exists at the dealership: `NO_QUALIFIED_TECHNICIAN`.
8. The result is stored for idempotent replay, the transaction commits, and `201` is returned. Booking events are logged as structured events.

Any failure rolls back the transaction, including the idempotency row, which is how A11 holds.

---

## 3. Data Model (PostgreSQL)

Enable `btree_gist`. Use plain SQL migrations (`src/database/migrations/`, applied on startup). Use `uuid` primary keys and `timestamptz` (UTC). TypeORM entities in `src/database/entities/` map the tables for reads; they do not map `time_range` and never generate schema.

| Table               | Key columns                                                                                                                                              | Constraints                                                                                                  |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `dealerships`       | id, name, timezone, open_time, close_time                                                                                                                |                                                                                                              |
| `customers`         | id, name, email, phone                                                                                                                                   | unique email                                                                                                 |
| `vehicles`          | id, customer_id, vin, make, model, year                                                                                                                  | unique vin; FK customer                                                                                      |
| `skills`            | id, code, name                                                                                                                                           | unique code                                                                                                  |
| `service_types`     | id, code, name, duration_minutes, required_skill_id                                                                                                      | duration > 0; FK skill                                                                                       |
| `technicians`       | id, dealership_id, name, is_active                                                                                                                       | FK dealership                                                                                                |
| `technician_skills` | technician_id, skill_id                                                                                                                                  | PK (technician_id, skill_id)                                                                                 |
| `service_bays`      | id, dealership_id, name, is_active                                                                                                                       | FK dealership                                                                                                |
| `appointments`      | id, customer_id, vehicle_id, dealership_id, service_type_id, technician_id, service_bay_id, start_at, end_at, time_range, status, created_at, updated_at | see below                                                                                                    |
| `idempotency_keys`  | key (PK), request_hash, appointment_id, created_at, expires_at                                                                                           | `expires_at = created_at + 24 hours` (A12); a replay re-reads the appointment, so no response body is stored |

`appointments.status` is `CONFIRMED` or `CANCELLED`. Only `CONFIRMED` is written today; `CANCELLED` is reserved for a future cancellation feature (A9), and the exclusion constraints already ignore it.

Core constraints (the authoritative protection against double booking):

```sql
CHECK (end_at > start_at)
time_range tstzrange GENERATED ALWAYS AS (tstzrange(start_at, end_at, '[)')) STORED

EXCLUDE USING gist (technician_id  WITH =, time_range WITH &&) WHERE (status = 'CONFIRMED')
EXCLUDE USING gist (service_bay_id WITH =, time_range WITH &&) WHERE (status = 'CONFIRMED')
EXCLUDE USING gist (vehicle_id     WITH =, time_range WITH &&) WHERE (status = 'CONFIRMED')
```

Indexes: `appointments(dealership_id, start_at)` for availability queries; the three exclusion constraints create GiST indexes that also serve overlap lookups by technician, bay and vehicle.

Constraint names (`appointments_technician_no_overlap`, `appointments_service_bay_no_overlap`, `appointments_vehicle_no_overlap`) are part of the contract: the booking service reads them from `23P01` errors to tell which resource was taken.

**Seed data (A10):** `src/database/seed.ts` inserts demo reference data with fixed ids when `DB_SEED=true`, ignoring rows that already exist. It contains a main dealership (three technicians, one inactive technician, three bays) and an express dealership with one technician and one bay for the race-condition demo, plus twenty fleet vehicles so parallel demo requests contend for resources, not for the same vehicle.

---

## 4. Availability

- `GET /availability` is computed from PostgreSQL on every request; it is not cached (see Key Decisions).
- Availability is advisory: `POST /appointments` re-checks every resource inside its transaction.

---

## 5. Observability

- **Logging:** structured JSON (pino through `nestjs-pino`). Every request carries a `correlationId` (from `X-Correlation-Id` or generated). Key events: `booking_created`, `booking_conflict`, `idempotent_replay`, `validation_failed`.
- **Errors:** every error response carries the request's `correlationId`, so a client report can be matched to the server log.
- **Health:** separate liveness and readiness probes.
- **Future extension:** Prometheus metrics (booking results by outcome, booking latency) are out of scope for this delivery.

---

## 6. Testing Strategy

The test cases themselves are listed in `SPEC.md` (Acceptance Tests). This section defines how they are run.

- **Unit** tests cover `BookingPolicyService`, `CandidateAllocator` and the time utilities, with no database.
- Service behavior is covered by integration tests through HTTP against real PostgreSQL, because its correctness depends on constraints, transactions and savepoints that fakes cannot reproduce.
- **Integration and concurrency** tests run against a real PostgreSQL instance through Testcontainers. SQLite or an in-memory database is never a substitute.
- Tests run inside the `app` container, so Testcontainers needs the host Docker daemon: mount `/var/run/docker.sock` into the `app` service and set `TESTCONTAINERS_HOST_OVERRIDE=host.docker.internal`.
- Test files are named by suite: unit tests sit next to their source as `src/**/*.spec.ts` (`npm run test`), as in a default NestJS project; `test/integration/**/*.int-spec.ts` (`npm run test:integration`), `test/e2e/**/*.e2e-spec.ts` (`npm run test:e2e`).
- **Regression evidence:** a naive check-then-insert booking function exists only as a test double under `test/integration/support/`, never in `src/`. The concurrency suite runs against it to show that it double books under load while the constraint-based implementation does not.
- **Static checks:** oxlint with type-aware rules (`no-floating-promises`, `no-explicit-any`, `no-console`) and Prettier.

---

## 7. Key Decisions

| Decision                                                                     | Alternatives considered                                                                                 | Why                                                                                                                                                                                                                                                                                                                          |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Prevent double booking with PostgreSQL `EXCLUDE` constraints on `tstzrange`  | Check-then-insert in application code; `SELECT ... FOR UPDATE` on resource rows; Redis distributed lock | The database rejects every overlapping write regardless of code path or number of app instances. Check-then-insert races; row locks do not cover rows that do not exist yet; a Redis lock adds a failure point outside the transaction.                                                                                      |
| Try candidate pairs inside a `SAVEPOINT` and retry on `23P01`                | Fail on the first conflict; restart the whole transaction                                               | A conflict on one pair should not fail the request when another pair is free. Without a savepoint, a failed statement aborts the whole transaction.                                                                                                                                                                          |
| Advisory lock per dealership and local day before allocation                 | No lock, retry on deadlock only; lock rows of all candidate resources; `SERIALIZABLE` isolation         | Concurrency tests showed that parallel inserts on the same bay or vehicle deadlock on each other's uncommitted rows; retries alone took up to a minute under load. The lock orders contenders for one dealership-day only, keeps other days and dealerships parallel, and leaves the exclusion constraints as the guarantee. |
| Store idempotency keys in PostgreSQL, in the same transaction as the booking | Redis with `SET NX`; in-memory map                                                                      | Key and appointment commit or roll back together (A11). The unique key serializes concurrent duplicates without extra locking.                                                                                                                                                                                               |
| No cache for `GET /availability`                                             | Redis read-through cache with a short TTL                                                               | The brief does not require a cache, and availability is one indexed query per day. A cache adds a service to run and a staleness window; it can be added if measured load calls for it.                                                                                                                                      |
| Plain SQL migrations                                                         | ORM-generated migrations or `synchronize`                                                               | Exclusion constraints, generated columns and `btree_gist` cannot be expressed through ORM decorators.                                                                                                                                                                                                                        |
| Assign technician and bay automatically (A1)                                 | Let the user choose                                                                                     | Matches the requirement of a single booking request, and keeps allocation inside one transaction.                                                                                                                                                                                                                            |
| Standard NestJS feature modules; business rules in injectable services       | Clean Architecture with ports, adapters and framework-free use cases                                    | Default NestJS structure is easier to read and review at this size. Logic that depends on PostgreSQL is tested against PostgreSQL instead of fakes.                                                                                                                                                                          |

---

## 8. Scalability

To be written in the final build step (see [`PLAN.md`](PLAN.md)).

---

## 9. GenAI Usage

To be written in the final build step (see [`PLAN.md`](PLAN.md)), based on [`ai-log.md`](ai-log.md).
