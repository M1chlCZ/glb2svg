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
    const usage = io.stdoutText.join("\n");
    expect(usage).toContain("Usage: glb2svg");
    expect(usage).toContain("--views");
    expect(usage).toContain("--layout");
    expect(usage).toContain("--dimensions");
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

  it("renders exactly two panels for --views front,side", async () => {
    const directory = tempDirectory();
    const input = writeInput(directory, createStudioFixture());
    const output = join(directory, "views.svg");
    const io = createIo();
    expect(
      await runCli([input, output, "--views", "front,side"], io),
    ).toBe(0);
    const svg = readFileSync(output, "utf8");
    expect((svg.match(/data-view="/g) ?? []).length).toBe(2);
    expect(svg).toContain(">front</text>");
    expect(svg).toContain(">side</text>");
  });

  it("renders a four-view sheet with --layout sheet", async () => {
    const directory = tempDirectory();
    const input = writeInput(directory, createStudioFixture());
    const output = join(directory, "sheet.svg");
    const io = createIo();
    expect(
      await runCli(
        [input, output, "--layout", "sheet", "--views", "front,top,side,iso"],
        io,
      ),
    ).toBe(0);
    const svg = readFileSync(output, "utf8");
    expect((svg.match(/data-view="/g) ?? []).length).toBe(4);
    for (const view of ["front", "top", "side", "iso"]) {
      expect(svg).toContain(`>${view}</text>`);
    }
  });

  it("adds dimension labels only with --dimensions", async () => {
    const directory = tempDirectory();
    const input = writeInput(directory, createStudioFixture());
    const plainOutput = join(directory, "plain.svg");
    const dimensionOutput = join(directory, "dimensions.svg");
    const io = createIo();
    expect(await runCli([input, plainOutput], io)).toBe(0);
    expect(await runCli([input, dimensionOutput, "--dimensions"], io)).toBe(0);
    const plain = readFileSync(plainOutput, "utf8");
    const dimensions = readFileSync(dimensionOutput, "utf8");
    expect(plain).not.toMatch(/\d+(?:\.\d+)? mm/);
    expect(dimensions).toMatch(/\d+(?:\.\d+)? mm/);
    expect(dimensions).toContain("1500 mm");
  });

  it("rejects unknown views and layouts with exit code 2", async () => {
    const directory = tempDirectory();
    const input = writeInput(directory, createStudioFixture());
    const io = createIo();
    expect(
      await runCli([input, join(directory, "a.svg"), "--views", "banana"], io),
    ).toBe(2);
    expect(
      await runCli([input, join(directory, "b.svg"), "--views", "front,"], io),
    ).toBe(0);
    expect(
      await runCli([input, join(directory, "c.svg"), "--layout", "grid"], io),
    ).toBe(2);
    expect(
      await runCli([input, join(directory, "d.svg"), "--views", ","], io),
    ).toBe(2);
    expect(io.stderrText.length).toBeGreaterThan(0);
  });
});
