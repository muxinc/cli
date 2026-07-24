const LLMS_INDEX_URL = 'https://www.mux.com/llms.txt';
const FETCH_TIMEOUT_MS = 5000;

export interface DocsIndexEntry {
  path: string;
  url: string;
  description: string;
}

/**
 * Parse mux.com/llms.txt index lines of the form
 * `- [/docs/guides/foo.md](https://www.mux.com/docs/guides/foo.md): description`.
 * llms-full.txt is excluded: it is the entire documentation in one file and
 * should never be recommended to an agent.
 */
export function parseDocsIndex(text: string): DocsIndexEntry[] {
  const entries: DocsIndexEntry[] = [];
  const pattern = /^- \[([^\]]+)\]\((https:\/\/[^)]+)\)(?::\s*(.*))?$/;
  for (const line of text.split('\n')) {
    const match = line.trim().match(pattern);
    if (!match) continue;
    if (match[2].includes('llms-full')) continue;
    entries.push({
      path: match[1],
      url: match[2],
      description: match[3]?.trim() ?? '',
    });
  }
  return entries;
}

/**
 * Rank index entries against a search query. Terms match case-insensitively
 * against the path and description; path matches score slightly higher so
 * exact page names win over passing mentions.
 */
export function searchDocsIndex(
  entries: DocsIndexEntry[],
  query: string,
  limit = 5,
): DocsIndexEntry[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return [];

  const scored = entries
    .map((entry) => {
      const path = entry.path.toLowerCase();
      const description = entry.description.toLowerCase();
      let score = 0;
      for (const term of terms) {
        if (path.includes(term)) score += 2;
        else if (description.includes(term)) score += 1;
      }
      return { entry, score };
    })
    .filter((item) => item.score > 0);

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((item) => item.entry);
}

/**
 * Fetch the live docs index from mux.com. Throws on network failure or a
 * non-OK response so the command can report it.
 */
export async function fetchDocsIndex(): Promise<string> {
  const response = await fetch(LLMS_INDEX_URL, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(
      `Failed to fetch ${LLMS_INDEX_URL}: ${response.status} ${response.statusText}`,
    );
  }
  return response.text();
}
