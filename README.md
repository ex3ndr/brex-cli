# brex-cli

![Brex CLI Hero](hero.jpg)

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

A powerful CLI for the [Brex Platform API](https://developer.brex.com/). Manage accounts, transactions, transfers, recipients, webhooks, and more from your terminal.

## Features

- 🏦 **Full Brex API coverage** — accounts, transactions, transfers, recipients, cards, statements, webhooks, and more
- 📊 **Multiple output formats** — human-readable tables or JSON for scripting
- 🔐 **Secure token storage** — credentials stored safely in `~/.brex/`
- 💳 **Cash & card accounts** — unified interface for both account types
- 🤖 **Scriptable** — no interactive prompts, perfect for CI/CD and automation

## Installation

```bash
npm install -g brex-cli
```

### Requirements

- Node.js v18 or later

---

## Quick Start

```bash
# 1. Get your API token from Brex Developer Portal
#    https://developer.brex.com/

# 2. Authenticate
brex login --token <YOUR_API_TOKEN>

# 3. List your accounts
brex accounts list

# 4. View transactions
brex transactions <account-id>
```

---

## Global Options

All commands support these global options:

| Option | Description |
|--------|-------------|
| `--json` | Output as JSON instead of human-readable tables |
| `-h`, `--help` | Show help for the command |
| `-v`, `--version` | Show CLI version |

---

## Authentication

Brex CLI uses API tokens for authentication. Tokens are stored locally in `~/.brex/token`.

### Getting Your API Token

1. Log in to the [Brex Developer Portal](https://developer.brex.com/)
2. Create an API token with the appropriate scopes
3. Copy the token

### `brex login`

Store an API token for authentication.

**Syntax:**
```
brex login --token <TOKEN>
brex login --token-stdin
```

**Flags:**

| Flag | Required | Description |
|------|----------|-------------|
| `--token <TOKEN>` | One of these | API token string |
| `--token-stdin` | One of these | Read token from stdin |

**Examples:**

```bash
# Direct token input
brex login --token "brex_prod_xxx..."

# From environment variable
brex login --token "$BREX_TOKEN"

# From stdin (CI/CD friendly)
echo "$BREX_TOKEN" | brex login --token-stdin

# From file
cat ~/.secrets/brex | brex login --token-stdin
```

---

### `brex logout`

Remove stored authentication token.

```bash
brex logout
```

---

### `brex status`

Show current authentication and configuration status.

```bash
brex status
```

**Example Output:**
```
Brex CLI Status
──────────────────
Authenticated: Yes
Token: brex_prod...xxxx
API Base URL: https://platform.brexapis.com
Default Account: abc123-def456-...
```

---

## Token Storage & Configuration

| File | Purpose |
|------|---------|
| `~/.brex/token` | API token |
| `~/.brex/config.json` | Optional configuration (default account, API base URL) |

---

## Accounts

Manage Brex bank accounts (cash and card).

**Aliases:** `account`, `acc`

### `brex accounts list`

List all accounts.

**Syntax:**
```
brex accounts list [--type cash|card|all] [--cursor <cursor>] [--json]
```

**Options:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `--type` | string | `all` | Account type: `cash`, `card`, or `all` |
| `--cursor` | string | none | Pagination cursor for next page |

### `brex accounts get`

Get detailed information about a specific account.

**Syntax:**
```
brex accounts get <account-id> [--type cash|card] [--json]
```

---

## Transactions

View account transactions.

**Aliases:** `tx`, `txn`

### `brex transactions`

List transactions for an account.

**Syntax:**
```
brex transactions <account-id> [options] [--json]
brex transactions --type card [options] [--json]
```

**Options:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `--type` | string | `cash` | Account type: `cash` or `card` |
| `--limit <N>` | integer | API default | Maximum number of transactions to return |
| `--cursor` | string | none | Pagination cursor |
| `--posted-at-start` | ISO date | none | Filter transactions posted on or after this date |

> **Note:** Cash transactions require an `<account-id>`. Card transactions use the primary card account automatically (`--type card`).

**Examples:**

```bash
# List recent cash transactions
brex transactions dpacc_xxx

# Card transactions with limit
brex transactions --type card --limit 50

# Filter by posted date
brex transactions dpacc_xxx --posted-at-start 2026-01-01

# Paginate results
brex transactions dpacc_xxx --cursor <cursor>
```

---

## Transfers (Payments API)

Create and manage transfers. Supports vendor payments (ACH/wire) and book transfers between your own accounts.

### `brex transfer create`

Send funds to a vendor or move money between your own accounts.

**Vendor payment:**
```
brex transfer create --from <cash-account-id> --to <payment-instrument-id> --amount <cents> --description <text> --memo <text> [--currency <code>] [--approval manual]
```

**Book transfer (between own accounts):**
```
brex transfer create --from <cash-account-id> --to-account <cash-account-id> --amount <cents> --description <text> --memo <text>
```

**Options:**

| Option | Required | Type | Description |
|--------|----------|------|-------------|
| `--from` | Yes | string | Source cash account ID |
| `--to` | One of | string | Vendor's payment instrument ID (from `/vendors`) |
| `--to-account` | One of | string | Destination cash account ID (book transfer) |
| `--amount` | Yes | integer | Amount in **cents** (e.g., `12550` for $125.50) |
| `--description` | Yes | string | Internal description (not shown externally) |
| `--memo` | Yes | string | External memo (max 90 chars for ACH/wire, 40 for cheque) |
| `--currency` | No | string | Currency code (default: `USD`) |
| `--idempotency-key` | No | string | Dedup key (auto-generated if omitted) |
| `--approval` | No | string | Set to `manual` to require manual approval |

> **Note:** Use `--to` for vendor payments and `--to-account` for moving money between your own Brex cash accounts. Cannot use both.

**Examples:**

```bash
# Pay a vendor $125.50 via ACH
brex transfer create --from dpacc_xxx --to pyi_xxx --amount 12550 --description "Invoice 001" --memo "Payment for services"

# Move $1.00 from Primary to Vault
brex transfer create --from dpacc_xxx --to-account dpacc_yyy --amount 100 --description "Savings" --memo "Move to vault"

# With manual approval required
brex transfer create --from dpacc_xxx --to pyi_xxx --amount 50000 --description "Large payment" --memo "Q1 invoice" --approval manual
```

### `brex transfer get`

Get details about a specific transfer.

```bash
brex transfer get <transfer-id> [--json]
```

### `brex transfer list`

List transfers.

**Syntax:**
```
brex transfer list [--limit <N>] [--cursor <cursor>] [--json]
```

**Options:**

| Option | Type | Description |
|--------|------|-------------|
| `--limit` | integer | Maximum results |
| `--cursor` | string | Pagination cursor |

The list view shows direction (IN/OUT), counterparty name, amount, status, payment type, and date.

---

## Recipients (Vendors)

Manage payment vendors (counterparties) for outbound transfers. Uses the Brex `/v1/vendors` API.

**Aliases:** `recipient`, `recip`

### `brex recipients list`

List all vendors.

**Syntax:**
```
brex recipients [list] [--limit <N>] [--cursor <cursor>] [--name <name>] [--json]
```

**Options:**

| Option | Type | Description |
|--------|------|-------------|
| `--limit` | integer | Maximum results |
| `--cursor` | string | Pagination cursor |
| `--name` | string | Filter by company name |

### `brex recipients get`

Get detailed vendor info including payment accounts and instruments.

```bash
brex recipients get <vendor-id> [--json]
```

### `brex recipients create`

Create a new vendor. Optionally attach an ACH payment account.

**Syntax:**
```
brex recipients create --name <company-name> [--email <email>] [--phone <phone>] [--routing <number> --account <number> --account-type CHECKING|SAVING --account-class BUSINESS|PERSONAL] [--idempotency-key <key>]
```

**Options:**

| Option | Required | Type | Description |
|--------|----------|------|-------------|
| `--name` | Yes | string | Company name (must be unique) |
| `--email` | No | string | Vendor email |
| `--phone` | No | string | Vendor phone |
| `--routing` | No* | string | Bank routing number |
| `--account` | No* | string | Bank account number |
| `--account-type` | No* | string | `CHECKING` or `SAVING` |
| `--account-class` | No* | string | `BUSINESS` or `PERSONAL` |
| `--idempotency-key` | No | string | Dedup key (auto-generated if omitted) |

> *If any ACH field is provided, all four (`--routing`, `--account`, `--account-type`, `--account-class`) are required.

### `brex recipients delete`

Delete a vendor.

```bash
brex recipients delete <vendor-id>
```

---

## Cards

View card information.

**Aliases:** `card`

### `brex cards list`

List cards with optional filters.

**Syntax:**
```
brex cards [list] [--user-id <user-id>] [--cursor <cursor>] [--limit <N>] [--json]
```

### `brex cards get`

Get details about a specific card.

```bash
brex cards get <card-id> [--json]
```

---

## Users

List and view organization members.

**Aliases:** `user`

### `brex users list`

List all users in the organization.

**Syntax:**
```
brex users [list] [--cursor <cursor>] [--email <email>] [--json]
```

### `brex users get`

Get details about a specific user.

```bash
brex users get <user-id> [--json]
```

---

## Organization

**Aliases:** `org`

### `brex organization`

Get organization information (legal name, DBA, status, address).

```bash
brex organization [--json]
```

---

## Statements

View card account statements.

**Aliases:** `statement`

### `brex statements`

List statements for a card account.

**Syntax:**
```
brex statements [--scope primary|additional] [--account-id <id>] [--cursor <cursor>] [--json]
```

**Options:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `--scope` | string | `primary` | `primary` or `additional` card account |
| `--account-id` | string | none | Required when scope is `additional` |
| `--cursor` | string | none | Pagination cursor |

### `brex statements get`

Get a specific statement.

```bash
brex statements get <statement-id> [--scope primary|additional] [--account-id <id>] [--json]
```

---

## Webhooks

Manage webhook endpoints.

**Aliases:** `webhook`, `wh`

### `brex webhooks list`

List all webhook endpoints.

```bash
brex webhooks [list] [--cursor <cursor>] [--limit <N>] [--json]
```

### `brex webhooks get`

Get details about a webhook.

```bash
brex webhooks get <webhook-id> [--json]
```

### `brex webhooks create`

Create a new webhook endpoint.

**Syntax:**
```
brex webhooks create --url <url> [--events <event1,event2>] [--status <status>] [--idempotency-key <key>] [--json]
```

**Event Types:** `PAYMENT_COMPLETED`, `TRANSFER_COMPLETED`, and others.

### `brex webhooks update`

Update an existing webhook.

```bash
brex webhooks update <webhook-id> [--url <url>] [--status <status>] [--events <events>] [--json]
```

### `brex webhooks delete`

Delete a webhook endpoint.

```bash
brex webhooks delete <webhook-id>
```

---

## Events

View webhook event history.

**Aliases:** `event`

### `brex events list`

List webhook events.

**Syntax:**
```
brex events [list] [--event-type <type>] [--after-date <ISO>] [--before-date <ISO>] [--cursor <cursor>] [--limit <N>] [--json]
```

### `brex events get`

Get details about a specific event.

```bash
brex events get <event-id> [--json]
```

---

## Scripting Examples

### Export Transactions to CSV

```bash
brex transactions "$ACCOUNT_ID" --json | \
  jq -r '.items[] | [.id, .type, .amount.amount, .description] | @csv'
```

### Daily Balance Check

```bash
brex accounts get "$ACCOUNT_ID" --type cash --json | jq -r '.available_balance'
```

### List All Incoming Transfers

```bash
brex transfer list --json | jq '.items[] | select(.amount.amount < 0)'
```

---

## API Reference

- **Base URL:** `https://platform.brexapis.com`
- **Authentication:** Bearer token
- **Documentation:** [developer.brex.com](https://developer.brex.com/)

### API Sources

| Domain | Reference |
|--------|-----------|
| Authentication | [developer.brex.com/openapi/authentication](https://developer.brex.com/openapi/authentication) |
| Transactions | [developer.brex.com/openapi/transactions](https://developer.brex.com/openapi/transactions) |
| Team | [developer.brex.com/openapi/team](https://developer.brex.com/openapi/team) |
| Payments | [developer.brex.com/openapi/payments](https://developer.brex.com/openapi/payments) |
| Webhooks | [developer.brex.com/openapi/webhooks](https://developer.brex.com/openapi/webhooks) |

---

## Disclaimer

This is an unofficial CLI. Verify scopes, permissions, and request payload requirements in Brex docs before production use.

## License

MIT License. See [LICENSE](LICENSE) for details.
