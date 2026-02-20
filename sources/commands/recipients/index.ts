import type { Command, CommandContext } from "../types.js";
import { parseOutputFlag, printJson, printTable, truncate } from "../../output.js";

const USAGE = `brex recipients
brex recipients list [--limit <N>] [--cursor <cursor>] [--name <name>]
brex recipients get <counterparty-id>
brex recipients add --name <name> --account <number> --routing <number> [--account-type CHECKING|SAVINGS]
brex recipients delete <counterparty-id>
brex recipients --json`;

type PaymentCounterparty = {
  id: string;
  name?: string;
  payment_instruments?: Array<{
    bank_transfer?: {
      account_number?: string;
      routing_number?: string;
      bank_name?: string;
      account_type?: string;
      country?: string;
      currency?: string;
    };
  }>;
  created_at?: string;
};

type ListCounterpartiesResponse = {
  items?: PaymentCounterparty[];
  payment_counterparties?: PaymentCounterparty[];
  next_cursor?: string;
};

type GetCounterpartyResponse = {
  payment_counterparty?: PaymentCounterparty;
  item?: PaymentCounterparty;
} & PaymentCounterparty;

type CreateCounterpartyRequest = {
  name: string;
  payment_instrument: {
    bank_transfer: {
      account_number: string;
      routing_number: string;
      account_type?: string;
      country?: string;
      currency?: string;
    };
  };
};

type ListOptions = {
  limit?: number;
  cursor?: string;
  name?: string;
};

type AddOptions = {
  name: string;
  accountNumber: string;
  routingNumber: string;
  accountType?: "CHECKING" | "SAVINGS";
  country?: string;
  currency?: string;
};

export const recipientsCommand: Command = {
  name: "recipients",
  description: "Manage payment counterparties.",
  usage: USAGE,
  aliases: ["recipient", "recip"],
  run: async (args, context) => {
    const { format, args: remaining } = parseOutputFlag(args);
    const subcommand = remaining[0] ?? "list";

    switch (subcommand) {
      case "list":
        await listRecipients(context, parseListOptions(remaining.slice(1)), format);
        return;
      case "get": {
        const recipientId = remaining[1];
        if (!recipientId) throw new Error("Missing recipient ID. Usage: brex recipients get <counterparty-id>");
        await getRecipient(context, recipientId, format);
        return;
      }
      case "add":
        await addRecipient(context, parseAddOptions(remaining.slice(1)), format);
        return;
      case "delete": {
        const recipientId = remaining[1];
        if (!recipientId) throw new Error("Missing recipient ID. Usage: brex recipients delete <counterparty-id>");
        await deleteRecipient(context, recipientId);
        return;
      }
      default:
        throw new Error(`Unknown subcommand: ${subcommand}. Use 'list', 'get', 'add', or 'delete'.`);
    }
  },
};

