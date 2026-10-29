# Unified Service Scheduler: Specification

Backend implementation of **Scenario A** from the Keyloop Technical Assessment (brief summarized in [`ASSESSMENT.md`](ASSESSMENT.md)).

This document defines **what** the system must do and how it is accepted. How it is built is described in [`SYSTEM_DESIGN.md`](SYSTEM_DESIGN.md); build order and progress are tracked in [`PLAN.md`](PLAN.md).

---

## 1. Overview

Build an appointment scheduler that replaces manual service booking.

Core requirements:

1. **Resource-constrained booking.** A user requests a service appointment for a specific vehicle, service type and dealership at a desired time.
2. **Real-time availability check.** Before confirming, verify that both a service bay and a qualified technician are available for the entire service duration.
3. **Confirmed appointment record.** On success, persist an appointment that links the customer, vehicle, technician and service bay.

Quality requirements:

- Correctness under concurrency (no double booking, ever).
- Partial time-range overlap detection.
- Idempotent booking requests (duplicate submissions and client retries).
- Precise, consistent error semantics.

---

## 2. Scope

**In scope:** backend with a RESTful API and a persistent database. The client layer is stubbed with cURL examples, an OpenAPI specification and a test harness.

**Out of scope** (documented as future extensions where relevant):

- Authentication and authorization (A8).
- Cancellation and rescheduling (A9).
- Listing and searching appointments.
- CRUD for reference data (A10).
- Rate limiting.
- Metrics export and load testing.
- Notifications, payments and any user interface.

---

## 3. Assumptions

This table is the single source for assumptions. Other documents reference them by ID.

| ID  | Assumption                                                                                                                                                                         |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1  | The system assigns the technician and service bay automatically. The user does not choose them.                                                                                    |
| A2  | Each service type has a fixed `duration_minutes` and exactly one required skill. A technician is qualified if they hold that skill.                                                |
| A3  | Time ranges are half-open, `[start, end)`. An appointment ending at 10:00 does not conflict with one starting at 10:00.                                                            |
| A4  | A service must fit entirely within the dealership's opening hours (evaluated in the dealership's timezone), Monday to Saturday, and must not span multiple days.                   |
| A5  | The start time must be in the future and aligned to `SLOT_GRANULARITY_MINUTES` (default 15).                                                                                       |
| A6  | No buffer between appointments. Back-to-back bookings are allowed (consistent with A3).                                                                                            |
| A7  | A vehicle cannot hold two overlapping confirmed appointments.                                                                                                                      |
| A8  | Authentication is out of scope. `customerId` is supplied in the request body.                                                                                                      |
| A9  | Cancellation and rescheduling are out of scope. Appointments are created as `CONFIRMED`; the status column exists so that cancellation can be added later without a schema change. |
| A10 | Reference data (dealerships, bays, technicians, skills, service types, customers, vehicles) is seeded. No CRUD endpoints are provided for it.                                      |
| A11 | Only successful bookings are stored for idempotent replay. A failed attempt (for example `409`) is re-evaluated when retried.                                                      |
| A12 | An idempotency key is retained for 24 hours. After expiry the key is treated as new.                                                                                               |

---

## 4. REST API

### 4.1 Conventions

- Business endpoints are served under `/api/v1`. Operational endpoints (listed below) are served at the root, without the prefix.
- All errors share one shape:

```json
{
  "error": {
    "code": "SLOT_UNAVAILABLE",
    "message": "...",
    "correlationId": "..."
  }
}
```

### 4.2 Endpoints

| Method | Path                                               | Description                                                                                                                                                                                                                                                             |
| ------ | -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| POST   | `/appointments`                                    | Book an appointment. Header `Idempotency-Key: <uuid>` is mandatory. Body: `customerId`, `vehicleId`, `dealershipId`, `serviceTypeId`, `startAt` (ISO 8601). Returns `201`, or `200` with header `Idempotent-Replayed: true` when the same key and payload are replayed. |
| GET    | `/appointments/:id`                                | Appointment details including customer, vehicle, technician, bay and service type.                                                                                                                                                                                      |
| GET    | `/availability?dealershipId=&serviceTypeId=&date=` | Available slots for a day with remaining resource counts.                                                                                                                                                                                                               |

### 4.3 Operational endpoints

`GET /health/live`, `GET /health/ready` (checks PostgreSQL), `GET /docs` (Scalar API reference).

### 4.4 Error catalog

| Code                       | HTTP | When                                                                       |
| -------------------------- | ---- | -------------------------------------------------------------------------- |
| `VALIDATION_FAILED`        | 400  | Malformed body, query or path parameter.                                   |
| `IDEMPOTENCY_KEY_REQUIRED` | 400  | `Idempotency-Key` header missing or not a UUID.                            |
| `NOT_FOUND`                | 404  | Appointment, customer, vehicle, dealership or service type does not exist. |
| `SLOT_UNAVAILABLE`         | 409  | No technician and bay pair is free for the whole range.                    |
| `VEHICLE_ALREADY_BOOKED`   | 409  | The vehicle has an overlapping confirmed appointment (A7).                 |
| `NO_QUALIFIED_TECHNICIAN`  | 422  | No active technician at the dealership holds the required skill.           |
| `OUTSIDE_BUSINESS_HOURS`   | 422  | The range does not fit within opening hours (A4).                          |
| `START_IN_PAST`            | 422  | `startAt` is not in the future (A5).                                       |
| `INVALID_SLOT_ALIGNMENT`   | 422  | `startAt` is not aligned to the slot granularity (A5).                     |
| `IDEMPOTENCY_KEY_REUSED`   | 422  | The key was already used with a different payload.                         |
| `INTERNAL_ERROR`           | 500  | Unexpected failure. Details are logged, never returned.                    |

---

## 5. Acceptance Tests

Each item below must be covered by an automated test. How tests are run is described in `SYSTEM_DESIGN.md` (Testing Strategy).

**Unit:**

- End-time computation from service duration.
- Opening hours evaluated in the dealership timezone.
- Slot alignment.
- Candidate selection.

**Integration:**

- Partial overlap: A 10:00-11:00 and B 10:30-11:30 conflict when no other resource is free.
- Adjacent ranges `[10:00,11:00)` and `[11:00,12:00)` both succeed.
- Bay free but no technician free returns 409, and the reverse.
- Technician without the required skill is never assigned. No qualified technician returns 422.
- Outside hours, in the past, or misaligned start returns 422.
- Vehicle with an overlapping appointment returns 409.
- An expired idempotency key is treated as new.

**Concurrency:**

- 20 parallel requests for the same slot with different keys, one bay and one technician: exactly one `201`, nineteen `409`, one database row.
- Two parallel requests with the same key: exactly one row, both responses carry the same appointment id.
- Same key with a different payload: 422.
- Three bays and three technicians with 10 parallel requests: exactly three succeed.
- A naive check-then-insert implementation double books under the same load (regression evidence).
