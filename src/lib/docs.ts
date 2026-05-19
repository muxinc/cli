import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { getCacheDir } from './xdg.ts';

export const DOCS_RELATIVE_ROOT = 'apps/web/app/docs';
export const DOCS_GUIDES_RELATIVE_ROOT = `${DOCS_RELATIVE_ROOT}/_guides`;
export const DOCS_GUIDES_MDX_SPARSE_PATTERN = `/${DOCS_GUIDES_RELATIVE_ROOT}/**/*.mdx`;
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

/**
 * Get the cache checkout path for the mux.com docs repository.
 */
export function getDocsRepoCachePath(): string {
  return join(getCacheDir(), 'docs', 'mux.com');
}

/**
 * Get the path where the generated docs search index is cached.
 */
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
  const publishedIndex = await readJson<PublishedDocsIndex>(
    cachePaths.indexPath,
  );
  return normalizePublishedDocsIndex(publishedIndex, cachePaths.indexPath);
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

function normalizePublishedDocsIndex(
  index: PublishedDocsIndex,
  cachePath: string,
): DocsIndex {
  return {
    generatedAt: index.generatedAt,
    repoPath: dirname(cachePath),
    repoUrl: MUX_DOCS_INDEX_URL,
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
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }

  return (await response.json()) as T;
}

/**
 * Git arguments for a shallow, partial, sparse clone of the mux.com repository.
 *
 * This avoids checking out or downloading blobs for the rest of the application
 * repository. Git may still download commit and tree metadata, but file content
 * outside MDX files under DOCS_GUIDES_RELATIVE_ROOT is not fetched into the
 * local checkout.
 */
export function getDocsSparseCloneArgs(
  repoUrl: string,
  repoPath: string,
): string[] {
  return [
    'clone',
    '--depth=1',
    '--filter=blob:none',
    '--sparse',
    repoUrl,
    repoPath,
  ];
}

export function getDocsSparseCheckoutArgs(repoPath: string): string[] {
  return [
    '-C',
    repoPath,
    'sparse-checkout',
    'set',
    '--no-cone',
    DOCS_GUIDES_MDX_SPARSE_PATTERN,
  ];
}

/**
 * Resolve the docs source for the current command.
 *
 * Precedence:
 * 1. Explicit command option
 * 2. MUX_DOCS_PATH
 * 3. Sibling ../mux.com checkout for local Mux development
 * 4. XDG cache checkout used by `mux docs update`
 */
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

/**
 * Clone or refresh the cached mux.com checkout used as the default docs source.
 */
export async function updateCachedDocsRepo(
  options: { force?: boolean; repoUrl?: string } = {},
): Promise<DocsSource> {
  const repoUrl = options.repoUrl ?? MUX_DOCS_REPO_URL;
  const repoPath = getDocsRepoCachePath();

  if (options.force) {
    await rm(repoPath, { recursive: true, force: true });
  }

  if (existsSync(join(repoPath, '.git'))) {
    if (!(await isSparseDocsCheckout(repoPath))) {
      await rm(repoPath, { recursive: true, force: true });
      await cloneSparseDocsRepo(repoUrl, repoPath);
    } else {
      await runGit(getDocsSparseCheckoutArgs(repoPath));
      await runGit(['-C', repoPath, 'pull', '--ff-only']);
    }
  } else {
    await rm(repoPath, { recursive: true, force: true });
    await cloneSparseDocsRepo(repoUrl, repoPath);
  }

  if (!hasDocsRoot(repoPath)) {
    throw new Error(
      `The docs repository did not contain ${DOCS_GUIDES_RELATIVE_ROOT}: ${repoPath}`,
    );
  }

  return {
    kind: 'cache',
    source: 'cache',
    repoPath,
    docsRoot: join(repoPath, DOCS_RELATIVE_ROOT),
    repoUrl,
  };
}

async function cloneSparseDocsRepo(
  repoUrl: string,
  repoPath: string,
): Promise<void> {
  await mkdir(dirname(repoPath), { recursive: true });
  await runGit(getDocsSparseCloneArgs(repoUrl, repoPath));
  await runGit(getDocsSparseCheckoutArgs(repoPath));
}

