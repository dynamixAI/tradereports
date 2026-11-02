# ADR 0003: Future database choice

- Status: Proposed
- Date: 2026-10-31

## Context

If accounts or saved data are added, we need a database that enforces business separation even if application code has a bug.

## Decision

Use PostgreSQL with Row-Level Security, most likely hosted on Supabase, which provides both the database and user login. Every table includes `business_id`, and database policies only return rows that match the logged-in user's business.

## Consequences

- Separation is enforced by the database as well as the code.
- This decision will be confirmed or revised when a server is actually needed.
