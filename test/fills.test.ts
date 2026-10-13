import { describe, expect, it } from "vitest";
import { linearRgbaToHex, linearToSrgb, readGlbPrimitiveFills } from "../src/fills.js";
import {
  createMaterialFixture,
  createMultiPrimitiveFixture,
} from "./glb-fixture.js";

describe("linearToSrgb", () => {
  it("converts known linear components", () => {
    expect(linearToSrgb(0)).toBe(0);
    expect(linearToSrgb(1)).toBeCloseTo(1, 12);
    expect(linearToSrgb(0.5)).toBeCloseTo(0.7353569830524495, 12);
    expect(linearToSrgb(0.0031308)).toBeCloseTo(0.040449936, 9);
  });

  it("clamps out-of-range and guards non-finite components", () => {
    expect(linearToSrgb(-1)).toBe(0);
    expect(linearToSrgb(2)).toBeCloseTo(1, 12);
    expect(linearToSrgb(Number.NaN)).toBe(0);
    expect(linearToSrgb(Number.POSITIVE_INFINITY)).toBeCloseTo(1, 12);
    expect(linearToSrgb(Number.NEGATIVE_INFINITY)).toBe(0);
  });
});

describe("linearRgbaToHex", () => {
  it("converts known colors to lowercase hex", () => {
    expect(linearRgbaToHex([0, 0, 0, 1])).toBe("#000000");
    expect(linearRgbaToHex([1, 1, 1, 1])).toBe("#ffffff");
    expect(linearRgbaToHex([0.5, 0.5, 0.5, 1])).toBe("#bcbcbc");
    expect(linearRgbaToHex([0.5, 0, 0, 1])).toBe("#bc0000");
    expect(linearRgbaToHex([0, 0.5, 1, 1])).toBe("#00bcff");
    expect(linearRgbaToHex([0.21404114048223255, 0.21404114048223255, 0.21404114048223255, 1])).toBe(
      "#808080",
    );
  });

  it("ignores alpha", () => {
    expect(linearRgbaToHex([0.5, 0.5, 0.5, 0.25])).toBe("#bcbcbc");
    expect(linearRgbaToHex([0.5, 0.5, 0.5, 0])).toBe("#bcbcbc");
  });

  it("clamps and guards out-of-range components", () => {
    expect(linearRgbaToHex([-1, 2, 0.5, 1])).toBe("#00ffbc");
    expect(
      linearRgbaToHex([Number.NaN, 0.5, Number.POSITIVE_INFINITY, 1]),
    ).toBe("#00bcff");
  });
});

describe("readGlbPrimitiveFills", () => {
  it("resolves the declared base color factor per primitive", () => {
    expect(readGlbPrimitiveFills(createMaterialFixture())).toEqual([
      ["#bc0000"],
      ["#00bcff"],
      [null],
      [null],
    ]);
  });

  it("resolves primitives grouped in one mesh in order", () => {
    expect(readGlbPrimitiveFills(createMultiPrimitiveFixture())).toEqual([
      ["#bc0000", "#00bcff"],
    ]);
  });
});
