# Assessment Brief

Summary of the Keyloop Technical Assessment, the source of every requirement in this repository. The original document is [`assessment/keyloop-technical-assessment.pdf`](assessment/keyloop-technical-assessment.pdf). Requirements derived from it, and the assumptions made where it is ambiguous, are in [`SPEC.md`](SPEC.md).

## Chosen scenario: A, the Unified Service Scheduler

Domain: Ownership. Replace manual service booking with an appointment scheduler.

| Core requirement             | Meaning                                                                                                   |
| ---------------------------- | --------------------------------------------------------------------------------------------------------- |
| Resource-constrained booking | A user requests an appointment for a vehicle, a service type and a dealership at a desired time.          |
| Real-time availability check | Before confirming, both a service bay and a qualified technician must be free for the whole duration.     |
| Confirmed appointment record | On success, a persistent appointment links the customer, the vehicle, the technician and the service bay. |

## What the brief asks for

- **Part 1, system design document:** architecture diagram, role of each component, data flow, technologies with justification, observability strategy, and a section on how GenAI assisted the design. Ambiguous requirements are resolved by documented assumptions.
- **Part 2, implementation of one layer:** this repository implements the **backend**: a RESTful API with a persistent database. The client is stubbed with cURL examples, an OpenAPI specification and a test harness. The design must consider scalability, performance, reliability, maintainability and observability.

## Deliverables

| Deliverable            | Where                                                                                                 |
| ---------------------- | ----------------------------------------------------------------------------------------------------- |
| System design document | [`SYSTEM_DESIGN.md`](SYSTEM_DESIGN.md)                                                                |
| Working code           | This repository. `README.md` covers build, run and test, and contains the AI Collaboration Narrative. |
| Tests of core logic    | `test/` (unit, integration, concurrency, e2e)                                                         |
| Video, 5 to 10 minutes | Recorded separately; draws on [`ai-log.md`](ai-log.md)                                                |

## Evaluation dimensions

1. Problem solving and system design: clarity, logic and foresight of the architecture.
2. Technical execution: quality, correctness and testing.
3. AI engineering and verification: how the AI was directed, and how its output was verified, debugged and owned.
4. Communication and presentation: documentation and video.

The third dimension is a primary criterion, which is why the working agreement in `AGENTS.md` requires human checkpoints and why `ai-log.md` records them.
