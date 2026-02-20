import type { Command } from "../types.js";

const VERSION = "0.1.0";

export const versionCommand: Command = {
  name: "version",
  description: "Show brex-cli version.",
  usage: "brex version",
  aliases: ["v"],
  run: async () => {
    console.log(`brex-cli v${VERSION}`);
  },
};
