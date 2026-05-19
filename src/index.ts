// lia-Kachel — LiaScript drag-and-drop tile quiz plugin
// Provides: rounded tile styles, touch drag-drop, cross-root drop emulation,
// order-insensitive Kachelfolge grading, and quiz freeze on solve/resolve.

import { initDebug, dlog } from "./debug";
import { ensureRoundedTileStyles } from "./styles";
import { applyThemeColorToTargetPlaceholders } from "./dom";
import { setupStandaloneKachelAreas, bootstrapTileStateObservers } from "./tile";
import { initFreezeStores, freezeResolvedQuizzesInDocument } from "./freeze";
import { installAllEventListeners } from "./events";

function boot(): void {
  if (window.__liaTileCrossPatched) return;
  window.__liaTileCrossPatched = 1;

  initDebug();
  initFreezeStores();

  window.__liaKachelfolgeExpected = window.__liaKachelfolgeExpected || {};
  window.__liaKfAssignedSources = window.__liaKfAssignedSources || new WeakMap();

  ensureRoundedTileStyles();

  // LiaScript renders slides progressively after DOMContentLoaded, so setup
  // functions run at three increasing delays to catch late-appearing elements.
  // All functions are idempotent — repeated calls are safe.
  const RETRY_DELAYS = [60, 520, 1100] as const;
  for (const delay of RETRY_DELAYS) {
    window.setTimeout(() => {
      applyThemeColorToTargetPlaceholders(document);
      setupStandaloneKachelAreas(document);
      bootstrapTileStateObservers();
      freezeResolvedQuizzesInDocument("init-freeze-" + delay);
    }, delay);
  }

  installAllEventListeners();

  dlog("patch active");
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  setTimeout(boot, 0);
}
