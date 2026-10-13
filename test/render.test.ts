import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { renderGlbToSvg, type RenderOptions } from "../src/index.js";
import {
  createCustomKeyFixture,
  createGlb,
  createMaterialFixture,
  createMultiPrimitiveFixture,
  createStudioFixture,
} from "./glb-fixture.js";

const fixture = createStudioFixture();

function countPaths(svg: string): number {
  return (svg.match(/<path/g) ?? []).length;
}

function countOccurrences(svg: string, pattern: RegExp): number {
  return (svg.match(pattern) ?? []).length;
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

  it("keeps the single-view output byte-identical when views is unset", async () => {
    const defaultOutput = await renderGlbToSvg(fixture);
    const explicitSingle = await renderGlbToSvg(fixture, {
      views: ["iso"],
      layout: "single",
    });
    expect(explicitSingle).toBe(defaultOutput);
  });

  it("keeps the default role output byte-identical to the pre-fills renderer", async () => {
    const golden = readFileSync(
      new URL("./golden/material-role.svg", import.meta.url),
      "utf8",
    );
    expect(await renderGlbToSvg(createMaterialFixture())).toBe(golden);
    expect(
      await renderGlbToSvg(createMaterialFixture(), { fills: "role" }),
    ).toBe(golden);
  });

  it("fills primitives from their glTF materials in material mode", async () => {
    const svg = await renderGlbToSvg(createMaterialFixture(), {
      fills: "material",
    });
    expect(svg).toContain('fill="#bc0000"');
    expect(svg).toContain('fill="#00bcff"');
    expect(svg).toContain("glb2svg-lid");
    expect(svg).toContain("var(--glb2svg-body-0)");
  });

  it("keeps the semantic-role fallback for unusable materials", async () => {
    const svg = await renderGlbToSvg(createMaterialFixture(), {
      fills: "material",
    });
    const literals = [...new Set(svg.match(/fill="#[0-9a-f]{6}"/g) ?? [])];
    expect(literals.sort()).toEqual(['fill="#00bcff"', 'fill="#bc0000"']);
    const classed = (svg.match(/<path [^>]*class="/g) ?? []).length;
    const filled = (svg.match(/<path [^>]*fill="#/g) ?? []).length;
    expect(classed).toBeGreaterThan(0);
    expect(filled).toBeGreaterThan(0);
    expect(classed + filled).toBe(countPaths(svg));
    expect(svg).toMatch(/class="glb2svg-body glb2svg-band-\d"/);
    expect(svg).toMatch(/class="glb2svg-lid glb2svg-band-\d"/);
  });

  it("fills each primitive of one mesh individually", async () => {
    const svg = await renderGlbToSvg(createMultiPrimitiveFixture(), {
      fills: "material",
    });
    expect(svg).toContain('fill="#bc0000"');
    expect(svg).toContain('fill="#00bcff"');
    expect(svg).not.toMatch(/<path [^>]*class="/);
  });

  it("keeps material fills in every sheet panel", async () => {
    const svg = await renderGlbToSvg(createMultiPrimitiveFixture(), {
      fills: "material",
      views: ["front", "side"],
    });
    expect(countOccurrences(svg, /data-view="/g)).toBe(2);
    expect(countOccurrences(svg, /fill="#bc0000"/g)).toBeGreaterThanOrEqual(2);
    expect(countOccurrences(svg, /fill="#00bcff"/g)).toBeGreaterThanOrEqual(2);
  });

  it("produces byte-identical material output across two renders", async () => {
    const options: RenderOptions = { fills: "material" };
    const first = await renderGlbToSvg(createMultiPrimitiveFixture(), options);
    const second = await renderGlbToSvg(createMultiPrimitiveFixture(), options);
    expect(first).toBe(second);
  });

  it("composes a labelled sheet with four views in a grid", async () => {
    const svg = await renderGlbToSvg(fixture, {
      views: ["front", "top", "side", "iso"],
      layout: "sheet",
    });
    expect(countOccurrences(svg, /data-view="/g)).toBe(4);
    expect(svg).toContain('data-layout="sheet"');
    expect(svg).toContain('class="glb2svg-panel"');
    for (const view of ["front", "top", "side", "iso"] as const) {
      expect(svg).toContain(`data-view="${view}"`);
      expect(svg).toContain(`data-view-label="${view}"`);
      expect(svg).toContain(`>${view}</text>`);
    }
  });

  it("composes a sheet when several views are requested without a layout", async () => {
    const svg = await renderGlbToSvg(fixture, { views: ["front", "side"] });
    expect(countOccurrences(svg, /data-view="/g)).toBe(2);
    expect(svg).toContain('data-view="front"');
    expect(svg).toContain('data-view="side"');
  });

  it("renders one requested view without sheet markup", async () => {
    const svg = await renderGlbToSvg(fixture, { views: ["front"] });
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).not.toContain("data-view=");
    expect(svg).not.toContain("glb2svg-sheet");
    expect(countPaths(svg)).toBeGreaterThan(0);
  });

  it("adds dimension labels only when showDimensions is enabled", async () => {
    const plain = await renderGlbToSvg(fixture);
    const withDimensions = await renderGlbToSvg(fixture, {
      showDimensions: true,
    });
    expect(plain).not.toMatch(/\d+(?:\.\d+)? mm/);
    expect(withDimensions).toMatch(/\d+(?:\.\d+)? mm/);
    expect(withDimensions).toContain("1500 mm");
    expect(withDimensions).toContain('data-dimension="width"');
    expect(withDimensions).toContain('data-dimension="height"');
    expect(withDimensions).toContain('data-dimension="depth"');
  });

  it("draws the matching dimension pair in each sheet panel", async () => {
    const svg = await renderGlbToSvg(fixture, {
      views: ["front", "side"],
      layout: "sheet",
      showDimensions: true,
    });
    expect(countOccurrences(svg, /data-dimension="/g)).toBe(4);
    const sideStart = svg.indexOf('data-view="side"');
    const frontPanel = svg.slice(svg.indexOf('data-view="front"'), sideStart);
    const sidePanel = svg.slice(sideStart);
    expect(frontPanel).toContain('data-dimension="width"');
    expect(frontPanel).toContain('data-dimension="height"');
    expect(frontPanel).not.toContain('data-dimension="depth"');
    expect(sidePanel).toContain('data-dimension="depth"');
    expect(sidePanel).toContain('data-dimension="height"');
    expect(sidePanel).not.toContain('data-dimension="width"');
  });

  it("produces byte-identical spec sheets across two runs", async () => {
    const options: RenderOptions = {
      views: ["front", "top", "side", "iso"],
      layout: "sheet",
      showDimensions: true,
    };
    const first = await renderGlbToSvg(fixture, options);
    const second = await renderGlbToSvg(fixture, options);
    expect(first).toBe(second);
  });
});
