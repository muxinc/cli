import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { getCacheDir } from './xdg.ts';

export const DOCS_RELATIVE_ROOT = 'apps/web/app/docs';
export const DOCS_GUIDES_RELATIVE_ROOT = `${DOCS_RELATIVE_ROOT}/_guides`;
export const MUX_DOCS_REPO_URL = 'https://github.com/muxinc/mux.com.git';
export const DOCS_BASE_URL = 'https://docs.mux.com';
export const MUX_DOCS_MANIFEST_URL = `${DOCS_BASE_URL}/.well-known/mux-docs/manifest.json`;
export const MUX_DOCS_INDEX_URL = `${DOCS_BASE_URL}/.well-known/mux-docs/index.json`;

const SKIPPED_DIRECTORIES = new Set([
  '.git',
  '.next',
  '.turbo',
  'dist',
  'node_modules',
]);

export interface ResolveDocsSourceOptions {
  explicitPath?: string;
  cwd?: string;
  repoUrl?: string;
}

export interface DocsSource {
  kind: 'local' | 'cache';
  source: 'explicit' | 'env' | 'sibling' | 'cache';
  repoPath: string;
  docsRoot: string;
  repoUrl: string;
}

export interface PublishedDocsSource {
  kind: 'cache';
  source: 'published';
  indexPath: string;
  manifestPath: string;
  version?: string;
  generatedAt: string;
  documents: number;
}

export type DocsIndexSource = DocsSource | PublishedDocsSource;

export interface BuildDocsIndexOptions {
  repoPath: string;
  repoUrl?: string;
}

export interface PublishedDocsManifest {
  version: string;
  commit?: string | null;
  generatedAt: string;
  docsRoot: string;
  indexUrl: string;
  fileCount: number;
  files: Array<{
    id: string;
    path: string;
    route: string;
    url: string;
    sha256: string;
  }>;
}

export interface PublishedDocsIndexEntry {
  id: string;
  title: string;
  description?: string;
  product?: string;
  path: string;
  route: string;
  url: string;
  headings: string[];
  sha256: string;
  content: string;
}

export interface PublishedDocsIndex {
  version: string;
  commit?: string | null;
  generatedAt: string;
  docsRoot: string;
  entries: PublishedDocsIndexEntry[];
}

export interface DocsIndexEntry {
  id: string;
  title: string;
  description?: string;
  product?: string;
  relativePath: string;
  absolutePath: string;
  route: string;
  url: string;
  headings: string[];
  content: string;
}

export interface DocsIndex {
  generatedAt: string;
  repoPath: string;
  repoUrl: string;
  docsRoot: string;
  entries: DocsIndexEntry[];
  source?: 'local' | 'published';
  version?: string;
  commit?: string | null;
}

export interface DocsSearchResult {
  entry: DocsIndexEntry;
  score: number;
  snippet: string;
}

export interface SearchDocsIndexOptions {
  limit?: number;
}

export type DocsContentFormat = 'markdown' | 'raw';

interface JsonFetchResponse {
  ok: boolean;
  status: number;
  text(): Promise<string>;
  json(): Promise<unknown>;
}

export function getDocsRepoCachePath(): string {
  return join(getCacheDir(), 'docs', 'mux.com');
}

export function getDocsIndexCachePath(): string {
  return join(getCacheDir(), 'docs', 'index.json');
}

export function getDocsArtifactCachePaths(): {
  manifestPath: string;
  indexPath: string;
} {
  return {
    manifestPath: join(getCacheDir(), 'docs', 'manifest.json'),
    indexPath: getDocsIndexCachePath(),
  };
}

