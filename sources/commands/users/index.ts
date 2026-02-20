import type { Command, CommandContext } from "../types.js";
import { parseOutputFlag, printJson, printTable } from "../../output.js";

const USAGE = `brex users [list] [--cursor <cursor>] [--email <email>]
brex users get <user-id>
brex users --json`;

type User = {
  id: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  department?: string;
  manager_id?: string;
  status?: string;
};

type ListUsersResponse = {
  items?: User[];
  users?: User[];
  next_cursor?: string;
};

type GetUserResponse = {
  user?: User;
  item?: User;
} & User;

type ListOptions = {
  cursor?: string;
  email?: string;
};

export const usersCommand: Command = {
  name: "users",
  description: "List and view organization users.",
  usage: USAGE,
  aliases: ["user"],
  run: async (args, context) => {
    const { format, args: remaining } = parseOutputFlag(args);
    const subcommand = remaining[0] ?? "list";

    switch (subcommand) {
      case "list":
        await listUsers(context, parseListOptions(remaining.slice(1)), format);
        return;
      case "get": {
        const userId = remaining[1];
        if (!userId) throw new Error("Missing user ID. Usage: brex users get <user-id>");
        await getUser(context, userId, format);
        return;
      }
      default:
        if (!subcommand.startsWith("-")) {
          await getUser(context, subcommand, format);
          return;
        }
        throw new Error(`Unknown subcommand: ${subcommand}`);
    }
  },
};

function parseListOptions(args: readonly string[]): ListOptions {
  let cursor: string | undefined;
  let email: string | undefined;

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (!arg) continue;

    if (arg === "--cursor") {
      const value = args[++i];
      if (!value) throw new Error("--cursor requires a value");
      cursor = value;
      continue;
    }

    if (arg === "--email") {
      const value = args[++i];
      if (!value) throw new Error("--email requires a value");
      email = value;
      continue;
    }

    if (arg.startsWith("-")) {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  return { cursor, email };
}

async function listUsers(
  context: CommandContext,
  options: ListOptions,
  format: "table" | "json"
): Promise<void> {
  const params = new URLSearchParams();
  if (options.cursor) params.set("cursor", options.cursor);
  if (options.email) params.set("email", options.email);
  const query = params.toString();
  const path = query ? `/v2/users?${query}` : "/v2/users";
  const response = await context.client.fetch<ListUsersResponse>(path);
  const users = response.items ?? response.users ?? [];

  if (format === "json") {
    printJson({ items: users, nextCursor: response.next_cursor ?? null });
    return;
  }

  if (users.length === 0) {
    console.log("No users found.");
    return;
  }

  printTable(
    users.map((user) => ({
      id: user.id,
      firstName: user.first_name ?? "-",
      lastName: user.last_name ?? "-",
      email: user.email ?? "-",
      department: user.department ?? "-",
      status: user.status ?? "-",
    })),
    [
      { key: "id", header: "ID", width: 36 },
      { key: "firstName", header: "First Name", width: 14 },
      { key: "lastName", header: "Last Name", width: 14 },
      { key: "email", header: "Email", width: 30 },
      { key: "department", header: "Department", width: 15 },
      { key: "status", header: "Status", width: 10 },
    ]
  );

  if (response.next_cursor) {
    console.log(`\nMore results available. Run with: --cursor ${response.next_cursor}`);
  }
}

async function getUser(context: CommandContext, userId: string, format: "table" | "json"): Promise<void> {
  const response = await context.client.fetch<GetUserResponse>(`/v2/users/${userId}`);
  const user = response.user ?? response.item ?? response;

  if (format === "json") {
    printJson(user);
    return;
  }

  console.log("User Details");
  console.log("────────────");
  console.log(`ID:         ${user.id}`);
  console.log(`Name:       ${user.first_name ?? "-"} ${user.last_name ?? "-"}`);
  console.log(`Email:      ${user.email ?? "-"}`);
  console.log(`Department: ${user.department ?? "-"}`);
  console.log(`Status:     ${user.status ?? "-"}`);
  if (user.manager_id) {
    console.log(`Manager ID: ${user.manager_id}`);
  }
}
