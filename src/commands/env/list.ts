import { Command } from "@cliffy/command";
import { readConfig } from "../../lib/config.ts";

export const listCommand = new Command()
  .description("List all configured environments")
  .action(async () => {
    const config = await readConfig();

    if (!config || Object.keys(config.environments).length === 0) {
      console.log("No environments configured.");
      console.log("\nRun 'mux login' to add an environment.");
      return;
    }

    console.log("Configured environments:\n");

    const envNames = Object.keys(config.environments);
    const defaultEnv = config.defaultEnvironment;

    for (const name of envNames) {
      const isDefault = name === defaultEnv;
      const marker = isDefault ? "* " : "  ";
      console.log(`${marker}${name}${isDefault ? " (default)" : ""}`);
    }

    console.log(`\n${envNames.length} environment${envNames.length === 1 ? "" : "s"} total`);
  });
