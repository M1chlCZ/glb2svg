import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runCli, type CliIo } from "../src/index.js";
import { createStudioFixture } from "./glb-fixture.js";

function createIo(): CliIo & { stdoutText: string[]; stderrText: string[] } {
  const stdoutText: string[] = [];
  const stderrText: string[] = [];
  return {
    stdoutText,
    stderrText,
    stdout: (message: string) => stdoutText.push(message),
    stderr: (message: string) => stderrText.push(message),
  };
}

function tempDirectory(): string {
  return mkdtempSync(join(tmpdir(), "glb2svg-"));
}

function writeInput(directory: string, bytes: Uint8Array): string {
  const input = join(directory, "input.glb");
  writeFileSync(input, bytes);
  return input;
}

describe("runCli", () => {
  it("writes the SVG file and returns 0", async () => {
    const directory = tempDirectory();
    const input = writeInput(directory, createStudioFixture());
    const output = join(directory, "output.svg");
    const io = createIo();
    expect(await runCli([input, output], io)).toBe(0);
    const svg = readFileSync(output, "utf8");
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg.endsWith("\n")).toBe(true);
    expect(io.stderrText).toEqual([]);
  });

  it("writes byte-identical files on repeated runs", async () => {
    const directory = tempDirectory();
    const input = writeInput(directory, createStudioFixture());
    const first = join(directory, "first.svg");
    const second = join(directory, "second.svg");
    const io = createIo();
    expect(await runCli([input, first], io)).toBe(0);
    expect(await runCli([input, second], io)).toBe(0);
    expect(readFileSync(first, "utf8")).toBe(readFileSync(second, "utf8"));
  });

  it("returns 2 on usage errors", async () => {
    const directory = tempDirectory();
    const input = writeInput(directory, createStudioFixture());
    const io = createIo();
    expect(await runCli([], io)).toBe(2);
    expect(await runCli([input], io)).toBe(2);
    expect(await runCli([input, join(directory, "a.svg"), "--nope"], io)).toBe(2);
    expect(
      await runCli([input, join(directory, "b.svg"), "--width", "zero"], io),
    ).toBe(2);
    expect(io.stderrText.length).toBeGreaterThan(0);
  });

  it("returns 1 when the input cannot be rendered", async () => {
    const directory = tempDirectory();
    const input = join(directory, "broken.glb");
    writeFileSync(input, "not a glb");
    const output = join(directory, "broken.svg");
    const io = createIo();
    expect(await runCli([input, output], io)).toBe(1);
    expect(io.stderrText.length).toBeGreaterThan(0);
  });

  it("returns 0 for --help and prints the usage text", async () => {
    const io = createIo();
    expect(await runCli(["--help"], io)).toBe(0);
    expect(io.stdoutText.join("\n")).toContain("Usage: glb2svg");
  });

  it("honors prefix and viewBox options", async () => {
    const directory = tempDirectory();
    const input = writeInput(directory, createStudioFixture());
    const output = join(directory, "custom.svg");
    const io = createIo();
    expect(
      await runCli(
        [
          input,
          output,
          "--class-prefix",
          "custom-",
          "--css-variable-prefix",
          "custom-",
          "--width",
          "300",
          "--height",
          "150",
        ],
        io,
      ),
    ).toBe(0);
    const svg = readFileSync(output, "utf8");
    expect(svg).toContain('viewBox="-150 -75 300 150"');
    expect(svg).toContain("custom-body");
    expect(svg).toContain("var(--custom-body-0)");
  });

  it("creates missing output directories", async () => {
    const directory = tempDirectory();
    const input = writeInput(directory, createStudioFixture());
    const output = join(directory, "nested", "deep", "output.svg");
    const io = createIo();
    expect(await runCli([input, output], io)).toBe(0);
    expect(readFileSync(output, "utf8").startsWith("<svg")).toBe(true);
  });
});
