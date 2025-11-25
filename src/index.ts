#!/usr/bin/env bun
import { Command } from "@cliffy/command";
import { assetsCommand } from "./commands/assets/index.ts";
import { envCommand } from "./commands/env/index.ts";
import { liveCommand } from "./commands/live/index.ts";
import { loginCommand } from "./commands/login.ts";
import { logoutCommand } from "./commands/logout.ts";

const VERSION = "1.0.0";

// Main CLI command
const cli = new Command()
	.name("mux")
	.version(VERSION)
	.description("Official Mux CLI for interacting with Mux APIs")
	.action(function () {
		this.showHelp();
	})
	.allowEmpty(true)
	.command("login", loginCommand)
	.command("logout", logoutCommand)
	.command("env", envCommand)
	.command("assets", assetsCommand)
	.command("live", liveCommand);

// Run the CLI
if (import.meta.main) {
	try {
		await cli.parse(Bun.argv.slice(2));
	} catch (error) {
		if (error instanceof Error) {
			console.error(`Error: ${error.message}`);
		} else {
			console.error("An unknown error occurred");
		}
		process.exit(1);
	}
}

export { cli };
