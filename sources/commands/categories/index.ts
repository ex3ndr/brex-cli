import type { Command } from "../types.js";

const USAGE = `brex categories`;

export const categoriesCommand: Command = {
  name: "categories",
  description: "Not supported by Brex public APIs in this CLI.",
  usage: USAGE,
  aliases: ["category", "cat"],
  run: async () => {
    throw new Error(
      "The Brex APIs currently used by this CLI do not expose a direct transaction categories endpoint. See https://developer.brex.com/ for available resources."
    );
  },
};
