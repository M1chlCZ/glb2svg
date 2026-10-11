import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import draco3d from "draco3dgltf";
import { Window } from "happy-dom";
import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { SVGRenderer } from "three/examples/jsm/renderers/SVGRenderer.js";
import { STUDIO_SEMANTIC_ROLE_KEY } from "./user-data.js";

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

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
 * One orthographic direction that a render or a spec sheet can display.
 *
 * - `front` looks along the negative Z axis.
 * - `top` looks down the negative Y axis.
 * - `side` looks along the negative X axis.
 * - `iso` keeps the fixed three-quarter camera of the single-view render.
 */
export type ViewName = "front" | "top" | "side" | "iso";

/**
 * Panel arrangement of a render.
 *
 * `single` draws one full-size view. `sheet` tiles the requested views in a
 * grid with a label per panel. Requesting more than one view always composes a
 * sheet, even when `single` is selected.
 */
export type RenderLayout = "single" | "sheet";

/**
 * The views used when {@link RenderOptions.views} is not set.
 */
export const DEFAULT_VIEWS: readonly ViewName[] = Object.freeze(["iso"] as const);

/**
 * The layout used when {@link RenderOptions.layout} is not set.
 */
export const DEFAULT_LAYOUT: RenderLayout = "single";

/**
 * Returns `true` when the value is one of the supported view names.
 */
export function isViewName(value: string): value is ViewName {
  return (
    value === "front" || value === "top" || value === "side" || value === "iso"
  );
}

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
  /**
   * Views to render from orthographic cameras. Each entry adds a panel to a
   * sheet. Defaults to `["iso"]`. When more than one view is requested the
   * renderer composes a sheet even if `layout` is `single`.
   */
  views?: ViewName[];
  /**
   * Panel arrangement. Defaults to `single`, which keeps the original
   * full-size single-view output for one view.
   */
  layout?: RenderLayout;
  /**
   * Draws width, height and depth dimension lines with arrow ends and
   * millimetre labels. Isometric panels show all three dimensions, and the
   * axis-aligned panels show their matching pair. Defaults to `false`.
   */
  showDimensions?: boolean;
}

