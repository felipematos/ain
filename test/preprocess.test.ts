import { describe, it, expect } from 'vitest';
import { preprocessArgs } from '../src/cli/preprocess.js';

const N = 'node';
const S = 'ain';

describe('preprocessArgs', () => {
  describe('default command (no command = ask)', () => {
    it('treats bare words as ask prompt', () => {
      const result = preprocessArgs([N, S, 'What', 'is', 'the', 'capital', 'of', 'Brazil?']);
      expect(result).toEqual([N, S, 'ask', 'What is the capital of Brazil?']);
    });

    it('separates trailing options from prompt', () => {
      const result = preprocessArgs([N, S, 'Explain', 'quantum', 'entanglement', '--stream']);
      expect(result).toEqual([N, S, 'ask', 'Explain quantum entanglement', '--stream']);
    });

    it('handles multiple trailing options', () => {
      const result = preprocessArgs([N, S, 'Hello', 'world', '--stream', '--verbose']);
      expect(result).toEqual([N, S, 'ask', 'Hello world', '--stream', '--verbose']);
    });

    it('handles options with values', () => {
      const result = preprocessArgs([N, S, 'Translate', 'this', '--model', 'gpt-4o', '--stream']);
      expect(result).toEqual([N, S, 'ask', 'Translate this', '--model', 'gpt-4o', '--stream']);
    });

    it('handles single word prompt', () => {
      const result = preprocessArgs([N, S, 'Hello']);
      expect(result).toEqual([N, S, 'ask', 'Hello']);
    });

    it('passes through when no args', () => {
      const result = preprocessArgs([N, S]);
      expect(result).toEqual([N, S]);
    });
  });

  describe('command aliases', () => {
    it('expands a → ask', () => {
      const result = preprocessArgs([N, S, 'a', 'Hello', 'world']);
      expect(result).toEqual([N, S, 'ask', 'Hello world']);
    });

    it('expands r → run', () => {
      const result = preprocessArgs([N, S, 'r', 'Get', 'info', '--json']);
      expect(result).toEqual([N, S, 'run', 'Get info', '--json']);
    });

    it('expands p → providers', () => {
      const result = preprocessArgs([N, S, 'p', 'list']);
      expect(result).toEqual([N, S, 'providers', 'list']);
    });

    it('expands m → models', () => {
      const result = preprocessArgs([N, S, 'm', 'list', '--live']);
      expect(result).toEqual([N, S, 'models', 'list', '--live']);
    });

    it('expands c → config', () => {
      const result = preprocessArgs([N, S, 'c', 'show']);
      expect(result).toEqual([N, S, 'config', 'show']);
    });

    it('expands d → doctor', () => {
      const result = preprocessArgs([N, S, 'd']);
      expect(result).toEqual([N, S, 'doctor']);
    });

    it('expands rt → routing', () => {
      const result = preprocessArgs([N, S, 'rt', 'policies']);
      expect(result).toEqual([N, S, 'routing', 'policies']);
    });
  });

  describe('option abbreviation expansion', () => {
    it('expands --st to --stream', () => {
      const result = preprocessArgs([N, S, 'Hello', '--st']);
      expect(result).toEqual([N, S, 'ask', 'Hello', '--stream']);
    });

    it('expands --ro to --route', () => {
      const result = preprocessArgs([N, S, 'Classify', 'this', '--ro']);
      expect(result).toEqual([N, S, 'ask', 'Classify this', '--route']);
    });

    it('expands --ret to --retry (--re is ambiguous with --remove-tag)', () => {
      const result = preprocessArgs([N, S, 'ask', 'Hello', '--ret', '5']);
      expect(result).toEqual([N, S, 'ask', 'Hello', '--retry', '5']);
    });

    it('expands --dr to --dry-run', () => {
      const result = preprocessArgs([N, S, 'ask', 'Test', '--dr']);
      expect(result).toEqual([N, S, 'ask', 'Test', '--dry-run']);
    });

    it('expands --sk to --skip-think', () => {
      const result = preprocessArgs([N, S, 'ask', 'Hello', '--sk']);
      expect(result).toEqual([N, S, 'ask', 'Hello', '--skip-think']);
    });

    it('expands --te to --temperature', () => {
      const result = preprocessArgs([N, S, 'ask', 'Hello', '--te', '0.5']);
      expect(result).toEqual([N, S, 'ask', 'Hello', '--temperature', '0.5']);
    });

    it('expands --sc to --schema', () => {
      const result = preprocessArgs([N, S, 'run', 'Extract', 'data', '--sc', 'schema.json']);
      expect(result).toEqual([N, S, 'run', 'Extract data', '--schema', 'schema.json']);
    });

    it('does not expand ambiguous abbreviations', () => {
      // --s matches --system, --stream, --skip-think, --schema, --system-file, --set-default
      const result = preprocessArgs([N, S, 'Hello', '--s']);
      expect(result).toEqual([N, S, 'ask', 'Hello', '--s']);
    });

    it('does not expand --ti (ambiguous: --tier, --timeout)', () => {
      const result = preprocessArgs([N, S, 'Hello', '--ti']);
      expect(result).toEqual([N, S, 'ask', 'Hello', '--ti']);
    });

    it('expands --tie to --tier', () => {
      const result = preprocessArgs([N, S, 'Hello', '--tie', 'fast']);
      expect(result).toEqual([N, S, 'ask', 'Hello', '--tier', 'fast']);
    });

    it('expands --tim to --timeout', () => {
      const result = preprocessArgs([N, S, 'Hello', '--tim', '5000']);
      expect(result).toEqual([N, S, 'ask', 'Hello', '--timeout', '5000']);
    });

    it('preserves exact long options', () => {
      const result = preprocessArgs([N, S, 'Hello', '--stream', '--json']);
      expect(result).toEqual([N, S, 'ask', 'Hello', '--stream', '--json']);
    });

    it('handles --opt=value format', () => {
      const result = preprocessArgs([N, S, 'Hello', '--te=0.5']);
      expect(result).toEqual([N, S, 'ask', 'Hello', '--temperature=0.5']);
    });
  });

  describe('pass-through cases', () => {
    it('passes --help through', () => {
      const result = preprocessArgs([N, S, '--help']);
      expect(result).toEqual([N, S, '--help']);
    });

    it('passes --version through', () => {
      const result = preprocessArgs([N, S, '--version']);
      expect(result).toEqual([N, S, '--version']);
    });

    it('passes -h through', () => {
      const result = preprocessArgs([N, S, '-h']);
      expect(result).toEqual([N, S, '-h']);
    });

    it('passes known commands through', () => {
      const result = preprocessArgs([N, S, 'doctor', '--json']);
      expect(result).toEqual([N, S, 'doctor', '--json']);
    });
  });

  describe('prompt collection for ask and run', () => {
    it('collects bare words for explicit ask command', () => {
      const result = preprocessArgs([N, S, 'ask', 'Tell', 'me', 'a', 'joke']);
      expect(result).toEqual([N, S, 'ask', 'Tell me a joke']);
    });

    it('collects bare words for run command', () => {
      const result = preprocessArgs([N, S, 'run', 'Get', 'info', 'about', 'France', '--json']);
      expect(result).toEqual([N, S, 'run', 'Get info about France', '--json']);
    });

    it('preserves already-quoted prompt', () => {
      const result = preprocessArgs([N, S, 'ask', 'Tell me a joke', '--stream']);
      expect(result).toEqual([N, S, 'ask', 'Tell me a joke', '--stream']);
    });

    it('does not collect bare words for non-prompt commands', () => {
      const result = preprocessArgs([N, S, 'providers', 'add', 'local', '--base-url', 'http://x']);
      expect(result).toEqual([N, S, 'providers', 'add', 'local', '--base-url', 'http://x']);
    });

    it('handles run with --prompt flag (no bare words)', () => {
      const result = preprocessArgs([N, S, 'run', '--prompt', 'Hello', '--json']);
      expect(result).toEqual([N, S, 'run', '--prompt', 'Hello', '--json']);
    });
  });

  describe('combined scenarios', () => {
    it('alias + bare words + abbreviated option', () => {
      const result = preprocessArgs([N, S, 'r', 'Get', 'info', 'about', 'France', '--json']);
      expect(result).toEqual([N, S, 'run', 'Get info about France', '--json']);
    });

    it('default command + multiple abbreviated options', () => {
      const result = preprocessArgs([N, S, 'Summarize', 'this', '--st', '--verb']);
      expect(result).toEqual([N, S, 'ask', 'Summarize this', '--stream', '--verbose']);
    });

    it('short flags are preserved', () => {
      const result = preprocessArgs([N, S, 'Hello', 'world', '-v', '-j']);
      expect(result).toEqual([N, S, 'ask', 'Hello world', '-v', '-j']);
    });
  });
});