async function isSparseDocsCheckout(repoPath: string): Promise<boolean> {
  const sparseCheckoutPath = join(repoPath, '.git', 'info', 'sparse-checkout');

  if (!existsSync(sparseCheckoutPath)) {
    return false;
  }

  const content = await readFile(sparseCheckoutPath, 'utf-8');
  return content.includes(DOCS_GUIDES_MDX_SPARSE_PATTERN);
}

async function runGit(args: string[]): Promise<void> {
  const proc = Bun.spawn(['git', ...args], {
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);

  if (exitCode !== 0) {
    const message = stderr.trim() || stdout.trim() || `git ${args.join(' ')}`;
    throw new Error(message);
  }
}

/**
 * Build a lightweight local search index from docs markdown and MDX files.
 */
export async function loadDocsIndex(
  options: { explicitPath?: string } = {},
): Promise<{ index: DocsIndex; source: DocsIndexSource }> {
  if (
    !options.explicitPath &&
    !process.env.MUX_DOCS_PATH &&
    hasCachedDocsIndex()
  ) {
    const index = await readCachedDocsIndex();
    return { index, source: getPublishedDocsSource(index) };
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

/**
 * Search a generated docs index using simple deterministic term scoring.
 */
export function searchDocsIndex(
  index: DocsIndex,
  query: string,
  options: SearchDocsIndexOptions = {},
): DocsSearchResult[] {
  const terms = tokenize(query);
  if (terms.length === 0) return [];

  const results: DocsSearchResult[] = [];

  for (const entry of index.entries) {
    const score = scoreEntry(entry, terms, query);
    if (score <= 0) continue;

    results.push({
      entry,
      score,
      snippet: makeSnippet(entry, terms),
    });
  }

  results.sort(
    (a, b) => b.score - a.score || a.entry.title.localeCompare(b.entry.title),
  );
  return results.slice(0, options.limit ?? 10);
}

function scoreEntry(
  entry: DocsIndexEntry,
  terms: string[],
  query: string,
): number {
  const fields = [
    { value: entry.title, weight: 8 },
    { value: entry.description ?? '', weight: 5 },
    { value: entry.headings.join(' '), weight: 4 },
    { value: entry.id, weight: 3 },
    { value: entry.content, weight: 1 },
  ];

  let score = 0;
  for (const term of terms) {
    for (const field of fields) {
      score += countOccurrences(field.value, term) * field.weight;
    }
  }

  const phrase = query.toLowerCase().trim();
  if (phrase) {
    if (entry.title.toLowerCase().includes(phrase)) score += 50;
    if ((entry.description ?? '').toLowerCase().includes(phrase)) score += 25;
    if (entry.headings.join(' ').toLowerCase().includes(phrase)) score += 20;
    if (entry.content.toLowerCase().includes(phrase)) score += 5;
  }

  return score;
}

function countOccurrences(value: string, term: string): number {
  if (!value) return 0;

  const normalized = value.toLowerCase();
  let count = 0;
  let index = normalized.indexOf(term);

  while (index !== -1) {
    count += 1;
    index = normalized.indexOf(term, index + term.length);
  }

  return count;
}

function makeSnippet(entry: DocsIndexEntry, terms: string[]): string {
  const lines = entry.content
    .replace(/^---[\s\S]*?---\s*/, '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  const matchingLine = lines.find((line) => {
    const normalized = line.toLowerCase();
    return terms.some((term) => normalized.includes(term));
  });

  return truncate(matchingLine ?? entry.description ?? entry.title, 220);
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 1)}…`;
}

function tokenize(query: string): string[] {
  return Array.from(
    new Set(
      query
        .toLowerCase()
        .split(/[^a-z0-9_/-]+/)
        .map((term) => term.trim())
        .filter(Boolean),
    ),
  );
}

/**
 * Find a docs entry by id, route, URL, or repository-relative path.
 */
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

/**
 * Read raw markdown/MDX content for an indexed docs entry.
 */
export async function readDocContent(entry: DocsIndexEntry): Promise<string> {
  if (entry.content) {
    return entry.content;
  }

  return readFile(entry.absolutePath, 'utf-8');
}

export async function writeDocsIndexCache(index: DocsIndex): Promise<void> {
  const cachePath = getDocsIndexCachePath();
  await mkdir(dirname(cachePath), { recursive: true });
  await writeFile(cachePath, JSON.stringify(index, null, 2));
}
