// tile.ts — Tile state management: direct DOM apply, cross-root drop emulation,
// source resolution, and standalone Kachel area setup.

import { dlog } from "./debug";
import {
  norm, normKey, pickAccentFrom,
  targetNodes, sourceCandidates, isInsideAnyTarget,
  targetDisplayText, tileRootFrom, quizKeyFrom,
  extractTargetId, extractSourceId, rectCenter, dist2,
  invokeInlineHandler, sendLiaPayloadFromAttr,
  triggerClick, applyThemeColorToTargetPlaceholders,
  expectedTextsByTargetIds,
} from "./dom";

// ── State observers ──────────────────────────────────────────────────────────

const __kfStateObservedRoots = new WeakSet<Element>();
const __kfStateSignatures = new WeakMap<Element, string>();
let __kfInlineExpectedBlocksPromise: Promise<string[][] | null> | null = null;

function tileStateSignature(targets: string[], sources: string[]): string {
  return targets.join("|") + " || " + sources.join("|");
}

function logTileState(root: Element, reason: string, force: boolean): void {
  const targets = targetNodes(root).map(t => targetDisplayText(t) || "✛");
  const outside = sourceCandidates(root).filter(s => !isInsideAnyTarget(s, targetNodes(root))).map(s => norm(s.textContent) || "").filter(Boolean);
  const sig = tileStateSignature(targets, outside);
  const prev = __kfStateSignatures.get(root) || "";
  if (!force && sig === prev) return;
  __kfStateSignatures.set(root, sig);
  dlog("kf: state reason='" + reason + "' targets='" + targets.join("|") + "' sources='" + outside.join("|") + "'");
}

export function ensureTileStateObserver(root: Element, reason: string): void {
  if (!root) return;
  if (__kfStateObservedRoots.has(root)) {
    logTileState(root, reason || "observer-known", false);
    return;
  }
  __kfStateObservedRoots.add(root);
  let pending = 0;
  try {
    const obs = new MutationObserver(() => {
      if (pending) return;
      pending = 1;
      window.setTimeout(() => { pending = 0; logTileState(root, "mutation", false); }, 0);
    });
    obs.observe(root, { subtree: true, childList: true, characterData: true, attributes: true });
  } catch (e) {}
  logTileState(root, reason || "observer-init", true);
}

export function bootstrapTileStateObservers(): void {
  const scope = document.body || document.documentElement;
  if (!scope) return;
  const candidates: Element[] = [];
  if (typeof window.__liaResetCollectTileQuizRoots === "function") {
    try { candidates.push(...(window.__liaResetCollectTileQuizRoots(scope) || [])); } catch (e) {}
  }
  try {
    scope.querySelectorAll(".Kachel, [id^='kachelfolge-wrap-'], .kachelfolge-wrap").forEach(el => candidates.push(el));
  } catch (e) {}
  const seen = new Set<Element>();
  for (const el of candidates) {
    if (!el || seen.has(el)) continue;
    seen.add(el);
    if (!targetNodes(el).length) continue;
    ensureTileStateObserver(el, "bootstrap");
  }
}

// ── Assigned source memory ───────────────────────────────────────────────────

export function rememberAssignedSource(target: Element, sourceEl: Element, text: string, reason: string): void {
  if (!target || !sourceEl) return;
  const entry = {
    sourceEl, text: norm(text || sourceEl.textContent), sourceId: extractSourceId(sourceEl),
    ts: Date.now(), reason: String(reason || "unknown"),
  };
  try { window.__liaKfAssignedSources.set(target, entry); } catch (e) {}
  dlog("kf: remember source reason='" + entry.reason + "' text='" + entry.text + "'");
}

// ── Source resolution ────────────────────────────────────────────────────────

export function resolveLocalSourceForTarget(target: Element, activeText: string, fallbackSource: Element | null, preferredSourceId: number | null): Element | null {
  const root = tileRootFrom(target);
  if (!root) return fallbackSource || null;

  const targets = targetNodes(root);
  const wanted = norm(activeText || "");
  const targetCenter = rectCenter(target);

  if (fallbackSource) {
    const fallbackText = norm(fallbackSource.textContent);
    const fallbackInsideTarget = isInsideAnyTarget(fallbackSource, targets);
    const fallbackId = extractSourceId(fallbackSource);
    const fallbackIdMatches = preferredSourceId === null || fallbackId === null || fallbackId === preferredSourceId;
    const fallbackSameRoot = root.contains(fallbackSource) || tileRootFrom(fallbackSource) === root;
    if (fallbackSameRoot && !fallbackInsideTarget && (!wanted || fallbackText === wanted) && fallbackIdMatches) {
      return fallbackSource;
    }
  }

  let best: Element | null = null;
  let bestDist = Number.POSITIVE_INFINITY;
  let bestIdMatch = false;

  for (const candidate of sourceCandidates(root)) {
    if (isInsideAnyTarget(candidate, targets)) continue;
    if (wanted && norm(candidate.textContent) !== wanted) continue;
    if ((candidate as HTMLElement).style?.display === "none") continue;
    const candId = extractSourceId(candidate);
    const idMatch = preferredSourceId !== null && candId !== null && candId === preferredSourceId;
    const d = dist2(rectCenter(candidate), targetCenter);
    if (idMatch && !bestIdMatch) { best = candidate; bestDist = d; bestIdMatch = true; }
    else if (idMatch === bestIdMatch && d < bestDist) { best = candidate; bestDist = d; }
  }

  return best || fallbackSource || null;
}

