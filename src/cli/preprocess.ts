/**
 * Preprocesses CLI arguments before Commander parses them.
 *
 * 1. Default command: bare words without a command become `ask <prompt>`
 * 2. Command aliases: a→ask, r→run, p→providers, m→models, c→config, d→doctor, rt→routing
 * 3. Option abbreviations: --st→--stream, --ro→--route, etc. (prefix matching)
 */

const COMMAND_ALIASES: Record<string, string> = {
  a: 'ask',
  r: 'run',
  p: 'providers',
  m: 'models',
  c: 'config',
  d: 'doctor',
  rt: 'routing',
};

const KNOWN_COMMANDS = new Set([
  'ask', 'run', 'providers', 'models', 'config', 'doctor', 'routing',
]);

const PROMPT_COMMANDS = new Set(['ask', 'run']);

const PASS_THROUGH = new Set(['--help', '-h', '--version', '-V', 'help']);

// All long options across all commands (used for prefix matching)
const ALL_LONG_OPTIONS = [
  // Execution options
  '--provider', '--model', '--system', '--file', '--temperature',
  '--max-tokens', '--verbose', '--route', '--dry-run', '--policy',
  '--tier', '--stream', '--skip-think', '--no-think', '--retry',
  '--timeout', '--system-file', '--field', '--json', '--jsonl',
  '--schema', '--prompt', '--bool',
  // Provider options
  '--base-url', '--api-key', '--set-default', '--template',
  // Model options
  '--live', '--alias', '--tag', '--remove-tag', '--context',
  // General
  '--force', '--help', '--version',
];

function expandOption(arg: string): string {
  // Handle --opt=value format
  const eqIdx = arg.indexOf('=');
  if (eqIdx > 0) {
    return expandOptionName(arg.slice(0, eqIdx)) + arg.slice(eqIdx);
  }
  return expandOptionName(arg);
}

function expandOptionName(arg: string): string {
  if (!arg.startsWith('--') || arg.length <= 2) return arg;
  if (ALL_LONG_OPTIONS.includes(arg)) return arg;
  if (arg.startsWith('--no-')) return arg;

  const matches = ALL_LONG_OPTIONS.filter((opt) => opt.startsWith(arg));
  return matches.length === 1 ? matches[0] : arg;
}

function isOption(arg: string): boolean {
  return arg.startsWith('-');
}

/**
 * Collects leading bare words (non-option args) into a single joined prompt string.
 * Options and everything after the first option are preserved as-is.
 */
function collectPromptArgs(args: string[]): string[] {
  const promptWords: string[] = [];
  const rest: string[] = [];
  let pastPrompt = false;

  for (const arg of args) {
    if (!pastPrompt && !isOption(arg)) {
      promptWords.push(arg);
    } else {
      pastPrompt = true;
      rest.push(arg);
    }
  }

  const result: string[] = [];
  if (promptWords.length > 0) {
    result.push(promptWords.join(' '));
  }
  result.push(...rest);
  return result;
}

export function preprocessArgs(argv: string[]): string[] {
  // argv[0] = node/binary, argv[1] = script path, argv[2+] = user args
  const prefix = argv.slice(0, 2);
  const args = argv.slice(2);

  if (args.length === 0) return argv;

  const firstArg = args[0];

  // Flags that Commander handles at program level
  if (PASS_THROUGH.has(firstArg)) return argv;

  // Resolve command alias
  const resolved = COMMAND_ALIASES[firstArg] ?? (KNOWN_COMMANDS.has(firstArg) ? firstArg : null);

  if (resolved) {
    const rest = args.slice(1).map(expandOption);
    if (PROMPT_COMMANDS.has(resolved)) {
      return [...prefix, resolved, ...collectPromptArgs(rest)];
    }
    return [...prefix, resolved, ...rest];
  }

  // No recognized command — default to "ask", all bare words become the prompt
  const expanded = args.map(expandOption);
  return [...prefix, 'ask', ...collectPromptArgs(expanded)];
}
