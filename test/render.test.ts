import { describe, expect, it } from "vitest";
import { renderGlbToSvg } from "../src/index.js";
import {
  createCustomKeyFixture,
  createGlb,
  createStudioFixture,
} from "./glb-fixture.js";

const fixture = createStudioFixture();

function countPaths(svg: string): number {
  return (svg.match(/<path/g) ?? []).length;
}

describe("renderGlbToSvg", () => {
  it("renders a deterministic SVG with the studio role classes", async () => {
    const svg = await renderGlbToSvg(fixture);
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg.endsWith("\n")).toBe(false);
    expect(svg).toContain('viewBox="-256 -256 512 512"');
    expect(svg).toContain('role="presentation"');
    expect(svg).toContain('aria-hidden="true"');
    expect(svg).toContain('data-source-up="Z"');
    expect(svg).toContain('data-presentation-up="Y"');
    expect(svg).toContain("glb2svg-body");
    expect(svg).toContain("glb2svg-lid");
    for (const band of [0, 1, 2]) {
      expect(svg).toContain(`glb2svg-band-${band}`);
    }
    expect(svg).toContain("var(--glb2svg-body-0)");
    expect(svg).toContain("var(--glb2svg-lid-2)");
  });

  it("produces byte-identical output across two renders", async () => {
    const first = await renderGlbToSvg(fixture);
    const second = await renderGlbToSvg(fixture);
    expect(first).toBe(second);
  });

  it("hides meshes whose semantic role is ignore", async () => {
    const visible = createGlb([
      {
        kind: "box",
        name: "body",
        role: "body",
        min: [0, 0, 0],
        max: [0.5, 0.5, 0.5],
      },
      {
        kind: "box",
        name: "ignored",
        role: "body",
        min: [0.6, 0, 0],
        max: [1.1, 0.5, 0.5],
      },
    ]);
    const hidden = createGlb([
      {
        kind: "box",
        name: "body",
        role: "body",
        min: [0, 0, 0],
        max: [0.5, 0.5, 0.5],
      },
      {
        kind: "box",
        name: "ignored",
        role: "ignore",
        min: [0.6, 0, 0],
        max: [1.1, 0.5, 0.5],
      },
    ]);
    const visibleSvg = await renderGlbToSvg(visible);
    const hiddenSvg = await renderGlbToSvg(hidden);
    expect(countPaths(visibleSvg)).toBeGreaterThan(countPaths(hiddenSvg));
  });

  it("rejects invalid GLB bytes", async () => {
    await expect(
      renderGlbToSvg(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])),
    ).rejects.toThrowError(Error);
  });

  it("honors custom prefixes, semantic keys and viewBox sizes", async () => {
    const custom = createCustomKeyFixture();
    const withOverride = await renderGlbToSvg(custom, {
      classPrefix: "part-",
      cssVariablePrefix: "part-",
      width: 256,
      height: 128,
      semanticKeys: { semanticRole: "custom_role" },
    });
    const withoutOverride = await renderGlbToSvg(custom);
    expect(withOverride.startsWith("<svg")).toBe(true);
    expect(withOverride).toContain('viewBox="-128 -64 256 128"');
    expect(withOverride).toContain("part-body");
    expect(withOverride).toContain("var(--part-body-0)");
    expect(withOverride).not.toContain("glb2svg-body");
    expect(countPaths(withOverride)).toBeLessThan(countPaths(withoutOverride));
  });
});
