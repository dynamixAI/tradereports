# ADR 0002: Multi-tenant data model and repository pattern

- Status: Accepted
- Date: 2026-10-31

## Context

A future version may add accounts, saved reports or a Jobber API connection. Adding business separation later would mean rewriting most of the code.

## Decision

- Every record carries a `businessId`. In version 1 it is always `"local"`.
- Record ids are random UUIDs, never counting numbers.
- All data access goes through repository interfaces that require an `AccessContext` (user and business). No code can read data without saying whose data it is.
- A shared contract test proves that one business cannot read another business's records. Every repository implementation must pass it.

## Consequences

- Version 1 uses an in-memory repository.
- A database repository can be added later without changing the core logic or the UI.
