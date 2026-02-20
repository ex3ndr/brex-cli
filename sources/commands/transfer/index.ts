import type { Command, CommandContext } from "../types.js";
import { formatAmount, parseOutputFlag, printJson, printTable } from "../../output.js";

const USAGE = `brex transfer --from <cash-account-id> --to <counterparty-id> --amount <decimal> --idempotency-key <key> [--currency <code>]
brex transfer get <transfer-id>
brex transfer list [--cursor <cursor>] [--limit <N>] [--status <status>] [--from-account-id <id>] [--to-counterparty-id <id>]
brex transfer --json`;

type TransferAmount = {
  amount: string;
  currency: string;
};

type Transfer = {
  id: string;
  amount?: TransferAmount;
  status?: string;
  created_at?: string;
  idempotency_key?: string;
  from_account?: {
    cash_account?: { id?: string };
  };
  recipient?: {
    payment_counterparty?: { id?: string };
  };
};

type CreateTransferRequest = {
  from_account: {
    cash_account: {
      id: string;
    };
  };
  recipient: {
    payment_counterparty: {
      id: string;
    };
  };
  amount: TransferAmount;
  idempotency_key: string;
};

type ListTransfersResponse = {
  items?: Transfer[];
  transfers?: Transfer[];
  next_cursor?: string;
};

type GetTransferResponse = {
  transfer?: Transfer;
  item?: Transfer;
} & Transfer;

type CreateTransferOptions = {
  fromAccountId: string;
  toCounterpartyId: string;
  amount: string;
  currency: string;
  idempotencyKey: string;
};

type ListTransferOptions = {
  cursor?: string;
  limit?: number;
  status?: string;
  fromAccountId?: string;
  toCounterpartyId?: string;
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

    if (subcommand === "list") {
      await listTransfers(context, parseListTransferOptions(remaining.slice(1)), format);
      return;
    }

    const options = parseCreateTransferOptions(remaining);
    await createTransfer(context, options, format);
  },
};

function parseCreateTransferOptions(args: readonly string[]): CreateTransferOptions {
  let fromAccountId: string | undefined;
  let toCounterpartyId: string | undefined;
  let amount: string | undefined;
  let currency = "USD";
  let idempotencyKey: string | undefined;

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
      if (!value) throw new Error("--to requires a value");
      toCounterpartyId = value;
      continue;
    }

    if (arg === "--amount") {
      const value = args[++i];
      if (!value) throw new Error("--amount requires a value");
      const parsed = Number(value);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        throw new Error("--amount must be a positive number (e.g. 125.50)");
      }
      amount = parsed.toFixed(2);
      continue;
    }

    if (arg === "--currency") {
      const value = args[++i];
      if (!value) throw new Error("--currency requires a value");
      currency = value.toUpperCase();
      continue;
    }

    if (arg === "--idempotency-key") {
      const value = args[++i];
      if (!value) throw new Error("--idempotency-key requires a value");
      idempotencyKey = value;
      continue;
    }

    if (arg.startsWith("-")) {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  if (!fromAccountId) throw new Error("Missing required --from");
  if (!toCounterpartyId) throw new Error("Missing required --to");
  if (!amount) throw new Error("Missing required --amount");
  if (!idempotencyKey) throw new Error("Missing required --idempotency-key");

  return { fromAccountId, toCounterpartyId, amount, currency, idempotencyKey };
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

    if (arg === "--status") {
      const value = args[++i];
      if (!value) throw new Error("--status requires a value");
      options.status = value;
      continue;
    }

    if (arg === "--from-account-id") {
      const value = args[++i];
      if (!value) throw new Error("--from-account-id requires a value");
      options.fromAccountId = value;
      continue;
    }

    if (arg === "--to-counterparty-id") {
      const value = args[++i];
      if (!value) throw new Error("--to-counterparty-id requires a value");
      options.toCounterpartyId = value;
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
  const body: CreateTransferRequest = {
    from_account: {
      cash_account: {
        id: options.fromAccountId,
      },
    },
    recipient: {
      payment_counterparty: {
        id: options.toCounterpartyId,
      },
    },
    amount: {
      amount: options.amount,
      currency: options.currency,
    },
    idempotency_key: options.idempotencyKey,
  };

  const response = await context.client.fetch<GetTransferResponse>("/v1/transfers", {
    method: "POST",
    headers: {
      "Idempotency-Key": options.idempotencyKey,
    },
    body: JSON.stringify(body),
  });
  const transfer = response.transfer ?? response.item ?? response;

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
  const response = await context.client.fetch<GetTransferResponse>(`/v1/transfers/${transferId}`);
  const transfer = response.transfer ?? response.item ?? response;

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
  if (options.status) params.set("status", options.status);
  if (options.fromAccountId) params.set("from_account_id", options.fromAccountId);
  if (options.toCounterpartyId) params.set("to_counterparty_id", options.toCounterpartyId);
  const query = params.toString();
  const path = query ? `/v1/transfers?${query}` : "/v1/transfers";
  const response = await context.client.fetch<ListTransfersResponse>(path);
  const transfers = response.items ?? response.transfers ?? [];

  if (format === "json") {
    printJson({ items: transfers, nextCursor: response.next_cursor ?? null });
    return;
  }

  if (transfers.length === 0) {
    console.log("No transfers found.");
    return;
  }

  printTable(
    transfers.map((transfer) => ({
      id: transfer.id,
      from: transfer.from_account?.cash_account?.id ?? "-",
      to: transfer.recipient?.payment_counterparty?.id ?? "-",
      amount: transfer.amount
        ? formatAmount(transfer.amount.amount, transfer.amount.currency)
        : "-",
      status: transfer.status ?? "-",
    })),
    [
      { key: "id", header: "Transfer ID", width: 36 },
      { key: "from", header: "From Account", width: 36 },
      { key: "to", header: "To Counterparty", width: 36 },
      { key: "amount", header: "Amount", width: 14 },
      { key: "status", header: "Status", width: 14 },
    ]
  );

  if (response.next_cursor) {
    console.log(`\nNext cursor: ${response.next_cursor}`);
  }
}

function printTransferDetails(transfer: Transfer, title: string): void {
  console.log(title);
  console.log("──────────────────");
  console.log(`ID:          ${transfer.id}`);
  console.log(`From Account:${" "}${transfer.from_account?.cash_account?.id ?? "-"}`);
  console.log(`To Recipient:${" "}${transfer.recipient?.payment_counterparty?.id ?? "-"}`);
  console.log(`Amount:      ${transfer.amount ? formatAmount(transfer.amount.amount, transfer.amount.currency) : "-"}`);
  console.log(`Status:      ${transfer.status ?? "-"}`);
  if (transfer.idempotency_key) {
    console.log(`Idempotency: ${transfer.idempotency_key}`);
  }
}
