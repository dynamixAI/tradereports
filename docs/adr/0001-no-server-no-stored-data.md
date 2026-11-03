# ADR 0001: No server and no stored data in version 1

- Status: Accepted
- Date: 2026-10-31

## Context

Users load CSV exports that contain client names, addresses and money owed. Storing this data on a server would make us responsible for protecting it and would create risks such as one user seeing another user's data.

## Decision

Version 1 runs entirely in the browser. Files are read in memory and are never uploaded. Only settings (such as column matches) are saved in browser storage. No client data is placed in links, logs or browser storage.

## Consequences

- No database, no logins and no server to secure.
- One user can never see another user's data, because nothing is stored centrally.
- Users must load their files again each session.
- A Content Security Policy must block all outgoing network requests with user data.
