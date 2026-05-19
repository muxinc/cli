import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  buildDocsIndex,
  DOCS_GUIDES_MDX_SPARSE_PATTERN,
  DOCS_GUIDES_RELATIVE_ROOT,
  DOCS_RELATIVE_ROOT,
  findDocById,
  getDocsArtifactCachePaths,
  getDocsRepoCachePath,
  getDocsSparseCheckoutArgs,
  getDocsSparseCloneArgs,
  MUX_DOCS_INDEX_URL,
  MUX_DOCS_MANIFEST_URL,
  MUX_DOCS_REPO_URL,
  readCachedDocsIndex,
  readDocContent,
  resolveDocsSource,
  searchDocsIndex,
  updatePublishedDocsCache,
} from './docs.ts';

async function writeDoc(
  repoPath: string,
  relativePath: string,
  content: string,
) {
  const filePath = join(repoPath, DOCS_GUIDES_RELATIVE_ROOT, relativePath);
  await mkdir(join(filePath, '..'), { recursive: true });
  await writeFile(filePath, content);
}

describe('Mux docs source resolution', () => {
  let testDir: string;
  let originalMuxDocsPath: string | undefined;
  let originalXdgCacheHome: string | undefined;

  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), 'mux-docs-test-'));
    originalMuxDocsPath = process.env.MUX_DOCS_PATH;
    originalXdgCacheHome = process.env.XDG_CACHE_HOME;
    delete process.env.MUX_DOCS_PATH;
    process.env.XDG_CACHE_HOME = join(testDir, 'cache');
  });

  afterEach(async () => {
    if (originalMuxDocsPath === undefined) {
      delete process.env.MUX_DOCS_PATH;
    } else {
      process.env.MUX_DOCS_PATH = originalMuxDocsPath;
    }

    if (originalXdgCacheHome === undefined) {
      delete process.env.XDG_CACHE_HOME;
    } else {
      process.env.XDG_CACHE_HOME = originalXdgCacheHome;
    }

    await rm(testDir, { recursive: true, force: true });
  });

  it('uses an explicit path before all other sources', async () => {
    const explicitRepo = join(testDir, 'explicit-mux.com');
    const envRepo = join(testDir, 'env-mux.com');
    await mkdir(join(explicitRepo, DOCS_GUIDES_RELATIVE_ROOT), {
      recursive: true,
    });
    await mkdir(join(envRepo, DOCS_GUIDES_RELATIVE_ROOT), { recursive: true });
    process.env.MUX_DOCS_PATH = envRepo;

    const source = await resolveDocsSource({
      explicitPath: explicitRepo,
      cwd: join(testDir, 'cli'),
    });

    expect(source).toEqual({
      kind: 'local',
      source: 'explicit',
      repoPath: explicitRepo,
      docsRoot: join(explicitRepo, DOCS_RELATIVE_ROOT),
      repoUrl: MUX_DOCS_REPO_URL,
    });
  });

  it('uses MUX_DOCS_PATH when no explicit path is provided', async () => {
    const envRepo = join(testDir, 'env-mux.com');
    await mkdir(join(envRepo, DOCS_GUIDES_RELATIVE_ROOT), { recursive: true });
    process.env.MUX_DOCS_PATH = envRepo;

    const source = await resolveDocsSource({ cwd: join(testDir, 'cli') });

    expect(source.source).toBe('env');
    expect(source.repoPath).toBe(envRepo);
    expect(source.docsRoot).toBe(join(envRepo, DOCS_RELATIVE_ROOT));
  });

  it('auto-detects a sibling mux.com checkout for local development', async () => {
    const workspace = join(testDir, 'mux-projects');
    const cliRepo = join(workspace, 'cli');
    const docsRepo = join(workspace, 'mux.com');
    await mkdir(cliRepo, { recursive: true });
    await mkdir(join(docsRepo, DOCS_GUIDES_RELATIVE_ROOT), {
      recursive: true,
    });

    const source = await resolveDocsSource({ cwd: cliRepo });

    expect(source.source).toBe('sibling');
    expect(source.repoPath).toBe(docsRepo);
    expect(source.docsRoot).toBe(join(docsRepo, DOCS_RELATIVE_ROOT));
  });

  it('falls back to the XDG docs repo cache path', async () => {
    const source = await resolveDocsSource({ cwd: join(testDir, 'other') });

    expect(source.kind).toBe('cache');
    expect(source.source).toBe('cache');
    expect(source.repoPath).toBe(getDocsRepoCachePath());
    expect(source.docsRoot).toBe(
      join(getDocsRepoCachePath(), DOCS_RELATIVE_ROOT),
    );
    expect(source.repoUrl).toBe(MUX_DOCS_REPO_URL);
  });

  it('rejects configured paths that do not contain the docs root', async () => {
    const invalidRepo = join(testDir, 'not-docs');
    await mkdir(invalidRepo, { recursive: true });

    await expect(
      resolveDocsSource({ explicitPath: invalidRepo, cwd: testDir }),
    ).rejects.toThrow(/apps\/web\/app\/docs/);
  });
});

