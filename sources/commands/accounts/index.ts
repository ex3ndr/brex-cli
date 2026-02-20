import type { Command, CommandContext } from "../types.js";
import { BrexApiError } from "../../client.js";
import { formatAmount, parseOutputFlag, printJson, printTable } from "../../output.js";

const USAGE = `brex accounts
brex accounts list [--type cash|card|all] [--cursor <cursor>]
brex accounts get <account-id> [--type cash|card]
brex accounts --json`;

type AccountType = "cash" | "card" | "all";

type ApiAmount = {
  amount: string;
  currency: string;
};

type CashAccount = {
  id: string;
  account_name?: string;
  account_number?: string;
  routing_number?: string;
  current_balance?: ApiAmount;
  available_balance?: ApiAmount;
  created_at?: string;
  account_type?: string;
  status?: string;
};

type CardAccount = {
  id: string;
  account_name?: string;
  current_balance?: ApiAmount;
  limit?: ApiAmount;
  created_at?: string;
  account_type?: string;
  status?: string;
};

type AccountsPage<T> = {
  items?: T[];
  accounts?: T[];
  cash_accounts?: T[];
  card_accounts?: T[];
  next_cursor?: string;
};

type AccountRow = {
  id: string;
  name: string;
  type: string;
  status: string;
  accountNumber: string;
  routingNumber: string;
  available: string;
  current: string;
};

type ListOptions = {
  type: AccountType;
  cursor?: string;
};

type GetOptions = {
  type?: Exclude<AccountType, "all">;
};

export const accountsCommand: Command = {
  name: "accounts",
  description: "List and view Brex cash/card accounts.",
  usage: USAGE,
  aliases: ["account", "acc"],
  run: async (args, context) => {
    const { format, args: remaining } = parseOutputFlag(args);
    const subcommand = remaining[0] ?? "list";

    switch (subcommand) {
      case "list":
        await listAccounts(context, parseListOptions(remaining.slice(1)), format);
        return;
      case "get": {
        const accountId = remaining[1];
        if (!accountId) {
          throw new Error("Missing account ID. Usage: brex accounts get <account-id> [--type cash|card]");
        }
        await getAccount(context, accountId, parseGetOptions(remaining.slice(2)), format);
        return;
      }
      default:
        throw new Error(`Unknown subcommand: ${subcommand}. Use 'list' or 'get'.`);
    }
  },
};

