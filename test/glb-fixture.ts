const GLB_MAGIC = 0x46546c67;
const GLB_VERSION = 2;
const JSON_CHUNK_TYPE = 0x4e4f534a;
const BIN_CHUNK_TYPE = 0x004e4942;

type Vec3 = [number, number, number];

/**
 * One mesh that the fixture builder writes into the generated GLB.
 */
export type GlbPart =
  | {
      kind: "box";
      name: string;
      role: string;
      min: Vec3;
      max: Vec3;
    }
  | {
      kind: "quad";
      name: string;
      role: string;
      center: Vec3;
      normal: Vec3;
      size: number;
    };

function normalize(vector: Vec3): Vec3 {
  const length = Math.hypot(vector[0], vector[1], vector[2]) || 1;
  return [vector[0] / length, vector[1] / length, vector[2] / length];
}

function cross(left: Vec3, right: Vec3): Vec3 {
  return [
    left[1] * right[2] - left[2] * right[1],
    left[2] * right[0] - left[0] * right[2],
    left[0] * right[1] - left[1] * right[0],
  ];
}

function dot(left: Vec3, right: Vec3): number {
  return left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
}

function boxPositions(min: Vec3, max: Vec3): number[] {
  const [x0, y0, z0] = min;
  const [x1, y1, z1] = max;
  const a: Vec3 = [x0, y0, z0];
  const b: Vec3 = [x1, y0, z0];
  const c: Vec3 = [x1, y1, z0];
  const d: Vec3 = [x0, y1, z0];
  const e: Vec3 = [x0, y0, z1];
  const f: Vec3 = [x1, y0, z1];
  const g: Vec3 = [x1, y1, z1];
  const h: Vec3 = [x0, y1, z1];
  const triangles: Array<[Vec3, Vec3, Vec3]> = [
    [b, g, f],
    [b, c, g],
    [a, e, d],
    [a, e, h],
    [c, d, g],
    [d, h, g],
    [a, b, e],
    [b, f, e],
    [e, f, g],
    [e, g, h],
    [a, c, b],
    [a, d, c],
  ];
  return triangles.flatMap((triangle) => triangle.flat());
}

