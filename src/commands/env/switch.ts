import { Command } from "@cliffy/command";
import { getEnvironment, setDefaultEnvironment } from "../../lib/config.ts";

export const switchCommand = new Command()
	.description("Switch the default environment")
	.arguments("<name:string>")
	.action(async (_options, name: string) => {
		// Check if environment exists
		const env = await getEnvironment(name);

		if (!env) {
			console.error(`❌ Environment "${name}" does not exist.`);
			console.log("\nRun 'mux env list' to see available environments.");
			process.exit(1);
		}

		// Set as default
		await setDefaultEnvironment(name);
		console.log(`✅ Switched default environment to: ${name}`);
	});
