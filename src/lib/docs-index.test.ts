import { describe, expect, it } from 'bun:test';
import { parseDocsIndex, searchDocsIndex } from './docs-index.ts';

const FIXTURE = `# Mux Documentation for LLMs

> Mux is how developers build online video.

## Quick start: What are you trying to do?

- **Upload and stream a video file** → Start with /docs/core.txt

## Docs

- [/docs/core.txt](https://www.mux.com/docs/core.txt): Core Mux concepts (start here for most projects)
- [/llms-full.txt](https://www.mux.com/llms-full.txt): All Mux docs in one file (if your context window is large enough)
- [/docs/guides/video.txt](https://www.mux.com/docs/guides/video.txt): Upload, encode, and manage video assets
- [/docs/guides/robots-moderate.md](https://www.mux.com/docs/guides/robots-moderate.md): Analyze video content for policy violations with Mux Robots
- [/docs/guides/robots-summarize.md](https://www.mux.com/docs/guides/robots-summarize.md): Generate titles, descriptions, and tags
- [/docs/guides/start-live-streaming.md](https://www.mux.com/docs/guides/start-live-streaming.md): Create and broadcast live streams
`;

describe('parseDocsIndex', () => {
  it('parses path, url, and description from index lines', () => {
    const entries = parseDocsIndex(FIXTURE);
    const core = entries.find((entry) => entry.path === '/docs/core.txt');
    expect(core?.url).toBe('https://www.mux.com/docs/core.txt');
    expect(core?.description).toBe(
      'Core Mux concepts (start here for most projects)',
    );
  });

  it('ignores prose lines that are not index entries', () => {
    const entries = parseDocsIndex(FIXTURE);
    expect(entries.length).toBe(5);
  });

  it('excludes llms-full.txt so it is never recommended', () => {
    const entries = parseDocsIndex(FIXTURE);
    expect(entries.some((entry) => entry.url.includes('llms-full'))).toBe(
      false,
    );
  });
});

describe('searchDocsIndex', () => {
  const entries = parseDocsIndex(FIXTURE);

  it('ranks the page matching all terms first', () => {
    const results = searchDocsIndex(entries, 'robots moderate');
    expect(results[0].path).toBe('/docs/guides/robots-moderate.md');
  });

  it('matches terms in descriptions, not just paths', () => {
    const results = searchDocsIndex(entries, 'policy violations');
    expect(results[0].path).toBe('/docs/guides/robots-moderate.md');
  });

  it('returns no results for a query matching nothing', () => {
    expect(searchDocsIndex(entries, 'kubernetes helm chart')).toEqual([]);
  });

  it('respects the limit', () => {
    const results = searchDocsIndex(entries, 'video', 1);
    expect(results.length).toBe(1);
  });
});
