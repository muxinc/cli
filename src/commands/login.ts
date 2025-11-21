import { Command } from "@cliffy/command";
import { Input, Secret } from "@cliffy/prompt";
import { readFile } from "fs/promises";
import { existsSync } from "fs";
import { setEnvironment, listEnvironments } from "../lib/config.ts";
import { validateCredentials } from "../lib/mux.ts";

export interface EnvVars {
  MUX_TOKEN_ID?: string;
  MUX_TOKEN_SECRET?: string;
}

/**
 * Parse a .env file and extract MUX_TOKEN_ID and MUX_TOKEN_SECRET
 */
export async function parseEnvFile(filePath: string): Promise<EnvVars> {
  if (!existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  const content = await readFile(filePath, "utf-8");
  const envVars: EnvVars = {};

  for (const line of content.split("\n")) {
    const trimmed = line.trim();

    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    // Parse KEY=VALUE
    const match = trimmed.match(/^([^=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      let value = match[2].trim();

      // Remove surrounding quotes if present
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }

      if (key === "MUX_TOKEN_ID") {
        envVars.MUX_TOKEN_ID = value;
      } else if (key === "MUX_TOKEN_SECRET") {
        envVars.MUX_TOKEN_SECRET = value;
      }
    }
  }

  return envVars;
}

export const loginCommand = new Command()
  .description("Login to Mux and save credentials")
  .option("-f, --env-file <path:string>", "Path to .env file containing credentials")
  .option("-n, --name <name:string>", "Name for this environment (default: 'default')")
  .action(async (options) => {
    let tokenId: string;
    let tokenSecret: string;
    const envName = options.name || "default";

    // Check if environment already exists
    const existingEnvs = await listEnvironments();
    if (existingEnvs.includes(envName)) {
      console.log(`⚠️  Environment "${envName}" already exists. It will be overwritten.`);
    }

    if (options.envFile) {
      // Read from .env file
      console.log(`Reading credentials from ${options.envFile}...`);

      const envVars = await parseEnvFile(options.envFile);

      if (!envVars.MUX_TOKEN_ID || !envVars.MUX_TOKEN_SECRET) {
        throw new Error(
          "Missing required variables in .env file. Expected: MUX_TOKEN_ID and MUX_TOKEN_SECRET"
        );
      }

      tokenId = envVars.MUX_TOKEN_ID;
      tokenSecret = envVars.MUX_TOKEN_SECRET;
    } else {
      // Interactive prompts
      console.log("Enter your Mux API credentials:");

      tokenId = await Input.prompt({
        message: "Mux Token ID:",
        validate: (value: string) => {
          if (!value || value.trim().length === 0) {
            return "Token ID is required";
          }
          return true;
        },
      });

      tokenSecret = await Secret.prompt({
        message: "Mux Token Secret:",
        validate: (value: string) => {
          if (!value || value.trim().length === 0) {
            return "Token Secret is required";
          }
          return true;
        },
      });
    }

    // Validate credentials
    console.log("Validating credentials...");
    const validation = await validateCredentials(
      tokenId.trim(),
      tokenSecret.trim()
    );

    if (!validation.valid) {
      throw new Error(validation.error || "Invalid credentials");
    }

    console.log("✅ Credentials validated successfully");

    // Save to config
    await setEnvironment(envName, {
      tokenId: tokenId.trim(),
      tokenSecret: tokenSecret.trim(),
    });

    console.log(`✅ Credentials saved for environment: ${envName}`);

    if (existingEnvs.length === 0) {
      console.log(`✅ Set as default environment`);
    }
  });
