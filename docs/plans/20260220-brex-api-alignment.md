# Brex API Alignment

## Overview
Migrate the cloned CLI from Mercury-style endpoints and payloads to official Brex API endpoints and schema shapes.

## Steps

### 1. Update shared API config/client
- Set default base URL to `https://platform.brexapis.com` in `sources/config.ts`.
- Keep bearer token auth flow and existing local token storage in `~/.brex/token`.

### 2. Rework account/transaction/statement surfaces
- `sources/commands/accounts/index.ts`
  - map to `/v2/accounts/cash` and `/v2/accounts/card`
  - add `--type cash|card|all` and cursor support
- `sources/commands/transactions/index.ts`
  - map to `/v2/accounts/{cash|card}/{id}/transactions`
  - add `--type`, `--cursor`, `--limit`, time range options
  - make `transactions send` explicitly redirect users to `brex transfer`
- `sources/commands/statements/index.ts`
  - map to `/v2/accounts/card/primary/statements`
  - map to `/v2/accounts/card/additional/{account_id}/statements`

### 3. Rework team endpoints
- `sources/commands/users/index.ts` -> `/v2/users`
- `sources/commands/cards/index.ts` -> `/v2/cards`
- `sources/commands/organization/index.ts` -> `/v2/company`

### 4. Rework payments + webhooks/events
- `sources/commands/recipients/index.ts` -> `/v1/payment_counterparties`
- `sources/commands/transfer/index.ts` -> `/v1/transfers`
- `sources/commands/webhooks/index.ts` -> `/v1/webhooks`
- `sources/commands/events/index.ts` -> `/v1/events`

### 5. Handle unsupported category surface
- `sources/commands/categories/index.ts` changed to explicit unsupported message.

### 6. Refresh docs
- Replace inherited README with Brex-specific usage and endpoint references.

## Validation
- `bun run build` passes.
- `bun ./sources/main.ts --help` shows Brex-oriented command surface.
- `bun run typecheck` could not run in this environment because `tsc` is not installed yet.
