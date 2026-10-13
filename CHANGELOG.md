# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Material-based fills through the `fills` render option and the `--fills`
  CLI flag. `material` mode converts each primitive's linear-sRGB
  `pbrMetallicRoughness.baseColorFactor` to an sRGB hex fill and falls back to
  the semantic-role color when a primitive has no usable material. The
  default `role` mode output is unchanged.
- `FillMode`, `DEFAULT_FILL_MODE`, `isFillMode`, `linearRgbaToHex` and
  `linearToSrgb` exports.

## [0.2.0] - 2026-10-11

### Added

- Multi-view spec sheets through the `views` and `layout` render options and
  the `--views` and `--layout` CLI flags. The sheet tiles orthographic front,
  top, side and isometric panels with a label per panel.
- Dimension overlays through the `showDimensions` render option and the
  `--dimensions` CLI flag. Dimension lines with arrow ends and millimetre
  labels cover width, height and depth.
- `ViewName` and `RenderLayout` types plus the `DEFAULT_VIEWS`,
  `DEFAULT_LAYOUT` and `isViewName` exports.

[0.2.0]: https://github.com/M1chlCZ/glb2svg/releases/tag/v0.2.0
