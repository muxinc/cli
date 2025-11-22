import { Command } from "@cliffy/command";
import { createCommand } from "./create.ts";
import { listCommand } from "./list.ts";
import { getCommand } from "./get.ts";
import { deleteCommand } from "./delete.ts";

export const liveCommand = new Command()
  .description("Manage Mux live streams")
  .action(function () {
    this.showHelp();
  })
  .command("create", createCommand)
  .command("list", listCommand)
  .command("get", getCommand)
  .command("delete", deleteCommand);
