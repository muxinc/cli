import { Command } from "@cliffy/command";
import { createCommand } from "./create.ts";
import { deleteCommand } from "./delete.ts";
import { listCommand } from "./list.ts";

export const staticRenditionsCommand = new Command()
	.description("Manage static renditions (MP4s) for Mux video assets")
	.action(function () {
		this.showHelp();
	})
	.command("list", listCommand)
	.command("create", createCommand)
	.command("delete", deleteCommand);
