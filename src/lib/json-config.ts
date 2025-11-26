import { readFile } from "fs/promises";

/**
 * Asset configuration for Mux video creation
 *
 * This interface provides type safety while remaining flexible for Mux API changes.
 * The index signature allows any additional properties that Mux may support.
 */
export interface AssetConfig {
  inputs?: Array<{
    url?: string;
    type?: string;
    text_type?: string;
    language_code?: string;
    name?: string;
    closed_captions?: boolean;
    overlay_settings?: {
      url: string;
      vertical_align?: string;
      horizontal_align?: string;
      vertical_margin?: string;
      horizontal_margin?: string;
      opacity?: string;
      width?: string;
      height?: string;
    };
    generated_subtitles?: Array<{
      language_code: string;
      name?: string;
      passthrough?: string;
    }>;
    start_time?: number;
    end_time?: number;
  }>;
  playback_policy?: string[];
  test?: boolean;
  encoding_tier?: string;
  mp4_support?: string;
  max_resolution_tier?: string;
  master_access?: string;
  normalize_audio?: boolean;
  passthrough?: string;
  per_title_encode?: boolean;
  advanced_playback_policy?: Array<{
    policy?: string;
    drm_configuration_id?: string;
  }>;
  // Allow additional properties for future Mux API changes
  [key: string]: unknown;
}

/**
 * Parse a JSON configuration file for asset creation
 *
 * @param filePath - Absolute path to the JSON configuration file
 * @returns Parsed asset configuration object
 * @throws {Error} If file not found or contains invalid JSON
 *
 * @remarks
 * This function only validates:
 * - File existence
 * - Valid JSON syntax
 *
 * Business rule validation (enum values, required fields, etc.) is handled
 * by the Mux API. Invalid configurations will fail at API call time with
 * clear error messages from Mux.
 *
 * @example
 * ```typescript
 * const config = await parseAssetConfig('./asset-config.json');
 * // config contains the parsed JSON object
 * ```
 */
export async function parseAssetConfig(filePath: string): Promise<AssetConfig> {
  try {
    const content = await readFile(filePath, "utf-8");
    return JSON.parse(content);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(`Configuration file not found: ${filePath}`);
    }
    if (error instanceof SyntaxError) {
      throw new Error(`Invalid JSON in configuration file: ${error.message}`);
    }
    throw error;
  }
}
