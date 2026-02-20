import type { Command } from "../types.js";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

function getVersion(): string {
  try {
    let dir = dirname(fileURLToPath(import.meta.url));
    for (let i = 0; i < 5; i++) {
      const candidate = join(dir, "package.json");
      try {
        const pkg = JSON.parse(readFileSync(candidate, "utf-8"));
        if (pkg.name === "brex-cli" && pkg.version) return pkg.version;
      } catch { /* not found, keep walking */ }
      dir = dirname(dir);
    }
    return process.env.npm_package_version ?? "unknown";
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
