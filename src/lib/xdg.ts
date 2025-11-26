import { join } from "path";
import { homedir } from "os";

/**
 * Get the XDG config directory path for Mux CLI
 * Follows XDG Base Directory specification
 */
export function getConfigDir(): string {
	const xdgConfigHome = process.env.XDG_CONFIG_HOME;
	const baseDir = xdgConfigHome || join(homedir(), ".config");
	return join(baseDir, "mux");
}

/**
 * Get the full path to the config file
 */
export function getConfigPath(): string {
	return join(getConfigDir(), "config.json");
}
