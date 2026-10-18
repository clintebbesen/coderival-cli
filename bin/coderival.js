#!/usr/bin/env node
// @ts-check
import { HELP, parseCli } from "../src/args.js";
import { addForge, removeForge } from "../src/commands/forges.js";
import { login, logout } from "../src/commands/login.js";
import { schedule, status } from "../src/commands/status.js";
import { sync } from "../src/commands/sync.js";
import { loadConfig } from "../src/config.js";
import { VERSION } from "../src/version.js";

async function main() {
  const options = parseCli(process.argv.slice(2));
  if (options.version) return console.log(VERSION);
  if (options.help || options.command === "help") return console.log(HELP);

  const config = await loadConfig();
  const server = options.server || process.env.CODERIVAL_SERVER;
  if (server) config.server = server;

  switch (options.command) {
    case "sync":
      await sync(config, options);
      return;
    case "login":
      await login(config);
      return;
    case "logout":
      await logout(config);
      return;
    case "add":
      await addForge(config, options.rest[0], options);
      return;
    case "remove":
      await removeForge(config, options.rest[0]);
      return;
    case "status":
      status(config);
      return;
    case "schedule":
      schedule();
      return;
    default:
      throw new Error(`Unknown command "${options.command}". Run coderival --help.`);
  }
}

main().catch((error) => {
  console.error(`coderival: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