export async function updatePublishedDocsCache(
  options: {
    artifactPath?: string;
    manifestUrl?: string;
    indexUrl?: string;
  } = {},
): Promise<{ manifest: PublishedDocsManifest; index: PublishedDocsIndex }> {
  const artifactPath =
    options.artifactPath ?? process.env.MUX_DOCS_ARTIFACT_PATH;
  const manifest = artifactPath
    ? await readJson<PublishedDocsManifest>(join(artifactPath, 'manifest.json'))
    : await fetchJson<PublishedDocsManifest>(
        options.manifestUrl ??
          process.env.MUX_DOCS_MANIFEST_URL ??
          MUX_DOCS_MANIFEST_URL,
      );
  const index = artifactPath
    ? await readJson<PublishedDocsIndex>(join(artifactPath, 'index.json'))
    : await fetchJson<PublishedDocsIndex>(
        options.indexUrl ?? process.env.MUX_DOCS_INDEX_URL ?? manifest.indexUrl,
      );

  const cachePaths = getDocsArtifactCachePaths();
  await mkdir(dirname(cachePaths.manifestPath), { recursive: true });
  await writeFile(cachePaths.manifestPath, JSON.stringify(manifest, null, 2));
  await writeFile(cachePaths.indexPath, JSON.stringify(index, null, 2));

  return { manifest, index };
}

export async function readCachedDocsIndex(): Promise<DocsIndex> {
  const cachePaths = getDocsArtifactCachePaths();
  const cachedIndex = await readJson<PublishedDocsIndex | DocsIndex>(
    cachePaths.indexPath,
  );
  return normalizeCachedDocsIndex(cachedIndex, cachePaths.indexPath);
}

export function hasCachedDocsIndex(): boolean {
  return existsSync(getDocsArtifactCachePaths().indexPath);
}

export function getPublishedDocsSource(index: DocsIndex): PublishedDocsSource {
  const cachePaths = getDocsArtifactCachePaths();
  return {
    kind: 'cache',
    source: 'published',
    indexPath: cachePaths.indexPath,
    manifestPath: cachePaths.manifestPath,
    version: index.version,
    generatedAt: index.generatedAt,
    documents: index.entries.length,
  };
}

export function getCachedDocsSource(index: DocsIndex): DocsIndexSource {
  if (index.source === 'published') {
    return getPublishedDocsSource(index);
  }

  return {
    kind: 'cache',
    source: 'cache',
    repoPath: index.repoPath,
    docsRoot: index.docsRoot,
    repoUrl: index.repoUrl,
  };
}

function normalizeCachedDocsIndex(
  index: PublishedDocsIndex | DocsIndex,
  cachePath: string,
): DocsIndex {
  if (isDocsIndex(index)) {
    return index;
  }

  return normalizePublishedDocsIndex(index, cachePath);
}

function isDocsIndex(
  index: PublishedDocsIndex | DocsIndex,
): index is DocsIndex {
  const firstEntry = index.entries[0];

  return (
    'repoPath' in index &&
    'repoUrl' in index &&
    'docsRoot' in index &&
    (firstEntry === undefined ||
      ('relativePath' in firstEntry && 'absolutePath' in firstEntry))
  );
}

function normalizePublishedDocsIndex(
  index: PublishedDocsIndex,
  cachePath: string,
): DocsIndex {
  return {
    generatedAt: index.generatedAt,
    repoPath: dirname(cachePath),
    repoUrl: MUX_DOCS_REPO_URL,
    docsRoot: index.docsRoot,
    source: 'published',
    version: index.version,
    commit: index.commit,
    entries: index.entries.map((entry) => ({
      id: entry.id,
      title: entry.title,
      description: entry.description,
      product: entry.product,
      relativePath: entry.path,
      absolutePath: `published:${entry.id}`,
      route: entry.route,
      url: entry.url,
      headings: entry.headings,
      content: entry.content,
    })),
  };
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, 'utf-8')) as T;
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = (await fetch(url)) as unknown as JsonFetchResponse;

  if (!response.ok) {
    const body = await response.text();
    const details = body.trim();
    throw new Error(
      `Failed to fetch ${url}: ${response.status}${details ? ` ${details}` : ''}`,
    );
  }

  return (await response.json()) as T;
}

