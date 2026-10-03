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
```

The CLI writes the SVG through a temporary file in the target directory and an
atomic rename. It never opens a network connection.

| Option | Default | Description |
| --- | --- | --- |
| `--class-prefix <prefix>` | `glb2svg-` | Prefix for the generated CSS classes. |
| `--css-variable-prefix <prefix>` | `--glb2svg-` | Prefix for the generated CSS custom properties. A missing `--` is added. |
| `--width <pixels>` | `512` | SVG viewBox width. |
| `--height <pixels>` | `512` | SVG viewBox height. |

Each prefix is written directly before the generated name. Include a trailing
separator in the prefix when you want one; the defaults do (`glb2svg-` and
`--glb2svg-`).

Exit codes:

- `0` on success.
- `1` when the input cannot be read or rendered.
- `2` on usage errors.

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
| `width` | `number` | `512` | SVG viewBox width. |
| `height` | `number` | `512` | SVG viewBox height. |
| `semanticKeys.semanticRole` | `string` | `studio_semantic_role` | The `userData` key that holds the semantic role. |

The package also exports `STUDIO_SEMANTIC_ROLE_KEY` and
`STUDIO_SEMANTIC_ROLES` for callers that author model metadata.

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
custom property names change together.

## Determinism and limitations

The renderer is deterministic: the same GLB bytes and options always produce
the same SVG. It installs a DOM shim only for the duration of a render, decodes
Draco-compressed primitives with `draco3dgltf`, and draws with the three.js
`SVGRenderer`.

Limitations:

- Flat Lambert shading only. No physically based rendering.
- No textures, no transparency, no vertex colors.
- No shadows and no ambient occlusion.
- One fixed three-quarter orthographic camera. The model is rotated from STEP
  Z-up to Y-up, scaled so its longest side measures 1.5 units, centered on X
  and Z and placed on the ground plane.
- The fallback shows one material color per semantic role, not the live
  colors of a configured product.

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
