import * as fs from 'fs';
import * as path from 'path';

const SHELL_METACHARACTERS = /[;|&<>\n\r`$()\0]/;

const PATH_READ_COMMANDS = new Set(['ls', 'cat', 'head', 'tail']);

const READ_ONLY_COMMANDS = new Set([
  'echo',
  'pwd',
  'which',
  'whoami',
]);

const READ_ONLY_GIT_SUBCOMMANDS = new Set([
  'status',
  'log',
  'diff',
  'show',
  'ls-files',
]);

const UNSAFE_GIT_FLAGS = new Set([
  '--ext-diff',
  '--textconv',
  '--paginate',
  '--output',
  '--no-index',
  '--help',
]);

export function parseCommandArgv(input: string): string[] | null {
  const argv: string[] = [];
  let current = '';
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let tokenStarted = false;

  for (let index = 0; index < input.length; index++) {
    const character = input[index];

    if (character === '\'' && !inDoubleQuote) {
      inSingleQuote = !inSingleQuote;
      tokenStarted = true;
      continue;
    }
    if (character === '"' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote;
      tokenStarted = true;
      continue;
    }
    if (character === '\\' && !inSingleQuote) {
      if (index + 1 >= input.length) return null;
      current += input[index + 1];
      tokenStarted = true;
      index++;
      continue;
    }
    if (/\s/.test(character) && !inSingleQuote && !inDoubleQuote) {
      if (tokenStarted) {
        argv.push(current);
        current = '';
        tokenStarted = false;
      }
      continue;
    }

    current += character;
    tokenStarted = true;
  }

  if (inSingleQuote || inDoubleQuote) return null;
  if (tokenStarted) argv.push(current);
  return argv;
}

export function isReadOnlyCommand(command: string, cwd: string = process.cwd()): boolean {
  if (SHELL_METACHARACTERS.test(command)) return false;

  const argv = parseCommandArgv(command.trim());
  if (!argv || argv.length === 0) return false;

  const [executable, subcommand, ...args] = argv;
  if (PATH_READ_COMMANDS.has(executable)) {
    const commandArgs = argv.slice(1);
    if (commandArgs.includes('-')) return false;
    const pathArgs = commandArgs.filter(argument => !argument.startsWith('-'));
    if (executable !== 'ls' && pathArgs.length === 0) return false;
    return pathArgs.every(candidate => isPathWithinRoot(candidate, cwd));
  }
  if (executable === 'date') {
    return argv.length === 1 || (argv.length === 2 && argv[1].startsWith('+'));
  }
  if (READ_ONLY_COMMANDS.has(executable)) return true;
  if (executable !== 'git' || !subcommand) return false;

  if (subcommand === 'branch') {
    return args.length === 0 || (args.length === 1 && args[0] === '--show-current');
  }

  return READ_ONLY_GIT_SUBCOMMANDS.has(subcommand)
    && !args.some(argument =>
      UNSAFE_GIT_FLAGS.has(argument) || argument.startsWith('--output='));
}

function isPathWithinRoot(candidatePath: string, rootPath: string): boolean {
  const root = canonicalPath(rootPath);
  const candidate = canonicalPath(path.resolve(root, candidatePath));
  const relative = path.relative(root, candidate);
  return relative === ''
    || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

function canonicalPath(candidatePath: string): string {
  const resolved = path.resolve(candidatePath);
  try {
    return fs.realpathSync(resolved);
  } catch {
    return resolved;
  }
}
