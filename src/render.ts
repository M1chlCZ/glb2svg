import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import draco3d from "draco3dgltf";
import { Window } from "happy-dom";
import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { SVGRenderer } from "three/examples/jsm/renderers/SVGRenderer.js";
import { STUDIO_SEMANTIC_ROLE_KEY } from "./user-data.js";

/**
 * Default prefix for the generated CSS classes.
 */
export const DEFAULT_CLASS_PREFIX = "glb2svg-";

/**
 * Default prefix for the generated CSS custom properties.
 */
export const DEFAULT_CSS_VARIABLE_PREFIX = "--glb2svg-";

/**
 * Default SVG viewBox width in pixels.
 */
export const DEFAULT_WIDTH = 512;

/**
 * Default SVG viewBox height in pixels.
 */
export const DEFAULT_HEIGHT = 512;

/**
 * Maps the semantic-role lookup to a `userData` key. The `semanticRole` key
 * defaults to `studio_semantic_role` from the shared convention.
 */
export interface SemanticKeyMap {
  semanticRole: string;
}

/**
 * Default semantic-key map. It mirrors the keys published by the sibling
 * three-fdm-studio package.
 */
export const DEFAULT_SEMANTIC_KEYS: Readonly<SemanticKeyMap> = {
  semanticRole: STUDIO_SEMANTIC_ROLE_KEY,
};

/**
 * Options that control the generated SVG.
 */
export interface RenderOptions {
  /**
   * Prefix for the generated CSS classes. Defaults to `glb2svg-`.
   */
  classPrefix?: string;
  /**
   * Prefix for the generated CSS custom properties. A missing leading `--`
   * is added. Defaults to `--glb2svg-`.
   */
  cssVariablePrefix?: string;
  /**
   * ViewBox width in pixels. Defaults to 512.
   */
  width?: number;
  /**
   * ViewBox height in pixels. Defaults to 512.
   */
  height?: number;
  /**
   * Overrides for the `userData` keys read from the model. Defaults to the
   * shared `studio_*` key.
   */
  semanticKeys?: Partial<SemanticKeyMap>;
}

interface ResolvedOptions {
  classPrefix: string;
  cssVariablePrefix: string;
  width: number;
  height: number;
  semanticKeys: SemanticKeyMap;
}

function resolveOptions(options: RenderOptions): ResolvedOptions {
  return {
    classPrefix: options.classPrefix ?? DEFAULT_CLASS_PREFIX,
    cssVariablePrefix: normalizeVariablePrefix(
      options.cssVariablePrefix ?? DEFAULT_CSS_VARIABLE_PREFIX,
    ),
    width: options.width ?? DEFAULT_WIDTH,
    height: options.height ?? DEFAULT_HEIGHT,
    semanticKeys: {
      semanticRole:
        options.semanticKeys?.semanticRole ??
        DEFAULT_SEMANTIC_KEYS.semanticRole,
    },
  };
}

function normalizeVariablePrefix(prefix: string): string {
  return prefix.startsWith("--") ? prefix : `--${prefix}`;
}

function installDomShim(): Window {
  const window = new Window();
  const globals = globalThis as unknown as Record<string, unknown>;
  globals.window = window;
  globals.document = window.document;
  if (typeof globals.ProgressEvent === "undefined") {
    class ProgressEventShim {
      type: string;

      constructor(type: string, init: Record<string, unknown> = {}) {
        this.type = type;
        Object.assign(this, init);
      }
    }
    globals.ProgressEvent = ProgressEventShim;
  }
  return window;
}

function presentationFor(model: THREE.Object3D): THREE.Group {
  const sourceToYUp = new THREE.Group();
  sourceToYUp.rotation.x = -Math.PI / 2;
  sourceToYUp.add(model);
  const presentation = new THREE.Group();
  presentation.add(sourceToYUp);
  presentation.updateMatrixWorld(true);

  const sourceBounds = new THREE.Box3().setFromObject(presentation);
  const sourceSize = sourceBounds.getSize(new THREE.Vector3());
  const longest = Math.max(sourceSize.x, sourceSize.y, sourceSize.z);
  sourceToYUp.scale.setScalar(longest > 0 ? 1.5 / longest : 1);
  presentation.updateMatrixWorld(true);

  const scaledBounds = new THREE.Box3().setFromObject(presentation);
  const center = scaledBounds.getCenter(new THREE.Vector3());
  sourceToYUp.position.x -= center.x;
  sourceToYUp.position.z -= center.z;
  sourceToYUp.position.y += -0.72 - scaledBounds.min.y;
  presentation.updateMatrixWorld(true);
  return presentation;
}

function cameraFor(): THREE.OrthographicCamera {
  const camera = new THREE.OrthographicCamera(
    -1.025,
    1.025,
    1.025,
    -1.025,
    0.01,
    20,
  );
  camera.position.set(2.45, 1.45, 3.25);
  camera.lookAt(0, -0.02, 0);
  camera.updateProjectionMatrix();
  return camera;
}

