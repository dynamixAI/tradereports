# ADR 0004: Toolchain versions and dev-only audit warnings

- Status: Accepted
- Date: 2026-11-03

## Context

TypeScript 7.0.2 was installed first. typescript-eslint only supports TypeScript below 6.1, so installing the linter failed with a peer dependency conflict.

After installing ESLint, `npm audit` reported 12 moderate warnings, all caused by one advisory in `minimatch` (GHSA-g3hv-75wg-m249), a dependency of ESLint. `npm audit fix --force` would have downgraded ESLint to version 4.0.0 (2017).

## Decision

- Pin TypeScript to 6.0.x until typescript-eslint supports 7.
- Do not force peer dependencies (`--force`, `--legacy-peer-deps`).
- Accept the moderate `minimatch` warning because it only affects dev tooling, which runs on our own file patterns and never ships to users.
- CI fails on high or critical vulnerabilities in production dependencies (`npm run audit:prod`).
- Dependabot will propose upgrades when fixed versions are released.

## Consequences

- Linting and type checking work with supported versions.
- Upgrading to TypeScript 7 needs a deliberate pull request once the tooling supports it.
- Dev-only advisories are reviewed rather than blindly "fixed".
