// styles.ts — Injects a single <style> tag with all tile and target CSS rules.
// Selector lists and shared declarations are defined as constants to avoid repetition.

/* CSS custom properties — tile geometry and colours */
const TARGET_ATTRS =
  "[onclick*='dragtarget'], [onkeydown*='dragtarget'], [ondragover*='dragtarget'], [ondragleave*='dragtarget'], " +
  "[onclick*='dragenter'], [onkeydown*='dragenter'],  [ondragover*='dragenter'],  [ondragleave*='dragenter']";

const SOURCE_ATTRS =
  "[onclick*='dragsource'], [onkeydown*='dragsource'], [ondragstart*='dragsource'], [ondragend*='dragsource']";

const SOURCE_ELEMS = `${SOURCE_ATTRS}, [data-reset-tile-role='source'], [draggable='true']`;
const TARGET_ELEMS = `${TARGET_ATTRS}, [data-reset-tile-role='target']`;

const SOLVED_SCOPES =
  ".lia-quiz.solved, .lia-quiz.resolved, .solved, .resolved";

// ── Shared shorthand declarations ────────────────────────────────────────────

const TILE_SHAPE = `
  border-radius: var(--lia-tile-radius) !important;
  overflow: hidden !important;
`;

const TILE_SHAPE_SOFT = `
  border-radius: var(--lia-tile-radius) !important;
  overflow: hidden;
`;

const TILE_BG = `background-color: var(--lia-tile-bg) !important;`;

const FLEX_CENTER = `
  display: inline-flex;
  align-items: center;
  justify-content: center;
  text-align: center;
`;

const FLEX_CENTER_FULL = `
  ${FLEX_CENTER}
  width: 100%;
  margin-inline: auto;
`;

const TARGET_SIZING = `
  min-width: var(--lia-target-min-width);
  max-width: 100%;
  padding-inline: calc(0.8rem * var(--lia-target-width-scale));
`;

// ── Rule groups ──────────────────────────────────────────────────────────────

const TILE_STYLES = `
  /* 1. CSS variables */
  :root {
    --lia-tile-radius: 12px;
    --lia-target-width-scale: 0.65;
    --lia-target-min-width: calc(clamp(9rem, 22vw, 14rem) * var(--lia-target-width-scale));
    --lia-tile-bg: rgba(0, 0, 0, 0.15);
  }

  /* 2. Kachelfolge-wrap: target slots */
  .kachelfolge-wrap > span[data-kf-uid],
  .kachelfolge-wrap > span[data-kf-uid].lia-target-placeholder {
    ${TILE_SHAPE}
    ${TILE_BG}
  }

  /* 3. Kachelfolge-wrap: source tiles (sibling divs and adjacent paragraphs) */
  .kachelfolge-wrap > div > span[role='button'],
  .lia-paragraph:has(> .kachelfolge-wrap) + div > span[role='button'],
  [id^='kachelfolge-wrap-'] ~ div > span[role='button'] {
    ${TILE_SHAPE}
    ${TILE_BG}
  }

  /* 4. Inner content of wrap slots and source tiles — centred flex */
  .kachelfolge-wrap > span[data-kf-uid] > *,
  .kachelfolge-wrap > div > span[role='button'] > *,
  .lia-paragraph:has(> .kachelfolge-wrap) + div > span[role='button'] > *,
  [id^='kachelfolge-wrap-'] ~ div > span[role='button'] > * {
    display: inline-flex !important;
    ${FLEX_CENTER_FULL}
  }

  /* 5. Solved / resolved state — target slots */
  ${SOLVED_SCOPES.split(", ").map(s => `${s} [data-reset-tile-role='target']`).join(",\n  ")} {
    ${TILE_SHAPE}
    display: inline-flex !important;
    ${FLEX_CENTER}
    ${TARGET_SIZING}
    ${TILE_BG}
  }

  /* 6. Solved / resolved state — source tiles */
  ${SOLVED_SCOPES.split(", ").map(s => `${s} [data-reset-tile-role='source'], ${s} [draggable='true']`).join(",\n  ")} {
    ${TILE_SHAPE}
    ${TILE_BG}
  }

  /* 7. Generic target elements */
  ${TARGET_ELEMS} {
    ${TILE_SHAPE_SOFT}
    display: inline-flex;
    ${FLEX_CENTER}
    ${TARGET_SIZING}
    ${TILE_BG}
  }

  /* 8. Target background reinforcement (event-attr targets only) */
  ${TARGET_ATTRS} {
    ${TILE_BG}
  }

  /* 9. Generic source elements */
  ${SOURCE_ELEMS} {
    ${TILE_SHAPE_SOFT}
    ${TILE_BG}
  }

  /* 10. Source background reinforcement (event-attr sources only) */
  ${SOURCE_ATTRS} {
    ${TILE_BG}
  }

  /* 11. Sources nested inside targets — transparent background, inherit colour */
  [data-reset-tile-role='target'] [data-reset-tile-role='source'],
  [data-reset-tile-role='target'] [draggable='true'],
  [data-reset-tile-role='target'] [data-reset-tile-role='source'] *,
  [data-reset-tile-role='target'] [draggable='true'] * {
    background-color: transparent !important;
    color: inherit !important;
  }

  /* 12. All descendants of target elements — transparent, inherit colour */
  ${TARGET_ATTRS.split(", ").map(s => `${s} *`).join(",\n  ")},
  [data-reset-tile-role='target'] * {
    background-color: transparent !important;
    color: inherit !important;
  }

  /* 13. Legacy inline-styled target (dotted border) — transparent children */
  span[style*='border: 3px dotted'][style*='padding: 1rem'][style*='vertical-align: middle'] * {
    background-color: transparent !important;
    color: inherit !important;
  }

  /* 14. Direct children of target elements — rounded, centred flex */
  ${TARGET_ATTRS.split(", ").map(s => `${s} > *`).join(",\n  ")} {
    border-radius: var(--lia-tile-radius) !important;
    display: inline-flex;
    ${FLEX_CENTER_FULL}
  }

  /* 15. Source tile dropped inside a target — centred flex */
  [data-reset-tile-role='target'] [onclick*='dragsource'],
  [data-reset-tile-role='target'] [onkeydown*='dragsource'],
  [data-reset-tile-role='target'] [draggable='true'] {
    display: inline-flex;
    ${FLEX_CENTER_FULL}
  }

  /* 16. Placeholder — accent colour */
  .lia-target-placeholder {
    color: var(--lia-theme-color,
             var(--lia-primary,
               var(--md-primary-fg-color,
                 var(--color-primary, currentColor)))) !important;
  }

  .lia-target-placeholder *,
  .lia-target-placeholder [data-reset-tile-role='source'],
  .lia-target-placeholder [draggable='true'] {
    color: inherit !important;
    background-color: transparent !important;
  }

  /* 17. Children of source elements — inherit radius */
  ${SOURCE_ATTRS.split(", ").map(s => `${s} > *`).join(",\n  ")} {
    border-radius: var(--lia-tile-radius) !important;
  }
`;

export function ensureRoundedTileStyles(): void {
  const existing = document.querySelector("style[data-lia-tile-rounded='1']");
  if ((window as any).__liaTileCrossRoundedStylesApplied && existing) return;
  (window as any).__liaTileCrossRoundedStylesApplied = 1;

  const style = document.createElement("style");
  style.setAttribute("data-lia-tile-rounded", "1");
  style.textContent = TILE_STYLES;
  (document.head || document.documentElement).appendChild(style);
}