// ── Direct tile state application ────────────────────────────────────────────

function isUsableSourceTile(source: Element, targets: Element[]): boolean {
  if (isInsideAnyTarget(source, targets)) return false;
  const txt = norm(source.textContent);
  if (!txt || txt === "✛" || txt === "+") return false;
  const attrs = ["onclick", "onkeydown", "ondragstart", "ondragend"].map(n => String(source.getAttribute?.(n) || "")).join(" ").toLowerCase();
  if (attrs.includes("dragsource") || attrs.includes("dragend") || attrs.includes("dragstart")) return true;
  if (source.getAttribute?.("data-reset-tile-role") === "source") return true;
  if (String(source.getAttribute?.("draggable") || "").toLowerCase() === "true") return true;
  if (String(source.getAttribute?.("aria-hidden") || "").toLowerCase() === "true") return true;
  return false;
}

function sourceHost(source: Element, root: Element): Element {
  const parent = source.parentElement || null;
  if (
    parent && parent.parentElement === root &&
    parent.tagName.toUpperCase() === "DIV" &&
    parent.children.length === 1 &&
    parent.firstElementChild === source &&
    source.tagName.toUpperCase() === "SPAN" &&
    String(source.getAttribute?.("role") || "").toLowerCase() === "button" &&
    norm(parent.textContent) === norm(source.textContent)
  ) return parent;
  return source;
}

function sourceIsVisible(node: Element): boolean {
  const s = node as HTMLElement;
  return !(
    String(node.getAttribute?.("aria-hidden") || "").toLowerCase() === "true" ||
    s.style?.display?.toLowerCase() === "none" ||
    s.style?.pointerEvents?.toLowerCase() === "none" ||
    String(node.getAttribute?.("draggable") || "").toLowerCase() === "false"
  );
}

function revealSource(node: Element, host: Element): void {
  try { node.removeAttribute("aria-hidden"); } catch (e) {}
  try { node.setAttribute("draggable", "true"); } catch (e) {}
  try { (node as HTMLElement).style.pointerEvents = ""; } catch (e) {}
  try { (node as HTMLElement).style.display = ""; } catch (e) {}
  try { (node as HTMLElement).style.opacity = ""; } catch (e) {}
  try { (host as HTMLElement).style.pointerEvents = ""; } catch (e) {}
  try { (host as HTMLElement).style.display = ""; } catch (e) {}
  try { (host as HTMLElement).style.opacity = ""; } catch (e) {}
}

