#!/usr/bin/env bun
import type { Command, CommandContext } from "./commands/types.js";
import { createBrexClient } from "./client.js";
import { loginCommand } from "./commands/login/index.js";
import { logoutCommand } from "./commands/logout/index.js";
import { statusCommand } from "./commands/status/index.js";
import { accountsCommand } from "./commands/accounts/index.js";
import { transactionsCommand } from "./commands/transactions/index.js";
import { transferCommand } from "./commands/transfer/index.js";
import { recipientsCommand } from "./commands/recipients/index.js";
import { cardsCommand } from "./commands/cards/index.js";
import { statementsCommand } from "./commands/statements/index.js";
import { webhooksCommand } from "./commands/webhooks/index.js";
import { eventsCommand } from "./commands/events/index.js";
import { organizationCommand } from "./commands/organization/index.js";
import { usersCommand } from "./commands/users/index.js";
import { categoriesCommand } from "./commands/categories/index.js";
import { versionCommand } from "./commands/version/index.js";

const BIN = "brex";

const commands: readonly Command[] = [
  loginCommand,
  logoutCommand,
  statusCommand,
  accountsCommand,
  transactionsCommand,
  transferCommand,
  recipientsCommand,
  cardsCommand,
  statementsCommand,
  webhooksCommand,
  eventsCommand,
  organizationCommand,
  usersCommand,
  categoriesCommand,
  versionCommand,
];

const commandIndex = new Map<string, Command>();
for (const command of commands) {
  commandIndex.set(command.name, command);
  if (command.aliases) {
    for (const alias of command.aliases) {
      commandIndex.set(alias, command);
    }
  }
}

function isHelpFlag(value: string): boolean {
  return value === "-h" || value === "--help";
}

function printHelp(): void {
  console.log(`${BIN} <command> [options]`);
  console.log("");
  console.log("Commands:");

  for (const command of commands) {
    const aliasText = command.aliases && command.aliases.length > 0
      ? ` (${command.aliases.join(", ")})`
      : "";
    console.log(`  ${command.name.padEnd(16)}${command.description}${aliasText}`);
  }

  console.log("");
  console.log("Global options:");
  console.log("  --json          Output as JSON");
  console.log("  -h, --help      Show help");
  console.log("  -v, --version   Show version");
  console.log("");
  console.log(`Run "${BIN} <command> --help" for command-specific help.`);
}

function printCommandHelp(command: Command): void {
  console.log(command.usage);
  console.log("");
  console.log(command.description);
}

async function runCli(): Promise<void> {
  const args = process.argv.slice(2);
  const firstArg = args[0];

  if (!firstArg || isHelpFlag(firstArg)) {
    printHelp();
    return;
  }

  if (firstArg === "--version" || firstArg === "-v") {
    await versionCommand.run([], createContext());
    return;
  }

  const commandName = firstArg;
  const command = commandIndex.get(commandName);

  if (!command) {
    console.error(`Unknown command: ${commandName}`);
    printHelp();
    process.exitCode = 1;
    return;
  }

  const commandArgs = args.slice(1);
  if (commandArgs.some(isHelpFlag)) {
    printCommandHelp(command);
    return;
  }

  try {
    const context = createContext();
    await command.run(commandArgs, context);
  } catch (error) {
    if (error instanceof Error) {
      console.error(`Error: ${error.message}`);
    } else {
      console.error("Unexpected error");
    }
    process.exitCode = 1;
  }
}

function createContext(): CommandContext {
  return {
    client: createBrexClient(),
  };
}

void runCli();
