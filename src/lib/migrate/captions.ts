import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { CaptionHandler, TextCaption } from './types.ts';

/** Saves caption text under `{stateDir}/captions/` for the customer to host later. */
export function createLocalCaptionStore(stateDir: string): CaptionHandler {
  return {
    async saveLocal(sourceId: string, caption: TextCaption) {
      const directory = join(stateDir, 'captions');
      await mkdir(directory, { recursive: true });
      const name = sourceId.replace(/[^A-Za-z0-9._-]+/g, '_');
      const path = join(
        directory,
        `${name}.${caption.language}.${caption.format}`,
      );
      await writeFile(path, caption.text);
      return path;
    },
  };
}
