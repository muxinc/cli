import { Command } from "@cliffy/command";
import { listCommand } from "./list.ts";
import { switchCommand } from "./switch.ts";

export const envCommand = new Command()
	.description("Manage Mux environments")
	.action(function () {
		this.showHelp();
	})
	.command("list", listCommand)
	.command("switch", switchCommand);
