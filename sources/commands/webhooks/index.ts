import type { Command, CommandContext } from "../types.js";
import { parseOutputFlag, printJson, printTable, truncate } from "../../output.js";

const USAGE = `brex webhooks
brex webhooks list [--cursor <cursor>] [--limit <N>]
brex webhooks get <webhook-id>
brex webhooks create --url <url> [--events <event1,event2>]
brex webhooks update <webhook-id> [--url <url>] [--events <event1,event2>]
brex webhooks delete <webhook-id>
brex webhooks --json`;

type Webhook = {
  id: string;
  url?: string;
  status?: string;
  event_types?: string[];
  created_at?: string;
};

type ListWebhooksResponse = {
  items?: Webhook[];
  webhooks?: Webhook[];
  next_cursor?: string;
};

type GetWebhookResponse = {
  webhook?: Webhook;
  item?: Webhook;
} & Webhook;

type ListOptions = {
  cursor?: string;
  limit?: number;
};

type CreateOptions = {
  url: string;
  status?: string;
  events?: string[];
};

type UpdateOptions = {
  url?: string;
  status?: string;
  events?: string[];
};

export const webhooksCommand: Command = {
  name: "webhooks",
  description: "Manage webhook endpoints.",
  usage: USAGE,
  aliases: ["webhook", "wh"],
  run: async (args, context) => {
    const { format, args: remaining } = parseOutputFlag(args);
    const subcommand = remaining[0] ?? "list";

    switch (subcommand) {
      case "list":
        await listWebhooks(context, parseListOptions(remaining.slice(1)), format);
        return;
      case "get": {
        const webhookId = remaining[1];
        if (!webhookId) throw new Error("Missing webhook ID. Usage: brex webhooks get <webhook-id>");
        await getWebhook(context, webhookId, format);
        return;
      }
      case "create":
        await createWebhook(context, parseCreateOptions(remaining.slice(1)), format);
        return;
      case "update": {
        const webhookId = remaining[1];
        if (!webhookId) throw new Error("Missing webhook ID. Usage: brex webhooks update <webhook-id> ...");
        await updateWebhook(context, webhookId, parseUpdateOptions(remaining.slice(2)), format);
        return;
      }
      case "delete": {
        const webhookId = remaining[1];
        if (!webhookId) throw new Error("Missing webhook ID. Usage: brex webhooks delete <webhook-id>");
        await deleteWebhook(context, webhookId);
        return;
      }
      case "verify":
        throw new Error("`brex webhooks verify` is not available in the current Brex Webhooks API.");
      default:
        throw new Error(`Unknown subcommand: ${subcommand}`);
    }
  },
};

