import type { Command, CommandContext } from "../types.js";
import { parseOutputFlag, printJson, printTable, truncate } from "../../output.js";

const USAGE = `brex recipients list [--limit <N>] [--cursor <cursor>] [--name <name>]
brex recipients get <vendor-id>
brex recipients create --name <company-name> [--email <email>] [--phone <phone>] [--routing <number> --account <number> --account-type CHECKING|SAVING --account-class BUSINESS|PERSONAL]
brex recipients delete <vendor-id>
brex recipients --json`;

type PaymentAccountDetails = {
  type: string;
  payment_instrument_id?: string;
  routing_number?: string;
  account_number?: string;
  account_type?: string;
  account_class?: string;
  beneficiary_name?: string;
};

type PaymentAccount = {
  details: PaymentAccountDetails;
};

type Vendor = {
  id: string;
  company_name?: string;
  email?: string;
  phone?: string;
  payment_accounts?: PaymentAccount[];
};

type ListVendorsResponse = {
  items: Vendor[];
  next_cursor?: string;
};

type ListOptions = {
  limit?: number;
  cursor?: string;
  name?: string;
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
        await listVendors(context, parseListOptions(remaining.slice(1)), format);
        return;
      case "get": {
        const vendorId = remaining[1];
        if (!vendorId) throw new Error("Missing vendor ID. Usage: brex recipients get <vendor-id>");
        await getVendor(context, vendorId, format);
        return;
      }
      case "create": {
        const options = parseCreateOptions(remaining.slice(1));
        await createVendor(context, options, format);
        return;
      }
      case "delete": {
        const vendorId = remaining[1];
        if (!vendorId) throw new Error("Missing vendor ID. Usage: brex recipients delete <vendor-id>");
        await deleteVendor(context, vendorId);
        return;
      }
      default:
        if (subcommand.startsWith("-")) {
          await listVendors(context, parseListOptions(remaining), format);
          return;
        }
        throw new Error(`Unknown subcommand: ${subcommand}. Use 'list', 'get', 'create', or 'delete'.`);
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

type CreateVendorOptions = {
  companyName: string;
  email?: string;
  phone?: string;
  routingNumber?: string;
  accountNumber?: string;
  accountType?: "CHECKING" | "SAVING";
  accountClass?: "BUSINESS" | "PERSONAL";
  idempotencyKey: string;
};

function parseCreateOptions(args: readonly string[]): CreateVendorOptions {
  let companyName: string | undefined;
  let email: string | undefined;
  let phone: string | undefined;
  let routingNumber: string | undefined;
  let accountNumber: string | undefined;
  let accountType: "CHECKING" | "SAVING" | undefined;
  let accountClass: "BUSINESS" | "PERSONAL" | undefined;
  let idempotencyKey: string | undefined;

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (!arg) continue;

    if (arg === "--name") {
      const value = args[++i];
      if (!value) throw new Error("--name requires a company name");
      companyName = value;
      continue;
    }
    if (arg === "--email") {
      const value = args[++i];
      if (!value) throw new Error("--email requires a value");
      email = value;
      continue;
    }
    if (arg === "--phone") {
      const value = args[++i];
      if (!value) throw new Error("--phone requires a value");
      phone = value;
      continue;
    }
    if (arg === "--routing") {
      const value = args[++i];
      if (!value) throw new Error("--routing requires a routing number");
      routingNumber = value;
      continue;
    }
    if (arg === "--account") {
      const value = args[++i];
      if (!value) throw new Error("--account requires an account number");
      accountNumber = value;
      continue;
    }
    if (arg === "--account-type") {
      const value = args[++i]?.toUpperCase();
      if (value !== "CHECKING" && value !== "SAVING") {
        throw new Error("--account-type must be CHECKING or SAVING");
      }
      accountType = value;
      continue;
    }
    if (arg === "--account-class") {
      const value = args[++i]?.toUpperCase();
      if (value !== "BUSINESS" && value !== "PERSONAL") {
        throw new Error("--account-class must be BUSINESS or PERSONAL");
      }
      accountClass = value;
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

  if (!companyName) throw new Error("Missing required --name <company-name>");

  // If any ACH detail is given, require all of them
  const achFields = [routingNumber, accountNumber, accountType, accountClass];
  const achProvided = achFields.filter(Boolean).length;
  if (achProvided > 0 && achProvided < 4) {
    throw new Error("ACH payment account requires all of: --routing, --account, --account-type, --account-class");
  }

  return { companyName, email, phone, routingNumber, accountNumber, accountType, accountClass, idempotencyKey: idempotencyKey ?? crypto.randomUUID() };
}

async function createVendor(
  context: CommandContext,
  options: CreateVendorOptions,
  format: "table" | "json"
): Promise<void> {
  const body: Record<string, unknown> = {
    company_name: options.companyName,
  };
  if (options.email) body.email = options.email;
  if (options.phone) body.phone = options.phone;

  if (options.routingNumber && options.accountNumber && options.accountType && options.accountClass) {
    body.payment_accounts = [{
      details: {
        type: "ACH",
        routing_number: options.routingNumber,
        account_number: options.accountNumber,
        account_type: options.accountType,
        account_class: options.accountClass,
      },
    }];
  }

  const vendor = await context.client.fetch<Vendor>("/v1/vendors", {
    method: "POST",
    headers: { "Idempotency-Key": options.idempotencyKey },
    body: JSON.stringify(body),
  });

  if (format === "json") {
    printJson(vendor);
    return;
  }

  console.log("Vendor Created");
  console.log("──────────────");
  console.log(`ID:           ${vendor.id}`);
  console.log(`Company Name: ${vendor.company_name ?? "-"}`);
  if (vendor.email) console.log(`Email:        ${vendor.email}`);
  if (vendor.phone) console.log(`Phone:        ${vendor.phone}`);
  if (vendor.payment_accounts?.length) {
    const d = vendor.payment_accounts[0].details;
    console.log(`Pay Type:     ${d.type}`);
    if (d.payment_instrument_id) console.log(`Instrument:   ${d.payment_instrument_id}`);
  }
}

async function listVendors(
  context: CommandContext,
  options: ListOptions,
  format: "table" | "json"
): Promise<void> {
  const params = new URLSearchParams();
  if (options.limit) params.set("limit", String(options.limit));
  if (options.cursor) params.set("cursor", options.cursor);
  if (options.name) params.set("name", options.name);
  const query = params.toString();
  const path = query ? `/v1/vendors?${query}` : "/v1/vendors";
  const response = await context.client.fetch<ListVendorsResponse>(path);
  const vendors = response.items ?? [];

  if (format === "json") {
    printJson({ items: vendors, nextCursor: response.next_cursor ?? null });
    return;
  }

  if (vendors.length === 0) {
    console.log("No vendors found.");
    return;
  }

  printTable(
    vendors.map((vendor) => {
      const account = vendor.payment_accounts?.[0]?.details;
      return {
        id: vendor.id,
        name: truncate(vendor.company_name ?? "-", 30),
        email: truncate(vendor.email ?? "-", 25),
        type: account?.type ?? "-",
        instrumentId: truncate(account?.payment_instrument_id ?? "-", 20),
      };
    }),
    [
      { key: "id", header: "ID", width: 36 },
      { key: "name", header: "Company Name", width: 30 },
      { key: "email", header: "Email", width: 25 },
      { key: "type", header: "Pay Type", width: 20 },
      { key: "instrumentId", header: "Instrument ID", width: 20 },
    ]
  );

  if (response.next_cursor) {
    console.log(`\nMore results available. Run with: --cursor ${response.next_cursor}`);
  }
}

async function getVendor(
  context: CommandContext,
  vendorId: string,
  format: "table" | "json"
): Promise<void> {
  const vendor = await context.client.fetch<Vendor>(`/v1/vendors/${vendorId}`);

  if (format === "json") {
    printJson(vendor);
    return;
  }

  console.log("Vendor Details");
  console.log("──────────────");
  console.log(`ID:           ${vendor.id}`);
  console.log(`Company Name: ${vendor.company_name ?? "-"}`);
  if (vendor.email) console.log(`Email:        ${vendor.email}`);
  if (vendor.phone) console.log(`Phone:        ${vendor.phone}`);

  if (vendor.payment_accounts && vendor.payment_accounts.length > 0) {
    console.log(`\nPayment Accounts (${vendor.payment_accounts.length}):`);
    for (const account of vendor.payment_accounts) {
      const d = account.details;
      console.log(`  Type:          ${d.type}`);
      if (d.payment_instrument_id) console.log(`  Instrument ID: ${d.payment_instrument_id}`);
      if (d.routing_number) console.log(`  Routing:       ${d.routing_number}`);
      if (d.account_number) console.log(`  Account:       ...${d.account_number.slice(-4)}`);
      if (d.account_type) console.log(`  Account Type:  ${d.account_type}`);
      if (d.beneficiary_name) console.log(`  Beneficiary:   ${d.beneficiary_name}`);
      console.log("");
    }
  }
}

async function deleteVendor(context: CommandContext, vendorId: string): Promise<void> {
  await context.client.fetch(`/v1/vendors/${vendorId}`, {
    method: "DELETE",
  });

  console.log(`Vendor ${vendorId} deleted.`);
}
