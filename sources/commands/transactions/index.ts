import type { Command, CommandContext } from "../types.js";
import { formatAmount, formatDateTime, parseOutputFlag, printJson, printTable, truncate } from "../../output.js";

const USAGE = `brex transactions <account-id> [--type cash|card] [--limit <N>] [--cursor <cursor>] [--start-time <ISO>] [--end-time <ISO>]
brex transactions get <account-id> <transaction-id> [--type cash|card]
brex transactions --json`;

type AccountType = "cash" | "card";

type ApiAmount = {
  amount: string;
  currency: string;
};

type BrexTransaction = {
  id: string;
  status?: string;
  description?: string;
  memo?: string;
  posted_at?: string;
  initiated_at?: string;
  transaction_type?: string;
  transaction_source_type?: string;
  merchant_name?: string;
  counterparty_name?: string;
  amount?: ApiAmount;
};

type ListTransactionsResponse = {
  items?: BrexTransaction[];
  transactions?: BrexTransaction[];
  next_cursor?: string;
};

type GetTransactionResponse = {
  cash_transaction?: BrexTransaction;
  card_transaction?: BrexTransaction;
  transaction?: BrexTransaction;
  item?: BrexTransaction;
};

type ListOptions = {
  type: AccountType;
  limit?: number;
  cursor?: string;
  startTime?: string;
  endTime?: string;
};

type GetOptions = {
  type: AccountType;
};

export const transactionsCommand: Command = {
  name: "transactions",
  description: "List and view Brex account transactions.",
  usage: USAGE,
  aliases: ["tx", "txn"],
  run: async (args, context) => {
    const { format, args: remaining } = parseOutputFlag(args);

    if (remaining.length === 0) {
      throw new Error("Missing account ID. Usage: brex transactions <account-id>");
    }

    const firstArg = remaining[0]!;

    if (firstArg === "get") {
      const accountId = remaining[1];
      const transactionId = remaining[2];
      if (!accountId || !transactionId) {
        throw new Error("Usage: brex transactions get <account-id> <transaction-id> [--type cash|card]");
      }
      await getTransaction(context, accountId, transactionId, parseGetOptions(remaining.slice(3)), format);
      return;
    }

    if (firstArg === "send") {
      throw new Error("Brex sends money via Transfers API. Use `brex transfer` instead.");
    }

    const accountId = firstArg;
    const options = parseListOptions(remaining.slice(1));
    await listTransactions(context, accountId, options, format);
  },
};

function parseListOptions(args: readonly string[]): ListOptions {
  const options: ListOptions = { type: "cash" };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (!arg) continue;

    if (arg === "--type") {
      const value = args[++i];
      if (!value || (value !== "cash" && value !== "card")) {
        throw new Error("--type must be one of: cash, card");
      }
      options.type = value;
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

    if (arg === "--cursor") {
      const value = args[++i];
      if (!value) throw new Error("--cursor requires a value");
      options.cursor = value;
      continue;
    }

    if (arg === "--start-time" || arg === "--start") {
      const value = args[++i];
      if (!value) throw new Error(`${arg} requires a value`);
      options.startTime = value;
      continue;
    }

    if (arg === "--end-time" || arg === "--end") {
      const value = args[++i];
      if (!value) throw new Error(`${arg} requires a value`);
      options.endTime = value;
      continue;
    }

    if (arg.startsWith("-")) {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  return options;
}

function parseGetOptions(args: readonly string[]): GetOptions {
  let type: AccountType = "cash";

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (!arg) continue;

    if (arg === "--type") {
      const value = args[++i];
      if (!value || (value !== "cash" && value !== "card")) {
        throw new Error("--type must be one of: cash, card");
      }
      type = value;
      continue;
    }

    if (arg.startsWith("-")) {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  return { type };
}

async function listTransactions(
  context: CommandContext,
  accountId: string,
  options: ListOptions,
  format: "table" | "json"
): Promise<void> {
  const pathBase = options.type === "cash"
    ? `/v2/transactions/cash/${accountId}`
    : `/v2/transactions/card/${accountId}`;
  const path = withQuery(pathBase, options);
  const response = await context.client.fetch<ListTransactionsResponse>(path);
  const transactions = response.items ?? response.transactions ?? [];

  if (format === "json") {
    printJson({ items: transactions, nextCursor: response.next_cursor ?? null });
    return;
  }

  if (transactions.length === 0) {
    console.log("No transactions found.");
    return;
  }

  printTable(
    transactions.map((tx) => toTableRow(tx)),
    [
      { key: "id", header: "ID", width: 36 },
      { key: "type", header: "Type", width: 16 },
      { key: "status", header: "Status", width: 12 },
      { key: "amount", header: "Amount", width: 14 },
      { key: "counterparty", header: "Counterparty", width: 25 },
      { key: "postedAt", header: "Posted", width: 20 },
    ]
  );

  if (response.next_cursor) {
    console.log(`\nNext cursor: ${response.next_cursor}`);
  }
}

async function getTransaction(
  context: CommandContext,
  accountId: string,
  transactionId: string,
  options: GetOptions,
  format: "table" | "json"
): Promise<void> {
  const path = options.type === "cash"
    ? `/v2/transactions/cash/${accountId}/${transactionId}`
    : `/v2/transactions/card/${accountId}/${transactionId}`;
  const response = await context.client.fetch<GetTransactionResponse>(path);
  const transaction = response.cash_transaction ?? response.card_transaction ?? response.transaction ?? response.item;

  if (!transaction) {
    throw new Error("Brex API returned an empty transaction payload.");
  }

  if (format === "json") {
    printJson(transaction);
    return;
  }

  const amount = transaction.amount
    ? formatAmount(transaction.amount.amount, transaction.amount.currency)
    : "-";

  console.log("Transaction Details");
  console.log("───────────────────");
  console.log(`ID:              ${transaction.id}`);
  console.log(`Type:            ${transaction.transaction_type ?? "-"}`);
  console.log(`Source Type:     ${transaction.transaction_source_type ?? "-"}`);
  console.log(`Status:          ${transaction.status ?? "-"}`);
  console.log(`Amount:          ${amount}`);
  console.log(`Counterparty:    ${transaction.counterparty_name ?? transaction.merchant_name ?? "-"}`);
  console.log(`Description:     ${transaction.description ?? "-"}`);
  console.log(`Memo:            ${transaction.memo ?? "-"}`);
  console.log(`Initiated At:    ${formatDateTime(transaction.initiated_at)}`);
  console.log(`Posted At:       ${formatDateTime(transaction.posted_at)}`);
}

function withQuery(path: string, options: ListOptions): string {
  const params = new URLSearchParams();
  if (options.limit) params.set("limit", String(options.limit));
  if (options.cursor) params.set("cursor", options.cursor);
  if (options.startTime) params.set("start_time", options.startTime);
  if (options.endTime) params.set("end_time", options.endTime);
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

function toTableRow(transaction: BrexTransaction): {
  id: string;
  type: string;
  status: string;
  amount: string;
  counterparty: string;
  postedAt: string;
} {
  return {
    id: transaction.id,
    type: truncate(transaction.transaction_type ?? "-", 16),
    status: transaction.status ?? "-",
    amount: transaction.amount
      ? formatAmount(transaction.amount.amount, transaction.amount.currency)
      : "-",
    counterparty: truncate(transaction.counterparty_name ?? transaction.merchant_name ?? "-", 25),
    postedAt: formatDateTime(transaction.posted_at ?? transaction.initiated_at),
  };
}
