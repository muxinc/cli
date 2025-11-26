import { spawn } from "node:child_process";

/**
 * Try to copy text using a specific clipboard command
 */
function tryClipboard(
	cmd: string,
	args: string[],
	text: string,
): Promise<void> {
	return new Promise((resolve, reject) => {
		const proc = spawn(cmd, args, { stdio: ["pipe", "pipe", "pipe"] });

		proc.on("error", reject);
		proc.on("close", (code) => {
			if (code === 0) {
				resolve();
			} else {
				reject(new Error(`${cmd} exited with code ${code}`));
			}
		});

		proc.stdin.write(text);
		proc.stdin.end();
	});
}

/**
 * Copy text to the system clipboard
 * Works on macOS (pbcopy), Linux (xclip/xsel), and Windows (clip)
 */
export async function copyToClipboard(text: string): Promise<void> {
	const platform = process.platform;

	switch (platform) {
		case "darwin":
			await tryClipboard("pbcopy", [], text);
			break;

		case "linux":
			try {
				await tryClipboard("xclip", ["-selection", "clipboard"], text);
			} catch {
				// Fallback to xsel if xclip fails
				try {
					await tryClipboard("xsel", ["--clipboard", "--input"], text);
				} catch {
					throw new Error(
						"Could not copy to clipboard. Please install xclip or xsel.",
					);
				}
			}
			break;

		case "win32":
			await tryClipboard("clip", [], text);
			break;

		default:
			throw new Error(`Clipboard not supported on platform: ${platform}`);
	}
}
