/**
 * Fill source for the rendered paths.
 *
 * - `role` uses the semantic-role colors and the generated CSS custom
 *   properties. It is the default and keeps the original output.
 * - `material` fills each mesh primitive from its glTF
 *   `pbrMetallicRoughness.baseColorFactor` and falls back to the
 *   semantic-role color when a primitive has no usable material.
 */
export type FillMode = "role" | "material";

/**
 * The fill source that the renderer uses when the caller omits
 * {@link FillMode}.
 */
export const DEFAULT_FILL_MODE: FillMode = "role";

/**
 * Returns `true` when the value is one of the supported fill modes.
 */
export function isFillMode(value: string): value is FillMode {
  return value === "role" || value === "material";
}

function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0;
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

/**
 * Converts one linear-sRGB component to the sRGB transfer curve.
 *
 * Values are clamped to `[0, 1]` and `NaN` becomes zero.
 *
 * @param linear A linear-sRGB component.
 * @returns The matching sRGB component in `[0, 1]`.
 */
export function linearToSrgb(linear: number): number {
  const value = clamp01(linear);
  return value <= 0.0031308 ? 12.92 * value : 1.055 * value ** (1 / 2.4) - 0.055;
}

/**
 * Converts a linear-sRGB RGB(A) color to a lowercase `#rrggbb` string.
 *
 * The first three components are clamped to `[0, 1]` and converted with the
 * sRGB transfer curve, then rounded to the nearest 8-bit value. The alpha
 * component, when present, is ignored.
 *
 * @param linearRgba Linear-sRGB components, at least three entries.
 * @returns The sRGB hex color.
 */
export function linearRgbaToHex(linearRgba: readonly number[]): string {
  const components = [0, 1, 2].map((index) =>
    Math.round(linearToSrgb(linearRgba[index] ?? 0) * 255),
  );
  return `#${components
    .map((component) => component.toString(16).padStart(2, "0"))
    .join("")}`;
}

/**
 * Per-primitive fill colors read from a GLB container.
 *
 * The outer index addresses a mesh, the inner index addresses a primitive of
 * that mesh. A `null` entry means that the primitive has no material or that
 * its material does not declare `pbrMetallicRoughness.baseColorFactor`.
 */
export type PrimitiveFills = ReadonlyArray<ReadonlyArray<string | null>>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readArray(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : [];
}

function readBaseColorFactorHex(material: unknown): string | null {
  if (!isRecord(material)) return null;
  const pbr = material.pbrMetallicRoughness;
  if (!isRecord(pbr)) return null;
  const factor = pbr.baseColorFactor;
  if (!Array.isArray(factor) || factor.length < 3) return null;
  const red = factor[0];
  const green = factor[1];
  const blue = factor[2];
  if (
    typeof red !== "number" ||
    typeof green !== "number" ||
    typeof blue !== "number" ||
    !Number.isFinite(red) ||
    !Number.isFinite(green) ||
    !Number.isFinite(blue)
  ) {
    return null;
  }
  return linearRgbaToHex([red, green, blue]);
}

function readGlbJson(glb: Uint8Array): unknown {
  const view = new DataView(glb.buffer, glb.byteOffset, glb.byteLength);
  if (glb.byteLength < 20 || view.getUint32(0, true) !== 0x46546c67) {
    throw new Error("Expected a binary glTF (GLB) container.");
  }
  if (view.getUint32(16, true) !== 0x4e4f534a) {
    throw new Error("Expected a JSON chunk in the GLB container.");
  }
  const jsonLength = view.getUint32(12, true);
  if (20 + jsonLength > glb.byteLength) {
    throw new Error("The GLB JSON chunk exceeds the container length.");
  }
  const text = new TextDecoder().decode(glb.subarray(20, 20 + jsonLength));
  return JSON.parse(text) as unknown;
}

/**
 * Reads the fill color of every mesh primitive from a GLB container.
 *
 * Only an explicitly declared `pbrMetallicRoughness.baseColorFactor` is
 * resolved. The value is converted from linear sRGB to a lowercase `#rrggbb`
 * string, ignoring alpha. Meshes and primitives keep their source order.
 *
 * @param glb Binary GLB bytes.
 * @returns One hex color or `null` per primitive.
 */
export function readGlbPrimitiveFills(glb: Uint8Array): PrimitiveFills {
  const json = readGlbJson(glb);
  const root = isRecord(json) ? json : {};
  const materials = readArray(root.materials);
  return readArray(root.meshes).map((mesh) => {
    const primitives = isRecord(mesh) ? readArray(mesh.primitives) : [];
    return primitives.map((primitive) => {
      if (!isRecord(primitive) || typeof primitive.material !== "number") {
        return null;
      }
      return readBaseColorFactorHex(materials[primitive.material]);
    });
  });
}
