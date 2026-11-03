# Agent Instructions

This repository is a backend implementation of Scenario A (Unified Service Scheduler) for the Keyloop technical assessment.

This file is the single, tool-agnostic source of agent instructions. Tool-specific files (for example `.claude/CLAUDE.md`) import it and must not duplicate its rules.

## Context map

At the start of every session, read `docs/PLAN.md` to find the current step. Then read what the task needs:

| Document                | Contains                                                                             | Read when                                     |
| ----------------------- | ------------------------------------------------------------------------------------ | --------------------------------------------- |
| `docs/ASSESSMENT.md`    | The original brief: Scenario A requirements, deliverables, evaluation criteria       | First session, and when scoping a feature     |
| `docs/SPEC.md`          | Scope, assumptions (A1 to A12), REST API, error catalog, acceptance tests            | Always, before the first change in a session  |
| `docs/SYSTEM_DESIGN.md` | Components, booking flow, data model, caching, observability, testing, key decisions | Writing or changing code, migrations or tests |
| `docs/PLAN.md`          | Build order, progress, definition of done                                            | Session start and every checkpoint            |
| `README.md`             | Commands for running, testing and the demo                                           | Running anything                              |
| `docs/ai-log.md`        | Record of human oversight for reviewers                                              | Only when adding an entry (see below)         |

`submission/system-design.md` (and its PDF) is a standalone copy of `docs/SPEC.md` and `docs/SYSTEM_DESIGN.md` compiled for the submission. It is not a source of truth: when those documents change, update it and export the PDF again.

Each fact has one home. When a document needs a fact defined elsewhere, link to it by file and heading; do not copy it and do not reference section numbers.

## Language policy

- All repository content is written in **professional English**: source code, identifiers, comments, commit messages, branch names, test names, documentation, logs, error messages and API responses.
- Conversation with the owner may be in the language the owner uses. Never copy conversational language into the repository.
- Keep tone formal and precise. No slang, no emojis, no filler comments.

## Working agreement

1. Work in small steps following the build order in `docs/PLAN.md`. At the end of each step, stop and report: what changed, which tests pass, remaining risks. Update the step's status and notes in `docs/PLAN.md`, then wait for the owner's confirmation before proceeding.
2. Test first for all booking logic. Never modify a test to make incorrect code pass. If a test seems wrong, explain why and ask.
3. Do not add features outside `docs/SPEC.md`; its Scope section lists what is out of scope. Ask for approval first.
4. When uncertain about a requirement, state the assumption and ask. Do not silently decide.
5. Verify, do not assume. Library APIs (especially TypeORM and Testcontainers) change between versions. Check the installed version and run the code before claiming it works.
6. When a design decision changes, update `docs/SYSTEM_DESIGN.md` (including Key Decisions) in the same step, after the owner approves the change.

## Architecture rules (non-negotiable)

Architecture, database and testing rules are defined in `docs/SYSTEM_DESIGN.md`. Follow them as written. The one that must never be violated:

- Double-booking prevention relies on PostgreSQL constraints and transactions, never on check-then-insert.

## Simplicity

- Use standard NestJS building blocks: feature modules, `@Injectable` services, controllers, DTOs with `class-validator`. Do not introduce ports, adapters, use-case classes or other abstraction layers without the owner's approval.
- Business rules belong in an injectable service of the feature module (for example `BookingPolicyService` in `appointments/`). Shared utilities and typed errors belong in `src/common/`. Unit tests sit next to the file they test (`*.spec.ts`).
- Logic whose correctness depends on PostgreSQL (constraints, transactions, savepoints, idempotency) is tested against PostgreSQL, never against in-memory fakes.

## Code quality standards

- TypeScript `strict` mode. No `any` without a justified comment.
- Imports across directories use the `@/` alias for `src/`; relative imports are only for files in the same directory.
- oxlint and Prettier must pass.
- Domain errors are typed and mapped to HTTP codes in one place (`GlobalExceptionFilter`), using the error catalog in `docs/SPEC.md`.
- Structured JSON logging with a correlation id on every request. No `console.log`.
- Public behavior is documented through OpenAPI decorators.
- Commits follow Conventional Commits (`feat:`, `fix:`, `test:`, `docs:`, `refactor:`, `chore:`), one logical change per commit. The `commit-msg` hook in `.githooks/` enforces the format; never bypass it with `--no-verify`.

## Development environment

- Everything runs in Docker Compose. Never install dependencies or run Node.js, npm or tests on the host.
- Run commands inside the app container: `docker compose exec app <command>`. The exact commands are in `README.md`.
- After installing a package in the running container, restart the app (`docker compose restart app`) so the TypeScript watcher resolves the new module.
- When a new command is introduced, document it in `README.md` in the same step. Expected set by the end: install, build, lint, unit tests, integration tests, run with Docker Compose, run the race-condition demo.

## AI collaboration log

`docs/ai-log.md` is source material for the AI Collaboration Narrative in the README and for the final video. It is a record for reviewers, not a reference for agents; persistent rules belong in this file.

Add an entry only when a step contains something worth showing a reviewer. Record only what shows human direction and oversight:

- The owner's instruction for the step, in one line.
- Where the AI output was wrong, missing or risky, and how the owner caught it (review, failing test, running the code).
- Significant decisions the owner made, with the reason.
- How the result was verified.

Do not record routine technical problems the agent found and fixed on its own (version conflicts, configuration fixes, tooling quirks), or changes of preference. Keep each entry to a few lines; table cells are short phrases, not sentences. Be factual. Do not embellish.