describe('Mux docs cache git arguments', () => {
  it('uses a shallow partial sparse clone for the mux.com docs repo', () => {
    const repoPath = '/tmp/mux-docs-cache';

    expect(getDocsSparseCloneArgs(MUX_DOCS_REPO_URL, repoPath)).toEqual([
      'clone',
      '--depth=1',
      '--filter=blob:none',
      '--sparse',
      MUX_DOCS_REPO_URL,
      repoPath,
    ]);
  });

  it('sets the sparse checkout to only the docs root', () => {
    const repoPath = '/tmp/mux-docs-cache';

    expect(getDocsSparseCheckoutArgs(repoPath)).toEqual([
      '-C',
      repoPath,
      'sparse-checkout',
      'set',
      '--no-cone',
      DOCS_GUIDES_MDX_SPARSE_PATTERN,
    ]);
  });
});

describe('Mux published docs artifacts', () => {
  let testDir: string;
  let originalXdgCacheHome: string | undefined;

  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), 'mux-docs-artifact-test-'));
    originalXdgCacheHome = process.env.XDG_CACHE_HOME;
    process.env.XDG_CACHE_HOME = join(testDir, 'cache');
  });

  afterEach(async () => {
    if (originalXdgCacheHome === undefined) {
      delete process.env.XDG_CACHE_HOME;
    } else {
      process.env.XDG_CACHE_HOME = originalXdgCacheHome;
    }

    await rm(testDir, { recursive: true, force: true });
  });

  it('copies published manifest and index artifacts into the CLI cache', async () => {
    const artifactPath = join(testDir, 'artifacts');
    await mkdir(artifactPath, { recursive: true });

    const manifest = {
      version: 'abc123',
      commit: 'commit123',
      generatedAt: '2026-05-18T00:00:00.000Z',
      docsRoot: 'app/docs/_guides',
      indexUrl: MUX_DOCS_INDEX_URL,
      fileCount: 1,
      files: [
        {
          id: 'verify-webhook-signatures',
          path: 'app/docs/_guides/core/verify-webhook-signatures.mdx',
          route: '/guides/core/verify-webhook-signatures',
          url: 'https://docs.mux.com/guides/core/verify-webhook-signatures',
          sha256: 'hash123',
        },
      ],
    };
    const publishedIndex = {
      version: 'abc123',
      commit: 'commit123',
      generatedAt: '2026-05-18T00:00:00.000Z',
      docsRoot: 'app/docs/_guides',
      entries: [
        {
          id: 'verify-webhook-signatures',
          title: 'Verify webhook signatures',
          description: 'Verify webhook requests from Mux.',
          product: 'system',
          path: 'app/docs/_guides/core/verify-webhook-signatures.mdx',
          route: '/guides/core/verify-webhook-signatures',
          url: 'https://docs.mux.com/guides/core/verify-webhook-signatures',
          headings: ['Obtain your signing secret'],
          sha256: 'hash123',
          content:
            '---\ntitle: Verify webhook signatures\n---\n\nMux signature docs.',
        },
      ],
    };

    await writeFile(
      join(artifactPath, 'manifest.json'),
      JSON.stringify(manifest, null, 2),
    );
    await writeFile(
      join(artifactPath, 'index.json'),
      JSON.stringify(publishedIndex, null, 2),
    );

    const result = await updatePublishedDocsCache({ artifactPath });
    const cachePaths = getDocsArtifactCachePaths();

    expect(result.manifest.version).toBe('abc123');
    expect(result.index.entries).toHaveLength(1);
    expect(
      JSON.parse(await readFile(cachePaths.manifestPath, 'utf-8')),
    ).toEqual(manifest);
    expect(JSON.parse(await readFile(cachePaths.indexPath, 'utf-8'))).toEqual(
      publishedIndex,
    );
  });

  it('normalizes cached published index entries for search and read', async () => {
    const cachePaths = getDocsArtifactCachePaths();
    await mkdir(join(cachePaths.indexPath, '..'), { recursive: true });
    await writeFile(
      cachePaths.indexPath,
      JSON.stringify({
        version: 'abc123',
        commit: 'commit123',
        generatedAt: '2026-05-18T00:00:00.000Z',
        docsRoot: 'app/docs/_guides',
        entries: [
          {
            id: 'create-assets',
            title: 'Create assets',
            description: 'Create Mux video assets.',
            product: 'video',
            path: 'app/docs/_guides/developer/create-assets.mdx',
            route: '/guides/developer/create-assets',
            url: 'https://docs.mux.com/guides/developer/create-assets',
            headings: ['Create assets'],
            sha256: 'hash123',
            content: '# Create assets\n\nUpload and encode video with Mux.',
          },
        ],
      }),
    );

    const index = await readCachedDocsIndex();
    const results = searchDocsIndex(index, 'upload encode video', { limit: 1 });
    const doc = findDocById(index, 'create-assets');

    expect(index.source).toBe('published');
    expect(results[0]?.entry.id).toBe('create-assets');
    expect(doc?.relativePath).toBe(
      'app/docs/_guides/developer/create-assets.mdx',
    );
    expect(doc ? await readDocContent(doc) : '').toContain('Upload and encode');
  });

  it('uses public docs artifact URLs by default', async () => {
    expect(MUX_DOCS_MANIFEST_URL).toBe(
      'https://docs.mux.com/.well-known/mux-docs/manifest.json',
    );
    expect(MUX_DOCS_INDEX_URL).toBe(
      'https://docs.mux.com/.well-known/mux-docs/index.json',
    );
  });
});

