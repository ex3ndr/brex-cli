import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const CONFIG_DIR = join(homedir(), ".brex");
const TOKEN_PATH = join(CONFIG_DIR, "token");
const CONFIG_PATH = join(CONFIG_DIR, "config.json");

export type BrexConfig = {
  defaultAccountId?: string;
  apiBaseUrl?: string;
};

function ensureConfigDir(): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { mode: 0o700, recursive: true });
  }
}

export function loadToken(): string | null {
  if (!existsSync(TOKEN_PATH)) {
    return null;
  }
  try {
    const value = readFileSync(TOKEN_PATH, "utf-8").trim();
    return value.length > 0 ? value : null;
  } catch {
    return null;
  }
}

export function saveToken(token: string): void {
  ensureConfigDir();
  writeFileSync(TOKEN_PATH, token.trim(), { mode: 0o600 });
}

export function clearToken(): void {
  if (existsSync(TOKEN_PATH)) {
    unlinkSync(TOKEN_PATH);
  }
}

export function loadConfig(): BrexConfig {
  if (!existsSync(CONFIG_PATH)) {
    return {};
  }
  try {
    return JSON.parse(readFileSync(CONFIG_PATH, "utf-8")) as BrexConfig;
  } catch {
    return {};
  }
}

export function saveConfig(config: BrexConfig): void {
  ensureConfigDir();
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), { mode: 0o600 });
}

export function getApiBaseUrl(): string {
  const config = loadConfig();
  return config.apiBaseUrl ?? "https://platform.brexapis.com";
}
