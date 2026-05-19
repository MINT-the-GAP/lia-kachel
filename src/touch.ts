import { dlog } from "./debug";
import { norm, sourceFromNode, tileRootFrom, findTargetFromNode, findTargetFromPoint, isManagedKachelTouchRoot, applyThemeColorToTargetPlaceholders } from "./dom";
import { applyTileStateDirectly, emulateLocalDrop } from "./tile";

let touchDragActive = false;
let touchDragMoved = false;
let touchStartX = 0;
let touchStartY = 0;
let touchSourceEl: Element | null = null;
let touchSourceTarget: Element | null = null;
let touchHoverTarget: Element | null = null;
let touchGhostEl: Element | null = null;

export function resetTouchDragState(): void {
  touchDragActive = false;
  touchDragMoved = false;
  touchStartX = 0;
  touchStartY = 0;
  touchSourceEl = null;
  touchSourceTarget = null;
  touchHoverTarget = null;
  if (touchGhostEl?.parentNode) {
    try { touchGhostEl.parentNode.removeChild(touchGhostEl); } catch (e) {}
  }
  touchGhostEl = null;
}

function ensureTouchGhost(sourceEl: Element | null, fallbackText: string): Element {
  if (touchGhostEl?.parentNode) return touchGhostEl;
  let ghost: Element | null = null;
  if (sourceEl) {
    try {
      ghost = sourceEl.cloneNode(true) as Element;
      ghost.removeAttribute("id");
      Array.from(ghost.querySelectorAll?.("[id]") || []).forEach(el => { try { el.removeAttribute("id"); } catch (e) {} });
    } catch (e) { ghost = null; }
  }
  if (!ghost) {
    ghost = document.createElement("div");
    (ghost as HTMLElement).textContent = String(fallbackText || "");
  }
  ghost.classList.add("lia-touch-ghost");
  const s = (ghost as HTMLElement).style;
  s.position = "fixed"; s.left = "0"; s.top = "0";
  s.transform = "translate(-50%, -50%)"; s.pointerEvents = "none";
  s.zIndex = "2147483647"; s.opacity = "0.5"; s.margin = "0"; s.touchAction = "none";
  if (sourceEl && typeof (sourceEl as HTMLElement).getBoundingClientRect === "function") {
    const rect = (sourceEl as HTMLElement).getBoundingClientRect();
    if (rect?.width > 0) s.width = rect.width + "px";
    if (rect?.height > 0) s.height = rect.height + "px";
  }
  (document.body || document.documentElement).appendChild(ghost);
  touchGhostEl = ghost;
  return ghost;
}

function moveTouchGhost(x: number, y: number): void {
  if (!touchGhostEl || !Number.isFinite(x) || !Number.isFinite(y)) return;
  try {
    (touchGhostEl as HTMLElement).style.left = x + "px";
    (touchGhostEl as HTMLElement).style.top = y + "px";
  } catch (e) {}
}

function markSourceAsUsedAfterTouchDrop(sourceEl: Element, target: Element): void {
  const sourceNode = sourceFromNode(sourceEl) || sourceEl;
  if (findTargetFromNode(sourceNode)) return;
  if (target && (target === sourceNode || target.contains?.(sourceNode))) return;
  try { sourceNode.setAttribute("aria-hidden", "true"); } catch (e) {}
  try { sourceNode.setAttribute("draggable", "false"); } catch (e) {}
  (sourceNode as HTMLElement).style.pointerEvents = "none";
  (sourceNode as HTMLElement).style.display = "none";
}

function clearTargetBySource(sourceEl: Element, origin: string): boolean {
  const target = findTargetFromNode(sourceEl);
  if (!target) return false;
  const ok = applyTileStateDirectly(target, "", origin || "touch-clear");
  if (ok) {
    try { applyThemeColorToTargetPlaceholders(document); } catch (e) {}
    try { if (typeof window.__liaResetRefreshTileTargetStyles === "function") window.__liaResetRefreshTileTargetStyles(document); } catch (e) {}
  }
  return ok;
}

function primaryTouch(ev: TouchEvent): Touch | null {
  if (ev.changedTouches?.length) return ev.changedTouches[0];
  if (ev.touches?.length) return ev.touches[0];
  return null;
}

export interface TouchHandlerDeps {
  pointerText: () => string;
  pointerRoot: () => Element | null;
  pointerEl: () => Element | null;
  pointerQuizKey: () => string;
  draggedText: () => string;
  draggedRoot: () => Element | null;
  setPointer: (text: string, root: Element | null, el: Element | null, key: string) => void;
  lastDragOverTarget: () => Element | null;
  lastDragOverTs: () => number;
  setLastDragOver: (target: Element | null, ts: number) => void;
  lastHandledDropTs: () => number;
  setLastHandledDropTs: (ts: number) => void;
  scheduleClearState: (reason: string, delay: number) => void;
  lastEmuTsRef: { value: number };
  draggedEl: () => Element | null;
}