function parseListOptions(args: readonly string[]): ListOptions {
  let type: AccountType = "all";
  let cursor: string | undefined;

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (!arg) continue;

    if (arg === "--type") {
      const value = args[++i];
      if (!value || (value !== "cash" && value !== "card" && value !== "all")) {
        throw new Error("--type must be one of: cash, card, all");
      }
      type = value;
      continue;
    }

    if (arg === "--cursor") {
      const value = args[++i];
      if (!value) throw new Error("--cursor requires a value");
      cursor = value;
      continue;
    }

    if (arg.startsWith("-")) {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  if (type === "all" && cursor) {
    throw new Error("--cursor can only be used with --type cash or --type card");
  }

  return { type, cursor };
}

function parseGetOptions(args: readonly string[]): GetOptions {
  let type: Exclude<AccountType, "all"> | undefined;

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

async function listAccounts(
  context: CommandContext,
  options: ListOptions,
  format: "table" | "json"
): Promise<void> {
  const cashPath = withCursor("/v2/accounts/cash", options.cursor);
  const cardPath = withCursor("/v2/accounts/card", options.cursor);

  if (options.type === "cash") {
    const cashResponse = await context.client.fetch<AccountsPage<CashAccount>>(cashPath);
    const cashAccounts = extractItems(cashResponse, ["items", "cash_accounts", "accounts"]);
    if (format === "json") {
      printJson({ items: cashAccounts, nextCursor: cashResponse.next_cursor ?? null });
      return;
    }
    printAccountsTable(cashAccounts.map((account) => toAccountRow(account, "cash")));
    if (cashResponse.next_cursor) {
      console.log(`\nNext cursor: ${cashResponse.next_cursor}`);
    }
    return;
  }

  if (options.type === "card") {
    const cardResponse = await context.client.fetch<AccountsPage<CardAccount>>(cardPath);
    const cardAccounts = extractItems(cardResponse, ["items", "card_accounts", "accounts"]);
    if (format === "json") {
      printJson({ items: cardAccounts, nextCursor: cardResponse.next_cursor ?? null });
      return;
    }
    printAccountsTable(cardAccounts.map((account) => toAccountRow(account, "card")));
    if (cardResponse.next_cursor) {
      console.log(`\nNext cursor: ${cardResponse.next_cursor}`);
    }
    return;
  }

  const [cashResponse, cardResponse] = await Promise.all([
    context.client.fetch<AccountsPage<CashAccount>>(cashPath),
    context.client.fetch<AccountsPage<CardAccount>>(cardPath),
  ]);

  const cashAccounts = extractItems(cashResponse, ["items", "cash_accounts", "accounts"]);
  const cardAccounts = extractItems(cardResponse, ["items", "card_accounts", "accounts"]);

  if (format === "json") {
    printJson({
      cash: { items: cashAccounts, nextCursor: cashResponse.next_cursor ?? null },
      card: { items: cardAccounts, nextCursor: cardResponse.next_cursor ?? null },
    });
    return;
  }

  const rows: AccountRow[] = [
    ...cashAccounts.map((account) => toAccountRow(account, "cash")),
    ...cardAccounts.map((account) => toAccountRow(account, "card")),
  ];
  printAccountsTable(rows);
}

async function getAccount(
  context: CommandContext,
  accountId: string,
  options: GetOptions,
  format: "table" | "json"
): Promise<void> {
  const fetchCash = async (): Promise<CashAccount> => context.client.fetch<CashAccount>(`/v2/accounts/cash/${accountId}`);
  const fetchCard = async (): Promise<CardAccount> => context.client.fetch<CardAccount>(`/v2/accounts/card/${accountId}`);

  if (options.type === "cash") {
    const account = await fetchCash();
    renderAccount(account, "cash", format);
    return;
  }

  if (options.type === "card") {
    const account = await fetchCard();
    renderAccount(account, "card", format);
    return;
  }

  try {
    const account = await fetchCash();
    renderAccount(account, "cash", format);
    return;
  } catch (error) {
    if (!(error instanceof BrexApiError) || error.status !== 404) {
      throw error;
    }
  }

  const cardAccount = await fetchCard();
  renderAccount(cardAccount, "card", format);
}

function renderAccount(
  account: CashAccount | CardAccount,
  type: "cash" | "card",
  format: "table" | "json"
): void {
  if (format === "json") {
    printJson(account);
    return;
  }

  const row = toAccountRow(account, type);
  console.log("Account Details");
  console.log("───────────────");
  console.log(`ID:              ${row.id}`);
  console.log(`Name:            ${row.name}`);
  console.log(`Type:            ${row.type}`);
  console.log(`Status:          ${row.status}`);
  if (row.accountNumber !== "-") console.log(`Account Number:  ${row.accountNumber}`);
  if (row.routingNumber !== "-") console.log(`Routing Number:  ${row.routingNumber}`);
  console.log(`Available:       ${row.available}`);
  console.log(`Current:         ${row.current}`);
}

function toAccountRow(account: CashAccount | CardAccount, type: "cash" | "card"): AccountRow {
  const availableBalance = "available_balance" in account ? account.available_balance : undefined;
  const currentBalance = account.current_balance;
  const status = account.status ?? "-";
  const accountName = account.account_name ?? "-";
  const accountType = account.account_type ?? type;

  return {
    id: account.id,
    name: accountName,
    type: accountType,
    status,
    accountNumber: "account_number" in account ? account.account_number ?? "-" : "-",
    routingNumber: "routing_number" in account ? account.routing_number ?? "-" : "-",
    available: formatMoney(availableBalance ?? currentBalance),
    current: formatMoney(currentBalance),
  };
}

function formatMoney(balance: ApiAmount | undefined): string {
  if (!balance) return "-";
  return formatAmount(balance.amount, balance.currency);
}

function withCursor(path: string, cursor?: string): string {
  if (!cursor) return path;
  return `${path}?cursor=${encodeURIComponent(cursor)}`;
}

function extractItems<T>(response: AccountsPage<T>, keys: readonly (keyof AccountsPage<T>)[]): T[] {
  for (const key of keys) {
    const value = response[key];
    if (Array.isArray(value)) return value;
  }
  return [];
}

function printAccountsTable(rows: AccountRow[]): void {
  if (rows.length === 0) {
    console.log("No accounts found.");
    return;
  }

  printTable(rows, [
    { key: "id", header: "ID", width: 36 },
    { key: "name", header: "Name", width: 22 },
    { key: "type", header: "Type", width: 12 },
    { key: "status", header: "Status", width: 10 },
    { key: "accountNumber", header: "Account #", width: 12 },
    { key: "available", header: "Available", width: 14 },
    { key: "current", header: "Current", width: 14 },
  ]);
}
