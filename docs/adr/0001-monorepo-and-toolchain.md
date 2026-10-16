# ADR 0001 — Monorepo and toolchain

**Status:** Accepted · 2026-10-16

## Context

The mobile app, the admin web, the API and the worker share domain rules: image framing, scout vocabulary, bearing and coordinate formatting. These rules must not drift between client and server.

## Decision

- **pnpm workspaces** (pnpm 11), with no extra build orchestrator until build times justify one.
  - `apps/mobile`: Expo app
  - `apps/admin`: Next.js, added in Phase 2
  - `services/api`: Fastify
  - `services/worker`: image processing
  - `packages/shared`: domain rules and zod schemas
- **TypeScript ~6.0** everywhere, pinned to the version Expo SDK 58 expects, with strict mode and `noUncheckedIndexedAccess`.
- `packages/shared` is consumed **as TypeScript source**: Metro bundles it for mobile, `tsx` runs it for the services, and Vitest tests it. It has no build step.
- **Vitest** for unit and integration tests, and **Prettier** for formatting. CI runs format check, typecheck and tests on every push.
- **Node 24** LTS.
- pnpm 11's supply-chain policies stay on: install scripts need `allowBuilds`, and there is a minimum release age.

## Consequences

- The services run TypeScript through `tsx`. Before production we add a bundled build (esbuild) to the service container images.
- Adding a native dependency to mobile always goes through `npx expo install` so versions stay compatible with the SDK.
