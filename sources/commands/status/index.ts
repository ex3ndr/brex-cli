import type { Command } from "../types.js";
import { loadToken, getApiBaseUrl, loadConfig } from "../../config.js";

const USAGE = "brex status";

export const statusCommand: Command = {
  name: "status",
  description: "Show current authentication and configuration status.",
  usage: USAGE,
  run: async () => {
    const token = loadToken();
    const config = loadConfig();
    const baseUrl = getApiBaseUrl();

    console.log("Brex CLI Status");
    console.log("──────────────────");
    console.log(`Authenticated: ${token ? "Yes" : "No"}`);
    if (token) {
      const masked = token.slice(0, 10) + "..." + token.slice(-4);
      console.log(`Token: ${masked}`);
    }
    console.log(`API Base URL: ${baseUrl}`);
    if (config.defaultAccountId) {
      console.log(`Default Account: ${config.defaultAccountId}`);
    }
  },
};