export async function resolveDocsSource(
  options: ResolveDocsSourceOptions = {},
): Promise<DocsSource> {
  const cwd = options.cwd ?? process.cwd();
  const repoUrl = options.repoUrl ?? MUX_DOCS_REPO_URL;

  if (options.explicitPath) {
    return resolveConfiguredSource(
      resolve(cwd, options.explicitPath),
      'explicit',
      repoUrl,
    );
  }

  if (process.env.MUX_DOCS_PATH) {
    return resolveConfiguredSource(
      resolve(cwd, process.env.MUX_DOCS_PATH),
      'env',
      repoUrl,
    );
  }

  const siblingPath = resolve(cwd, '..', 'mux.com');
  if (hasDocsRoot(siblingPath)) {
    return {
      kind: 'local',
      source: 'sibling',
      repoPath: siblingPath,
      docsRoot: join(siblingPath, DOCS_RELATIVE_ROOT),
      repoUrl,
    };
  }

  const cachePath = getDocsRepoCachePath();
  return {
    kind: 'cache',
    source: 'cache',
    repoPath: cachePath,
    docsRoot: join(cachePath, DOCS_RELATIVE_ROOT),
    repoUrl,
  };
}

async function resolveConfiguredSource(
  repoPath: string,
  source: 'explicit' | 'env',
  repoUrl: string,
): Promise<DocsSource> {
  if (!hasDocsRoot(repoPath)) {
    throw new Error(
      `Docs source does not contain ${DOCS_GUIDES_RELATIVE_ROOT}: ${repoPath}`,
    );
  }

  return {
    kind: 'local',
    source,
    repoPath,
    docsRoot: join(repoPath, DOCS_RELATIVE_ROOT),
    repoUrl,
  };
}

function hasDocsRoot(repoPath: string): boolean {
  return existsSync(join(repoPath, DOCS_GUIDES_RELATIVE_ROOT));
}

export async function loadDocsIndex(
  options: { explicitPath?: string } = {},
): Promise<{ index: DocsIndex; source: DocsIndexSource }> {
  if (
    !options.explicitPath &&
    !process.env.MUX_DOCS_PATH &&
    hasCachedDocsIndex()
  ) {
    const index = await readCachedDocsIndex();
    return { index, source: getCachedDocsSource(index) };
  }

  const source = await resolveDocsSource({
    explicitPath: options.explicitPath,
  });
  return {
    source,
    index: await buildDocsIndex({
      repoPath: source.repoPath,
      repoUrl: source.repoUrl,
    }),
  };
}

export async function buildDocsIndex(
  options: BuildDocsIndexOptions,
): Promise<DocsIndex> {
  const repoPath = options.repoPath;
  const repoUrl = options.repoUrl ?? MUX_DOCS_REPO_URL;
  const docsRoot = join(repoPath, DOCS_RELATIVE_ROOT);
  const guidesRoot = join(repoPath, DOCS_GUIDES_RELATIVE_ROOT);

  if (!existsSync(guidesRoot)) {
    throw new Error(
      `Docs guides root not found at ${guidesRoot}. Run 'mux docs update' or set MUX_DOCS_PATH.`,
    );
  }

  const files = await collectDocsFiles(guidesRoot);
  const entries = await Promise.all(
    files.map((filePath) => buildDocsIndexEntry(repoPath, docsRoot, filePath)),
  );

  entries.sort((a, b) => a.title.localeCompare(b.title));

  return {
    generatedAt: new Date().toISOString(),
    repoPath,
    repoUrl,
    docsRoot,
    source: 'local',
    entries,
  };
}

async function collectDocsFiles(root: string): Promise<string[]> {
  const results: string[] = [];

  async function walk(directory: string): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true });

    for (const entry of entries) {
      const path = join(directory, entry.name);

      if (entry.isDirectory()) {
        if (!SKIPPED_DIRECTORIES.has(entry.name)) {
          await walk(path);
        }
        continue;
      }

      if (entry.isFile() && extname(entry.name) === '.mdx') {
        results.push(path);
      }
    }
  }

  await walk(root);
  results.sort();
  return results;
}

