import type { BrexClient } from "./commands/types.js";
import { loadToken, getApiBaseUrl } from "./config.js";

export type ApiError = {
  error: string;
  message?: string;
  details?: unknown;
};

export class BrexApiError extends Error {
  status: number;
  body: ApiError;

  constructor(status: number, body: ApiError) {
    super(body.message ?? body.error ?? `HTTP ${status}`);
    this.name = "BrexApiError";
    this.status = status;
    this.body = body;
  }
}

export function createBrexClient(): BrexClient {
  const token = loadToken();
  const baseUrl = getApiBaseUrl();

  return {
    baseUrl,
    token,
    fetch: async <T>(path: string, init?: RequestInit): Promise<T> => {
      if (!token) {
        throw new Error("Not authenticated. Run 'brex login' first.");
      }

      const url = path.startsWith("http") ? path : `${baseUrl}${path}`;
      
      const response = await fetch(url, {
        ...init,
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
          "Accept": "application/json",
          ...init?.headers,
        },
      });

      if (!response.ok) {
        let body: ApiError;
        try {
          const parsed = await response.json();
          if (parsed && typeof parsed === "object") {
            body = parsed as ApiError;
          } else {
            body = { error: `HTTP ${response.status}`, message: response.statusText };
          }
        } catch {
          body = { error: `HTTP ${response.status}`, message: response.statusText };
        }
        throw new BrexApiError(response.status, body);
      }

      if (response.status === 204) {
        return undefined as T;
      }

      const text = (await response.text()).trim();
      if (!text) return undefined as T;
      return JSON.parse(text) as T;
    },
  };
}
