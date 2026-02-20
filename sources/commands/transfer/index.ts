import type { Command, CommandContext } from "../types.js";
import { formatAmount, formatDate, parseOutputFlag, printJson, printTable, truncate } from "../../output.js";

const USAGE = `brex transfer create --from <cash-account-id> --to <payment-instrument-id> --amount <cents> --description <text> --memo <text> [--currency <code>] [--approval manual]
brex transfer create --from <cash-account-id> --to-account <cash-account-id> --amount <cents> --description <text> --memo <text>  (book transfer between own accounts)
brex transfer get <transfer-id>
brex transfer list [--cursor <cursor>] [--limit <N>]
brex transfer --json`;

type Transfer = {
  id: string;
  amount: { amount: number; currency?: string };
  status: string;
  payment_type: string;
  originating_account: {
    type: string;
    id: string;
  };
  counterparty?: {
    type: string;
    id?: string;
    payment_instrument_id?: string;
    description?: string;
    routing_number?: string;
    account_number?: string;
    external_memo?: string;
    deposit_account_id?: string;
  };
  description?: string;
  display_name?: string;
  external_memo?: string;
  process_date?: string;
  estimated_delivery_date?: string;
  created_at?: string;
  creator_user_id?: string;
  cancellation_reason?: string;
  idempotency_key?: string;
  is_ppro_enabled?: boolean;
};

type ListTransfersResponse = {
  items: Transfer[];
  next_cursor?: string;
};

type CounterpartyType = "VENDOR" | "BOOK_TRANSFER";

type CreateTransferOptions = {
  fromAccountId: string;
  counterpartyType: CounterpartyType;
  toPaymentInstrumentId?: string;
  toDepositAccountId?: string;
  amountCents: number;
  currency: string;
  description: string;
  externalMemo: string;
  idempotencyKey: string;
  approvalType?: "MANUAL";
};

type ListTransferOptions = {
  cursor?: string;
  limit?: number;
};

export const transferCommand: Command = {
  name: "transfer",
  description: "Create and inspect transfers.",
  usage: USAGE,
  run: async (args, context) => {
    const { format, args: remaining } = parseOutputFlag(args);
    const subcommand = remaining[0];

    if (subcommand === "get") {
      const transferId = remaining[1];
      if (!transferId) throw new Error("Usage: brex transfer get <transfer-id>");
      await getTransfer(context, transferId, format);
      return;
    }

    if (subcommand === "list" || !subcommand) {
      await listTransfers(context, parseListTransferOptions(remaining.slice(subcommand === "list" ? 1 : 0)), format);
      return;
    }

    if (subcommand === "create") {
      const options = parseCreateTransferOptions(remaining.slice(1));
      await createTransfer(context, options, format);
      return;
    }

    // If no subcommand matched but args start with --, assume create
    if (subcommand.startsWith("--")) {
      const options = parseCreateTransferOptions(remaining);
      await createTransfer(context, options, format);
      return;
    }

    throw new Error(`Unknown subcommand: ${subcommand}. Use 'create', 'get', or 'list'.`);
  },
};

