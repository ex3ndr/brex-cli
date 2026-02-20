import type { Command, CommandContext } from "../types.js";
import { parseOutputFlag, printJson, printTable } from "../../output.js";

const USAGE = `brex cards [list] [--user-id <user-id>] [--cursor <cursor>] [--limit <N>]
brex cards get <card-id>
brex cards --json`;

type Card = {
  id: string;
  card_name?: string;
  status?: string;
  expiration_month?: string | number;
  expiration_year?: string | number;
  last_four?: string;
  last_4?: string;
  cardholder?: {
    user_id?: string;
  };
};

type ListCardsResponse = {
  items?: Card[];
  cards?: Card[];
  next_cursor?: string;
};

type GetCardResponse = {
  card?: Card;
  item?: Card;
} & Card;

type ListOptions = {
  userId?: string;
  cursor?: string;
  limit?: number;
};

export const cardsCommand: Command = {
  name: "cards",
  description: "List and view cards.",
  usage: USAGE,
  aliases: ["card"],
  run: async (args, context) => {
    const { format, args: remaining } = parseOutputFlag(args);
    const subcommand = remaining[0] ?? "list";

    if (subcommand === "get") {
      const cardId = remaining[1];
      if (!cardId) {
        throw new Error("Usage: brex cards get <card-id>");
      }
      await getCard(context, cardId, format);
      return;
    }

    if (subcommand !== "list" && !subcommand.startsWith("-")) {
      await getCard(context, subcommand, format);
      return;
    }

    const listArgs = subcommand === "list" ? remaining.slice(1) : remaining;
    await listCards(context, parseListOptions(listArgs), format);
  },
};

function parseListOptions(args: readonly string[]): ListOptions {
  let userId: string | undefined;
  let cursor: string | undefined;
  let limit: number | undefined;

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (!arg) continue;

    if (arg === "--user-id") {
      const value = args[++i];
      if (!value) throw new Error("--user-id requires a value");
      userId = value;
      continue;
    }

    if (arg === "--cursor") {
      const value = args[++i];
      if (!value) throw new Error("--cursor requires a value");
      cursor = value;
      continue;
    }

    if (arg === "--limit") {
      const value = args[++i];
      if (!value) throw new Error("--limit requires a value");
      const parsed = parseInt(value, 10);
      if (Number.isNaN(parsed) || parsed <= 0) {
        throw new Error("--limit must be a positive integer");
      }
      limit = parsed;
      continue;
    }

    if (arg.startsWith("-")) {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  return { userId, cursor, limit };
}

async function listCards(
  context: CommandContext,
  options: ListOptions,
  format: "table" | "json"
): Promise<void> {
  const params = new URLSearchParams();
  if (options.userId) params.set("user_id", options.userId);
  if (options.cursor) params.set("cursor", options.cursor);
  if (options.limit) params.set("limit", String(options.limit));
  const query = params.toString();
  const path = query ? `/v2/cards?${query}` : "/v2/cards";
  const response = await context.client.fetch<ListCardsResponse>(path);
  const cards = response.items ?? response.cards ?? [];

  if (format === "json") {
    printJson({ items: cards, nextCursor: response.next_cursor ?? null });
    return;
  }

  if (cards.length === 0) {
    console.log("No cards found.");
    return;
  }

  printTable(
    cards.map((card) => ({
      id: card.id,
      name: card.card_name ?? "-",
      last4: card.last_four ?? card.last_4 ?? "-",
      status: card.status ?? "-",
      expires: formatExpiration(card.expiration_month, card.expiration_year),
      userId: card.cardholder?.user_id ?? "-",
    })),
    [
      { key: "id", header: "Card ID", width: 36 },
      { key: "name", header: "Name", width: 22 },
      { key: "last4", header: "Last 4", width: 8 },
      { key: "status", header: "Status", width: 12 },
      { key: "expires", header: "Expires", width: 10 },
      { key: "userId", header: "User ID", width: 36 },
    ]
  );

  if (response.next_cursor) {
    console.log(`\nNext cursor: ${response.next_cursor}`);
  }
}

async function getCard(
  context: CommandContext,
  cardId: string,
  format: "table" | "json"
): Promise<void> {
  const response = await context.client.fetch<GetCardResponse>(`/v2/cards/${cardId}`);
  const card = response.card ?? response.item ?? response;

  if (format === "json") {
    printJson(card);
    return;
  }

  console.log("Card Details");
  console.log("────────────");
  console.log(`ID:         ${card.id}`);
  console.log(`Name:       ${card.card_name ?? "-"}`);
  console.log(`Status:     ${card.status ?? "-"}`);
  console.log(`Last 4:     ${card.last_four ?? card.last_4 ?? "-"}`);
  console.log(`Expires:    ${formatExpiration(card.expiration_month, card.expiration_year)}`);
  console.log(`User ID:    ${card.cardholder?.user_id ?? "-"}`);
}

function formatExpiration(
  month: string | number | undefined,
  year: string | number | undefined
): string {
  if (!month || !year) return "-";
  const mm = String(month).padStart(2, "0");
  const yy = String(year);
  return `${mm}/${yy}`;
}