export function applyTileStateDirectly(target: Element, activeText: string, origin: string, forceReleaseLabelText?: string): boolean {
  const root = tileRootFrom(target);
  if (!root) return false;
  ensureTileStateObserver(root, "direct-attach");

  const targets = targetNodes(root);
  if (!targets.length) return false;

  const outsideSources = sourceCandidates(root).filter(s => isUsableSourceTile(s, targets));
  const poolAnchor = outsideSources.length ? sourceHost(outsideSources[0], root) : null;
  const poolParent = poolAnchor?.parentElement ?? root;

  let targetIndex = -1;
  for (let i = 0; i < targets.length; i++) {
    const c = targets[i];
    if (c === target || c.contains?.(target) || target.contains?.(c)) { targetIndex = i; break; }
  }
  if (targetIndex < 0) return false;

  function getTargetText(node: Element): string {
    const box = node.firstElementChild || node;
    return String((box as HTMLElement).textContent || "").replace(/\s+/g, " ").trim();
  }

  function setTileTargetDisplay(node: Element, value: string): void {
    const box = node.firstElementChild || node;
    try { (node as HTMLElement).style.setProperty("border-radius", "var(--lia-tile-radius)", "important"); } catch (e) {}
    try { (node as HTMLElement).style.setProperty("overflow", "hidden", "important"); } catch (e) {}
    try { (node as HTMLElement).style.setProperty("background-color", "var(--lia-tile-bg)", "important"); } catch (e) {}
    try { (node as HTMLElement).style.setProperty("display", "inline-flex", "important"); } catch (e) {}
    try { (node as HTMLElement).style.setProperty("align-items", "center", "important"); } catch (e) {}
    try { (node as HTMLElement).style.setProperty("justify-content", "center", "important"); } catch (e) {}
    try { (node as HTMLElement).style.setProperty("text-align", "center", "important"); } catch (e) {}
    try { (box as HTMLElement).style.setProperty("display", "inline-flex", "important"); } catch (e) {}
    try { (box as HTMLElement).style.setProperty("align-items", "center", "important"); } catch (e) {}
    try { (box as HTMLElement).style.setProperty("justify-content", "center", "important"); } catch (e) {}
    try { (box as HTMLElement).style.setProperty("background-color", "transparent", "important"); } catch (e) {}
    if (value) {
      (box as HTMLElement).textContent = value;
      try { node.classList.remove("lia-target-placeholder"); } catch (e) {}
      try { box.classList.remove("lia-target-placeholder"); } catch (e) {}
      (node as HTMLElement).style.color = "";
      (box as HTMLElement).style.color = "";
    } else {
      restoreNestedSources(node);
      const residualHosts: Element[] = [];
      const residualSel = "[onclick], [onkeydown], [ondragstart], [ondragend], [draggable], [data-reset-tile-role='source']";
      Array.from(node.querySelectorAll?.(residualSel) || []).forEach(src => {
        const host = sourceHost(src, root);
        if (host === node || host === box || !node.contains(host) || residualHosts.includes(host)) return;
        residualHosts.push(host);
      });
      residualHosts.forEach(h => { try { h.parentNode?.removeChild(h); } catch (e) {} });
      Array.from(node.childNodes || []).forEach(child => {
        if (child !== box) try { node.removeChild(child); } catch (e) {}
      });
      (box as HTMLElement).textContent = "✛";
      try { node.classList.add("lia-target-placeholder"); } catch (e) {}
      try { box.classList.add("lia-target-placeholder"); } catch (e) {}
      const accent = pickAccentFrom(document) || "";
      if (accent) {
        try { (node as HTMLElement).style.setProperty("color", accent, "important"); } catch (e) {}
        try { (box as HTMLElement).style.setProperty("color", accent, "important"); } catch (e) {}
      }
    }
    Array.from(node.querySelectorAll?.("[data-reset-tile-role='source'], [draggable='true']") || []).forEach(el => {
      if (value) {
        try { (el as HTMLElement).style.color = ""; } catch (e) {}
        try { (el as HTMLElement).style.backgroundColor = "transparent"; } catch (e) {}
      } else {
        const accent = pickAccentFrom(document) || "";
        if (accent) try { (el as HTMLElement).style.color = accent; } catch (e) {}
      }
    });
  }

  function restoreNestedSources(node: Element): void {
    if (!poolParent) return;
    const skipBox = node.firstElementChild || null;
    const nested = Array.from(node.querySelectorAll?.("[onclick], [onkeydown], [ondragstart], [ondragend], [draggable], [data-reset-tile-role='source']") || []).filter(src => {
      if (src === node || (skipBox && src === skipBox)) return false;
      if (!node.contains(src)) return false;
      const txt = norm(src.textContent);
      if (!txt || txt === "✛" || txt === "+") return false;
      const attrs = ["onclick", "onkeydown", "ondragstart", "ondragend"].map(n => String(src.getAttribute?.(n) || "")).join(" ").toLowerCase();
      return attrs.includes("dragsource") || attrs.includes("dragstart") || attrs.includes("dragend") ||
        src.getAttribute?.("data-reset-tile-role") === "source" ||
        String(src.getAttribute?.("draggable") || "").toLowerCase() === "true";
    });
    nested.forEach(src => {
      const host = sourceHost(src, root) || src;
      revealSource(src, host);
      try {
        if (poolAnchor?.parentElement === poolParent) poolParent.insertBefore(host, poolAnchor!);
        else poolParent.appendChild(host);
      } catch (e) { try { poolParent.appendChild(host); } catch (e2) {} }
    });
  }

  function reconcileSourceVisibility(values: string[]): void {
    const usedCounts: Record<string, number> = Object.create(null);
    for (const v of values) {
      const txt = norm(v);
      if (!txt || txt === "✛" || txt === "+") continue;
      usedCounts[txt] = (usedCounts[txt] || 0) + 1;
    }
    const liveOutside = sourceCandidates(root).filter(s => isUsableSourceTile(s, targets));
    const buckets: Record<string, Element[]> = Object.create(null);
    for (const s of liveOutside) {
      const label = norm(s.textContent);
      if (!label || label === "✛" || label === "+") continue;
      (buckets[label] = buckets[label] || []).push(s);
    }
    for (const [label, list] of Object.entries(buckets)) {
      const used = Math.max(0, usedCounts[label] || 0);
      list.forEach((source, i) => {
        if (i < used) {
          try { source.setAttribute("aria-hidden", "true"); } catch (e) {}
          try { source.setAttribute("draggable", "false"); } catch (e) {}
          try { (source as HTMLElement).style.pointerEvents = "none"; } catch (e) {}
          try { (source as HTMLElement).style.display = "none"; } catch (e) {}
        } else {
          try { source.removeAttribute("aria-hidden"); } catch (e) {}
          try { source.setAttribute("draggable", "true"); } catch (e) {}
          try { (source as HTMLElement).style.pointerEvents = ""; } catch (e) {}
          try { (source as HTMLElement).style.display = ""; } catch (e) {}
          try { (source as HTMLElement).style.opacity = ""; } catch (e) {}
        }
      });
    }
  }

  function forceReleaseLabel(label: string, preferredNode: Element): boolean {
    const wanted = norm(label);
    if (!wanted || wanted === "✛" || wanted === "+") return false;
    const outside = sourceCandidates(root).filter(s => isUsableSourceTile(s, targets) && norm(s.textContent) === wanted);
    if (outside.some(sourceIsVisible)) return true;
    const hidden = outside.find(s => !sourceIsVisible(s)) || null;
    if (hidden) {
      const host = sourceHost(hidden, root) || hidden;
      revealSource(hidden, host);
      try {
        if (host.parentElement !== poolParent) {
          if (poolAnchor?.parentElement === poolParent) poolParent.insertBefore(host, poolAnchor!);
          else poolParent.appendChild(host);
        }
      } catch (e) {}
      dlog("kf: force-release outside label='" + wanted + "'");
      return true;
    }
    const scopeNodes = [preferredNode, ...targets].filter(Boolean);
    for (const scope of scopeNodes) {
      const scopeBox = scope.firstElementChild || null;
      const nested = Array.from(scope.querySelectorAll?.("[onclick], [onkeydown], [ondragstart], [ondragend], [draggable], [data-reset-tile-role='source']") || []).filter(src => {
        if (src === scope || (scopeBox && src === scopeBox)) return false;
        if (!scope.contains(src) || norm(src.textContent) !== wanted) return false;
        const attrs = ["onclick", "onkeydown", "ondragstart", "ondragend"].map(n => String(src.getAttribute?.(n) || "")).join(" ").toLowerCase();
        return attrs.includes("dragsource") || attrs.includes("dragstart") || attrs.includes("dragend") ||
          src.getAttribute?.("data-reset-tile-role") === "source" ||
          String(src.getAttribute?.("draggable") || "").toLowerCase() === "true";
      });
      if (!nested.length) continue;
      const src = nested[0];
      const host = sourceHost(src, root) || src;
      revealSource(src, host);
      try {
        if (poolAnchor?.parentElement === poolParent) poolParent.insertBefore(host, poolAnchor!);
        else poolParent.appendChild(host);
      } catch (e) { try { poolParent.appendChild(host); } catch (e2) {} }
      dlog("kf: force-release nested label='" + wanted + "'");
      return true;
    }
    return false;
  }

  function createForcedSourceClone(label: string): boolean {
    const wanted = norm(label);
    if (!wanted || !poolParent) return false;
    if (wanted.length > 48 || /[.!?]/.test(wanted)) { dlog("kf: skip forced clone suspicious label='" + wanted + "'"); return false; }
    const preferredId = extractTargetId(targets[targetIndex]);
    const existingForced = sourceCandidates(root).find(s =>
      s.getAttribute?.("data-kf-forced-source") === "1" && norm(s.textContent) === wanted
    );
    if (existingForced) { revealSource(existingForced, sourceHost(existingForced, root)); dlog("kf: reuse forced clone label='" + wanted + "'"); return true; }
    let template = sourceCandidates(root).find(s => isUsableSourceTile(s, targets) && (norm(s.textContent) === wanted || (preferredId !== null && extractSourceId(s) === preferredId))) || null;
    if (!template) {
      template = Array.from(root.querySelectorAll?.("[onclick], [onkeydown], [ondragstart], [ondragend], [draggable], [data-reset-tile-role='source']") || []).find(s =>
        isUsableSourceTile(s, targets) && (norm(s.textContent) === wanted || (preferredId !== null && extractSourceId(s) === preferredId))
      ) || null;
    }
    if (!template) template = sourceCandidates(root).find(s => isUsableSourceTile(s, targets)) || null;
    if (!template) return false;

    const templateHost = sourceHost(template, root) || template;
    let clone: Element | null = null;
    try { clone = templateHost.cloneNode(true) as Element; } catch (e) { return false; }
    if (!clone) return false;
    try { clone.removeAttribute("id"); } catch (e) {}
    Array.from(clone.querySelectorAll?.("[id]") || []).forEach(el => { try { el.removeAttribute("id"); } catch (e) {} });
    [clone, ...Array.from(clone.querySelectorAll?.("*") || [])].forEach(el => {
      ["ondragover", "ondragleave", "ondrop"].forEach(a => { try { el.removeAttribute(a); } catch (e) {} });
      ["onclick", "onkeydown", "ondragstart", "ondragend"].forEach(a => {
        const raw = String(el.getAttribute?.(a) || "");
        if (!raw) return;
        if (/cmd\s*:\s*['\"](dragtarget|dragenter)['\"]/i.test(raw)) { try { el.removeAttribute(a); } catch (e) {} return; }
        let next = raw;
        if (preferredId !== null) next = next.replace(/(param\s*:\s*\{[^}]*id\s*:\s*)\d+/i, "$1" + preferredId);
        if (norm((el as HTMLElement).textContent) === norm(template!.textContent) || el === clone || !el.children.length) {
          try { (el as HTMLElement).textContent = String(label || wanted); } catch (e) {}
        }
        if (next !== raw) try { el.setAttribute(a, next); } catch (e) {}
      });
      try { el.classList.remove("lia-target-placeholder"); } catch (e) {}
    });
    try { clone.setAttribute("data-kf-forced-source", "1"); } catch (e) {}
    try { clone.removeAttribute("data-reset-tile-role"); } catch (e) {}
    Array.from(clone.querySelectorAll?.("[onclick], [onkeydown], [ondragstart], [ondragend], [draggable], [data-reset-tile-role='source']") || []).forEach(el => {
      try { el.setAttribute("data-reset-tile-role", "source"); } catch (e) {}
      try { el.setAttribute("draggable", "true"); } catch (e) {}
    });
    revealSource(clone, clone);
    try {
      if (poolAnchor?.parentElement === poolParent) poolParent.insertBefore(clone, poolAnchor!);
      else poolParent.appendChild(clone);
    } catch (e) { try { poolParent.appendChild(clone); } catch (e2) {} }
    dlog("kf: forced clone source label='" + wanted + "'");
    return true;
  }

  function restoreRememberedSource(node: Element, label: string): boolean {
    if (!node || !window.__liaKfAssignedSources) return false;
    const remembered = window.__liaKfAssignedSources.get(node);
    if (!remembered?.sourceEl) return false;
    const wanted = norm(label);
    const source = remembered.sourceEl;
    const host = sourceHost(source, root) || source;
    const sourceLabel = norm(remembered.text || source.textContent);
    if (wanted && sourceLabel && wanted !== sourceLabel) return false;
    revealSource(source, host);
    try {
      if (node.contains?.(host)) {
        if (poolAnchor?.parentElement === poolParent) poolParent.insertBefore(host, poolAnchor!);
        else poolParent.appendChild(host);
      }
    } catch (e) { try { poolParent.appendChild(host); } catch (e2) {} }
    dlog("kf: restore remembered source label='" + sourceLabel + "'");
    return true;
  }

  function cleanupForcedSourceDuplicates(label: string): void {
    const wanted = norm(label);
    if (!wanted) return;
    const outside = sourceCandidates(root).filter(s => !isInsideAnyTarget(s, targets) && norm(s.textContent) === wanted);
    if (!outside.length) return;
    const nonForcedVisible = outside.filter(s => s.getAttribute?.("data-kf-forced-source") !== "1" && sourceIsVisible(s));
    const forced = outside.filter(s => s.getAttribute?.("data-kf-forced-source") === "1");
    if (nonForcedVisible.length > 0) {
      forced.forEach(s => { try { s.parentNode?.removeChild(s); } catch (e) {} });
      return;
    }
    for (let i = 1; i < forced.length; i++) {
      try { forced[i].parentNode?.removeChild(forced[i]); } catch (e) {}
    }
  }

  const values = targets.map(getTargetText);
  const previousValue = norm(forceReleaseLabelText || values[targetIndex]);
  values[targetIndex] = String(activeText || "").replace(/\s+/g, " ").trim();

  try {
    for (let i = 0; i < targets.length; i++) setTileTargetDisplay(targets[i], values[i] || "");
    if (!norm(activeText)) restoreRememberedSource(targets[targetIndex], previousValue);
    reconcileSourceVisibility(values);
    if (!norm(activeText)) {
      const released = forceReleaseLabel(previousValue, targets[targetIndex]);
      if (!released) createForcedSourceClone(previousValue);
      cleanupForcedSourceDuplicates(previousValue);
    }
    dlog((origin || "tile") + ": applied tile state directly index=" + targetIndex + " values='" + values.join("|") + "'");
    return true;
  } catch (e) {
    dlog((origin || "tile") + ": apply tile state failed: " + String(e).slice(0, 120));
    return false;
  }
}

// ── Emulate cross-root drop ──────────────────────────────────────────────────

export function emulateLocalDrop(
  target: Element, activeText: string, _activeRoot: Element | null, origin: string,
  draggedEl: Element | null, pointerEl: Element | null,
  _draggedQuizKey: string, _pointerQuizKey: string,
  lastEmuTsRef: { value: number },
): void {
  const root = tileRootFrom(target);
  const targetQuizKey = quizKeyFrom(target);
  if (!root && !targetQuizKey) { dlog(origin + ": abort (target root null)"); return; }
  if (Date.now() - lastEmuTsRef.value < 80) { dlog(origin + ": skip duplicate emulate window"); return; }

  const sourceEl = draggedEl || pointerEl || null;
  if (!sourceEl) { dlog(origin + ": no source element stored for text='" + activeText + "'"); return; }
  const preferredSourceId = extractTargetId(target);
  const useSourceEl = resolveLocalSourceForTarget(target, activeText, sourceEl, preferredSourceId);
  if (!useSourceEl) { dlog(origin + ": no usable source element resolved"); return; }
  rememberAssignedSource(target, useSourceEl, activeText, origin);

  function _fireSyntheticDrop(node: Element): boolean {
    try {
      const dt = typeof DataTransfer === "function" ? new DataTransfer() : null;
      if (dt) {
        try { dt.setData("text/plain", String(activeText || "")); } catch (e) {}
        try { (dt as any).effectAllowed = "copyMove"; } catch (e) {}
      }
      (window as any).__liaTileCrossInternalDispatch = 1;
      const evInit = { bubbles: true, cancelable: true };
      let evDrop: Event;
      try { evDrop = new DragEvent("drop", Object.assign({}, evInit, dt ? { dataTransfer: dt } : {})); } catch (e) {
        evDrop = new Event("drop", evInit);
        if (dt) try { Object.defineProperty(evDrop, "dataTransfer", { value: dt }); } catch (e2) {}
      }
      try { node.dispatchEvent(new DragEvent("dragenter", Object.assign({}, evInit, dt ? { dataTransfer: dt } : {}))); } catch (e) {}
      try { node.dispatchEvent(new DragEvent("dragover", Object.assign({}, evInit, dt ? { dataTransfer: dt } : {}))); } catch (e) {}
      try { node.dispatchEvent(evDrop); } catch (e) {}
      return true;
    } catch (e) {
      dlog(origin + ": synthetic drop error: " + String(e).slice(0, 120));
      return false;
    } finally {
      (window as any).__liaTileCrossInternalDispatch = 0;
    }
  }

  lastEmuTsRef.value = Date.now();
  window.setTimeout(() => {
    try {
      const expectedText = norm(activeText || "");
      const targetFilledNow = () => norm(target.textContent) === expectedText;
      const pairSourceOk = sendLiaPayloadFromAttr(useSourceEl, "onclick", origin);
      const pairTargetOk = sendLiaPayloadFromAttr(target, "onclick", origin) || sendLiaPayloadFromAttr(target, "ondrop", origin) || sendLiaPayloadFromAttr(target, "ondragover", origin);

      window.setTimeout(() => {
        if (pairSourceOk && pairTargetOk && targetFilledNow()) return;
        const lifecycleStartOk = sendLiaPayloadFromAttr(useSourceEl, "ondragstart", origin) || sendLiaPayloadFromAttr(useSourceEl, "onclick", origin);
        const lifecycleTargetOk = sendLiaPayloadFromAttr(target, "onclick", origin) || sendLiaPayloadFromAttr(target, "ondrop", origin) || sendLiaPayloadFromAttr(target, "ondragover", origin);
        const lifecycleEndOk = sendLiaPayloadFromAttr(useSourceEl, "ondragend", origin) || sendLiaPayloadFromAttr(useSourceEl, "onclick", origin);
        window.setTimeout(() => {
          if (lifecycleStartOk && lifecycleTargetOk && lifecycleEndOk && targetFilledNow()) return;
          _fireSyntheticDrop(target);
          invokeInlineHandler(target, "ondrop", activeText, origin) || invokeInlineHandler(target, "onclick", activeText, origin);
          const srcOk = invokeInlineHandler(useSourceEl, "onclick", activeText, origin);
          const tgtOk = invokeInlineHandler(target, "onclick", activeText, origin) || invokeInlineHandler(target, "ondrop", activeText, origin);
          if (!srcOk || !tgtOk) { triggerClick(useSourceEl); triggerClick(target); }
          if (!targetFilledNow()) applyTileStateDirectly(target, activeText, origin);
        }, 24);
      }, 24);
    } catch (e) {
      dlog(origin + ": emulate error: " + String(e).slice(0, 120));
    }
  }, 0);
}

// ── Standalone Kachel area setup ─────────────────────────────────────────────

function currentCourseSourceUrl(): string {
  const href = String(window.location.href || "");
  const queryAt = href.indexOf("?");
  if (queryAt < 0) return "";
  let sourceUrl = href.slice(queryAt + 1);
  const hashAt = sourceUrl.indexOf("#");
  if (hashAt >= 0) sourceUrl = sourceUrl.slice(0, hashAt);
  try { sourceUrl = decodeURIComponent(sourceUrl); } catch (e) {}
  return /^https?:\/\//i.test(sourceUrl) ? sourceUrl : "";
}

function parseExpectedTextsFromRawTileMarkup(raw: string): string[] {
  const expected: string[] = [];
  String(raw || "").replace(/\[->\[([^\]]*)\]\]/g, function (_, inner) {
    const match = String(inner || "").match(/\(([^)]*)\)/);
    if (match) expected.push(String(match[1] || "").trim());
    return _;
  });
  return expected.filter(v => !!norm(v));
}