async function buildDocsIndexEntry(
  repoPath: string,
  docsRoot: string,
  filePath: string,
): Promise<DocsIndexEntry> {
  const rawContent = await readFile(filePath, 'utf-8');
  const { frontmatter, body } = parseFrontmatter(rawContent);
  const headings = extractHeadings(body);
  const route = buildRoute(docsRoot, filePath);
  const relativePath = toPosixPath(relative(repoPath, filePath));
  const id =
    route.split('/').filter(Boolean).at(-1) ?? stripExtension(filePath);
  const title = frontmatter.title ?? titleFromId(id);

  return {
    id,
    title,
    description: frontmatter.description,
    product: frontmatter.product,
    relativePath,
    absolutePath: filePath,
    route,
    url: `${DOCS_BASE_URL}${route}`,
    headings,
    content: rawContent,
  };
}

function parseFrontmatter(content: string): {
  frontmatter: Record<string, string>;
  body: string;
} {
  if (!content.startsWith('---\n')) {
    return { frontmatter: {}, body: content };
  }

  const end = content.indexOf('\n---', 4);
  if (end === -1) {
    return { frontmatter: {}, body: content };
  }

  const yaml = content.slice(4, end).trim();
  const body = content.slice(end + 4).replace(/^\s*\n/, '');
  const frontmatter: Record<string, string> = {};

  for (const line of yaml.split('\n')) {
    const match = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!match) continue;

    const [, key, rawValue] = match;
    frontmatter[key] = rawValue.replace(/^['"]|['"]$/g, '').trim();
  }

  return { frontmatter, body };
}

function extractHeadings(content: string): string[] {
  return content
    .split('\n')
    .map((line) => line.match(/^#{1,6}\s+(.+)$/)?.[1]?.trim())
    .filter((heading): heading is string => Boolean(heading));
}

function buildRoute(docsRoot: string, filePath: string): string {
  const withoutExtension = stripExtension(
    toPosixPath(relative(docsRoot, filePath)),
  );
  const parts = withoutExtension
    .split('/')
    .filter((part) => part !== 'index')
    .map((part) => part.replace(/^_+/, ''));

  return `/${parts.join('/')}`;
}

function stripExtension(path: string): string {
  return path.replace(/\.(md|mdx)$/i, '');
}

function titleFromId(id: string): string {
  return id
    .split('-')
    .filter(Boolean)
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
    .join(' ');
}

function toPosixPath(path: string): string {
  return path.split('\\').join('/');
}

export function searchDocsIndex(
  index: DocsIndex,
  query: string,
  options: SearchDocsIndexOptions = {},
): DocsSearchResult[] {
  const normalizedQuery = normalizeDocsSearchQuery(query);
  if (normalizedQuery.terms.length === 0) return [];

  const results: DocsSearchResult[] = [];

  for (const entry of index.entries) {
    const score = scoreEntry(entry, normalizedQuery);
    if (score <= 0) continue;

    results.push({
      entry,
      score,
      snippet: makeSnippet(entry, normalizedQuery),
    });
  }

  results.sort(
    (a, b) => b.score - a.score || a.entry.title.localeCompare(b.entry.title),
  );
  return results.slice(0, options.limit ?? 10);
}

interface NormalizedDocsSearchQuery {
  terms: string[];
  phrases: string[];
}

const STOP_WORDS = new Set([
  'a',
  'about',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'can',
  'do',
  'does',
  'for',
  'from',
  'get',
  'how',
  'i',
  'in',
  'is',
  'it',
  'me',
  'my',
  'of',
  'on',
  'or',
  'the',
  'to',
  'use',
  'using',
  'with',
]);

const SHORT_SEARCH_TERMS = new Set([
  'ai',
  'api',
  'drm',
  'hls',
  'id',
  'jwt',
  'mp4',
  'sdk',
  'srt',
]);

const TERM_SYNONYMS: Record<string, string[]> = {
  browser: ['direct', 'upload'],
  caption: ['subtitle', 'subtitles', 'text', 'track', 'transcript'],
  captions: ['subtitle', 'subtitles', 'text', 'track', 'transcript'],
  drm: ['digital', 'rights', 'management', 'protected'],
  hls: ['playback', 'streaming', 'm3u8'],
  jwt: ['signed', 'playback', 'token', 'url'],
  sig: ['signature', 'mux', 'hmac'],
  signature: ['mux', 'hmac'],
  signatures: ['signature', 'mux', 'hmac'],
  subtitle: ['caption', 'captions', 'text', 'track', 'transcript'],
  subtitles: ['caption', 'captions', 'text', 'track', 'transcript'],
  token: ['jwt', 'signed'],
  tokens: ['jwt', 'signed'],
  transcript: ['captions', 'subtitles', 'text', 'track'],
};

const PHRASE_SYNONYMS: Array<[string, string[]]> = [
  [
    'webhook sig',
    ['webhook signature', 'mux signature', 'mux-signature', 'hmac'],
  ],
  ['webhook signature', ['mux-signature', 'hmac']],
  ['signed url', ['signed playback', 'playback token', 'jwt']],
  ['signed urls', ['signed playback', 'playback token', 'jwt']],
  ['signed playback', ['jwt', 'playback token', 'signed url']],
  ['playback id', ['playback-id', 'playback_id', 'playback ids']],
  ['playback ids', ['playback-id', 'playback_id', 'playback id']],
  ['direct upload', ['browser upload', 'upload files directly']],
  ['browser upload', ['direct upload', 'upload files directly']],
  ['upload from browser', ['direct upload', 'upload files directly']],
  ['stream key', ['live stream', 'rtmp']],
  ['live stream', ['stream key', 'rtmp', 'broadcast']],
  ['text track', ['captions', 'subtitles', 'transcripts']],
];

function scoreEntry(
  entry: DocsIndexEntry,
  query: NormalizedDocsSearchQuery,
): number {
  const fields = [
    { value: entry.title, weight: 8 },
    { value: entry.description ?? '', weight: 5 },
    { value: entry.headings.join(' '), weight: 4 },
    { value: entry.id, weight: 3 },
    { value: entry.content, weight: 1 },
  ].map((field) => ({
    value: normalizeSearchText(field.value),
    weight: field.weight,
  }));

  let score = 0;
  for (const term of query.terms) {
    for (const field of fields) {
      score += countTermOccurrences(field.value, term) * field.weight;
    }
  }

  for (const phrase of query.phrases) {
    for (const field of fields) {
      if (field.value.includes(phrase)) {
        score += field.weight * phrase.split(' ').length * 6;
      }
    }
  }

  return score;
}

function countTermOccurrences(value: string, term: string): number {
  if (!value) return 0;

  const escapedTerm = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return Array.from(
    value.matchAll(new RegExp(`(?:^|\\s)${escapedTerm}(?=\\s|$)`, 'g')),
  ).length;
}

function makeSnippet(
  entry: DocsIndexEntry,
  query: NormalizedDocsSearchQuery,
): string {
  const lines = entry.content
    .replace(/^---[\s\S]*?---\s*/, '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  const matchingLine = lines.find((line) => {
    const normalized = normalizeSearchText(line);
    return (
      query.phrases.some((phrase) => normalized.includes(phrase)) ||
      query.terms.some((term) => normalized.includes(term))
    );
  });

  return truncate(matchingLine ?? entry.description ?? entry.title, 220);
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 1)}…`;
}

function normalizeDocsSearchQuery(query: string): NormalizedDocsSearchQuery {
  const normalized = normalizeSearchText(query);
  const terms = new Set(tokenizeNormalizedText(normalized));
  const phrases = new Set<string>([normalized].filter(Boolean));

  for (const term of Array.from(terms)) {
    for (const synonym of TERM_SYNONYMS[term] ?? []) {
      for (const synonymTerm of tokenizeNormalizedText(
        normalizeSearchText(synonym),
      )) {
        terms.add(synonymTerm);
      }
    }
  }

  for (const [phrase, synonyms] of PHRASE_SYNONYMS) {
    const normalizedPhrase = normalizeSearchText(phrase);
    if (!normalized.includes(normalizedPhrase)) continue;

    addPhraseWithTerms(normalizedPhrase, phrases, terms);
    for (const synonym of synonyms) {
      addPhraseWithTerms(normalizeSearchText(synonym), phrases, terms);
    }
  }

  if (
    terms.has('upload') &&
    ['browser', 'web', 'client', 'user'].some((term) => terms.has(term))
  ) {
    addPhraseWithTerms('direct upload', phrases, terms);
    addPhraseWithTerms('upload files directly', phrases, terms);
  }

  return {
    terms: Array.from(terms),
    phrases: Array.from(phrases).filter(
      (phrase) => phrase.split(' ').length > 1,
    ),
  };
}

function addPhraseWithTerms(
  phrase: string,
  phrases: Set<string>,
  terms: Set<string>,
): void {
  if (!phrase) return;

  phrases.add(phrase);
  for (const phraseTerm of tokenizeNormalizedText(phrase)) {
    terms.add(phraseTerm);
  }
}

function normalizeSearchText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[_/-]+/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function tokenizeNormalizedText(value: string): string[] {
  const terms = new Set<string>();

  for (const term of value.split(' ')) {
    if (!isSearchableTerm(term)) continue;

    terms.add(term);
    const stemmed = stemSearchTerm(term);
    if (stemmed !== term && isSearchableTerm(stemmed)) {
      terms.add(stemmed);
    }
  }

  return Array.from(terms);
}

function isSearchableTerm(term: string): boolean {
  if (!term || STOP_WORDS.has(term)) return false;
  return term.length > 2 || SHORT_SEARCH_TERMS.has(term);
}

function stemSearchTerm(term: string): string {
  if (term.length <= 3) return term;
  if (term.endsWith('ies') && term.length > 4) return `${term.slice(0, -3)}y`;
  if (term.endsWith('sses')) return term.slice(0, -2);
  if (term.endsWith('s') && !term.endsWith('ss')) return term.slice(0, -1);
  return term;
}

export function findDocById(
  index: DocsIndex,
  idOrPath: string,
): DocsIndexEntry | undefined {
  const normalized = normalizeIdentifier(idOrPath);

  return index.entries.find((entry) => {
    const identifiers = [
      entry.id,
      entry.route,
      entry.route.replace(/^\//, ''),
      entry.relativePath,
      entry.url,
    ].map(normalizeIdentifier);

    return identifiers.includes(normalized);
  });
}

function normalizeIdentifier(value: string): string {
  return value
    .trim()
    .replace(/^https:\/\/docs\.mux\.com/, '')
    .replace(/^\/+/, '');
}

export async function readDocContent(entry: DocsIndexEntry): Promise<string> {
  if (entry.content) {
    return entry.content;
  }

  return readFile(entry.absolutePath, 'utf-8');
}

export function formatDocContent(
  content: string,
  format: DocsContentFormat = 'markdown',
): string {
  if (format === 'raw') {
    return content;
  }

  return stripFrontmatterBlock(content);
}

function stripFrontmatterBlock(content: string): string {
  const match = content.match(/^---\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/);

  if (!match) {
    return content;
  }

  return content.slice(match[0].length).replace(/^\s*\r?\n/, '');
}

export async function writeDocsIndexCache(index: DocsIndex): Promise<void> {
  const cachePath = getDocsIndexCachePath();
  await mkdir(dirname(cachePath), { recursive: true });
  await writeFile(cachePath, JSON.stringify(index, null, 2));
}
