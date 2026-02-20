import type { OutputFormat } from "./commands/types.js";

export function parseOutputFlag(args: readonly string[]): { format: OutputFormat; args: string[] } {
  let format: OutputFormat = "table";
  const remaining: string[] = [];

  for (const arg of args) {
    if (arg === "--json") {
      format = "json";
      continue;
    }
    remaining.push(arg);
  }

  return { format, args: remaining };
}

export function printJson(data: unknown): void {
  console.log(JSON.stringify(data, null, 2));
}

export function printTable<T extends Record<string, unknown>>(
  rows: T[],
  columns: { key: keyof T; header: string; width?: number; format?: (value: unknown) => string }[]
): void {
  if (rows.length === 0) {
    console.log("No results.");
    return;
  }

  // Calculate column widths
  const widths = columns.map((col) => {
    const headerWidth = col.header.length;
    const maxDataWidth = rows.reduce((max, row) => {
      const value = col.format ? col.format(row[col.key]) : String(row[col.key] ?? "");
      return Math.max(max, value.length);
    }, 0);
    return col.width ?? Math.min(Math.max(headerWidth, maxDataWidth), 50);
  });

  // Print header
  const headerLine = columns.map((col, i) => col.header.padEnd(widths[i]!)).join("  ");
  console.log(headerLine);
  console.log(columns.map((_, i) => "─".repeat(widths[i]!)).join("  "));

  // Print rows
  for (const row of rows) {
    const line = columns.map((col, i) => {
      const value = col.format ? col.format(row[col.key]) : String(row[col.key] ?? "");
      return value.slice(0, widths[i]!).padEnd(widths[i]!);
    }).join("  ");
    console.log(line);
  }
}

export function formatAmount(
  amount: number | string | null | undefined,
  currency = "USD"
): string {
  if (amount === null || amount === undefined) return "-";
  const numeric = typeof amount === "string" ? Number(amount) : amount;
  if (!Number.isFinite(numeric)) {
    return String(amount);
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(numeric / 100);
}

export function formatDate(isoString: string | null | undefined): string {
  if (!isoString) return "-";
  const date = new Date(isoString);
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function formatDateTime(isoString: string | null | undefined): string {
  if (!isoString) return "-";
  const date = new Date(isoString);
  return date.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 3) + "...";
}
