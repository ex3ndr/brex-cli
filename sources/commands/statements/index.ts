import type { Command, CommandContext } from "../types.js";
import { formatAmount, formatDate, parseOutputFlag, printJson, printTable } from "../../output.js";

const USAGE = `brex statements [--scope primary|additional] [--account-id <additional-card-account-id>] [--cursor <cursor>]
brex statements get <statement-id> [--scope primary|additional] [--account-id <additional-card-account-id>]
brex statements --json`;

type StatementScope = "primary" | "additional";

type StatementAmount = {
  amount?: number;
  currency?: string;
};

type AccountStatement = {
  id: string;
  statement_status?: string;
  period_start_date?: string;
  period_end_date?: string;
  period?: {
    start_date?: string;
    end_date?: string;
  };
  start_balance?: StatementAmount;
  end_balance?: StatementAmount;
  due_date?: string;
  download_url?: string;
  created_at?: string;
};

type ListStatementsResponse = {
  items?: AccountStatement[];
  next_cursor?: string;
  statements?: AccountStatement[];
};

type GetStatementResponse = {
  account_statement?: AccountStatement;
  statement?: AccountStatement;
  item?: AccountStatement;
};

type SharedOptions = {
  scope: StatementScope;
  accountId?: string;
};

type ListOptions = SharedOptions & {
  cursor?: string;
};

export const statementsCommand: Command = {
  name: "statements",
  description: "List and view card account statements.",
  usage: USAGE,
  aliases: ["statement"],
  run: async (args, context) => {
    const { format, args: remaining } = parseOutputFlag(args);
    const firstArg = remaining[0] ?? "list";

    if (firstArg === "get") {
      const statementId = remaining[1];
      if (!statementId) {
        throw new Error("Usage: brex statements get <statement-id> [--scope primary|additional] [--account-id <id>]");
      }
      const options = parseSharedOptions(remaining.slice(2));
      await getStatement(context, statementId, options, format);
      return;
    }

    const options = parseListOptions(remaining.slice(firstArg === "list" ? 1 : 0));
    await listStatements(context, options, format);
  },
};

function parseListOptions(args: readonly string[]): ListOptions {
  const shared = parseSharedOptions(args);
  let cursor: string | undefined;

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (!arg) continue;
    if (arg === "--cursor") {
      const value = args[++i];
      if (!value) throw new Error("--cursor requires a value");
      cursor = value;
    }
  }

  return { ...shared, cursor };
}

function parseSharedOptions(args: readonly string[]): SharedOptions {
  let scope: StatementScope = "primary";
  let accountId: string | undefined;

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (!arg) continue;

    if (arg === "--scope") {
      const value = args[++i];
      if (!value || (value !== "primary" && value !== "additional")) {
        throw new Error("--scope must be one of: primary, additional");
      }
      scope = value;
      continue;
    }

    if (arg === "--account-id") {
      const value = args[++i];
      if (!value) throw new Error("--account-id requires a value");
      accountId = value;
      continue;
    }

    if (arg === "--cursor") {
      i += 1;
      continue;
    }

    if (arg === "list") {
      continue;
    }

    if (arg.startsWith("-")) {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  if (scope === "additional" && !accountId) {
    throw new Error("--account-id is required when --scope additional");
  }

  return { scope, accountId };
}

async function listStatements(
  context: CommandContext,
  options: ListOptions,
  format: "table" | "json"
): Promise<void> {
  const path = options.scope === "primary"
    ? withCursor("/v2/accounts/card/primary/statements", options.cursor)
    : withCursor(`/v2/accounts/card/additional/${options.accountId}/statements`, options.cursor);
  const response = await context.client.fetch<ListStatementsResponse>(path);
  const statements = response.items ?? response.statements ?? [];

  if (format === "json") {
    printJson({ items: statements, nextCursor: response.next_cursor ?? null });
    return;
  }

  if (statements.length === 0) {
    console.log("No statements found.");
    return;
  }

  printTable(
    statements.map((statement) => ({
      id: statement.id,
      start: formatDate(statement.period_start_date ?? statement.period?.start_date),
      end: formatDate(statement.period_end_date ?? statement.period?.end_date),
      startBal: statement.start_balance
        ? formatAmount(statement.start_balance.amount, statement.start_balance.currency)
        : "-",
      endBal: statement.end_balance
        ? formatAmount(statement.end_balance.amount, statement.end_balance.currency)
        : "-",
    })),
    [
      { key: "id", header: "Statement ID", width: 36 },
      { key: "start", header: "Start", width: 12 },
      { key: "end", header: "End", width: 12 },
      { key: "startBal", header: "Start Bal", width: 14 },
      { key: "endBal", header: "End Bal", width: 14 },
    ]
  );

  if (response.next_cursor) {
    console.log(`\nMore results available. Run with: --cursor ${response.next_cursor}`);
  }
}

async function getStatement(
  context: CommandContext,
  statementId: string,
  options: SharedOptions,
  format: "table" | "json"
): Promise<void> {
  const path = options.scope === "primary"
    ? `/v2/accounts/card/primary/statements/${statementId}`
    : `/v2/accounts/card/additional/${options.accountId}/statements/${statementId}`;
  const response = await context.client.fetch<GetStatementResponse>(path);
  const statement = response.account_statement ?? response.statement ?? response.item;

  if (!statement) {
    throw new Error("Brex API returned an empty statement payload.");
  }

  if (format === "json") {
    printJson(statement);
    return;
  }

  console.log("Statement Details");
  console.log("─────────────────");
  console.log(`ID:          ${statement.id}`);
  console.log(`Period Start:${" "}${formatDate(statement.period_start_date ?? statement.period?.start_date)}`);
  console.log(`Period End:  ${formatDate(statement.period_end_date ?? statement.period?.end_date)}`);
  if (statement.start_balance) {
    console.log(`Start Bal:   ${formatAmount(statement.start_balance.amount, statement.start_balance.currency)}`);
  }
  if (statement.end_balance) {
    console.log(`End Bal:     ${formatAmount(statement.end_balance.amount, statement.end_balance.currency)}`);
  }
  if (statement.due_date) console.log(`Due Date:    ${formatDate(statement.due_date)}`);
  if (statement.download_url) console.log(`Download:    ${statement.download_url}`);
}

function withCursor(path: string, cursor?: string): string {
  if (!cursor) return path;
  return `${path}?cursor=${encodeURIComponent(cursor)}`;
}
