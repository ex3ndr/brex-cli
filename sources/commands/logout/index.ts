import type { Command } from "../types.js";
import { clearToken, loadToken } from "../../config.js";

const USAGE = "brex logout";

export const logoutCommand: Command = {
  name: "logout",
  description: "Remove stored authentication token.",
  usage: USAGE,
  run: async () => {
    const token = loadToken();
    if (!token) {
      console.log("Not currently authenticated.");
      return;
    }

    clearToken();
    console.log("Logged out. Token removed from ~/.brex/token");
  },
};