function quadPositions(center: Vec3, normal: Vec3, size: number): number[] {
  const unit = normalize(normal);
  const helper: Vec3 = Math.abs(unit[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const u = normalize(cross(unit, helper));
  const v = cross(unit, u);
  const half = size / 2;
  const corner = (su: number, sv: number): Vec3 => [
    center[0] + half * (su * u[0] + sv * v[0]),
    center[1] + half * (su * u[1] + sv * v[1]),
    center[2] + half * (su * u[2] + sv * v[2]),
  ];
  const p0 = corner(-1, -1);
  const p1 = corner(1, -1);
  const p2 = corner(1, 1);
  const p3 = corner(-1, 1);
  return [...p0, ...p1, ...p2, ...p0, ...p2, ...p3];
}

function positionsFor(part: GlbPart): number[] {
  if (part.kind === "box") return boxPositions(part.min, part.max);
  return quadPositions(part.center, part.normal, part.size);
}

/**
 * Builds a minimal, valid GLB from the given parts. Each part becomes one
 * mesh node whose `extras` carry the semantic role under the requested key.
 */
export function createGlb(
  parts: GlbPart[],
  roleKey = "studio_semantic_role",
): Uint8Array {
  const chunks: Uint8Array[] = [];
  const accessors: Array<Record<string, unknown>> = [];
  const bufferViews: Array<Record<string, unknown>> = [];
  let byteLength = 0;

  for (const part of parts) {
    const positions = positionsFor(part);
    const floats = new Float32Array(positions);
    const bytes = new Uint8Array(floats.buffer);
    bufferViews.push({
      buffer: 0,
      byteOffset: byteLength,
      byteLength: bytes.byteLength,
    });
    const partMin: Vec3 = [Infinity, Infinity, Infinity];
    const partMax: Vec3 = [-Infinity, -Infinity, -Infinity];
    for (let index = 0; index < positions.length; index += 3) {
      for (let axis = 0; axis < 3; axis += 1) {
        const value = positions[index + axis]!;
        partMin[axis] = Math.min(partMin[axis], value);
        partMax[axis] = Math.max(partMax[axis], value);
      }
    }
    accessors.push({
      bufferView: bufferViews.length - 1,
      componentType: 5126,
      count: positions.length / 3,
      type: "VEC3",
      min: partMin,
      max: partMax,
    });
    chunks.push(bytes);
    byteLength += bytes.byteLength;
  }

  const json = JSON.stringify({
    asset: { version: "2.0", generator: "glb2svg tests" },
    scene: 0,
    scenes: [{ nodes: parts.map((_, index) => index) }],
    nodes: parts.map((part, index) => ({
      mesh: index,
      name: part.name,
      extras: { [roleKey]: part.role },
    })),
    meshes: parts.map((_, index) => ({
      primitives: [{ attributes: { POSITION: index } }],
    })),
    accessors,
    bufferViews,
    buffers: [{ byteLength }],
  });
  const jsonBytes = new TextEncoder().encode(json);
  const jsonPadding = (4 - (jsonBytes.length % 4)) % 4;
  const binaryPadding = (4 - (byteLength % 4)) % 4;
  const totalLength =
    12 +
    8 +
    jsonBytes.length +
    jsonPadding +
    8 +
    byteLength +
    binaryPadding;
  const buffer = new Uint8Array(totalLength);
  const view = new DataView(buffer.buffer);
  view.setUint32(0, GLB_MAGIC, true);
  view.setUint32(4, GLB_VERSION, true);
  view.setUint32(8, totalLength, true);
  view.setUint32(12, jsonBytes.length + jsonPadding, true);
  view.setUint32(16, JSON_CHUNK_TYPE, true);
  buffer.set(jsonBytes, 20);
  buffer.fill(0x20, 20 + jsonBytes.length, 20 + jsonBytes.length + jsonPadding);
  const binaryOffset = 20 + jsonBytes.length + jsonPadding;
  view.setUint32(binaryOffset, byteLength + binaryPadding, true);
  view.setUint32(binaryOffset + 4, BIN_CHUNK_TYPE, true);
  let offset = binaryOffset + 8;
  for (const chunk of chunks) {
    buffer.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return buffer;
}

/**
 * Builds a fixture with body, lid, hardware and ignored parts. The floating
 * panel is oriented perpendicular to the key light so the output contains all
 * three Lambert intensity bands.
 */
export function createStudioFixture(): Uint8Array {
  const cameraDirection = normalize([2.45, 1.47, 3.25]);
  const lightDirection = normalize([2.4, 3.2, 4.1]);
  const alignment = dot(cameraDirection, lightDirection);
  const worldNormal = normalize([
    cameraDirection[0] - alignment * lightDirection[0],
    cameraDirection[1] - alignment * lightDirection[1],
    cameraDirection[2] - alignment * lightDirection[2],
  ]);
  const sourceNormal: Vec3 = [
    worldNormal[0],
    -worldNormal[2],
    worldNormal[1],
  ];
  return createGlb([
    {
      kind: "box",
      name: "body",
      role: "body",
      min: [0, 0, 0],
      max: [0.5, 0.5, 0.5],
    },
    {
      kind: "box",
      name: "lid",
      role: "lid",
      min: [0.6, 0, 0],
      max: [1.1, 0.5, 0.5],
    },
    {
      kind: "box",
      name: "hardware",
      role: "hardware",
      min: [1.2, 0, 0],
      max: [1.5, 0.3, 0.3],
    },
    {
      kind: "box",
      name: "ignored",
      role: "ignore",
      min: [1.6, 0, 0],
      max: [2.1, 0.5, 0.5],
    },
    {
      kind: "quad",
      name: "panel",
      role: "body",
      center: [0.55, 0.25, 0.7],
      normal: sourceNormal,
      size: 0.5,
    },
  ]);
}

/**
 * Builds a two-box fixture whose semantic roles use a custom `userData` key.
 */
export function createCustomKeyFixture(): Uint8Array {
  return createGlb(
    [
      {
        kind: "box",
        name: "body",
        role: "body",
        min: [0, 0, 0],
        max: [0.5, 0.5, 0.5],
      },
      {
        kind: "box",
        name: "hidden",
        role: "ignore",
        min: [0.6, 0, 0],
        max: [1.1, 0.5, 0.5],
      },
    ],
    "custom_role",
  );
}
