import {
  afterEach,
  beforeEach,
  describe,
  expect,
  type Mock,
  spyOn,
  test,
} from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { askQuestionsCommand, parseQuestion } from './ask-questions.ts';

// Note: These tests focus on CLI flag parsing and command structure
// They do NOT test the actual Mux API integration (that's tested via E2E)

describe('mux robots ask-questions', () => {
  let tempDir: string;
  let exitSpy: Mock<typeof process.exit>;
  let consoleErrorSpy: Mock<typeof console.error>;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'mux-cli-robots-test-'));

    exitSpy = spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit called');
    }) as never);

    consoleErrorSpy = spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
    exitSpy?.mockRestore();
    consoleErrorSpy?.mockRestore();
  });

  describe('Command metadata', () => {
    test('has correct command description', () => {
      expect(askQuestionsCommand.getDescription()).toMatch(/ask.*questions/i);
    });

    test('requires asset-id argument', () => {
      const args = askQuestionsCommand.getArguments();
      expect(args.length).toBeGreaterThan(0);
      expect(args[0].name).toBe('asset-id');
    });
  });

  describe('Required flags', () => {
    test('has --question flag', () => {
      const opt = askQuestionsCommand
        .getOptions()
        .find((o) => o.name === 'question');
      expect(opt).toBeDefined();
    });
  });

  describe('Optional flags', () => {
    test('has --language-code flag', () => {
      const opt = askQuestionsCommand
        .getOptions()
        .find((o) => o.name === 'language-code');
      expect(opt).toBeDefined();
    });

    test('has --passthrough flag', () => {
      const opt = askQuestionsCommand
        .getOptions()
        .find((o) => o.name === 'passthrough');
      expect(opt).toBeDefined();
    });

    test('has --json flag for output formatting', () => {
      const opt = askQuestionsCommand
        .getOptions()
        .find((o) => o.name === 'json');
      expect(opt).toBeDefined();
    });

    test('has --wait flag', () => {
      const opt = askQuestionsCommand
        .getOptions()
        .find((o) => o.name === 'wait');
      expect(opt).toBeDefined();
    });

    test('has --file flag', () => {
      const opt = askQuestionsCommand
        .getOptions()
        .find((o) => o.name === 'file');
      expect(opt).toBeDefined();
    });
  });

  describe('Input validation', () => {
    test('throws error when asset-id is not provided', async () => {
      try {
        await askQuestionsCommand.parse([]);
      } catch (_error) {
        // Expected to throw
      }

      expect(exitSpy).toHaveBeenCalled();
    });
  });

  describe('parseQuestion helper', () => {
    test('plain question without pipe yields no answer_options', () => {
      expect(parseQuestion('What is this?')).toEqual({
        question: 'What is this?',
      });
    });

    test('question with pipe splits answer_options on commas', () => {
      expect(parseQuestion('How many speakers?|one,two,three or more')).toEqual(
        {
          question: 'How many speakers?',
          answer_options: ['one', 'two', 'three or more'],
        },
      );
    });

    test('trims whitespace around question and options', () => {
      expect(parseQuestion('  Q?  |  a , b , c  ')).toEqual({
        question: 'Q?',
        answer_options: ['a', 'b', 'c'],
      });
    });

    test('splits only on first pipe so options may contain pipes', () => {
      expect(parseQuestion('Choose?|a|b,c|d')).toEqual({
        question: 'Choose?',
        answer_options: ['a|b', 'c|d'],
      });
    });

    test('throws on empty question', () => {
      expect(() => parseQuestion('|a,b')).toThrow(/question/i);
    });

    test('throws when pipe is present but options list is empty', () => {
      expect(() => parseQuestion('Q?|')).toThrow(/answer_options/i);
    });
  });

  describe('--file mode', () => {
    test('errors when config file does not exist', async () => {
      const configPath = join(tempDir, 'nope.json');
      try {
        await askQuestionsCommand.parse(['asset_abc', '--file', configPath]);
      } catch (_error) {
        // Expected
      }
      expect(exitSpy).toHaveBeenCalledWith(1);
      const msg = consoleErrorSpy.mock.calls[0]?.[0] ?? '';
      expect(msg).toMatch(/file not found/i);
    });

    test('errors when config file is invalid JSON', async () => {
      const configPath = join(tempDir, 'bad.json');
      await writeFile(configPath, '{ bad');
      try {
        await askQuestionsCommand.parse(['asset_abc', '--file', configPath]);
      } catch (_error) {
        // Expected
      }
      expect(exitSpy).toHaveBeenCalledWith(1);
      const msg = consoleErrorSpy.mock.calls[0]?.[0] ?? '';
      expect(msg).toMatch(/invalid json/i);
    });

    test('errors when --file combined with --question', async () => {
      const configPath = join(tempDir, 'config.json');
      await writeFile(
        configPath,
        JSON.stringify({
          questions: [{ question: 'What is this?' }],
        }),
      );
      try {
        await askQuestionsCommand.parse([
          'asset_abc',
          '--file',
          configPath,
          '--question',
          'Other?',
        ]);
      } catch (_error) {
        // Expected
      }
      expect(exitSpy).toHaveBeenCalledWith(1);
      const msg = consoleErrorSpy.mock.calls[0]?.[0] ?? '';
      expect(msg).toMatch(/--file cannot be combined/i);
    });

    test('requires either --file or --question', async () => {
      try {
        await askQuestionsCommand.parse(['asset_abc']);
      } catch (_error) {
        // Expected
      }
      expect(exitSpy).toHaveBeenCalled();
    });
  });
});