describe('Mux docs indexing and lookup', () => {
  let repoPath: string;

  beforeEach(async () => {
    repoPath = await mkdtemp(join(tmpdir(), 'mux-docs-index-test-'));

    await writeDoc(
      repoPath,
      'core/verify-webhook-signatures.mdx',
      `---
title: Verify webhook signatures
product: system
description: Verify webhook requests that Mux sends to your endpoints.
---

## Obtain your signing secret

Mux includes a \`mux-signature\` header with the timestamp and signature.

## How to verify webhook signatures

Compute an HMAC with SHA-256 and compare it to the request signature.
`,
    );

    await writeDoc(
      repoPath,
      'developer/create-assets.mdx',
      `---
title: Create assets
product: video
description: Create Mux video assets from remote URLs or direct uploads.
---

# Create assets

Use assets when you want to upload, ingest, encode, and play video with Mux.
`,
    );

    await writeDoc(
      repoPath,
      'developer/not-indexed.md',
      '# Markdown files are not indexed or checked out for end users',
    );
    await mkdir(join(repoPath, DOCS_RELATIVE_ROOT, 'other'), {
      recursive: true,
    });
    await writeFile(
      join(repoPath, DOCS_RELATIVE_ROOT, 'other', 'not-indexed.mdx'),
      '# MDX outside _guides should not be indexed',
    );
    await mkdir(join(repoPath, 'node_modules', 'ignored'), { recursive: true });
    await writeFile(
      join(repoPath, 'node_modules', 'ignored', 'README.md'),
      '# Should not be indexed',
    );
  });

  afterEach(async () => {
    await rm(repoPath, { recursive: true, force: true });
  });

  it('builds an index from MDX docs under apps/web/app/docs', async () => {
    const index = await buildDocsIndex({ repoPath });

    expect(index.entries).toHaveLength(2);
    expect(index.generatedAt).toBeDefined();
    expect(index.repoUrl).toBe(MUX_DOCS_REPO_URL);

    const webhookDoc = index.entries.find(
      (entry) => entry.id === 'verify-webhook-signatures',
    );
    expect(webhookDoc).toMatchObject({
      title: 'Verify webhook signatures',
      product: 'system',
      description: 'Verify webhook requests that Mux sends to your endpoints.',
      relativePath:
        'apps/web/app/docs/_guides/core/verify-webhook-signatures.mdx',
      route: '/guides/core/verify-webhook-signatures',
      url: 'https://docs.mux.com/guides/core/verify-webhook-signatures',
    });
    expect(webhookDoc?.headings).toContain('Obtain your signing secret');
  });

  it('searches docs by title, description, headings, and content', async () => {
    const index = await buildDocsIndex({ repoPath });
    const results = searchDocsIndex(index, 'webhook signature hmac', {
      limit: 5,
    });

    expect(results).toHaveLength(1);
    expect(results[0]?.entry.id).toBe('verify-webhook-signatures');
    expect(results[0]?.score).toBeGreaterThan(0);
    expect(results[0]?.snippet).toMatch(/HMAC|signature/i);
  });

  it('honors search result limits', async () => {
    const index = await buildDocsIndex({ repoPath });
    const results = searchDocsIndex(index, 'mux video', { limit: 1 });

    expect(results).toHaveLength(1);
  });

  it('finds docs by id, route, or relative path', async () => {
    const index = await buildDocsIndex({ repoPath });

    expect(findDocById(index, 'create-assets')?.title).toBe('Create assets');
    expect(findDocById(index, '/guides/developer/create-assets')?.title).toBe(
      'Create assets',
    );
    expect(
      findDocById(
        index,
        'apps/web/app/docs/_guides/developer/create-assets.mdx',
      )?.title,
    ).toBe('Create assets');
  });

  it('reads raw markdown content for a selected doc', async () => {
    const index = await buildDocsIndex({ repoPath });
    const doc = findDocById(index, 'verify-webhook-signatures');

    if (!doc) {
      throw new Error('Expected verify-webhook-signatures doc to exist');
    }
    const content = await readDocContent(doc);

    expect(content).toContain('title: Verify webhook signatures');
    expect(content).toContain('mux-signature');
  });
});