function parseListOptions(args: readonly string[]): ListOptions {
  const options: ListOptions = {};

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (!arg) continue;

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

    if (arg === "--name") {
      const value = args[++i];
      if (!value) throw new Error("--name requires a value");
      options.name = value;
      continue;
    }

    if (arg.startsWith("-")) {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  return options;
}

function parseAddOptions(args: readonly string[]): AddOptions {
  let name: string | undefined;
  let accountNumber: string | undefined;
  let routingNumber: string | undefined;
  let accountType: "CHECKING" | "SAVINGS" | undefined;
  let country: string | undefined;
  let currency: string | undefined;

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (!arg) continue;

    if (arg === "--name") {
      const value = args[++i];
      if (!value) throw new Error("--name requires a value");
      name = value;
      continue;
    }

    if (arg === "--account") {
      const value = args[++i];
      if (!value) throw new Error("--account requires a value");
      accountNumber = value;
      continue;
    }

    if (arg === "--routing") {
      const value = args[++i];
      if (!value) throw new Error("--routing requires a value");
      routingNumber = value;
      continue;
    }

    if (arg === "--account-type") {
      const value = args[++i];
      if (!value || (value !== "CHECKING" && value !== "SAVINGS")) {
        throw new Error("--account-type must be CHECKING or SAVINGS");
      }
      accountType = value;
      continue;
    }

    if (arg === "--country") {
      const value = args[++i];
      if (!value) throw new Error("--country requires a value");
      country = value;
      continue;
    }

    if (arg === "--currency") {
      const value = args[++i];
      if (!value) throw new Error("--currency requires a value");
      currency = value;
      continue;
    }

    if (arg.startsWith("-")) {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  if (!name) throw new Error("Missing required --name");
  if (!accountNumber) throw new Error("Missing required --account");
  if (!routingNumber) throw new Error("Missing required --routing");

  return { name, accountNumber, routingNumber, accountType, country, currency };
}

async function listRecipients(
  context: CommandContext,
  options: ListOptions,
  format: "table" | "json"
): Promise<void> {
  const params = new URLSearchParams();
  if (options.limit) params.set("limit", String(options.limit));
  if (options.cursor) params.set("cursor", options.cursor);
  if (options.name) params.set("name", options.name);
  const query = params.toString();
  const path = query ? `/v1/payment_counterparties?${query}` : "/v1/payment_counterparties";
  const response = await context.client.fetch<ListCounterpartiesResponse>(path);
  const recipients = response.items ?? response.payment_counterparties ?? [];

  if (format === "json") {
    printJson({ items: recipients, nextCursor: response.next_cursor ?? null });
    return;
  }

  if (recipients.length === 0) {
    console.log("No recipients found.");
    return;
  }

  printTable(
    recipients.map((recipient) => {
      const bank = recipient.payment_instruments?.[0]?.bank_transfer;
      return {
        id: recipient.id,
        name: truncate(recipient.name ?? "-", 30),
        account: bank?.account_number ? `...${bank.account_number.slice(-4)}` : "-",
        routing: bank?.routing_number ?? "-",
        bank: truncate(bank?.bank_name ?? "-", 20),
      };
    }),
    [
      { key: "id", header: "ID", width: 36 },
      { key: "name", header: "Name", width: 30 },
      { key: "account", header: "Account", width: 12 },
      { key: "routing", header: "Routing", width: 12 },
      { key: "bank", header: "Bank", width: 20 },
    ]
  );

  if (response.next_cursor) {
    console.log(`\nNext cursor: ${response.next_cursor}`);
  }
}

async function getRecipient(
  context: CommandContext,
  recipientId: string,
  format: "table" | "json"
): Promise<void> {
  const response = await context.client.fetch<GetCounterpartyResponse>(`/v1/payment_counterparties/${recipientId}`);
  const recipient = response.payment_counterparty ?? response.item ?? response;

  if (format === "json") {
    printJson(recipient);
    return;
  }

  const bank = recipient.payment_instruments?.[0]?.bank_transfer;

  console.log("Recipient Details");
  console.log("─────────────────");
  console.log(`ID:             ${recipient.id}`);
  console.log(`Name:           ${recipient.name ?? "-"}`);
  console.log(`Account Number: ${bank?.account_number ?? "-"}`);
  console.log(`Routing Number: ${bank?.routing_number ?? "-"}`);
  if (bank?.bank_name) console.log(`Bank Name:      ${bank.bank_name}`);
  if (bank?.account_type) console.log(`Account Type:   ${bank.account_type}`);
  if (bank?.country) console.log(`Country:        ${bank.country}`);
  if (bank?.currency) console.log(`Currency:       ${bank.currency}`);
}

async function addRecipient(
  context: CommandContext,
  options: AddOptions,
  format: "table" | "json"
): Promise<void> {
  const body: CreateCounterpartyRequest = {
    name: options.name,
    payment_instrument: {
      bank_transfer: {
        account_number: options.accountNumber,
        routing_number: options.routingNumber,
        ...(options.accountType ? { account_type: options.accountType } : {}),
        ...(options.country ? { country: options.country } : {}),
        ...(options.currency ? { currency: options.currency } : {}),
      },
    },
  };

  const response = await context.client.fetch<GetCounterpartyResponse>("/v1/payment_counterparties", {
    method: "POST",
    body: JSON.stringify(body),
  });
  const recipient = response.payment_counterparty ?? response.item ?? response;

  if (format === "json") {
    printJson(recipient);
    return;
  }

  console.log("Recipient Created");
  console.log("─────────────────");
  console.log(`ID:   ${recipient.id}`);
  console.log(`Name: ${recipient.name ?? "-"}`);
}

async function deleteRecipient(context: CommandContext, recipientId: string): Promise<void> {
  await context.client.fetch(`/v1/payment_counterparties/${recipientId}`, {
    method: "DELETE",
  });

  console.log(`Recipient ${recipientId} deleted.`);
}
