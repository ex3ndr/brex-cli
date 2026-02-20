import type { Command, CommandContext } from "../types.js";
import { formatAmount, formatDate, parseOutputFlag, printJson, printTable, truncate } from "../../output.js";

const USAGE = `brex transactions <account-id> [--type cash] [--limit <N>] [--cursor <cursor>] [--posted-at-start <ISO>]
brex transactions --type card [--limit <N>] [--cursor <cursor>] [--posted-at-start <ISO>]
brex transactions --json`;

type AccountType = "cash" | "card";

type ApiAmount = {
  amount: number;
  currency?: string;
};

/** Shared fields between CashTransaction and CardTransaction. */
type BrexTransaction = {
  id: string;
  description: string;
  amount?: ApiAmount;
  initiated_at_date: string;
  posted_at_date: string;
  type?: string;
  // Card-specific
  card_id?: string;
  merchant?: {
    raw_descriptor: string;
    mcc: string;
    country: string;
  };
  expense_id?: string;
  // Cash-specific
  transfer_id?: string;
};

type ListTransactionsResponse = {
  items: BrexTransaction[];
  next_cursor?: string;
};

type ListOptions = {
  type: AccountType;
  limit?: number;
  cursor?: string;
  postedAtStart?: string;
};

export const transactionsCommand: Command = {
  name: "transactions",
  description: "List and view Brex account transactions.",
  usage: USAGE,
  aliases: ["tx", "txn"],
  run: async (args, context) => {
    const { format, args: remaining } = parseOutputFlag(args);

    if (remaining.length === 0) {
      const options = parseListOptions(remaining);
      if (options.type === "card") {
        await listTransactions(context, "primary", options, format);
        return;
      }
      throw new Error("Missing account ID. Usage: brex transactions <account-id> [--type cash|card]");
    }

    const firstArg = remaining[0]!;

    if (firstArg === "send") {
      throw new Error("Brex sends money via Transfers API. Use `brex transfer` instead.");
    }

    // If first arg starts with --, it's a flag not an account ID
    if (firstArg.startsWith("--")) {
      const options = parseListOptions(remaining);
      if (options.type === "card") {
        await listTransactions(context, "primary", options, format);
        return;
      }
      throw new Error("Missing account ID for cash transactions. Usage: brex transactions <account-id>");
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

    if (arg === "--posted-at-start" || arg === "--start-time" || arg === "--start") {
      const value = args[++i];
      if (!value) throw new Error(`${arg} requires a value`);
      options.postedAtStart = value;
      continue;
    }

    if (arg.startsWith("-")) {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  return options;
}

async function listTransactions(
  context: CommandContext,
  accountId: string,
  options: ListOptions,
  format: "table" | "json"
): Promise<void> {
  const pathBase = options.type === "cash"
    ? `/v2/transactions/cash/${accountId}`
    : `/v2/transactions/card/primary`;
  const path = withQuery(pathBase, options);
  const response = await context.client.fetch<ListTransactionsResponse>(path);
  const transactions = response.items ?? [];

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
      { key: "amount", header: "Amount", width: 14 },
      { key: "description", header: "Description", width: 28 },
      { key: "postedAt", header: "Posted", width: 12 },
    ]
  );

  if (response.next_cursor) {
    console.log(`\nMore results available. Run with: --cursor ${response.next_cursor}`);
  }
}

function withQuery(path: string, options: ListOptions): string {
  const params = new URLSearchParams();
  if (options.limit) params.set("limit", String(options.limit));
  if (options.cursor) params.set("cursor", options.cursor);
  if (options.postedAtStart) params.set("posted_at_start", options.postedAtStart);
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

function toTableRow(transaction: BrexTransaction): {
  id: string;
  type: string;
  amount: string;
  description: string;
  postedAt: string;
} {
  return {
    id: transaction.id,
    type: truncate(transaction.type ?? "-", 16),
    amount: transaction.amount
      ? formatAmount(transaction.amount.amount, transaction.amount.currency)
      : "-",
    description: truncate(
      transaction.merchant?.raw_descriptor
        ?? transaction.description
        ?? "-",
      28
    ),
    postedAt: formatDate(transaction.posted_at_date ?? transaction.initiated_at_date),
  };
}
