import { randomUUID } from "node:crypto";
import {
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { renderGlbToSvg, type RenderOptions } from "./render.js";

/**
 * Sinks that the CLI writes to. Tests can supply collectors instead of the
 * process streams.
 */
export interface CliIo {
  stdout: (message: string) => void;
  stderr: (message: string) => void;
}

/**
 * Usage text that the CLI prints for `--help` and usage errors.
 */
export const CLI_USAGE = `Usage: glb2svg <input.glb> <output.svg> [options]

Options:
  --class-prefix <prefix>         CSS class prefix (default: glb2svg-)
  --css-variable-prefix <prefix>  CSS custom-property prefix (default: --glb2svg-)
  --width <pixels>                SVG viewBox width (default: 512)
  --height <pixels>               SVG viewBox height (default: 512)
  --help                          Show this message`;

const defaultIo: CliIo = {
  stdout: (message) => process.stdout.write(`${message}\n`),
  stderr: (message) => process.stderr.write(`${message}\n`),
};

interface ParsedArguments {
  input: string;
  output: string;
  options: RenderOptions;
}

class UsageError extends Error {}

function splitOption(argument: string): [string, string | undefined] {
  const separator = argument.indexOf("=");
  if (separator === -1) return [argument, undefined];
  return [argument.slice(0, separator), argument.slice(separator + 1)];
}

function optionValue(
  inlineValue: string | undefined,
  argv: string[],
  index: number,
  name: string,
): [string, number] {
  if (inlineValue !== undefined) return [inlineValue, index];
  const value = argv[index + 1];
  if (value === undefined) {
    throw new UsageError(`Missing value for ${name}.`);
  }
  return [value, index + 1];
}

function parseArguments(argv: string[]): ParsedArguments {
  const positionals: string[] = [];
  const options: RenderOptions = {};

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]!;
    if (!argument.startsWith("-")) {
      positionals.push(argument);
      continue;
    }
    const [name, inlineValue] = splitOption(argument);
    if (name === "--class-prefix") {
      const [value, next] = optionValue(inlineValue, argv, index, name);
      options.classPrefix = value;
      index = next;
    } else if (name === "--css-variable-prefix") {
      const [value, next] = optionValue(inlineValue, argv, index, name);
      options.cssVariablePrefix = value;
      index = next;
    } else if (name === "--width" || name === "--height") {
      const [value, next] = optionValue(inlineValue, argv, index, name);
      const pixels = Number(value);
      if (!Number.isFinite(pixels) || pixels <= 0) {
        throw new UsageError(`${name} expects a positive number.`);
      }
      if (name === "--width") options.width = pixels;
      else options.height = pixels;
      index = next;
    } else {
      throw new UsageError(`Unknown option: ${argument}`);
    }
  }

  if (positionals.length !== 2) {
    throw new UsageError("Expected an input GLB path and an output SVG path.");
  }
  return { input: positionals[0]!, output: positionals[1]!, options };
}

function writeFileAtomic(target: string, contents: string): void {
  const directory = dirname(target);
  mkdirSync(directory, { recursive: true });
  const temporary = join(
    directory,
    `.${basename(target)}.${randomUUID()}.tmp`,
  );
  try {
    writeFileSync(temporary, contents);
    renameSync(temporary, target);
  } catch (error) {
    rmSync(temporary, { force: true });
    throw error;
  }
}

/**
 * Runs the command-line interface and returns its exit code.
 *
 * `0` means success, `1` means the input could not be rendered and `2` means
 * the arguments are invalid. The SVG file is written through a temporary file
 * in the target directory and an atomic rename.
 *
 * @param argv Arguments without the `node` and script entries.
 * @param io Optional output sinks, used by tests.
 * @returns The process exit code.
 */
export async function runCli(
  argv: string[],
  io: CliIo = defaultIo,
): Promise<number> {
  if (argv.includes("--help") || argv.includes("-h")) {
    io.stdout(CLI_USAGE);
    return 0;
  }

  let parsed: ParsedArguments;
  try {
    parsed = parseArguments(argv);
  } catch (error) {
    if (error instanceof UsageError) {
      io.stderr(error.message);
      io.stderr(CLI_USAGE);
      return 2;
    }
    throw error;
  }

  try {
    const bytes = readFileSync(resolve(parsed.input));
    const svg = await renderGlbToSvg(bytes, parsed.options);
    writeFileAtomic(resolve(parsed.output), `${svg}\n`);
  } catch (error) {
    io.stderr(error instanceof Error ? error.message : String(error));
    return 1;
  }

  return 0;
}
