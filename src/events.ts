// events.ts — Global event listeners: drag lifecycle, drop handling, dblclick clear,
// frozen-quiz interaction blocking, and style-repair on navigation.

import { dlog } from "./debug";
import {
  norm, sourceFromNode, tileRootFrom, quizNodeFrom, quizKeyFrom,
  findTargetFromNode, findTargetFromPoint, targetDisplayText,
  applyThemeColorToTargetPlaceholders, isSolvedOrResolvedQuizNode,
} from "./dom";
import { applyTileStateDirectly, emulateLocalDrop, setupStandaloneKachelAreas, rememberAssignedSource } from "./tile";
import {
  freezeResolvedQuizzesInDocument, rememberFrozenQuiz,
  isQuizSuccessState, handleCheckButtonClick,
} from "./freeze";
import { installTouchHandlers } from "./touch";
import { ensureRoundedTileStyles } from "./styles";

export function installAllEventListeners(): void {
  // ── Shared drag/pointer state ──────────────────────────────────────────────
  let draggedText = "";
  let draggedRoot: Element | null = null;
  let draggedEl: Element | null = null;
  let draggedQuizKey = "";
  let pointerText = "";
  let pointerRoot: Element | null = null;
  let pointerEl: Element | null = null;
  let pointerQuizKey = "";
  let clearStateTimer = 0;
  let lastEmuTs = 0;
  let lastDragOverTarget: Element | null = null;
  let lastDragOverTs = 0;
  let lastHandledDropTs = 0;
  let lastDirectClearTs = 0;

  const lastEmuTsRef = { value: lastEmuTs };

  function clearState(reason: string): void {
    dlog("clear state; reason=" + String(reason || "unknown"));
    draggedText = ""; draggedRoot = null; draggedEl = null; draggedQuizKey = "";
    pointerText = ""; pointerRoot = null; pointerEl = null; pointerQuizKey = "";
  }

  function scheduleClearState(reason: string, delay: number): void {
    if (clearStateTimer) { try { window.clearTimeout(clearStateTimer); } catch (e) {} }
    clearStateTimer = window.setTimeout(() => { clearState(reason); clearStateTimer = 0; }, Number(delay || 0));
  }

  function blockIfFrozenQuizEvent(ev: Event, label: string): boolean {
    const quiz = (ev as any).target?.closest?.(".lia-quiz, lia-quiz");
    if (!quiz) return false;
    const frozenAttr = String(quiz.getAttribute?.("data-kf-frozen") || "") === "1";
    if (!frozenAttr && !isSolvedOrResolvedQuizNode(quiz)) return false;
    try { ev.preventDefault(); } catch (e) {}
    try { ev.stopPropagation(); } catch (e) {}
    try { (ev as any).stopImmediatePropagation?.(); } catch (e) {}
    dlog("kf: blocked frozen interaction kind='" + label + "'");
    return true;
  }

  // ── Style repair scheduler ────────────────────────────────────────────────
  let __kfRepairTimer = 0;
  function scheduleStyleRepair(reason: string, delay: number): void {
    if (__kfRepairTimer) { try { window.clearTimeout(__kfRepairTimer); } catch (e) {} }
    __kfRepairTimer = window.setTimeout(() => {
      __kfRepairTimer = 0;
      try { ensureRoundedTileStyles(); } catch (e) {}
      try { applyThemeColorToTargetPlaceholders(document); } catch (e) {}
      try { if (typeof window.__liaResetRefreshTileTargetStyles === "function") window.__liaResetRefreshTileTargetStyles(document); } catch (e) {}
      try { setupStandaloneKachelAreas(document); } catch (e) {}
      try { freezeResolvedQuizzesInDocument("style-repair"); } catch (e) {}
      dlog("kf: style-repair reason='" + reason + "'");
    }, Number(delay || 0));
  }

  window.addEventListener("hashchange", () => {
    scheduleStyleRepair("hashchange-30", 30);
    scheduleStyleRepair("hashchange-220", 220);
    scheduleStyleRepair("hashchange-700", 700);
  }, true);
  window.addEventListener("popstate", () => {
    scheduleStyleRepair("popstate-30", 30);
    scheduleStyleRepair("popstate-220", 220);
  }, true);
  window.addEventListener("pageshow", () => {
    scheduleStyleRepair("pageshow-40", 40);
    scheduleStyleRepair("pageshow-260", 260);
  }, true);

  // ── Navigation MutationObserver ───────────────────────────────────────────
  try {
    const navRoot = document.body || document.documentElement;
    if (navRoot && !(window as any).__liaKfNavObserverInstalled) {
      (window as any).__liaKfNavObserverInstalled = 1;
      let navPending = 0;
      const navObs = new MutationObserver(mutations => {
        if (navPending) return;
        for (const m of mutations) {
          if (!m.addedNodes.length && !m.removedNodes.length) continue;
          navPending = 1;
          scheduleStyleRepair("dom-mutation", 80);
          window.setTimeout(() => { navPending = 0; }, 220);
          break;
        }
      });
      navObs.observe(navRoot, { childList: true, subtree: true });
    }
  } catch (e) {}

  // ── Frozen interaction blocking ───────────────────────────────────────────
  document.addEventListener("dragstart", (ev) => { if (blockIfFrozenQuizEvent(ev, "dragstart-frozen")) return; }, true);
  document.addEventListener("touchstart", (ev) => { if (blockIfFrozenQuizEvent(ev, "touchstart-frozen")) return; }, { capture: true, passive: false } as any);
  document.addEventListener("drop", (ev) => { if (blockIfFrozenQuizEvent(ev, "drop-frozen")) return; }, true);

  // ── pointerdown (track source) ────────────────────────────────────────────
  document.addEventListener("pointerdown", (ev) => {
    const el = sourceFromNode(ev.target as Element);
    if (!el) return;
    pointerText = norm(el.textContent);
    pointerRoot = tileRootFrom(el);
    pointerEl = el;
    pointerQuizKey = quizKeyFrom(el);
    dlog("pointerdown source text='" + pointerText + "' quizKey='" + String(pointerQuizKey || "") + "'");
  }, true);

  // ── dragstart ─────────────────────────────────────────────────────────────
  document.addEventListener("dragstart", (ev) => {
    const el = (ev.target as Element)?.closest?.("[onclick],[onkeydown],[ondragstart],[draggable],[data-reset-tile-role='source']") || null;
    if (!el) return;
    draggedText = norm(el.textContent);
    draggedRoot = quizNodeFrom(el) || tileRootFrom(el);
    draggedEl = el;
    draggedQuizKey = quizKeyFrom(el);
    lastDragOverTarget = null; lastDragOverTs = 0;
    dlog("dragstart text='" + draggedText + "' quizKey='" + String(draggedQuizKey || "") + "'");
  }, true);

  // ── dragover ──────────────────────────────────────────────────────────────
  document.addEventListener("dragover", (ev) => {
    const activeText = draggedText || pointerText;
    if (!activeText) return;
    const t = findTargetFromNode(ev.target as Element);
    if (!t) return;
    lastDragOverTarget = t; lastDragOverTs = Date.now();
  }, true);

  // ── dragleave ─────────────────────────────────────────────────────────────
  document.addEventListener("dragleave", (ev) => {
    if (!lastDragOverTarget) return;
    const t = findTargetFromNode(ev.target as Element);
    if (!t || t !== lastDragOverTarget) return;
    const related = (ev as DragEvent).relatedTarget as Element | null;
    if (related && lastDragOverTarget.contains?.(related)) return;
    lastDragOverTarget = null; lastDragOverTs = 0;
  }, true);

  // ── dragend ───────────────────────────────────────────────────────────────
  document.addEventListener("dragend", () => {
    const activeText = draggedText || pointerText;
    const activeRoot = draggedRoot || pointerRoot;
    if ((Date.now() - lastDirectClearTs) < 700) { scheduleClearState("dragend-after-clear", 80); lastDragOverTarget = null; lastDragOverTs = 0; return; }
    if (activeText && !draggedEl && !pointerEl) { scheduleClearState("dragend-stale", 80); lastDragOverTarget = null; lastDragOverTs = 0; return; }
    if ((Date.now() - lastHandledDropTs) < 260) { scheduleClearState("dragend-after-drop", 140); lastDragOverTarget = null; lastDragOverTs = 0; return; }
    if (activeText && lastDragOverTarget && (Date.now() - lastDragOverTs) < 1400) {
      const targetRoot = tileRootFrom(lastDragOverTarget);
      const sourceNode = draggedEl || pointerEl || null;
      const sourceRoot = (sourceNode ? tileRootFrom(sourceNode) : null) || (activeRoot ? tileRootFrom(activeRoot) : null) || null;
      const crossRoot = !!sourceRoot && !!targetRoot && sourceRoot !== targetRoot;
      if (!crossRoot) { scheduleClearState("dragend-no-cross", 160); lastDragOverTarget = null; lastDragOverTs = 0; return; }
      emulateLocalDrop(lastDragOverTarget, activeText, activeRoot, "dragend", draggedEl, pointerEl, draggedQuizKey, pointerQuizKey, lastEmuTsRef);
      scheduleClearState("dragend-fallback", 180);
    } else {
      scheduleClearState("dragend", 700);
    }
    lastDragOverTarget = null; lastDragOverTs = 0;
  }, true);

  // ── drop ──────────────────────────────────────────────────────────────────
  document.addEventListener("drop", (ev) => {
    if ((window as any).__liaTileCrossInternalDispatch) return;
    const pointTarget = findTargetFromPoint(Number((ev as MouseEvent).clientX), Number((ev as MouseEvent).clientY));
    const nodeTarget = findTargetFromNode(ev.target as Element);
    const recentDragOver = lastDragOverTarget && (Date.now() - lastDragOverTs) < 1400 ? lastDragOverTarget : null;
    const target = pointTarget || nodeTarget || recentDragOver || null;
    if (!target) return;
    const activeText = draggedText || pointerText;
    const activeRoot = draggedRoot || pointerRoot;
    if (!activeText) return;
    const targetRoot = tileRootFrom(target);
    const sourceNode = draggedEl || pointerEl || null;
    const sourceRoot = (sourceNode ? tileRootFrom(sourceNode) : null) || (activeRoot ? tileRootFrom(activeRoot) : null) || null;
    const isCrossRoot = !!sourceRoot && !!targetRoot && sourceRoot !== targetRoot;
    if (!isCrossRoot) {
      if (sourceNode) rememberAssignedSource(target, sourceNode, activeText, "drop-native");
      lastHandledDropTs = Date.now(); lastDragOverTarget = null; lastDragOverTs = 0;
      scheduleClearState("drop-native", 220);
      return;
    }
    try { ev.preventDefault(); } catch (e) {}
    try { ev.stopPropagation(); } catch (e) {}
    try { (ev as any).stopImmediatePropagation?.(); } catch (e) {}
    emulateLocalDrop(target, activeText, activeRoot, "drop", draggedEl, pointerEl, draggedQuizKey, pointerQuizKey, lastEmuTsRef);
    lastHandledDropTs = Date.now(); lastDragOverTarget = null; lastDragOverTs = 0;
    scheduleClearState("drop-handled", 80);
  }, true);

  // ── dblclick (clear target) ───────────────────────────────────────────────
  document.addEventListener("dblclick", (ev) => {
    if ((window as any).__liaTileCrossInternalDispatch) return;
    const target = findTargetFromNode(ev.target as Element);
    if (!target) return;
    if ((window as any).__liaKfBlockDblclickClear !== false) {
      dlog("kf: dblclick blocked");
      try { ev.preventDefault(); } catch (e) {}
      try { ev.stopPropagation(); } catch (e) {}
      try { (ev as any).stopImmediatePropagation?.(); } catch (e) {}
      return;
    }
    const currentText = targetDisplayText(target);
    if (!currentText) return;
    const cleared = applyTileStateDirectly(target, "", "dblclick-clear", currentText);
    if (!cleared) return;
    lastHandledDropTs = Date.now(); lastDirectClearTs = Date.now();
    lastDragOverTarget = null; lastDragOverTs = 0;
    clearState("dblclick-clear-immediate");
    scheduleClearState("dblclick-clear", 120);
    window.setTimeout(() => {
      const rootNode = tileRootFrom(target);
      if (!rootNode || !targetDisplayText(target)) return;
      applyTileStateDirectly(target, "", "dblclick-force-t40", currentText);
    }, 40);
    try { applyThemeColorToTargetPlaceholders(document); } catch (e) {}
    try { (ev as any).stopImmediatePropagation?.(); } catch (e) {}
  }, true);

  // ── pointerup (keyboard/mouse drop fallback) ──────────────────────────────
  document.addEventListener("pointerup", (ev: PointerEvent) => {
    if ((window as any).__liaTileCrossInternalDispatch) return;
    if (String(ev?.pointerType || "").toLowerCase() === "touch") return;
    if (Number(ev?.detail || 0) > 1) return;
    if ((Date.now() - lastHandledDropTs) < 260) return;
    if (draggedText) return;
    const recentDragOver = lastDragOverTarget && (Date.now() - lastDragOverTs) < 1400 ? lastDragOverTarget : null;
    if (!recentDragOver) return;
    const activeText = draggedText || pointerText;
    const activeRoot = draggedRoot || pointerRoot;
    if (!activeText) return;
    const pointTarget = findTargetFromPoint(Number(ev.clientX), Number(ev.clientY));
    const nodeTarget = findTargetFromNode(ev.target as Element);
    const target = pointTarget || nodeTarget || recentDragOver;
    if (!target) return;
    if (recentDragOver && target !== recentDragOver) return;
    emulateLocalDrop(target, activeText, activeRoot, "pointerup", draggedEl, pointerEl, draggedQuizKey, pointerQuizKey, lastEmuTsRef);
    scheduleClearState("pointerup-handled", 120);
  }, true);

  // ── click on check/resolve buttons ───────────────────────────────────────
  document.addEventListener("click", (ev: MouseEvent) => {
    const actionBtn = (ev.target as Element)?.closest?.(".lia-quiz__check, .lia-quiz__resolve");
    if (blockIfFrozenQuizEvent(ev, "click-frozen")) return;
    if (actionBtn) {
      const actionQuiz = actionBtn.closest?.(".lia-quiz, lia-quiz") || null;
      const actionRoot = tileRootFrom(actionBtn) || (actionQuiz ? tileRootFrom(actionQuiz) : null);
      const isResolveAction = actionBtn.classList?.contains("lia-quiz__resolve");
      if (isResolveAction) {
        rememberFrozenQuiz(actionQuiz, actionRoot, "resolve-click");
        window.setTimeout(() => { try { freezeResolvedQuizzesInDocument("resolve-60"); } catch (e) {} }, 60);
      }
      for (const delay of [30, 180, 420]) {
        window.setTimeout(() => {
          try { applyThemeColorToTargetPlaceholders(document); } catch (e) {}
          try { if (typeof window.__liaResetRefreshTileTargetStyles === "function") window.__liaResetRefreshTileTargetStyles(document); } catch (e) {}
        }, delay);
      }
      if (!isResolveAction) {
        window.setTimeout(() => {
          const q = actionQuiz?.isConnected ? actionQuiz : actionBtn.closest?.(".lia-quiz, lia-quiz") || null;
          const r = tileRootFrom(actionBtn) || (q ? tileRootFrom(q) : null);
          if (isQuizSuccessState(q)) rememberFrozenQuiz(q, r, "check-success");
        }, 80);
      }
      for (const delay of [90, 320, 760]) {
        window.setTimeout(() => { try { freezeResolvedQuizzesInDocument("action-" + delay); } catch (e) {} }, delay);
      }
    }

    const btn = (ev.target as Element)?.closest?.(".lia-quiz__check");
    if (btn) handleCheckButtonClick(ev, btn);
  }, true);

  // ── Touch handlers ────────────────────────────────────────────────────────
  installTouchHandlers({
    pointerText: () => pointerText,
    pointerRoot: () => pointerRoot,
    pointerEl: () => pointerEl,
    pointerQuizKey: () => pointerQuizKey,
    draggedText: () => draggedText,
    draggedRoot: () => draggedRoot,
    draggedEl: () => draggedEl,
    setPointer: (text, root, el, key) => { pointerText = text; pointerRoot = root; pointerEl = el; pointerQuizKey = key; },
    lastDragOverTarget: () => lastDragOverTarget,
    lastDragOverTs: () => lastDragOverTs,
    setLastDragOver: (target, ts) => { lastDragOverTarget = target; lastDragOverTs = ts; },
    lastHandledDropTs: () => lastHandledDropTs,
    setLastHandledDropTs: (ts) => { lastHandledDropTs = ts; },
    scheduleClearState,
    lastEmuTsRef,
  });
}