function classifyPaths(
  svg: SVGElement,
  document: Document,
  options: ResolvedOptions,
): void {
  const { classPrefix, cssVariablePrefix } = options;
  for (const path of svg.querySelectorAll("path")) {
    const style = path.getAttribute("style") ?? "";
    const match = style.match(/fill:rgb\((\d+),(\d+),(\d+)\)/);
    if (!match) continue;
    const red = Number(match[1]);
    const blue = Number(match[3]);
    const component = red >= blue ? "body" : "lid";
    const intensity = Math.max(red, blue) / 255;
    const band = intensity < 0.55 ? 0 : intensity < 0.8 ? 1 : 2;
    path.setAttribute(
      "class",
      `${classPrefix}${component} ${classPrefix}band-${band}`,
    );
    path.setAttribute("style", "fill-opacity:1");
  }

  const style = document.createElementNS("http://www.w3.org/2000/svg", "style");
  const rules = (["body", "lid"] as const).flatMap((component) =>
    [0, 1, 2].map(
      (band) =>
        `.${classPrefix}${component}.${classPrefix}band-${band}{fill:var(${cssVariablePrefix}${component}-${band})}`,
    ),
  );
  style.textContent = `\n    ${rules.join("\n    ")}\n  `;
  svg.prepend(style);
  svg.setAttribute("role", "presentation");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("data-source-up", "Z");
  svg.setAttribute("data-presentation-up", "Y");
  svg.removeAttribute("width");
  svg.removeAttribute("height");
}

function prepareModel(model: THREE.Object3D, semanticRoleKey: string): void {
  model.traverse((object) => {
    if (object.userData[semanticRoleKey] === "ignore") object.visible = false;
    if (!(object instanceof THREE.Mesh)) return;
    const semanticRole = object.userData[semanticRoleKey];
    const isLid =
      semanticRole === "lid" || (semanticRole !== "body" && object.name === "lid");
    object.material = new THREE.MeshLambertMaterial({
      color: isLid ? 0x0000ff : 0xff0000,
    });
  });
}

/**
 * Renders a binary glTF (GLB) asset to a complete SVG document.
 *
 * The renderer is deterministic: the same bytes and options always produce
 * the same SVG text. It uses no browser, GPU or network access. The model is
 * rotated from STEP Z-up to Y-up, scaled so its longest side measures 1.5
 * units, centered on X and Z and placed on the ground plane before it is
 * drawn from a fixed three-quarter orthographic camera with flat Lambert
 * lighting.
 *
 * Mesh nodes that carry the `studio_semantic_role` `userData` key drive the
 * path classification. A `lid` role (or a mesh named `lid` without a `body`
 * role) receives the lid color. The `ignore` role hides the object. Every
 * other role, including `hardware`, receives the body color.
 *
 * @param input Binary GLB bytes. Draco-compressed primitives are decoded
 *   before rendering.
 * @param options Optional class, variable, viewBox and semantic-key settings.
 * @returns The complete SVG text without a trailing newline.
 */
export async function renderGlbToSvg(
  input: Uint8Array,
  options: RenderOptions = {},
): Promise<string> {
  const resolved = resolveOptions(options);
  const happyWindow = installDomShim();
  const document = happyWindow.document as unknown as Document;

  const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({
      "draco3d.decoder": await draco3d.createDecoderModule(),
    });
  const gltfDocument = await io.readBinary(input);
  for (const extension of gltfDocument.getRoot().listExtensionsUsed()) {
    if (extension.extensionName === "KHR_draco_mesh_compression") {
      extension.dispose();
    }
  }
  const decoded = await io.writeBinary(gltfDocument);
  const arrayBuffer = decoded.buffer.slice(
    decoded.byteOffset,
    decoded.byteOffset + decoded.byteLength,
  );
  const gltf = await new Promise<GLTF>((resolveLoad, reject) => {
    new GLTFLoader().parse(arrayBuffer, "", resolveLoad, reject);
  });

  prepareModel(gltf.scene, resolved.semanticKeys.semanticRole);

  const scene = new THREE.Scene();
  scene.add(presentationFor(gltf.scene));
  scene.add(new THREE.AmbientLight(0x242424));
  const key = new THREE.DirectionalLight(0xffffff, 0.72);
  key.position.set(2.4, 3.2, 4.1);
  scene.add(key);

  const renderer = new SVGRenderer();
  renderer.autoClear = false;
  renderer.setPrecision(2);
  renderer.setSize(resolved.width, resolved.height);
  renderer.render(scene, cameraFor());
  classifyPaths(renderer.domElement, document, resolved);

  return renderer.domElement.outerHTML;
}