function parseListOptions(args: readonly string[]): ListOptions {
  const options: ListOptions = {};

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

function parseCreateOptions(args: readonly string[]): CreateOptions {
  let url: string | undefined;
  let status: string | undefined;
  let events: string[] | undefined;

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (!arg) continue;

    if (arg === "--url") {
      const value = args[++i];
      if (!value) throw new Error("--url requires a value");
      url = value;
      continue;
    }

    if (arg === "--status") {
      const value = args[++i];
      if (!value) throw new Error("--status requires a value");
      status = value;
      continue;
    }

    if (arg === "--events") {
      const value = args[++i];
      if (!value) throw new Error("--events requires a value");
      events = value.split(",").map((eventType) => eventType.trim()).filter(Boolean);
      continue;
    }

    if (arg.startsWith("-")) {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  if (!url) throw new Error("Missing required --url");
  return { url, status, events };
}

function parseUpdateOptions(args: readonly string[]): UpdateOptions {
  const options: UpdateOptions = {};

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (!arg) continue;

    if (arg === "--url") {
      const value = args[++i];
      if (!value) throw new Error("--url requires a value");
      options.url = value;
      continue;
    }

    if (arg === "--status") {
      const value = args[++i];
      if (!value) throw new Error("--status requires a value");
      options.status = value;
      continue;
    }

    if (arg === "--events") {
      const value = args[++i];
      if (!value) throw new Error("--events requires a value");
      options.events = value.split(",").map((eventType) => eventType.trim()).filter(Boolean);
      continue;
    }

    if (arg.startsWith("-")) {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  return options;
}

async function listWebhooks(
  context: CommandContext,
  options: ListOptions,
  format: "table" | "json"
): Promise<void> {
  const params = new URLSearchParams();
  if (options.cursor) params.set("cursor", options.cursor);
  if (options.limit) params.set("limit", String(options.limit));
  const query = params.toString();
  const path = query ? `/v1/webhooks?${query}` : "/v1/webhooks";
  const response = await context.client.fetch<ListWebhooksResponse>(path);
  const webhooks = response.items ?? response.webhooks ?? [];

  if (format === "json") {
    printJson({ items: webhooks, nextCursor: response.next_cursor ?? null });
    return;
  }

  if (webhooks.length === 0) {
    console.log("No webhooks configured.");
    return;
  }

  printTable(
    webhooks.map((webhook) => ({
      id: webhook.id,
      url: truncate(webhook.url ?? "-", 40),
      status: webhook.status ?? "-",
      events: truncate(
        (webhook.event_types ?? []).join(", ") || "-",
        35
      ),
    })),
    [
      { key: "id", header: "ID", width: 36 },
      { key: "url", header: "URL", width: 40 },
      { key: "status", header: "Status", width: 12 },
      { key: "events", header: "Events", width: 35 },
    ]
  );

  if (response.next_cursor) {
    console.log(`\nNext cursor: ${response.next_cursor}`);
  }
}

async function getWebhook(
  context: CommandContext,
  webhookId: string,
  format: "table" | "json"
): Promise<void> {
  const response = await context.client.fetch<GetWebhookResponse>(`/v1/webhooks/${webhookId}`);
  const webhook = response.webhook ?? response.item ?? response;

  if (format === "json") {
    printJson(webhook);
    return;
  }

  const events = webhook.event_types ?? [];

  console.log("Webhook Details");
  console.log("───────────────");
  console.log(`ID:      ${webhook.id}`);
  console.log(`URL:     ${webhook.url ?? "-"}`);
  console.log(`Status:  ${webhook.status ?? "-"}`);
  console.log(`Events:  ${events.length > 0 ? events.join(", ") : "-"}`);
}

async function createWebhook(
  context: CommandContext,
  options: CreateOptions,
  format: "table" | "json"
): Promise<void> {
  const body: Record<string, unknown> = {
    url: options.url,
  };
  if (options.events && options.events.length > 0) {
    body.event_types = options.events;
  }

  const response = await context.client.fetch<GetWebhookResponse>("/v1/webhooks", {
    method: "POST",
    headers: { "Idempotency-Key": crypto.randomUUID() },
    body: JSON.stringify(body),
  });
  const webhook = response.webhook ?? response.item ?? response;

  if (format === "json") {
    printJson(webhook);
    return;
  }

  console.log("Webhook Created");
  console.log("───────────────");
  console.log(`ID:     ${webhook.id}`);
  console.log(`URL:    ${webhook.url ?? "-"}`);
  console.log(`Status: ${webhook.status ?? "-"}`);
}

async function updateWebhook(
  context: CommandContext,
  webhookId: string,
  options: UpdateOptions,
  format: "table" | "json"
): Promise<void> {
  // GET existing webhook first to preserve fields not being updated (PUT replaces the entire resource)
  const existing = await context.client.fetch<GetWebhookResponse>(`/v1/webhooks/${webhookId}`);
  const current = existing.webhook ?? existing.item ?? existing;

  if (!current.url && !current.id) {
    throw new Error(`Could not retrieve existing webhook ${webhookId} — unexpected API response`);
  }

  const body: Record<string, unknown> = {
    url: options.url ?? current.url,
    event_types: options.events && options.events.length > 0
      ? options.events
      : current.event_types ?? [],
  };

  const response = await context.client.fetch<GetWebhookResponse>(`/v1/webhooks/${webhookId}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
  const webhook = response.webhook ?? response.item ?? response;

  if (format === "json") {
    printJson(webhook);
    return;
  }

  console.log("Webhook Updated");
  console.log("───────────────");
  console.log(`ID:     ${webhook.id}`);
  console.log(`URL:    ${webhook.url ?? "-"}`);
  console.log(`Status: ${webhook.status ?? "-"}`);
}

async function deleteWebhook(context: CommandContext, webhookId: string): Promise<void> {
  await context.client.fetch(`/v1/webhooks/${webhookId}`, { method: "DELETE" });
  console.log(`Webhook ${webhookId} deleted.`);
}