function parseInlineExpectedBlocksFromSource(markdown: string): string[][] {
  const cleaned = String(markdown || "")
    .replace(/```[\s\S]*?```/g, "\n")
    .replace(/~~~[\s\S]*?~~~/g, "\n");
  const blocks: string[][] = [];
  const pattern = /<div\s+class=["']Kachel["'][^>]*>([\s\S]*?)<\/div>/gi;
  let match: RegExpExecArray | null = null;
  while ((match = pattern.exec(cleaned))) {
    blocks.push(parseExpectedTextsFromRawTileMarkup(match[1] || ""));
  }
  return blocks;
}

function getInlineExpectedBlocksFromSource(): Promise<string[][] | null> {
  if (__kfInlineExpectedBlocksPromise) return __kfInlineExpectedBlocksPromise;

  const sourceUrl = currentCourseSourceUrl();
  if (!sourceUrl || typeof window.fetch !== "function") {
    __kfInlineExpectedBlocksPromise = Promise.resolve(null);
    return __kfInlineExpectedBlocksPromise;
  }

  __kfInlineExpectedBlocksPromise = window.fetch(sourceUrl, { credentials: "omit" })
    .then(response => response.ok ? response.text() : "")
    .then(text => {
      if (!text) return null;
      const blocks = parseInlineExpectedBlocksFromSource(text);
      dlog("kf: inline source blocks=" + String(blocks.length));
      return blocks.length ? blocks : null;
    })
    .catch(error => {
      dlog("kf: inline source fetch failed: " + String(error).slice(0, 120));
      return null;
    });

  return __kfInlineExpectedBlocksPromise;
}

function hydrateInlineExpectedFromSource(blocks: Element[]): void {
  if (!blocks.length) return;

  getInlineExpectedBlocksFromSource().then(expectedBlocks => {
    if (!expectedBlocks?.length) return;

    blocks.forEach((block, idx) => {
      const expected = expectedBlocks[idx] || [];
      const normalized = expected.map(v => String(v || "").trim()).filter(Boolean);
      if (!normalized.length) return;

      const uid = String(block.getAttribute?.("data-kf-uid") || "").trim() || ("inline-" + String(idx + 1));
      const current = Array.isArray(window.__liaKachelfolgeExpected[uid]) ? window.__liaKachelfolgeExpected[uid] : [];
      const unchanged =
        current.length === normalized.length &&
        current.every((value, valueIdx) => normKey(value) === normKey(normalized[valueIdx]));

      window.__liaKachelfolgeExpected[uid] = normalized;
      if (!unchanged) {
        dlog("kf: inline area setup uid='" + uid + "' expected='" + normalized.join("|") + "' from=source");
      }
    });
  }).catch(() => {});
}

export function setupStandaloneKachelAreas(root: Document | Element): void {
  const scope = (root && (root as Element).querySelectorAll) ? root as Element : document as unknown as Element;
  const blocks = Array.from(scope.querySelectorAll?.("div.Kachel") || []) as Element[];
  if (!blocks.length) return;

  window.__liaKachelfolgeExpected = window.__liaKachelfolgeExpected || {};
  hydrateInlineExpectedFromSource(blocks);

  const stopWords: Record<string, 1> = {
    "in": 1, "den": 1, "dem": 1, "der": 1, "die": 1, "das": 1,
    "und": 1, "oder": 1, "danach": 1, "dann": 1, "anschliessend": 1,
    "anschliesend": 1, "aus": 1, "mit": 1, "von": 1,
  };

  function isInstructionStopword(token: string): boolean {
    return !!stopWords[normKey(token || "")];
  }

  function parseSmallGermanNumber(token: string): number | null {
    const t = normKey(token || "");
    if (!t) return null;
    if (/^\d+$/.test(t)) { const n = Number(t); return Number.isFinite(n) ? n : null; }
    const map: Record<string, number> = {
      "eins": 1, "ein": 1, "eine": 1, "zwei": 2, "drei": 3, "vier": 4,
      "fuenf": 5, "funf": 5, "sechs": 6, "sieben": 7, "acht": 8, "neun": 9, "zehn": 10,
    };
    return Object.prototype.hasOwnProperty.call(map, t) ? map[t] : null;
  }

  function sourceHasLabel(block: Element, label: string): boolean {
    const wanted = normKey(label || "");
    if (!wanted) return false;
    return sourceCandidates(block).some(n => normKey(n?.textContent || "") === wanted);
  }

  function inferExpectedFromInstruction(block: Element, targetCount: number): string[] | null {
    const txt = String(block.textContent || "").replace(/\s+/g, " ").trim();
    if (!txt) return null;
    const lower = txt.toLowerCase();
    const mixed = lower.match(/in\s+den\s+ersten\s+([^\s.,;:!?]+)\s+feldern?\s+([^\s.,;:!?]+)\s+und\s+(?:danach|dann|anschliessend)\s+([^\s.,;:!?]+)/i);
    if (mixed?.[1] && mixed[2] && mixed[3]) {
      const n = parseSmallGermanNumber(mixed[1]);
      const first = String(mixed[2] || "").trim();
      const second = String(mixed[3] || "").trim();
      if (Number.isFinite(n) && n! > 0 && n! < targetCount && !isInstructionStopword(first) && !isInstructionStopword(second) && sourceHasLabel(block, first) && sourceHasLabel(block, second)) {
        return Array.from({ length: targetCount }, (_, i) => i < n! ? first : second);
      }
    }
    const m = txt.match(/w\S*hle\s+([^\s.,;:!?]+)/i);
    if (!m?.[1]) return null;
    const token = String(m[1] || "").trim();
    if (!token || isInstructionStopword(token) || !sourceHasLabel(block, token)) return null;
    return Array.from({ length: targetCount }, () => token);
  }

  blocks.forEach((block, idx) => {
    if (block.getAttribute?.("data-kf-inline-ready") === "1") return;
    const targets = targetNodes(block);
    if (!targets.length) return;

    const existingUid = String(block.getAttribute?.("data-kf-uid") || "").trim();
    const uid = existingUid || ("inline-" + String(idx + 1));
    if (!block.id) try { block.id = "kachelfolge-wrap-" + uid; } catch (e) {}
    try { block.setAttribute("data-kf-uid", uid); } catch (e) {}
    try { block.setAttribute("data-kf-inline-ready", "1"); } catch (e) {}
    Array.from(block.querySelectorAll?.("[onclick],[ondragover],[ondragstart],[class*='lia-quiz']") || []).forEach(el => {
      try { el.setAttribute("data-kf-uid", uid); } catch (e) {}
    });

    const inferred = inferExpectedFromInstruction(block, targets.length);
    if (inferred?.length) {
      window.__liaKachelfolgeExpected[uid] = inferred;
      dlog("kf: inline area setup uid='" + uid + "' expected='" + inferred.join("|") + "' from=instruction");
    } else {
      const { complete, expected } = expectedTextsByTargetIds(block);
      if (complete && expected.length) {
        window.__liaKachelfolgeExpected[uid] = expected.map((v: string) => String(v || "").trim());
        dlog("kf: inline area setup uid='" + uid + "' expected='" + window.__liaKachelfolgeExpected[uid].join("|") + "' from=ids");
      }
    }
        hydrateInlineExpectedFromSource(blocks);

    try { applyThemeColorToTargetPlaceholders(block); } catch (e) {}
    ensureTileStateObserver(block, "standalone-setup");
  });
}

