/**
 * `userData` key that assigns an object one of the {@link STUDIO_SEMANTIC_ROLES}
 * values. The key is authored on the glTF node or on a parent group.
 *
 * The string is copied from the shared `studio_*` convention published by the
 * sibling three-fdm-studio package. No runtime dependency is required; both
 * packages read the same key.
 */
export const STUDIO_SEMANTIC_ROLE_KEY = "studio_semantic_role";

/**
 * The semantic roles that a glTF node can declare in
 * {@link STUDIO_SEMANTIC_ROLE_KEY}.
 *
 * The `hardware` role receives the body color in this fallback renderer. The
 * `ignore` role hides the object.
 */
export const STUDIO_SEMANTIC_ROLES = {
  body: "body",
  lid: "lid",
  hardware: "hardware",
  ignore: "ignore",
} as const;

/**
 * One of the semantic roles declared by {@link STUDIO_SEMANTIC_ROLES}.
 */
export type StudioSemanticRole =
  (typeof STUDIO_SEMANTIC_ROLES)[keyof typeof STUDIO_SEMANTIC_ROLES];
