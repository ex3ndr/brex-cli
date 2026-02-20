import type { Command, CommandContext } from "../types.js";
import { formatDateTime, parseOutputFlag, printJson, printTable, truncate } from "../../output.js";

const USAGE = `brex events
brex events list [--event-type <type>] [--after-date <ISO>] [--before-date <ISO>] [--cursor <cursor>] [--limit <N>]
brex events get <event-id>
brex events --json`;

type ApiEvent = {
  id: string;
  event_type?: string;
  occurred_at?: string;
  webhook_id?: string;
  payload?: unknown;
};

type ListEventsResponse = {
  items?: ApiEvent[];
  events?: ApiEvent[];
  next_cursor?: string;
};

type GetEventResponse = {
  event?: ApiEvent;
  item?: ApiEvent;
} & ApiEvent;

type ListOptions = {
  eventType?: string;
  afterDate?: string;
  beforeDate?: string;
  cursor?: string;
  limit?: number;
};

export const eventsCommand: Command = {
  name: "events",
  description: "List and view webhook events.",
  usage: USAGE,
  aliases: ["event"],
  run: async (args, context) => {
    const { format, args: remaining } = parseOutputFlag(args);
    const subcommand = remaining[0] ?? "list";

    if (subcommand === "list") {
      await listEvents(context, parseListOptions(remaining.slice(1)), format);
      return;
    }

    if (subcommand === "get") {
      const eventId = remaining[1];
      if (!eventId) throw new Error("Missing event ID. Usage: brex events get <event-id>");
      await getEvent(context, eventId, format);
      return;
    }

    if (!subcommand.startsWith("-")) {
      await getEvent(context, subcommand, format);
      return;
    }

    throw new Error(`Unknown subcommand: ${subcommand}`);
  },
};

function parseListOptions(args: readonly string[]): ListOptions {
  const options: ListOptions = {};

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (!arg) continue;

    if (arg === "--event-type") {
      const value = args[++i];
      if (!value) throw new Error("--event-type requires a value");
      options.eventType = value;
      continue;
    }

    if (arg === "--after-date") {
      const value = args[++i];
      if (!value) throw new Error("--after-date requires a value");
      options.afterDate = value;
      continue;
    }

    if (arg === "--before-date") {
      const value = args[++i];
      if (!value) throw new Error("--before-date requires a value");
      options.beforeDate = value;
      continue;
    }

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

async function listEvents(
  context: CommandContext,
  options: ListOptions,
  format: "table" | "json"
): Promise<void> {
  const params = new URLSearchParams();
  if (options.eventType) params.set("event_type", options.eventType);
  if (options.afterDate) params.set("after_date", options.afterDate);
  if (options.beforeDate) params.set("before_date", options.beforeDate);
  if (options.cursor) params.set("cursor", options.cursor);
  if (options.limit) params.set("limit", String(options.limit));
  const query = params.toString();
  const path = query ? `/v1/events?${query}` : "/v1/events";

  const response = await context.client.fetch<ListEventsResponse>(path);
  const events = response.items ?? response.events ?? [];

  if (format === "json") {
    printJson({ items: events, nextCursor: response.next_cursor ?? null });
    return;
  }

  if (events.length === 0) {
    console.log("No events found.");
    return;
  }

  printTable(
    events.map((event) => ({
      id: event.id,
      type: truncate(event.event_type ?? "-", 30),
      occurredAt: formatDateTime(event.occurred_at),
      webhookId: truncate(event.webhook_id ?? "-", 36),
    })),
    [
      { key: "id", header: "Event ID", width: 36 },
      { key: "type", header: "Type", width: 30 },
      { key: "occurredAt", header: "Occurred", width: 20 },
      { key: "webhookId", header: "Webhook ID", width: 36 },
    ]
  );

  if (response.next_cursor) {
    console.log(`\nNext cursor: ${response.next_cursor}`);
  }
}

async function getEvent(
  context: CommandContext,
  eventId: string,
  format: "table" | "json"
): Promise<void> {
  const response = await context.client.fetch<GetEventResponse>(`/v1/events/${eventId}`);
  const event = response.event ?? response.item ?? response;

  if (format === "json") {
    printJson(event);
    return;
  }

  console.log("Event Details");
  console.log("─────────────");
  console.log(`ID:         ${event.id}`);
  console.log(`Type:       ${event.event_type ?? "-"}`);
  console.log(`Occurred:   ${formatDateTime(event.occurred_at)}`);
  console.log(`Webhook ID: ${event.webhook_id ?? "-"}`);
  console.log("Payload:");
  console.log(JSON.stringify(event.payload ?? {}, null, 2));
}
