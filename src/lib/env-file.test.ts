import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  assertEnvFileWritable,
  isGitIgnored,
  upsertEnvContent,
  writeEnvVars,
} from './env-file.ts';

describe('upsertEnvContent', () => {
  test('appends variables to empty content', () => {
    const result = upsertEnvContent('', { MUX_SIGNING_KEY: 'key_1' });

    expect(result.content).toBe('MUX_SIGNING_KEY=key_1\n');
    expect(result.added).toEqual(['MUX_SIGNING_KEY']);
    expect(result.updated).toEqual([]);
  });

  test('appends after existing lines and keeps them unchanged', () => {
    const original = '# App config\nDATABASE_URL=postgres://localhost/db\n';
    const result = upsertEnvContent(original, {
      MUX_SIGNING_KEY: 'key_1',
      MUX_PRIVATE_KEY: 'cHJpdmF0ZQ==',
    });

    expect(result.content).toBe(
      '# App config\nDATABASE_URL=postgres://localhost/db\nMUX_SIGNING_KEY=key_1\nMUX_PRIVATE_KEY=cHJpdmF0ZQ==\n',
    );
    expect(result.added).toEqual(['MUX_SIGNING_KEY', 'MUX_PRIVATE_KEY']);
  });

  test('adds a newline before appending when the file does not end with one', () => {
    const result = upsertEnvContent('FOO=bar', { MUX_SIGNING_KEY: 'key_1' });

    expect(result.content).toBe('FOO=bar\nMUX_SIGNING_KEY=key_1\n');
  });

  test('updates an existing variable in place', () => {
    const original = 'FOO=bar\nMUX_SIGNING_KEY=old_key\nBAZ=qux\n';
    const result = upsertEnvContent(original, { MUX_SIGNING_KEY: 'new_key' });

    expect(result.content).toBe('FOO=bar\nMUX_SIGNING_KEY=new_key\nBAZ=qux\n');
    expect(result.updated).toEqual(['MUX_SIGNING_KEY']);
    expect(result.added).toEqual([]);
  });

  test('preserves an export prefix and surrounding whitespace style', () => {
    const original = 'export MUX_SIGNING_KEY="old_key"\n';
    const result = upsertEnvContent(original, { MUX_SIGNING_KEY: 'new_key' });

    expect(result.content).toBe('export MUX_SIGNING_KEY=new_key\n');
  });

  test('does not treat a commented-out assignment as the variable', () => {
    const original = '# MUX_SIGNING_KEY=old_key\n';
    const result = upsertEnvContent(original, { MUX_SIGNING_KEY: 'new_key' });

    expect(result.content).toBe(
      '# MUX_SIGNING_KEY=old_key\nMUX_SIGNING_KEY=new_key\n',
    );
    expect(result.added).toEqual(['MUX_SIGNING_KEY']);
  });

  test('does not match a variable that only shares a prefix', () => {
    const original = 'MUX_SIGNING_KEY_OLD=old_key\n';
    const result = upsertEnvContent(original, { MUX_SIGNING_KEY: 'new_key' });

    expect(result.content).toBe(
      'MUX_SIGNING_KEY_OLD=old_key\nMUX_SIGNING_KEY=new_key\n',
    );
  });

  test('replaces a multi-line quoted value entirely', () => {
    const original =
      'FOO=bar\nMUX_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\nabc\n-----END RSA PRIVATE KEY-----"\nBAZ=qux\n';
    const result = upsertEnvContent(original, {
      MUX_PRIVATE_KEY: 'bmV3LWtleQ==',
    });

    expect(result.content).toBe(
      'FOO=bar\nMUX_PRIVATE_KEY=bmV3LWtleQ==\nBAZ=qux\n',
    );
    expect(result.updated).toEqual(['MUX_PRIVATE_KEY']);
  });

  test('keeps the lines after a quoted value that never closes', () => {
    // A hand-pasted PEM often lacks its closing quote; treating the rest of
    // the file as part of the value would delete unrelated variables.
    const original =
      'MUX_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\nMUX_TOKEN_ID=abc\nDATABASE_URL=postgres://localhost/db\n';
    const result = upsertEnvContent(original, { MUX_PRIVATE_KEY: 'bmV3' });

    expect(result.content).toBe(
      'MUX_PRIVATE_KEY=bmV3\nMUX_TOKEN_ID=abc\nDATABASE_URL=postgres://localhost/db\n',
    );
  });

  test('updates every duplicate assignment so no stale value remains', () => {
    const original = 'MUX_SIGNING_KEY=one\nFOO=bar\nMUX_SIGNING_KEY=two\n';
    const result = upsertEnvContent(original, { MUX_SIGNING_KEY: 'new_key' });

    expect(result.content).toBe(
      'MUX_SIGNING_KEY=new_key\nFOO=bar\nMUX_SIGNING_KEY=new_key\n',
    );
  });

  test('preserves CRLF line endings', () => {
    const original = 'FOO=bar\r\nMUX_SIGNING_KEY=old\r\n';
    const result = upsertEnvContent(original, {
      MUX_SIGNING_KEY: 'new',
      MUX_PRIVATE_KEY: 'pk',
    });

    expect(result.content).toBe(
      'FOO=bar\r\nMUX_SIGNING_KEY=new\r\nMUX_PRIVATE_KEY=pk\r\n',
    );
  });
});

