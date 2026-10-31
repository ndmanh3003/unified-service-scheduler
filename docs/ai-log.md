# AI Collaboration Log

Factual record of how AI tools were directed, verified and corrected during this project.
Each entry feeds the AI Collaboration Narrative in the README and the video walkthrough.

## Tools and setup

- Tools used: Claude Code (desktop app, Code tab)
- Agent instruction files: `AGENTS.md` (shared rules), `.claude/CLAUDE.md` (Claude Code entry point)
- Project documents given to the agent: `docs/SPEC.md` (requirements), `docs/SYSTEM_DESIGN.md` (design and key decisions), `docs/PLAN.md` (build order and progress)
- Workflow: step-by-step with a human checkpoint after each step; test-first for booking logic.
- Scope: only human direction and oversight is recorded; routine technical fixes made by the agent are not.

## Entry template

### Step N: <title> (<date>)

**Instruction:**

- <what the owner asked for>

| Issue | Caught by | Root cause | Fix |
| ----- | --------- | ---------- | --- |
|       |           |            |     |

| Owner decision | Reason |
| -------------- | ------ |
|                |        |

**Verification:**

- <test, command or observed result>

**Remaining:** (only if the step is partial)

- <what is still open>

## Entries

<!-- Add entries here, newest last. -->

### Step 2: Data model and seed data (2026-10-30)

**Instruction:**

- Keep the code in the standard NestJS layout; write the constraint tests before the migration.

| Issue                                                                               | Caught by                       | Root cause                                                     | Fix                                                                                    |
| ----------------------------------------------------------------------------------- | ------------------------------- | -------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| First design used ports, use-case classes and in-memory fakes; hard to follow       | Owner code review               | Agent applied Clean Architecture beyond what the project needs | Standard NestJS feature modules                                                        |
| In-memory fakes could not reproduce exclusion constraints, savepoints or lock waits | Owner review                    | Fakes model PostgreSQL behavior by hand                        | Fakes removed; database behavior tested against PostgreSQL                             |
| Agent filled the third commit with booking rules instead of the data model          | Owner review of the commit list | Agent misread the requested commit order                       | Commit rebuilt as data model and seed; booking rules moved to the booking service step |

| Owner decision                                  | Reason                                                       |
| ----------------------------------------------- | ------------------------------------------------------------ |
| Standard NestJS layout instead of layered ports | Readability for the owner and reviewers at this project size |
| One commit per step, in the order the owner set | Reviewable history                                           |

**Verification:**

- Constraint tests failed before the migration existed, then 16 integration tests passed.
- On the Compose stack, the migration ran on startup and the seed inserted 23 vehicles and 5 technicians; e2e tests passed.

### Step 3: Booking service (2026-10-31)

**Instruction:**

- Build the booking service: allocate a qualified technician and a free bay in one transaction, test first.

| Issue                                                                                | Caught by                | Root cause                     | Fix                                                                                                                             |
| ------------------------------------------------------------------------------------ | ------------------------ | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| Rules sat in a separate `scheduling/` folder that was neither a module nor a service | Owner review             | Leftover of the layered design | Rules became `BookingPolicyService` in `AppointmentsModule`; time utilities and errors moved to `common/`; unit tests colocated |

| Owner decision                                                | Reason                                              |
| ------------------------------------------------------------- | --------------------------------------------------- |
| Customer taken from the vehicle's owner, not from the request | Matches the brief's inputs; no mismatch to validate |

**Verification:**

- Unit and HTTP integration tests written first; 28 unit and 43 integration tests pass.
- Live stack: four parallel bookings for one slot gave three `201` and one `409`; logs showed savepoint retries skipping taken technicians and bays.
