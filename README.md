# glb2svg

`glb2svg` is a headless GLB-to-SVG renderer. It reads a binary glTF (GLB)
model and writes a flat, themeable SVG drawing. It uses no browser, no GPU and
no network access.

## Why

A 3D viewer can ship a static fallback image for slow devices, missing WebGL
support or preview cards. `glb2svg` produces that fallback as vector artwork
that matches the same camera and semantic color scheme as the live viewer.
The output is deterministic, so the same model always produces the same bytes
and the result is safe to cache or diff.

## Shared convention with three-fdm-studio

`glb2svg` reads the same `studio_*` `userData` convention as the sibling
[three-fdm-studio](https://github.com/m1chlcz/three-fdm-studio) package.
Author the `studio_semantic_role` key on a glTF node (or on `extras` of the
node) with one of these values:

| Role | Behavior in `glb2svg` |
| --- | --- |
| `body` | Rendered with the body color. |
| `lid` | Rendered with the lid color. |
| `hardware` | Rendered with the body color. |
| `ignore` | Hidden and not drawn. |

A mesh named `lid` without a `body` role also gets the lid color.

Both packages use the same string constants, so one model file works with both.
`glb2svg` does not depend on three-fdm-studio at runtime; it copies the
constant values.

## Install

```sh
npm install glb2svg
```

Node.js 22 or later is required.

## CLI

```sh
npx glb2svg model.glb model.svg
npx glb2svg model.glb model.svg --class-prefix brand- --width 256 --height 256
npx glb2svg model.glb sheet.svg --views front,top,side,iso --layout sheet
npx glb2svg model.glb sheet.svg --views front,side --dimensions
npx glb2svg model.glb model.svg --fills material
```

The CLI writes the SVG through a temporary file in the target directory and an
atomic rename. It never opens a network connection.

| Option | Default | Description |
| --- | --- | --- |
| `--class-prefix <prefix>` | `glb2svg-` | Prefix for the generated CSS classes. |
| `--css-variable-prefix <prefix>` | `--glb2svg-` | Prefix for the generated CSS custom properties. A missing `--` is added. |
| `--width <pixels>` | `512` | SVG viewBox width per panel. |
| `--height <pixels>` | `512` | SVG viewBox height per panel. |
| `--views <list>` | `iso` | Comma-separated views: `front`, `top`, `side`, `iso`. More than one view composes a sheet. |
| `--layout <mode>` | `single` | `single` renders one full-size view, `sheet` tiles the views with labels. |
| `--dimensions` | off | Draw width, height and depth dimension lines with millimetre labels. |
| `--fills <mode>` | `role` | `role` uses the semantic-role colors, `material` uses each primitive's glTF base color factor. See [Material fills](#material-fills). |

Each prefix is written directly before the generated name. Include a trailing
separator in the prefix when you want one; the defaults do (`glb2svg-` and
`--glb2svg-`).

Exit codes:

- `0` on success.
- `1` when the input cannot be read or rendered.
- `2` on usage errors.

## Spec sheet

The renderer can draw the same model from four fixed orthographic directions
and tile the results in one SVG document.

| View | Direction |
| --- | --- |
| `front` | Looks along the negative Z axis. |
| `top` | Looks down the negative Y axis. |
| `side` | Looks along the negative X axis. |
| `iso` | The fixed three-quarter camera of the default single view. |

The `views` option lists the panels in order and defaults to `["iso"]`. The
`layout` option defaults to `single`, which keeps the original full-size
output for one view. Requesting more than one view always composes a sheet,
even when `layout` is `single`. A sheet arranges the panels in a grid: two
columns for two to four views, then a new row every two panels. The sheet
viewBox grows with the grid, and every panel keeps the requested `width` and
`height`.

Each panel is a `<g class="glb2svg-panel" data-view="...">` element that holds
the rendered paths, a small view label, and a shared light background when the
source renderer emits one. Set `showDimensions` to add dimension lines with
arrow ends and text labels. Isometric panels show width, height and depth.
Front and side panels show width or depth with the height, and top panels show
width and depth.

Dimension labels report the fitted model bounds in millimetres: one scene unit
equals one metre, and the longest side measures 1.5 units. The renderer does
not add external fonts or images, so the sheet stays self-contained.

CLI and library examples:

```sh
npx glb2svg model.glb sheet.svg --views front,top,side,iso --layout sheet --dimensions
```

```ts
import { readFile, writeFile } from "node:fs/promises";
import { renderGlbToSvg } from "glb2svg";

const input = await readFile("model.glb");
const svg = await renderGlbToSvg(input, {
  views: ["front", "top", "side", "iso"],
  layout: "sheet",
  showDimensions: true,
});
await writeFile("sheet.svg", svg);
```

## Library

```ts
import { readFile, writeFile } from "node:fs/promises";
import { renderGlbToSvg, STUDIO_SEMANTIC_ROLE_KEY } from "glb2svg";

const input = await readFile("model.glb");
const svg = await renderGlbToSvg(input, {
  classPrefix: "brand-",
  cssVariablePrefix: "--brand-",
  width: 512,
  height: 512,
});
await writeFile("model.svg", svg);
```

`renderGlbToSvg` returns the complete SVG text without a trailing newline. It
throws an `Error` when the input is not a valid GLB asset.

### Options

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `classPrefix` | `string` | `glb2svg-` | Prefix for the generated CSS classes. |
| `cssVariablePrefix` | `string` | `--glb2svg-` | Prefix for the generated CSS custom properties. A missing `--` is added. |
| `width` | `number` | `512` | SVG viewBox width per panel. |
| `height` | `number` | `512` | SVG viewBox height per panel. |
| `semanticKeys.semanticRole` | `string` | `studio_semantic_role` | The `userData` key that holds the semantic role. |
| `views` | `ViewName[]` | `["iso"]` | Views to render: `front`, `top`, `side`, `iso`. More than one view composes a sheet. |
| `layout` | `"single" \| "sheet"` | `"single"` | One full-size view or a labelled grid of panels. |
| `showDimensions` | `boolean` | `false` | Draw width, height and depth dimension lines with millimetre labels. |
| `fills` | `"role" \| "material"` | `"role"` | `role` keeps the semantic-role colors and CSS variables, `material` fills each primitive from its glTF material. See [Material fills](#material-fills). |

The package also exports `STUDIO_SEMANTIC_ROLE_KEY` and
`STUDIO_SEMANTIC_ROLES` for callers that author model metadata, `FillMode`,
`DEFAULT_FILL_MODE` and `isFillMode` for fill selection, and `linearRgbaToHex`
and `linearToSrgb` for the material color conversion.

## CSS classes and variables

Every visible path receives a role class and a band class. The band class
encodes the flat Lambert brightness: `band-0` is the darkest and `band-2` the
brightest.

| Class | Description |
| --- | --- |
| `glb2svg-body` | Paths of body, hardware and unrecognized roles. |
| `glb2svg-lid` | Paths of the lid role. |
| `glb2svg-band-0` | Darkest shading band. |
| `glb2svg-band-1` | Middle shading band. |
| `glb2svg-band-2` | Brightest shading band. |

The generated `<style>` element fills each role and band combination from a
CSS custom property:

| Variable | Description |
| --- | --- |
| `--glb2svg-body-0`, `--glb2svg-body-1`, `--glb2svg-body-2` | Body fill per band. |
| `--glb2svg-lid-0`, `--glb2svg-lid-1`, `--glb2svg-lid-2` | Lid fill per band. |

Override the variables on the SVG element or on a parent to theme the
fallback:

```css
.hero svg {
  --glb2svg-body-0: #d8d4cc;
  --glb2svg-body-1: #e6e2da;
  --glb2svg-body-2: #f2efe9;
  --glb2svg-lid-0: #6f7683;
  --glb2svg-lid-1: #7f8794;
  --glb2svg-lid-2: #929aa8;
}
```

When you change `classPrefix` or `cssVariablePrefix`, the class names and the
custom property names change together. Spec sheets also use
`glb2svg-panel`, `glb2svg-panel-background`, `glb2svg-view-label`,
`glb2svg-dimension-text`, `glb2svg-dimension-line`,
`glb2svg-dimension-extension` and `glb2svg-dimension-arrow`, with the same
prefix rule.

## Material fills

`role` fills (the default) color paths by semantic role and expose CSS custom
properties for theming. `material` fills color paths from the model itself.
Select the mode with the `fills` render option or the `--fills` CLI flag:

```sh
npx glb2svg model.glb model.svg --fills material
```

```ts
const svg = await renderGlbToSvg(input, { fills: "material" });
```

Precedence per primitive:

1. A node with the `ignore` role is hidden and never drawn.
2. A primitive whose material declares
   `pbrMetallicRoughness.baseColorFactor` is filled with that color.
3. Every other primitive keeps the semantic-role color (`body`, `lid` or the
   body fallback) and its CSS custom properties. This covers primitives
   without a material and primitives whose material omits the base color
   factor, including the glTF default of white.

three.js loads every glTF mesh primitive as its own mesh, so `glb2svg` colors
the primitives of one mesh individually, exactly like primitives of separate
meshes.

Conversion: the factor is linear sRGB. Each RGB component is clamped to
`[0, 1]`, converted with the standard sRGB transfer curve, rounded to the
nearest 8-bit value and written as a lowercase `#rrggbb` fill. Alpha is
ignored: the fallback renderer draws opaque surfaces only, every path keeps
`fill-opacity:1`, and occlusion and opacity are never read from the material.
`linearRgbaToHex` and `linearToSrgb` are exported for callers that need the
same conversion.

| Linear sRGB | sRGB 8-bit | Fill |
| --- | --- | --- |
| `0` | `0` | `#000000` |
| `0.0031308` | `10` | `#0a0a0a` |
| `0.214041` | `128` | `#808080` |
| `0.5` | `188` | `#bcbcbc` |
| `1` | `255` | `#ffffff` |

Material paths carry the literal `fill` attribute and no role class; fallback
paths keep their role classes and CSS variables, so one drawing can mix both.
The renderer does not add a `data-*` attribute for the resolved fill; it uses
`data-*` attributes only for view, dimension and orientation metadata, and the
sheet panel background uses the same literal `fill` pattern as material paths.

## Determinism and limitations

The renderer is deterministic: the same GLB bytes and options always produce
the same SVG. It installs a DOM shim only for the duration of a render, decodes
Draco-compressed primitives with `draco3dgltf`, and draws with the three.js
`SVGRenderer`.

Limitations:

- Flat Lambert shading only. No physically based rendering.
- No textures, no transparency, no vertex colors.
- No shadows and no ambient occlusion.
- One fixed three-quarter orthographic camera, or the four fixed orthographic
  directions of a spec sheet. The model is rotated from STEP Z-up to Y-up,
  scaled so its longest side measures 1.5 units, centered on X and Z and
  placed on the ground plane.
- By default the fallback shows one material color per semantic role, not the
  live colors of a configured product. The opt-in `material` fill mode reads
  base color factors only; textures, vertex colors, alpha, occlusion and the
  rest of the PBR model are still ignored.
- Dimension labels describe the fitted presentation, not the source CAD
  dimensions.

## Development

```sh
npm install
npm run typecheck
npm test
npm run build
```

The tests generate their own GLB fixtures, so they do not need product assets
and they run offline.

## License

MIT