interface ResolvedOptions {
  classPrefix: string;
  cssVariablePrefix: string;
  width: number;
  height: number;
  semanticKeys: SemanticKeyMap;
  views: ViewName[];
  layout: RenderLayout;
  showDimensions: boolean;
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
    views:
      options.views !== undefined && options.views.length > 0
        ? [...options.views]
        : [...DEFAULT_VIEWS],
    layout: options.layout ?? DEFAULT_LAYOUT,
    showDimensions: options.showDimensions ?? false,
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

function cameraForView(
  view: ViewName,
  fittedBounds: THREE.Box3,
): THREE.OrthographicCamera {
  if (view === "iso") return cameraFor();
  const center = fittedBounds.getCenter(new THREE.Vector3());
  const camera = new THREE.OrthographicCamera(
    -1.025,
    1.025,
    1.025,
    -1.025,
    0.01,
    20,
  );
  const distance = 5;
  if (view === "front") {
    camera.position.set(center.x, center.y, center.z + distance);
  } else if (view === "side") {
    camera.position.set(center.x + distance, center.y, center.z);
  } else {
    camera.up.set(0, 0, -1);
    camera.position.set(center.x, center.y + distance, center.z);
  }
  camera.lookAt(center);
  camera.updateProjectionMatrix();
  return camera;
}

function classifyPathElements(
  svg: SVGElement,
  options: ResolvedOptions,
): void {
  const { classPrefix } = options;
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
}

const DIMENSION_FONT_FAMILY = "system-ui,-apple-system,'Segoe UI',sans-serif";
const DIMENSION_OFFSET = 16;
const DIMENSION_EXTENSION_OVERSHOOT = 4;
const DIMENSION_ARROW_SIZE = 5;
const DIMENSION_TEXT_GAP = 9;
const VIEW_LABEL_PADDING = 8;

function bandStyleRules(options: ResolvedOptions): string[] {
  const { classPrefix, cssVariablePrefix } = options;
  return (["body", "lid"] as const).flatMap((component) =>
    [0, 1, 2].map(
      (band) =>
        `.${classPrefix}${component}.${classPrefix}band-${band}{fill:var(${cssVariablePrefix}${component}-${band})}`,
    ),
  );
}

function overlayStyleRules(options: ResolvedOptions): string[] {
  const prefix = options.classPrefix;
  return [
    `.${prefix}view-label{fill:#111827;font-family:${DIMENSION_FONT_FAMILY};font-size:12px;font-weight:600;letter-spacing:.06em;text-transform:uppercase}`,
    `.${prefix}dimension-text{fill:#111827;font-family:${DIMENSION_FONT_FAMILY};font-size:11px;text-anchor:middle;dominant-baseline:middle}`,
    `.${prefix}dimension-line{fill:none;stroke:#374151;stroke-width:1}`,
    `.${prefix}dimension-extension{stroke-width:.75;opacity:.7}`,
    `.${prefix}dimension-arrow{fill:#374151}`,
  ];
}

function styleText(rules: string[]): string {
  return `\n    ${rules.join("\n    ")}\n  `;
}

function classifyPaths(
  svg: SVGElement,
  document: Document,
  options: ResolvedOptions,
): void {
  classifyPathElements(svg, options);
  const style = document.createElementNS(SVG_NAMESPACE, "style");
  style.textContent = styleText(bandStyleRules(options));
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

type DimensionAxis = "width" | "height" | "depth";

interface ScreenPoint {
  x: number;
  y: number;
}

interface ScreenBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

const AXIS_COMPONENT: Record<DimensionAxis, "x" | "y" | "z"> = {
  width: "x",
  height: "y",
  depth: "z",
};

const DIMENSION_AXES_BY_VIEW: Record<ViewName, readonly DimensionAxis[]> = {
  front: ["width", "height"],
  side: ["depth", "height"],
  top: ["width", "depth"],
  iso: ["width", "height", "depth"],
};

function formatCoordinate(value: number): string {
  return String(Math.round(value * 100) / 100);
}

function formatMillimeters(value: number): string {
  const rounded =
    value >= 10 ? Math.round(value) : Math.round(value * 10) / 10;
  return `${rounded} mm`;
}

function projectorFor(
  camera: THREE.OrthographicCamera,
  width: number,
  height: number,
): (point: THREE.Vector3) => ScreenPoint {
  camera.updateMatrixWorld();
  const projected = new THREE.Vector3();
  return (point) => {
    projected.copy(point).project(camera);
    return {
      x: (projected.x * width) / 2,
      y: (-projected.y * height) / 2,
    };
  };
}

function boxCorners(box: THREE.Box3): THREE.Vector3[] {
  const { min, max } = box;
  return [
    new THREE.Vector3(min.x, min.y, min.z),
    new THREE.Vector3(max.x, min.y, min.z),
    new THREE.Vector3(min.x, max.y, min.z),
    new THREE.Vector3(max.x, max.y, min.z),
    new THREE.Vector3(min.x, min.y, max.z),
    new THREE.Vector3(max.x, min.y, max.z),
    new THREE.Vector3(min.x, max.y, max.z),
    new THREE.Vector3(max.x, max.y, max.z),
  ];
}

function projectBounds(
  box: THREE.Box3,
  project: (point: THREE.Vector3) => ScreenPoint,
): ScreenBounds {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const corner of boxCorners(box)) {
    const point = project(corner);
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }
  return { minX, minY, maxX, maxY };
}

function createDimensionLine(
  document: Document,
  options: ResolvedOptions,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  extension: boolean,
): SVGLineElement {
  const line = document.createElementNS(SVG_NAMESPACE, "line");
  const className = `${options.classPrefix}dimension-line`;
  line.setAttribute(
    "class",
    extension ? `${className} ${options.classPrefix}dimension-extension` : className,
  );
  line.setAttribute("x1", formatCoordinate(x1));
  line.setAttribute("y1", formatCoordinate(y1));
  line.setAttribute("x2", formatCoordinate(x2));
  line.setAttribute("y2", formatCoordinate(y2));
  return line;
}

function createDimensionArrow(
  document: Document,
  options: ResolvedOptions,
  tipX: number,
  tipY: number,
  directionX: number,
  directionY: number,
): SVGPolygonElement {
  const length = Math.hypot(directionX, directionY) || 1;
  const unitX = directionX / length;
  const unitY = directionY / length;
  const baseX = tipX + unitX * DIMENSION_ARROW_SIZE;
  const baseY = tipY + unitY * DIMENSION_ARROW_SIZE;
  const half = DIMENSION_ARROW_SIZE * 0.35;
  const normalX = -unitY * half;
  const normalY = unitX * half;
  const corners: Array<[number, number]> = [
    [tipX, tipY],
    [baseX + normalX, baseY + normalY],
    [baseX - normalX, baseY - normalY],
  ];
  const points = corners
    .map(([x, y]) => `${formatCoordinate(x)},${formatCoordinate(y)}`)
    .join(" ");
  const arrow = document.createElementNS(SVG_NAMESPACE, "polygon");
  arrow.setAttribute("class", `${options.classPrefix}dimension-arrow`);
  arrow.setAttribute("points", points);
  return arrow;
}

function createDimensionText(
  document: Document,
  options: ResolvedOptions,
  x: number,
  y: number,
  text: string,
  axis: DimensionAxis,
): SVGTextElement {
  const element = document.createElementNS(SVG_NAMESPACE, "text");
  element.setAttribute("class", `${options.classPrefix}dimension-text`);
  element.setAttribute("data-dimension", axis);
  element.setAttribute("x", formatCoordinate(x));
  element.setAttribute("y", formatCoordinate(y));
  element.textContent = text;
  return element;
}

function appendHorizontalDimension(
  container: SVGElement,
  document: Document,
  options: ResolvedOptions,
  bounds: ScreenBounds,
  axis: DimensionAxis,
  value: string,
): void {
  const lineY = bounds.maxY + DIMENSION_OFFSET;
  container.appendChild(
    createDimensionLine(document, options, bounds.minX, lineY, bounds.maxX, lineY, false),
  );
  container.appendChild(
    createDimensionLine(
      document,
      options,
      bounds.minX,
      bounds.maxY,
      bounds.minX,
      lineY + DIMENSION_EXTENSION_OVERSHOOT,
      true,
    ),
  );
  container.appendChild(
    createDimensionLine(
      document,
      options,
      bounds.maxX,
      bounds.maxY,
      bounds.maxX,
      lineY + DIMENSION_EXTENSION_OVERSHOOT,
      true,
    ),
  );
  container.appendChild(
    createDimensionArrow(document, options, bounds.minX, lineY, 1, 0),
  );
  container.appendChild(
    createDimensionArrow(document, options, bounds.maxX, lineY, -1, 0),
  );
  container.appendChild(
    createDimensionText(
      document,
      options,
      (bounds.minX + bounds.maxX) / 2,
      lineY + DIMENSION_TEXT_GAP,
      value,
      axis,
    ),
  );
}

function appendVerticalDimension(
  container: SVGElement,
  document: Document,
  options: ResolvedOptions,
  bounds: ScreenBounds,
  axis: DimensionAxis,
  value: string,
): void {
  const lineX = bounds.maxX + DIMENSION_OFFSET;
  container.appendChild(
    createDimensionLine(document, options, lineX, bounds.minY, lineX, bounds.maxY, false),
  );
  container.appendChild(
    createDimensionLine(
      document,
      options,
      bounds.maxX,
      bounds.minY,
      lineX + DIMENSION_EXTENSION_OVERSHOOT,
      bounds.minY,
      true,
    ),
  );
  container.appendChild(
    createDimensionLine(
      document,
      options,
      bounds.maxX,
      bounds.maxY,
      lineX + DIMENSION_EXTENSION_OVERSHOOT,
      bounds.maxY,
      true,
    ),
  );
  container.appendChild(
    createDimensionArrow(document, options, lineX, bounds.minY, 0, 1),
  );
  container.appendChild(
    createDimensionArrow(document, options, lineX, bounds.maxY, 0, -1),
  );
  container.appendChild(
    createDimensionText(
      document,
      options,
      lineX + DIMENSION_TEXT_GAP,
      (bounds.minY + bounds.maxY) / 2,
      value,
      axis,
    ),
  );
}

function appendPlanarDimensions(
  container: SVGElement,
  document: Document,
  options: ResolvedOptions,
  bounds: ScreenBounds,
  horizontalAxis: DimensionAxis,
  verticalAxis: DimensionAxis,
  valueFor: (axis: DimensionAxis) => string,
): void {
  appendHorizontalDimension(
    container,
    document,
    options,
    bounds,
    horizontalAxis,
    valueFor(horizontalAxis),
  );
  appendVerticalDimension(
    container,
    document,
    options,
    bounds,
    verticalAxis,
    valueFor(verticalAxis),
  );
}

function appendIsoDimensions(
  container: SVGElement,
  document: Document,
  options: ResolvedOptions,
  project: (point: THREE.Vector3) => ScreenPoint,
  fittedBounds: THREE.Box3,
  valueFor: (axis: DimensionAxis) => string,
): void {
  const center = fittedBounds.getCenter(new THREE.Vector3());
  const centerScreen = project(center);
  const { min, max } = fittedBounds;
  const edges: Array<{
    axis: DimensionAxis;
    from: THREE.Vector3;
    to: THREE.Vector3;
  }> = [
    {
      axis: "width",
      from: new THREE.Vector3(min.x, min.y, max.z),
      to: new THREE.Vector3(max.x, min.y, max.z),
    },
    {
      axis: "height",
      from: new THREE.Vector3(max.x, min.y, max.z),
      to: new THREE.Vector3(max.x, max.y, max.z),
    },
    {
      axis: "depth",
      from: new THREE.Vector3(max.x, min.y, max.z),
      to: new THREE.Vector3(max.x, min.y, min.z),
    },
  ];
  for (const edge of edges) {
    const start = project(edge.from);
    const end = project(edge.to);
    const deltaX = end.x - start.x;
    const deltaY = end.y - start.y;
    const length = Math.hypot(deltaX, deltaY) || 1;
    const unitX = deltaX / length;
    const unitY = deltaY / length;
    let normalX = -unitY;
    let normalY = unitX;
    const middle = {
      x: (start.x + end.x) / 2,
      y: (start.y + end.y) / 2,
    };
    if (
      normalX * (middle.x - centerScreen.x) +
        normalY * (middle.y - centerScreen.y) <
      0
    ) {
      normalX = -normalX;
      normalY = -normalY;
    }
    const offsetStart = {
      x: start.x + normalX * DIMENSION_OFFSET,
      y: start.y + normalY * DIMENSION_OFFSET,
    };
    const offsetEnd = {
      x: end.x + normalX * DIMENSION_OFFSET,
      y: end.y + normalY * DIMENSION_OFFSET,
    };
    container.appendChild(
      createDimensionLine(
        document,
        options,
        offsetStart.x,
        offsetStart.y,
        offsetEnd.x,
        offsetEnd.y,
        false,
      ),
    );
    container.appendChild(
      createDimensionLine(
        document,
        options,
        start.x,
        start.y,
        offsetStart.x + normalX * DIMENSION_EXTENSION_OVERSHOOT,
        offsetStart.y + normalY * DIMENSION_EXTENSION_OVERSHOOT,
        true,
      ),
    );
    container.appendChild(
      createDimensionLine(
        document,
        options,
        end.x,
        end.y,
        offsetEnd.x + normalX * DIMENSION_EXTENSION_OVERSHOOT,
        offsetEnd.y + normalY * DIMENSION_EXTENSION_OVERSHOOT,
        true,
      ),
    );
    container.appendChild(
      createDimensionArrow(
        document,
        options,
        offsetStart.x,
        offsetStart.y,
        unitX,
        unitY,
      ),
    );
    container.appendChild(
      createDimensionArrow(
        document,
        options,
        offsetEnd.x,
        offsetEnd.y,
        -unitX,
        -unitY,
      ),
    );
    container.appendChild(
      createDimensionText(
        document,
        options,
        middle.x + normalX * (DIMENSION_OFFSET + DIMENSION_TEXT_GAP),
        middle.y + normalY * (DIMENSION_OFFSET + DIMENSION_TEXT_GAP),
        valueFor(edge.axis),
        edge.axis,
      ),
    );
  }
}

function appendDimensions(
  container: SVGElement,
  document: Document,
  options: ResolvedOptions,
  view: ViewName,
  camera: THREE.OrthographicCamera,
  fittedBounds: THREE.Box3,
  width: number,
  height: number,
): void {
  const project = projectorFor(camera, width, height);
  const size = fittedBounds.getSize(new THREE.Vector3());
  const valueFor = (axis: DimensionAxis): string =>
    formatMillimeters(size[AXIS_COMPONENT[axis]] * 1000);
  if (view === "iso") {
    appendIsoDimensions(container, document, options, project, fittedBounds, valueFor);
    return;
  }
  const axes = DIMENSION_AXES_BY_VIEW[view];
  appendPlanarDimensions(
    container,
    document,
    options,
    projectBounds(fittedBounds, project),
    axes[0]!,
    axes[1]!,
    valueFor,
  );
}

interface ViewRender {
  view: ViewName;
  camera: THREE.OrthographicCamera;
  svg: SVGElement;
}

function renderView(
  scene: THREE.Scene,
  view: ViewName,
  width: number,
  height: number,
  fittedBounds: THREE.Box3,
): ViewRender {
  const renderer = new SVGRenderer();
  renderer.autoClear = false;
  renderer.setPrecision(2);
  renderer.setSize(width, height);
  const camera = cameraForView(view, fittedBounds);
  renderer.render(scene, camera);
  return { view, camera, svg: renderer.domElement };
}

function composeSheet(
  document: Document,
  resolved: ResolvedOptions,
  scene: THREE.Scene,
  fittedBounds: THREE.Box3,
): string {
  const columns = Math.ceil(Math.sqrt(resolved.views.length));
  const rows = Math.ceil(resolved.views.length / columns);
  const panelWidth = resolved.width;
  const panelHeight = resolved.height;
  const rendered = resolved.views.map((view) =>
    renderView(scene, view, panelWidth, panelHeight, fittedBounds),
  );
  for (const item of rendered) classifyPathElements(item.svg, resolved);
  const background = rendered
    .map((item) => item.svg.style.backgroundColor)
    .find((color) => color !== "");

  const root = document.createElementNS(SVG_NAMESPACE, "svg");
  root.setAttribute("xmlns", SVG_NAMESPACE);
  root.setAttribute(
    "viewBox",
    `0 0 ${formatCoordinate(resolved.width * columns)} ${formatCoordinate(resolved.height * rows)}`,
  );
  root.setAttribute("role", "presentation");
  root.setAttribute("aria-hidden", "true");
  root.setAttribute("data-source-up", "Z");
  root.setAttribute("data-presentation-up", "Y");
  root.setAttribute("class", `${resolved.classPrefix}sheet`);
  root.setAttribute("data-layout", "sheet");

  const style = document.createElementNS(SVG_NAMESPACE, "style");
  style.textContent = styleText([
    ...bandStyleRules(resolved),
    ...overlayStyleRules(resolved),
  ]);
  root.appendChild(style);

  rendered.forEach((item, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const centerX = column * panelWidth + panelWidth / 2;
    const centerY = row * panelHeight + panelHeight / 2;
    const panel = document.createElementNS(SVG_NAMESPACE, "g");
    panel.setAttribute("class", `${resolved.classPrefix}panel`);
    panel.setAttribute("data-view", item.view);
    panel.setAttribute(
      "transform",
      `translate(${formatCoordinate(centerX)},${formatCoordinate(centerY)})`,
    );
    if (background !== undefined) {
      const rect = document.createElementNS(SVG_NAMESPACE, "rect");
      rect.setAttribute("class", `${resolved.classPrefix}panel-background`);
      rect.setAttribute("x", formatCoordinate(-panelWidth / 2));
      rect.setAttribute("y", formatCoordinate(-panelHeight / 2));
      rect.setAttribute("width", formatCoordinate(panelWidth));
      rect.setAttribute("height", formatCoordinate(panelHeight));
      rect.setAttribute("fill", background);
      panel.appendChild(rect);
    }
    for (const path of Array.from(item.svg.querySelectorAll("path"))) {
      panel.appendChild(path);
    }
    if (resolved.showDimensions) {
      appendDimensions(
        panel,
        document,
        resolved,
        item.view,
        item.camera,
        fittedBounds,
        panelWidth,
        panelHeight,
      );
    }
    const label = document.createElementNS(SVG_NAMESPACE, "text");
    label.setAttribute("class", `${resolved.classPrefix}view-label`);
    label.setAttribute("data-view-label", item.view);
    label.setAttribute("x", formatCoordinate(-panelWidth / 2 + VIEW_LABEL_PADDING));
    label.setAttribute("y", formatCoordinate(panelHeight / 2 - VIEW_LABEL_PADDING));
    label.textContent = item.view;
    panel.appendChild(label);
    root.appendChild(panel);
  });

  return root.outerHTML;
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
 * With the default options the result is the original single isometric view.
 * Setting {@link RenderOptions.views} to several directions, or
 * {@link RenderOptions.layout} to `sheet`, composes a labelled grid of
 * orthographic panels. Setting {@link RenderOptions.showDimensions} adds
 * millimetre dimension lines measured from the fitted model bounds (one scene
 * unit equals one metre).
 *
 * @param input Binary GLB bytes. Draco-compressed primitives are decoded
 *   before rendering.
 * @param options Optional class, variable, viewBox, semantic-key, view,
 *   layout and dimension settings.
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

  const presentation = presentationFor(gltf.scene);
  const fittedBounds = new THREE.Box3().setFromObject(presentation);
  const scene = new THREE.Scene();
  scene.add(presentation);
  scene.add(new THREE.AmbientLight(0x242424));
  const key = new THREE.DirectionalLight(0xffffff, 0.72);
  key.position.set(2.4, 3.2, 4.1);
  scene.add(key);

  if (resolved.layout === "single" && resolved.views.length === 1) {
    const item = renderView(
      scene,
      resolved.views[0]!,
      resolved.width,
      resolved.height,
      fittedBounds,
    );
    classifyPaths(item.svg, document, resolved);
    if (resolved.showDimensions) {
      const style = item.svg.querySelector("style");
      if (style) {
        style.textContent = styleText([
          ...bandStyleRules(resolved),
          ...overlayStyleRules(resolved),
        ]);
      }
      appendDimensions(
        item.svg,
        document,
        resolved,
        item.view,
        item.camera,
        fittedBounds,
        resolved.width,
        resolved.height,
      );
    }
    return item.svg.outerHTML;
  }

  return composeSheet(document, resolved, scene, fittedBounds);
}
