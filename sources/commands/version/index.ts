import type { Command } from "../types.js";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

function getVersion(): string {
  try {
    const dir = dirname(fileURLToPath(import.meta.url));
    const pkgPath = join(dir, "..", "..", "..", "package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
    return pkg.version ?? "unknown";
  } catch {
    return "unknown";
  }
}

export const versionCommand: Command = {
  name: "version",
  description: "Show brex-cli version.",
  usage: "brex version",
  aliases: ["v"],
  run: async () => {
    console.log(`brex-cli v${getVersion()}`);
  },
};
