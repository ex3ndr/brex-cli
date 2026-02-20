export type CommandContext = {
  client: BrexClient;
};

export type Command = {
  name: string;
  description: string;
  usage: string;
  aliases?: readonly string[];
  run: (args: readonly string[], context: CommandContext) => Promise<void>;
};

export type OutputFormat = "table" | "json";

export type BrexClient = {
  baseUrl: string;
  token: string | null;
  fetch: <T>(path: string, init?: RequestInit) => Promise<T>;
};
