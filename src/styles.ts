const TILE_STYLES = [
  ":root { --lia-tile-radius: 12px; --lia-target-width-scale: 0.65; --lia-target-min-width: calc(clamp(9rem, 22vw, 14rem) * var(--lia-target-width-scale)); --lia-tile-bg: rgba(0, 0, 0, 0.15); }",
  ".kachelfolge-wrap > span[data-kf-uid] { border-radius: var(--lia-tile-radius) !important; overflow: hidden !important; background-color: var(--lia-tile-bg) !important; }",
  ".kachelfolge-wrap > span[data-kf-uid].lia-target-placeholder { background-color: var(--lia-tile-bg) !important; }",
  ".kachelfolge-wrap > div > span[role='button'] { border-radius: var(--lia-tile-radius) !important; overflow: hidden !important; background-color: var(--lia-tile-bg) !important; }",
  ".lia-paragraph:has(> .kachelfolge-wrap) + div > span[role='button'] { border-radius: var(--lia-tile-radius) !important; overflow: hidden !important; background-color: var(--lia-tile-bg) !important; }",
  "[id^='kachelfolge-wrap-'] ~ div > span[role='button'] { border-radius: var(--lia-tile-radius) !important; overflow: hidden !important; background-color: var(--lia-tile-bg) !important; }",
  ".kachelfolge-wrap > span[data-kf-uid] > *, .kachelfolge-wrap > div > span[role='button'] > * { display: inline-flex !important; align-items: center; justify-content: center; width: 100%; text-align: center; margin-inline: auto; }",
  ".lia-paragraph:has(> .kachelfolge-wrap) + div > span[role='button'] > * { display: inline-flex !important; align-items: center; justify-content: center; width: 100%; text-align: center; margin-inline: auto; }",
  "[id^='kachelfolge-wrap-'] ~ div > span[role='button'] > * { display: inline-flex !important; align-items: center; justify-content: center; width: 100%; text-align: center; margin-inline: auto; }",
  ".lia-quiz.solved [data-reset-tile-role='target'], .lia-quiz.resolved [data-reset-tile-role='target'], .solved [data-reset-tile-role='target'], .resolved [data-reset-tile-role='target'] { border-radius: var(--lia-tile-radius) !important; overflow: hidden !important; min-width: var(--lia-target-min-width); max-width: 100%; display: inline-flex !important; align-items: center; justify-content: center; padding-inline: calc(0.8rem * var(--lia-target-width-scale)); text-align: center; background-color: var(--lia-tile-bg) !important; }",
  ".lia-quiz.solved [data-reset-tile-role='source'], .lia-quiz.resolved [data-reset-tile-role='source'], .lia-quiz.solved [draggable='true'], .lia-quiz.resolved [draggable='true'], .solved [data-reset-tile-role='source'], .resolved [data-reset-tile-role='source'], .solved [draggable='true'], .resolved [draggable='true'] { border-radius: var(--lia-tile-radius) !important; overflow: hidden !important; background-color: var(--lia-tile-bg) !important; }",
  "[onclick*='dragtarget'], [onkeydown*='dragtarget'], [ondragover*='dragtarget'], [ondragleave*='dragtarget'],",
  "[onclick*='dragenter'], [onkeydown*='dragenter'], [ondragover*='dragenter'], [ondragleave*='dragenter'],",
  "[data-reset-tile-role='target'] { border-radius: var(--lia-tile-radius) !important; overflow: hidden; min-width: var(--lia-target-min-width); max-width: 100%; display: inline-flex; align-items: center; justify-content: center; padding-inline: calc(0.8rem * var(--lia-target-width-scale)); text-align: center; background-color: var(--lia-tile-bg) !important; }",
  "[onclick*='dragtarget'], [onkeydown*='dragtarget'], [ondragover*='dragtarget'], [ondragleave*='dragtarget'], [onclick*='dragenter'], [onkeydown*='dragenter'], [ondragover*='dragenter'], [ondragleave*='dragenter'] { background-color: var(--lia-tile-bg) !important; }",
  "[onclick*='dragsource'], [onkeydown*='dragsource'], [ondragstart*='dragsource'], [ondragend*='dragsource'],",
  "[data-reset-tile-role='source'], [draggable='true'] { border-radius: var(--lia-tile-radius) !important; overflow: hidden; background-color: var(--lia-tile-bg) !important; }",
  "[onclick*='dragsource'], [onkeydown*='dragsource'], [ondragstart*='dragsource'], [ondragend*='dragsource'] { background-color: var(--lia-tile-bg) !important; }",
  "[data-reset-tile-role='target'] [data-reset-tile-role='source'], [data-reset-tile-role='target'] [draggable='true'] { background-color: transparent !important; color: inherit !important; }",
  "[data-reset-tile-role='target'] [data-reset-tile-role='source'] *, [data-reset-tile-role='target'] [draggable='true'] * { background-color: transparent !important; color: inherit !important; }",
  "[onclick*='dragtarget'] *, [onkeydown*='dragtarget'] *, [ondragover*='dragtarget'] *, [onclick*='dragenter'] *, [onkeydown*='dragenter'] *, [ondragover*='dragenter'] *, [data-reset-tile-role='target'] * { background-color: transparent !important; color: inherit !important; }",
  "span[style*='border: 3px dotted'][style*='padding: 1rem'][style*='vertical-align: middle'] * { background-color: transparent !important; color: inherit !important; }",
  "[onclick*='dragtarget'] > *, [onkeydown*='dragtarget'] > *, [ondragover*='dragtarget'] > *,",
  "[onclick*='dragenter'] > *, [onkeydown*='dragenter'] > *, [ondragover*='dragenter'] > * { border-radius: var(--lia-tile-radius) !important; display: inline-flex; align-items: center; justify-content: center; width: 100%; text-align: center; margin-inline: auto; }",
  "[data-reset-tile-role='target'] [onclick*='dragsource'], [data-reset-tile-role='target'] [onkeydown*='dragsource'], [data-reset-tile-role='target'] [draggable='true'] { display: inline-flex; align-items: center; justify-content: center; width: 100%; text-align: center; margin-inline: auto; }",
  ".lia-target-placeholder { color: var(--lia-theme-color, var(--lia-primary, var(--md-primary-fg-color, var(--color-primary, currentColor)))) !important; }",
  ".lia-target-placeholder *, .lia-target-placeholder [data-reset-tile-role='source'], .lia-target-placeholder [draggable='true'] { color: inherit !important; background-color: transparent !important; }",
  "[onclick*='dragsource'] > *, [onkeydown*='dragsource'] > *, [ondragstart*='dragsource'] > * { border-radius: var(--lia-tile-radius) !important; }",
].join("\n");

export function ensureRoundedTileStyles(): void {
  const existing = document.querySelector("style[data-lia-tile-rounded='1']");
  if ((window as any).__liaTileCrossRoundedStylesApplied && existing) return;
  (window as any).__liaTileCrossRoundedStylesApplied = 1;

  const style = document.createElement("style");
  style.setAttribute("data-lia-tile-rounded", "1");
  style.textContent = TILE_STYLES;
  (document.head || document.documentElement).appendChild(style);
}