export function installTouchHandlers(deps: TouchHandlerDeps): void {
  document.addEventListener("touchstart", function (ev: TouchEvent) {
    if ((window as any).__liaTileCrossInternalDispatch) return;
    if (!ev || (ev.touches?.length ?? 0) > 1) return;
    const t = primaryTouch(ev);
    if (!t) return;
    const hit = typeof document.elementFromPoint === "function" ? document.elementFromPoint(t.clientX, t.clientY) : null;
    const sourceEl = sourceFromNode(hit as Element || ev.target as Element);
    if (!sourceEl) return;
    const sourceRoot = tileRootFrom(sourceEl) || null;

    touchDragActive = true;
    touchDragMoved = false;
    touchStartX = Number(t.clientX) || 0;
    touchStartY = Number(t.clientY) || 0;
    touchSourceEl = sourceEl;
    touchSourceTarget = findTargetFromNode(sourceEl);
    touchHoverTarget = null;

    deps.setPointer(norm(sourceEl.textContent), sourceRoot, sourceEl, "");
    deps.setLastDragOver(null, 0);

    ensureTouchGhost(sourceEl, (sourceEl as HTMLElement).textContent || "");
    moveTouchGhost(Number(t.clientX) || 0, Number(t.clientY) || 0);
    dlog("touchstart source text='" + norm(sourceEl.textContent) + "' inTarget=" + (touchSourceTarget ? 1 : 0));
    try { ev.preventDefault(); } catch (e) {}
  }, { capture: true, passive: false });

  document.addEventListener("touchmove", function (ev: TouchEvent) {
    if (!touchDragActive) return;
    const t = primaryTouch(ev);
    if (!t) return;
    const dx = Math.abs((Number(t.clientX) || 0) - touchStartX);
    const dy = Math.abs((Number(t.clientY) || 0) - touchStartY);
    if (!touchDragMoved && (dx > 6 || dy > 6)) touchDragMoved = true;
    moveTouchGhost(Number(t.clientX) || 0, Number(t.clientY) || 0);
    const hover = findTargetFromPoint(Number(t.clientX), Number(t.clientY));
    if (hover) deps.setLastDragOver(hover, Date.now());
    if (hover !== touchHoverTarget) { touchHoverTarget = hover; dlog("touchmove hover target=" + (hover ? 1 : 0)); }
    try { ev.preventDefault(); } catch (e) {}
  }, { capture: true, passive: false });

  document.addEventListener("touchend", function (ev: TouchEvent) {
    if (!touchDragActive) return;
    if ((window as any).__liaTileCrossInternalDispatch) { resetTouchDragState(); return; }

    const t = primaryTouch(ev);
    const pointTarget = t ? findTargetFromPoint(Number(t.clientX), Number(t.clientY)) : null;
    const recentDragOverTarget = deps.lastDragOverTarget() && (Date.now() - deps.lastDragOverTs()) < 1400 ? deps.lastDragOverTarget() : null;
    const target = pointTarget || recentDragOverTarget || null;
    const activeText = deps.draggedText() || deps.pointerText();
    const activeRoot = deps.draggedRoot() || deps.pointerRoot();
    const managedTouchRoot = isManagedKachelTouchRoot(activeRoot);

    if (target && activeText) {
      const sourceTarget = touchSourceTarget || null;
      if (managedTouchRoot && sourceTarget && sourceTarget !== target && touchSourceEl) {
        clearTargetBySource(touchSourceEl, "touchend-move-clear");
      }
      const dropped = managedTouchRoot
        ? applyTileStateDirectly(target, activeText, "touchend-drop")
        : (emulateLocalDrop(target, activeText, activeRoot, "touchend-drop", deps.draggedEl(), deps.pointerEl(), "", "", deps.lastEmuTsRef), true);
      if (managedTouchRoot && dropped && touchSourceEl) markSourceAsUsedAfterTouchDrop(touchSourceEl, target);
      try { applyThemeColorToTargetPlaceholders(document); } catch (e) {}
      try { if (typeof window.__liaResetRefreshTileTargetStyles === "function") window.__liaResetRefreshTileTargetStyles(document); } catch (e) {}
      dlog("touchend drop target=1 managed=" + (managedTouchRoot ? 1 : 0) + " ok=" + (dropped ? 1 : 0) + " text='" + activeText + "'");
      deps.setLastHandledDropTs(Date.now());
      deps.scheduleClearState("touchend-drop", 120);
    } else if (managedTouchRoot && touchSourceTarget && touchSourceEl) {
      const cleared = clearTargetBySource(touchSourceEl, "touchend-clear");
      dlog("touchend clear-by-drag=" + (cleared ? 1 : 0));
      if (cleared) { deps.setLastHandledDropTs(Date.now()); deps.scheduleClearState("touchend-clear", 120); }
      else deps.scheduleClearState("touchend-no-clear", 260);
    } else {
      deps.scheduleClearState("touchend", 260);
    }

    deps.setLastDragOver(null, 0);
    resetTouchDragState();
    try { ev.preventDefault(); } catch (e) {}
  }, { capture: true, passive: false });

  document.addEventListener("touchcancel", function () {
    if (!touchDragActive) return;
    dlog("touchcancel; clear state");
    deps.scheduleClearState("touchcancel", 120);
    deps.setLastDragOver(null, 0);
    resetTouchDragState();
  }, { capture: true, passive: false });
}

declare global {
  interface Window {
    __liaResetRefreshTileTargetStyles?: (doc: Document) => void;
  }
}