describe('env file I/O', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'mux-cli-env-file-test-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  test('writeEnvVars creates a missing file with owner-only permissions', async () => {
    const path = join(dir, '.env.local');

    const result = await writeEnvVars(path, { MUX_SIGNING_KEY: 'key_1' });

    expect(result.created).toBe(true);
    expect(await readFile(path, 'utf-8')).toBe('MUX_SIGNING_KEY=key_1\n');
    if (process.platform !== 'win32') {
      expect((await stat(path)).mode & 0o777).toBe(0o600);
    }
  });

  test('writeEnvVars updates an existing file and keeps other lines', async () => {
    const path = join(dir, '.env.local');
    await Bun.write(path, 'NEXT_PUBLIC_FOO=1\nMUX_SIGNING_KEY=old\n');

    const result = await writeEnvVars(path, {
      MUX_SIGNING_KEY: 'new',
      MUX_PRIVATE_KEY: 'pk',
    });

    expect(result.created).toBe(false);
    expect(result.updated).toEqual(['MUX_SIGNING_KEY']);
    expect(result.added).toEqual(['MUX_PRIVATE_KEY']);
    expect(await readFile(path, 'utf-8')).toBe(
      'NEXT_PUBLIC_FOO=1\nMUX_SIGNING_KEY=new\nMUX_PRIVATE_KEY=pk\n',
    );
  });

  test('assertEnvFileWritable accepts a missing file in an existing directory', async () => {
    await expect(
      assertEnvFileWritable(join(dir, '.env.local')),
    ).resolves.toBeUndefined();
  });

  test('assertEnvFileWritable rejects a missing parent directory', async () => {
    await expect(
      assertEnvFileWritable(join(dir, 'missing', '.env.local')),
    ).rejects.toThrow(/directory/i);
  });

  test('assertEnvFileWritable rejects a directory path', async () => {
    const sub = join(dir, 'sub');
    await mkdir(sub);
    await expect(assertEnvFileWritable(sub)).rejects.toThrow(/not a file/i);
  });

  test('isGitIgnored returns null outside a git repository', () => {
    expect(isGitIgnored(join(dir, '.env.local'))).toBeNull();
  });

  test('isGitIgnored reports whether a path is ignored inside a git repository', async () => {
    const init = Bun.spawnSync(['git', 'init', '-q', dir]);
    if (init.exitCode !== 0) return; // git unavailable on this machine
    await Bun.write(join(dir, '.gitignore'), '.env*.local\n');

    expect(isGitIgnored(join(dir, '.env.local'))).toBe(true);
    expect(isGitIgnored(join(dir, '.env'))).toBe(false);
  });
});
