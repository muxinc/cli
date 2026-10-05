import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { extname } from 'node:path';
import { MigrationFailure } from '../errors.ts';
import type { CaptionSource, SourceItem, SourceProvider } from '../types.ts';

type Row = Record<string, unknown>;

interface ManifestCaption {
  url: string;
  language: string;
  label?: string;
  closed_captions?: boolean;
}

/** Parses RFC 4180 CSV: quoted fields may contain commas, quotes, and newlines. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += char;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((value) => value !== ''));
}

function csvRows(text: string): Array<{ label: string; row: Row }> {
  const [header, ...lines] = parseCsv(text);
  if (!header) return [];
  const columns = header.map((name) => name.trim());
  return lines.map((values, index) => ({
    // The header is row 1.
    label: `Row ${index + 2}`,
    row: Object.fromEntries(
      columns.map((column, i) => [
        column,
        values[i] === '' ? undefined : values[i],
      ]),
    ),
  }));
}

function jsonRows(text: string): Array<{ label: string; row: Row }> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new MigrationFailure({
      code: 'MANIFEST_INVALID',
      message: `The manifest is not valid JSON: ${(error as Error).message}`,
    });
  }
  const entries = Array.isArray(parsed)
    ? parsed
    : (parsed as { items?: unknown })?.items;
  if (!Array.isArray(entries)) {
    throw new MigrationFailure({
      code: 'MANIFEST_INVALID',
      message:
        'A JSON manifest must be an array of entries, or an object with an "items" array.',
    });
  }
  return entries.map((row, index) => ({
    label: `Entry ${index + 1}`,
    row: row as Row,
  }));
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value : undefined;
}

function parseTags(value: unknown): string[] | undefined {
  if (Array.isArray(value)) return value.map(String);
  const text = optionalString(value);
  return text
    ?.split(';')
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function parseCaptions(value: unknown, label: string): ManifestCaption[] {
  if (value === undefined || value === null || value === '') return [];
  let captions: unknown = value;
  if (typeof value === 'string') {
    try {
      captions = JSON.parse(value);
    } catch {
      captions = undefined;
    }
  }
  const valid =
    Array.isArray(captions) &&
    captions.every(
      (c) =>
        optionalString(c?.url) !== undefined &&
        optionalString(c?.language) !== undefined,
    );
  if (!valid) {
    throw new MigrationFailure({
      code: 'MANIFEST_CAPTIONS_INVALID',
      message: `${label} has invalid captions. Use a JSON array of {"url", "language"} objects.`,
    });
  }
  return captions as ManifestCaption[];
}

function idFromUrl(url: string): string {
  return createHash('sha256').update(url).digest('hex').slice(0, 16);
}

function toSourceItem(row: Row, label: string): SourceItem {
  const url = optionalString(row.url);
  if (!url) {
    throw new MigrationFailure({
      code: 'MANIFEST_URL_MISSING',
      message: `${label} has no url.`,
      hint: 'Every manifest entry needs a url that Mux can download.',
    });
  }
  const captions = parseCaptions(row.captions, label);
  return {
    sourceId: optionalString(row.id) ?? idFromUrl(url),
    type: 'video',
    exportable: true,
    title: optionalString(row.title),
    description: optionalString(row.description),
    tags: parseTags(row.tags),
    posterUrl: optionalString(row.poster_url),
    passthrough: optionalString(row.passthrough),
    sourceUrl: url,
    embedPatterns: [url],
    captionCount: captions.length,
    raw: { ...row, captions },
  };
}

/** Reads a CSV or JSON manifest of source URLs. See MIGRATE_SPEC.md "Manifest". */
export function createManifestProvider(path: string): SourceProvider<void> {
  let items: Promise<SourceItem[]> | undefined;

  async function load(): Promise<SourceItem[]> {
    const format = extname(path).toLowerCase();
    if (format !== '.csv' && format !== '.json') {
      throw new MigrationFailure({
        code: 'MANIFEST_FORMAT_UNSUPPORTED',
        message: `Unsupported manifest file type "${format || 'none'}".`,
        hint: 'Use a .json or .csv file.',
      });
    }
    const text = await readFile(path, 'utf-8');
    const rows = format === '.csv' ? csvRows(text) : jsonRows(text);
    const seen = new Set<string>();
    return rows.map(({ row, label }) => {
      const item = toSourceItem(row, label);
      if (seen.has(item.sourceId)) {
        throw new MigrationFailure({
          code: 'MANIFEST_DUPLICATE_ID',
          message: `${label} repeats the id "${item.sourceId}". Each id must be unique.`,
        });
      }
      seen.add(item.sourceId);
      return item;
    });
  }

  return {
    id: 'manifest',
    defaultConcurrency: 4,

    async verify() {
      try {
        await stat(path);
        return { ok: true, warnings: [] };
      } catch {
        return {
          ok: false,
          warnings: [
            {
              code: 'MANIFEST_NOT_FOUND',
              message: `Manifest file not found: ${path}`,
              hint: 'Pass the path to a .json or .csv manifest.',
            },
          ],
        };
      }
    },

    async list() {
      items ??= load();
      return { items: await items };
    },

    async resolve(_creds, item) {
      const { captions } = item.raw as { captions: ManifestCaption[] };
      return {
        kind: 'resolved',
        url: item.sourceUrl as string,
        fidelity: 'original',
        captions: captions.map(
          (caption): CaptionSource => ({
            kind: 'url',
            url: caption.url,
            language: caption.language,
            label: caption.label,
            closedCaptions: caption.closed_captions ?? false,
          }),
        ),
      };
    },
  };
}