function parseCreateTransferOptions(args: readonly string[]): CreateTransferOptions {
  let fromAccountId: string | undefined;
  let toPaymentInstrumentId: string | undefined;
  let toDepositAccountId: string | undefined;
  let amountCents: number | undefined;
  let currency = "USD";
  let description: string | undefined;
  let externalMemo: string | undefined;
  let idempotencyKey: string | undefined;
  let approvalType: "MANUAL" | undefined;

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (!arg) continue;

    if (arg === "--from") {
      const value = args[++i];
      if (!value) throw new Error("--from requires a value");
      fromAccountId = value;
      continue;
    }

    if (arg === "--to") {
      const value = args[++i];
      if (!value) throw new Error("--to requires a payment_instrument_id");
      toPaymentInstrumentId = value;
      continue;
    }

    if (arg === "--to-account") {
      const value = args[++i];
      if (!value) throw new Error("--to-account requires a cash account ID (for book transfers)");
      toDepositAccountId = value;
      continue;
    }

    if (arg === "--amount") {
      const value = args[++i];
      if (!value) throw new Error("--amount requires a value (in cents, e.g. 12550 for $125.50)");
      const parsed = parseInt(value, 10);
      if (Number.isNaN(parsed) || parsed <= 0) {
        throw new Error("--amount must be a positive integer in cents (e.g. 12550 for $125.50)");
      }
      amountCents = parsed;
      continue;
    }

    if (arg === "--currency") {
      const value = args[++i];
      if (!value) throw new Error("--currency requires a value");
      currency = value.toUpperCase();
      continue;
    }

    if (arg === "--description" || arg === "--desc") {
      const value = args[++i];
      if (!value) throw new Error(`${arg} requires a value`);
      description = value;
      continue;
    }

    if (arg === "--memo" || arg === "--external-memo") {
      const value = args[++i];
      if (!value) throw new Error(`${arg} requires a value`);
      if (value.length > 90) throw new Error("Memo must be at most 90 characters");
      externalMemo = value;
      continue;
    }

    if (arg === "--idempotency-key") {
      const value = args[++i];
      if (!value) throw new Error("--idempotency-key requires a value");
      idempotencyKey = value;
      continue;
    }

    if (arg === "--approval") {
      const value = args[++i];
      if (value?.toUpperCase() === "MANUAL") {
        approvalType = "MANUAL";
      } else {
        throw new Error("--approval must be 'manual'");
      }
      continue;
    }

    if (arg.startsWith("-")) {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  if (!fromAccountId) throw new Error("Missing required --from <cash-account-id>");
  if (!toPaymentInstrumentId && !toDepositAccountId) {
    throw new Error("Missing required --to <payment-instrument-id> or --to-account <cash-account-id>");
  }
  if (toPaymentInstrumentId && toDepositAccountId) {
    throw new Error("Cannot use both --to and --to-account. Use --to for vendor payments, --to-account for book transfers.");
  }
  if (!amountCents) throw new Error("Missing required --amount <cents>");
  if (!description) throw new Error("Missing required --description");
  if (!externalMemo) throw new Error("Missing required --memo");

  const counterpartyType: CounterpartyType = toDepositAccountId ? "BOOK_TRANSFER" : "VENDOR";

  return {
    fromAccountId,
    counterpartyType,
    toPaymentInstrumentId,
    toDepositAccountId,
    amountCents,
    currency,
    description,
    externalMemo,
    idempotencyKey: idempotencyKey ?? crypto.randomUUID(),
    approvalType,
  };
}

function parseListTransferOptions(args: readonly string[]): ListTransferOptions {
  const options: ListTransferOptions = {};

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (!arg) continue;

    if (arg === "--cursor") {
      const value = args[++i];
      if (!value) throw new Error("--cursor requires a value");
      options.cursor = value;
      continue;
    }

    if (arg === "--limit") {
      const value = args[++i];
      if (!value) throw new Error("--limit requires a value");
      const parsed = parseInt(value, 10);
      if (Number.isNaN(parsed) || parsed <= 0) {
        throw new Error("--limit must be a positive integer");
      }
      options.limit = parsed;
      continue;
    }

    if (arg.startsWith("-")) {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  return options;
}

async function createTransfer(
  context: CommandContext,
  options: CreateTransferOptions,
  format: "table" | "json"
): Promise<void> {
  const counterparty = options.counterpartyType === "BOOK_TRANSFER"
    ? { type: "BOOK_TRANSFER" as const, recipient: { type: "ACCOUNT_ID", id: options.toDepositAccountId } }
    : { type: "VENDOR" as const, payment_instrument_id: options.toPaymentInstrumentId };

  const body = {
    originating_account: {
      type: "BREX_CASH",
      id: options.fromAccountId,
    },
    counterparty,
    amount: {
      amount: options.amountCents,
      currency: options.currency,
    },
    description: options.description,
    external_memo: options.externalMemo,
    ...(options.approvalType ? { approval_type: options.approvalType } : {}),
  };

  const transfer = await context.client.fetch<Transfer>("/v1/transfers", {
    method: "POST",
    headers: {
      "Idempotency-Key": options.idempotencyKey,
    },
    body: JSON.stringify(body),
  });

  if (format === "json") {
    printJson(transfer);
    return;
  }

  printTransferDetails(transfer, "Transfer Created");
}

async function getTransfer(
  context: CommandContext,
  transferId: string,
  format: "table" | "json"
): Promise<void> {
  const transfer = await context.client.fetch<Transfer>(`/v1/transfers/${transferId}`);

  if (format === "json") {
    printJson(transfer);
    return;
  }

  printTransferDetails(transfer, "Transfer Details");
}

async function listTransfers(
  context: CommandContext,
  options: ListTransferOptions,
  format: "table" | "json"
): Promise<void> {
  const params = new URLSearchParams();
  if (options.cursor) params.set("cursor", options.cursor);
  if (options.limit) params.set("limit", String(options.limit));
  const query = params.toString();
  const path = query ? `/v1/transfers?${query}` : "/v1/transfers";
  const response = await context.client.fetch<ListTransfersResponse>(path);
  const transfers = response.items ?? [];

  if (format === "json") {
    printJson({ items: transfers, nextCursor: response.next_cursor ?? null });
    return;
  }

  if (transfers.length === 0) {
    console.log("No transfers found.");
    return;
  }

  printTable(
    transfers.map((transfer) => {
      const cents = transfer.amount.amount;
      const isIncoming = cents < 0;
      return {
        id: transfer.id,
        direction: isIncoming ? "IN" : "OUT",
        name: truncate(transfer.display_name ?? transfer.counterparty?.description ?? "-", 20),
        amount: formatAmount(Math.abs(cents), transfer.amount.currency),
        status: transfer.status,
        type: transfer.payment_type,
        date: formatDate(transfer.process_date ?? transfer.created_at),
      };
    }),
    [
      { key: "id", header: "Transfer ID", width: 36 },
      { key: "direction", header: "Dir", width: 4 },
      { key: "name", header: "Name", width: 20 },
      { key: "amount", header: "Amount", width: 14 },
      { key: "status", header: "Status", width: 18 },
      { key: "type", header: "Type", width: 18 },
      { key: "date", header: "Date", width: 12 },
    ]
  );

  if (response.next_cursor) {
    console.log(`\nMore results available. Run with: --cursor ${response.next_cursor}`);
  }
}

function printTransferDetails(transfer: Transfer, title: string): void {
  const cents = transfer.amount.amount;
  const isIncoming = cents < 0;
  console.log(title);
  console.log("──────────────────");
  console.log(`ID:           ${transfer.id}`);
  console.log(`Direction:    ${isIncoming ? "INCOMING (credit)" : "OUTGOING (debit)"}`);
  console.log(`Name:         ${transfer.display_name ?? transfer.counterparty?.description ?? "-"}`);
  console.log(`From Account: ${transfer.originating_account.id}`);
  console.log(`To:           ${transfer.counterparty?.id ?? transfer.counterparty?.payment_instrument_id ?? "-"}`);
  console.log(`Amount:       ${formatAmount(Math.abs(cents), transfer.amount.currency)}`);
  console.log(`Status:       ${transfer.status}`);
  console.log(`Type:         ${transfer.payment_type}`);
  if (transfer.cancellation_reason) console.log(`Cancelled:    ${transfer.cancellation_reason}`);
  if (transfer.process_date) console.log(`Process Date: ${formatDate(transfer.process_date)}`);
  if (transfer.estimated_delivery_date) console.log(`Est Delivery: ${formatDate(transfer.estimated_delivery_date)}`);
  if (transfer.external_memo) console.log(`Memo:         ${transfer.external_memo}`);
  if (transfer.description) console.log(`Description:  ${transfer.description}`);
  if (transfer.creator_user_id) console.log(`Creator:      ${transfer.creator_user_id}`);
}
