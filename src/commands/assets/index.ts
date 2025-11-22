import { Command } from "@cliffy/command";
import { createCommand } from "./create.ts";

export const assetsCommand = new Command()
  .description("Manage Mux video assets")
  .action(function () {
    this.showHelp();
  })
  .command("create", createCommand);
