# brex-cli

CLI for the Brex APIs at `https://platform.brexapis.com`.

This project uses Brex endpoints from:
- Authentication: https://developer.brex.com/openapi/authentication
- Transactions: https://developer.brex.com/openapi/transactions
- Team: https://developer.brex.com/openapi/team
- Payments: https://developer.brex.com/openapi/payments
- Webhooks: https://developer.brex.com/openapi/webhooks

## Install

```bash
npm install -g "brex-cli"
```

## Authentication

Store an API access token locally:

```bash
brex login --token <ACCESS_TOKEN>
# or
cat token.txt | brex login --token-stdin
```

Token/config location:
- `~/.brex/token`
- `~/.brex/config.json`

Check status:

```bash
brex status
```

## Commands

### Accounts

```bash
brex accounts list --type all
brex accounts list --type cash --cursor <cursor>
brex accounts get <account-id> --type cash
```

### Transactions

```bash
brex transactions <account-id> --type cash --limit 50
brex transactions <account-id> --type card --cursor <cursor>
brex transactions get <account-id> <transaction-id> --type cash
```

### Transfers (Payments API)

```bash
brex transfer --from <cash-account-id> --to <counterparty-id> --amount 125.50 --idempotency-key <key>
brex transfer get <transfer-id>
brex transfer list --status PROCESSING --limit 20
```

### Recipients (Payment Counterparties)

```bash
brex recipients list --limit 50
brex recipients add --name "Vendor A" --account 123456789 --routing 021000021 --account-type CHECKING
brex recipients get <counterparty-id>
brex recipients delete <counterparty-id>
```

### Cards / Users / Organization

```bash
brex cards list --user-id <user-id>
brex cards get <card-id>

brex users list --cursor <cursor>
brex users get <user-id>

brex organization
```

### Statements

```bash
# Primary card account
brex statements --scope primary
brex statements get <statement-id> --scope primary

# Additional card account
brex statements --scope additional --account-id <card-account-id>
brex statements get <statement-id> --scope additional --account-id <card-account-id>
```

### Webhooks & Events

```bash
brex webhooks list
brex webhooks create --url https://example.com/webhooks/brex --events PAYMENT_COMPLETED,TRANSFER_COMPLETED
brex webhooks get <webhook-id>
brex webhooks update <webhook-id> --status ACTIVE
brex webhooks delete <webhook-id>

brex events list --event-type PAYMENT_COMPLETED --limit 25
brex events get <event-id>
```

## Notes

- `brex transactions send` is intentionally not used for outbound payments. Use `brex transfer`.
- `brex categories` is currently a placeholder because there is no direct categories endpoint wired in this CLI.

## Disclaimer

This is an unofficial CLI. Verify scopes, permissions, and request payload requirements in Brex docs before production use.
