import { glob } from "glob";
import { stat } from "fs/promises";
import { readFile } from "fs/promises";
import { basename } from "path";

export interface FileInfo {
	name: string;
	path: string;
	size: number;
}

/**
 * Expand a glob pattern and return information about matching files
 *
 * @param pattern - Glob pattern (e.g., "*.mp4", "videos/**\/*.mp4")
 * @returns Array of file information objects
 * @throws Error if pattern points to a directory
 */
export async function expandGlobPattern(pattern: string): Promise<FileInfo[]> {
	// Find all matching files
	const matches = await glob(pattern, {
		nodir: true, // Exclude directories
		absolute: true, // Return absolute paths
	});

	// If the pattern is a single path and it's a directory, throw error
	if (matches.length === 0) {
		try {
			const stats = await stat(pattern);
			if (stats.isDirectory()) {
				throw new Error(
					`Pattern points to a directory: ${pattern}. Please specify files or use a glob pattern like ${pattern}/*.mp4`,
				);
			}
		} catch (error) {
			// If stat fails, it's just no matches - return empty array
			if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
				throw error;
			}
		}
	}

	// Get file info for each match
	const fileInfos: FileInfo[] = [];
	for (const filePath of matches) {
		const stats = await stat(filePath);
		const name = basename(filePath);

		fileInfos.push({
			name,
			path: filePath,
			size: stats.size,
		});
	}

	return fileInfos;
}

export interface UploadResult {
	uploadId: string;
	success: boolean;
	assetId?: string;
}

/**
 * Upload a file to a Mux direct upload URL
 *
 * @param filePath - Absolute path to the file to upload
 * @param uploadUrl - Signed upload URL from Mux
 * @param uploadId - Upload ID from Mux
 * @param onProgress - Callback for progress updates (0-100)
 * @returns Upload result with upload ID and success status
 *
 * @remarks
 * Progress reporting is limited with native fetch - currently reports 0% at start
 * and 100% at completion. For large files, the CLI may appear to hang during upload.
 * Future enhancement: implement streaming upload with granular progress tracking.
 */
export async function uploadFile(
	filePath: string,
	uploadUrl: string,
	uploadId: string,
	onProgress: (percent: number) => void,
): Promise<UploadResult> {
	try {
		// Report upload starting
		onProgress(0);

		// Read the file
		const fileContent = await readFile(filePath);

		// Upload to the signed URL
		const response = await fetch(uploadUrl, {
			method: "PUT",
			body: fileContent,
			headers: {
				"Content-Type": "application/octet-stream",
				"Content-Length": fileContent.length.toString(),
			},
		});

		if (!response.ok) {
			throw new Error(
				`Upload failed with status ${response.status}: ${response.statusText}`,
			);
		}

		// Report upload complete
		onProgress(100);

		return {
			uploadId,
			success: true,
		};
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") {
			throw new Error(`File not found: ${filePath}`);
		}

		if (error instanceof TypeError && error.message.includes("fetch")) {
			throw new Error(`Upload failed: Invalid upload URL`);
		}

		throw error;
	}
}
