// lia-Kachel — LiaScript drag-and-drop tile quiz plugin
// Provides: rounded tile styles, touch drag-drop, cross-root drop emulation,
// order-insensitive Kachelfolge grading, and quiz freeze on solve/resolve.

import { initDebug, dlog } from "./debug";
import { ensureRoundedTileStyles } from "./styles";
import { applyThemeColorToTargetPlaceholders } from "./dom";
import { setupStandaloneKachelAreas, bootstrapTileStateObservers } from "./tile";
import { initFreezeStores, freezeResolvedQuizzesInDocument } from "./freeze";
import { installAllEventListeners } from "./events";

declare global {
  interface Window {
    __liaTileCrossPatched?: number;
    __liaKachelfolgeExpected: Record<string, string[]>;
    __liaKfAssignedSources: WeakMap<Element, { sourceEl: Element; text: string; sourceId: number | null; ts: number; reason: string }>;
  }
}

function boot(): void {
  if (window.__liaTileCrossPatched) return;
  window.__liaTileCrossPatched = 1;

  initDebug();
  initFreezeStores();

  window.__liaKachelfolgeExpected = window.__liaKachelfolgeExpected || {};
  window.__liaKfAssignedSources = window.__liaKfAssignedSources || new WeakMap();

  ensureRoundedTileStyles();

  // Apply accent color to existing target placeholders after a short delay
  // to let the LiaScript theme load first.
  window.setTimeout(() => applyThemeColorToTargetPlaceholders(document), 60);
  window.setTimeout(() => applyThemeColorToTargetPlaceholders(document), 500);
  window.setTimeout(() => applyThemeColorToTargetPlaceholders(document), 1100);

  // Discover standalone <div class="Kachel"> areas and register expected answers.
  window.setTimeout(() => setupStandaloneKachelAreas(document), 120);
  window.setTimeout(() => setupStandaloneKachelAreas(document), 520);
  window.setTimeout(() => setupStandaloneKachelAreas(document), 1100);

  // Bootstrap tile state observers (for debug logging).
  window.setTimeout(() => bootstrapTileStateObservers(), 160);
  window.setTimeout(() => bootstrapTileStateObservers(), 760);
  window.setTimeout(() => bootstrapTileStateObservers(), 1500);

  // Freeze any already-solved quizzes that survived a page reload.
  window.setTimeout(() => freezeResolvedQuizzesInDocument("init-freeze-120"), 120);
  window.setTimeout(() => freezeResolvedQuizzesInDocument("init-freeze-620"), 620);

  installAllEventListeners();

  dlog("patch active");
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  setTimeout(boot, 0);
}
