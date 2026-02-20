import type { Command } from "../types.js";
import { saveToken, loadToken } from "../../config.js";

const USAGE = `brex login --token <API_TOKEN>
brex login --token-stdin`;

type LoginOptions = {
  token?: string;
  tokenStdin: boolean;
};

export const loginCommand: Command = {
  name: "login",
  description: "Authenticate with your Brex API token.",
  usage: USAGE,
  run: async (args) => {
    const options = parseLoginArgs(args);

    if (options.tokenStdin && options.token) {
      throw new Error("Use either --token or --token-stdin, not both.");
    }

    let token = options.token;

    if (options.tokenStdin) {
      token = await readTokenFromStdin();
    }

    if (!token) {
      // Check if already authenticated
      const existingToken = loadToken();
      if (existingToken) {
        console.log("Already authenticated. Use 'brex logout' to disconnect.");
        return;
      }
      throw new Error("Missing token. Use --token <TOKEN> or --token-stdin.");
    }

    token = token.trim();
    if (!token) {
      throw new Error("Token cannot be empty.");
    }

    saveToken(token);
    console.log("Authenticated successfully. Token saved to ~/.brex/token");
  },
};

function parseLoginArgs(args: readonly string[]): LoginOptions {
  let token: string | undefined;
  let tokenStdin = false;
  const positionals: string[] = [];

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === undefined) continue;

    if (arg === "--token") {
      const value = args[i + 1];
      if (value === undefined) {
        throw new Error("--token requires a value");
      }
      token = value;
      i += 1;
      continue;
    }

    if (arg === "--token-stdin") {
      tokenStdin = true;
      continue;
    }

    if (arg.startsWith("-")) {
      throw new Error(`Unknown option: ${arg}`);
    }

    positionals.push(arg);
  }

  if (positionals.length > 0) {
    throw new Error(`Unexpected arguments: ${positionals.join(" ")}`);
  }

  return { token, tokenStdin };
}

async function readTokenFromStdin(): Promise<string> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf-8").trim();
}
