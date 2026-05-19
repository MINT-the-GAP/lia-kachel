// dom.ts — DOM query helpers, LiaScript payload dispatch, and accent-colour theming.
// Pure utility functions with no side effects — safe to call multiple times.

import { dlog } from "./debug";

export function norm(s: unknown): string {
  return String(s || "").replace(/\s+/g, " ").trim();
}

export function normKey(s: unknown): string {
  return norm(s).toLowerCase();
}

export function pickAccentFrom(doc: Document): string {
  try {
    const win = doc.defaultView || window;
    const cs = win.getComputedStyle(doc.documentElement);
    const vars = ["--lia-accent", "--lia-primary", "--lia-color-primary", "--primary", "--color-primary", "--accent-color"];
    for (const v of vars) {
      const val = String(cs.getPropertyValue(v) || "").trim();
      if (val) return val;
    }
    const a = doc.querySelector("a");
    if (a) {
      const c = win.getComputedStyle(a).color;
      if (c && c !== "rgba(0, 0, 0, 0)") return c;
    }
    const b = doc.querySelector(".lia-btn");
    if (b) {
      const bg = win.getComputedStyle(b).backgroundColor;
      if (bg && bg !== "rgba(0, 0, 0, 0)") return bg;
    }
  } catch (e) {}
  return "";
}

export function isTileTarget(el: Element): boolean {
  const attrs = ["onclick", "onkeydown", "ondragover", "ondragleave"];
  const pattern = /cmd\s*:\s*['\"](dragtarget|dragenter)['\"]/i;
  for (const name of attrs) {
    if (pattern.test(String(el.getAttribute(name) || ""))) return true;
  }
  return false;
}

export function targetNodes(root: Element): Element[] {
  if (!root || !root.querySelectorAll) return [];
  if (typeof window.__liaResetGetTileQuizTargetsFromRoot === "function") {
    try {
      const t = window.__liaResetGetTileQuizTargetsFromRoot(root) || [];
      if (t.length > 0) return Array.from(t);
    } catch (e) {}
  }
  return Array.from(root.querySelectorAll("[onclick],[onkeydown],[ondragover],[ondragleave]")).filter(isTileTarget);
}

export function sourceCandidates(root: Element): Element[] {
  if (!root || !root.querySelectorAll) return [];
  const selector = "[onclick],[onkeydown],[ondragstart],[draggable],[data-reset-tile-role='source']";
  const raw = Array.from(root.querySelectorAll(selector));
  const out: Element[] = [];
  const seen = new Set<Element>();
  const rawSet = new Set(raw);
  for (const n of raw) {
    let ancestor = n.parentElement?.closest(selector) ?? null;
    let skip = false;
    while (ancestor) {
      if (rawSet.has(ancestor)) { skip = true; break; }
      ancestor = ancestor.parentElement?.closest(selector) ?? null;
    }
    if (skip || seen.has(n)) continue;
    seen.add(n);
    out.push(n);
  }
  return out;
}

export function isInsideAnyTarget(node: Element, targets: Element[]): boolean {
  return targets.some(t => t === node || (t.contains && t.contains(node)));
}

export function targetDisplayText(node: Element): string {
  if (!node) return "";
  const box = node.firstElementChild || node;
  const txt = norm(box?.textContent || "");
  if (txt === "✛" || txt === "+") return "";
  return txt;
}

export function quizNodeFrom(node: Element | null): Element | null {
  if (!node) return null;
  if (node.closest) {
    const q = node.closest(".lia-quiz, lia-quiz");
    if (q) return q;
  }
  let cur: Element | null = node;
  while (cur && cur !== document.body) {
    if (cur.matches && cur.matches(".lia-quiz, lia-quiz")) return cur;
    cur = cur.parentElement;
  }
  return null;
}

export function tileRootFrom(node: Element | null): Element | null {
  if (!node) return null;
  if (typeof window.__liaResetGetTileQuizRootFromNode === "function") {
    try {
      const r = window.__liaResetGetTileQuizRootFromNode(node, document.body || document.documentElement);
      if (r) return r;
    } catch (e) {}
  }
  let cur: Element | null = node;
  while (cur && cur !== document.body) {
    const q = cur.querySelectorAll ? cur.querySelectorAll(".lia-quiz, lia-quiz") : [];
    if (q.length === 1 && targetNodes(cur).length > 0) return cur;
    cur = cur.parentElement;
  }
  return null;
}

export function quizKeyFrom(node: Element | null): string {
  const q = quizNodeFrom(node);
  const r = node ? tileRootFrom(node) : null;
  const n = q || r || null;
  if (!n) return "";
  const uid = String(n.getAttribute?.("data-resetall-id") || "").trim();
  if (uid) return "id:" + uid;
  const owner = String(n.getAttribute?.("data-reset-tile-owner") || "").trim();
  if (owner) return "owner:" + owner;
  const kfUid = String(n.getAttribute?.("data-kf-uid") || "").trim();
  if (isReliableFreezeUid(kfUid)) return "kf:" + kfUid;
  return "";
}

export function isReliableFreezeKey(key: string): boolean {
  const k = String(key || "").trim();
  return /^id:/i.test(k) || /^owner:/i.test(k) || /^kf:/i.test(k) || /^sig:/i.test(k);
}

export function isReliableFreezeUid(uid: string): boolean {
  const u = String(uid || "").trim();
  if (!u) return false;
  if (/^inline-\d+$/i.test(u)) return false;
  return true;
}

export function isSolvedOrResolvedQuizNode(node: Element): boolean {
  if (!node) return false;
  if (node.classList?.contains("solved") || node.classList?.contains("resolved")) return true;
  const cls = String(node.className || "").toLowerCase();
  return cls.indexOf(" solved") >= 0 || cls.indexOf(" resolved") >= 0 || cls === "solved" || cls === "resolved";
}

export function getCurrentSlideHashToken(): string {
  const raw = String(window?.location?.hash || "").trim();
  if (!raw) return "nohash";
  let end = raw.length;
  const cutQ = raw.indexOf("?");
  const cutAmp = raw.indexOf("&");
  if (cutQ >= 0) end = Math.min(end, cutQ);
  if (cutAmp >= 0) end = Math.min(end, cutAmp);
  return normKey(raw.slice(0, end) || raw);
}

export function isManagedKachelTouchRoot(root: Element | null): boolean {
  if (!root) return false;
  if (root.matches?.(".Kachel, .kachelfolge-wrap, [id^='kachelfolge-wrap-']")) return true;
  if (root.closest?.(".Kachel, .kachelfolge-wrap, [id^='kachelfolge-wrap-']")) return true;
  const uid = String(root.getAttribute?.("data-kf-uid") || "").trim();
  if (uid) return true;
  return String(root.getAttribute?.("data-kf-inline-ready") || "").trim() === "1";
}

export function rectCenter(node: Element): { x: number; y: number } | null {
  if (!node || typeof (node as any).getBoundingClientRect !== "function") return null;
  try {
    const r = (node as HTMLElement).getBoundingClientRect();
    if (!r || !isFinite(r.left) || !isFinite(r.top)) return null;
    return { x: r.left + (r.width || 0) / 2, y: r.top + (r.height || 0) / 2 };
  } catch (e) {
    return null;
  }
}

export function dist2(a: { x: number; y: number } | null, b: { x: number; y: number } | null): number {
  if (!a || !b) return Number.POSITIVE_INFINITY;
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

export function extractParamIdFromAttr(node: Element, attrName: string, wantedCmd: string): number | null {
  const raw = String(node.getAttribute?.(attrName) || "");
  if (!raw) return null;
  if (wantedCmd) {
    const hasCmd = new RegExp("cmd\\s*:\\s*['\"]" + wantedCmd + "['\"]", "i").test(raw);
    if (!hasCmd) return null;
  }
  const m = raw.match(/param\s*:\s*\{[^}]*id\s*:\s*(\d+)/i);
  if (!m) return null;
  const id = Number(m[1]);
  return Number.isFinite(id) ? id : null;
}

export function extractTargetId(node: Element): number | null {
  const tries: [string, string][] = [
    ["onclick", "dragtarget"], ["onclick", "dragenter"],
    ["onkeydown", "dragtarget"], ["onkeydown", "dragenter"],
    ["ondragover", "dragtarget"], ["ondragover", "dragenter"],
    ["ondrop", "dragtarget"], ["ondrop", "dragenter"],
    ["onclick", ""], ["onkeydown", ""], ["ondragover", ""], ["ondrop", ""],
  ];
  for (const [attr, cmd] of tries) {
    const id = extractParamIdFromAttr(node, attr, cmd);
    if (id !== null) return id;
  }
  return null;
}

export function extractSourceId(node: Element): number | null {
  const tries: [string, string][] = [
    ["onclick", "dragsource"], ["onkeydown", "dragsource"],
    ["ondragstart", "dragsource"], ["ondragend", "dragsource"],
    ["onclick", "dragstart"], ["onkeydown", "dragstart"],
    ["ondragstart", "dragstart"], ["onclick", "dragend"],
    ["ondragend", "dragend"],
    ["onclick", ""], ["onkeydown", ""], ["ondragstart", ""], ["ondragend", ""],
  ];
  for (const [attr, cmd] of tries) {
    const id = extractParamIdFromAttr(node, attr, cmd);
    if (id !== null) return id;
  }
  return null;
}

export function findTargetFromNode(node: Element | null): Element | null {
  if (!node) return null;
  if (typeof window.__liaResetCollectTileQuizRoots === "function" && typeof window.__liaResetGetTileQuizTargetsFromRoot === "function") {
    try {
      const roots = window.__liaResetCollectTileQuizRoots(document.body || document.documentElement) || [];
      for (const root of roots) {
        const ts = window.__liaResetGetTileQuizTargetsFromRoot!(root) || [];
        for (const t of ts) {
          if (t && (t === node || t.contains?.(node))) return t;
        }
      }
    } catch (e) {}
  }
  let cur: Element | null = node;
  while (cur && cur !== document.body) {
    if (isTileTarget(cur)) return cur;
    cur = cur.parentElement;
  }
  return null;
}

export function findTargetFromPoint(x: number, y: number): Element | null {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  try {
    if (typeof document.elementsFromPoint === "function") {
      for (const n of document.elementsFromPoint(x, y)) {
        const t = findTargetFromNode(n);
        if (t) return t;
      }
    }
  } catch (e) {}
  try {
    if (typeof document.elementFromPoint === "function") {
      const n = document.elementFromPoint(x, y);
      if (n) return findTargetFromNode(n);
    }
  } catch (e) {}
  return null;
}

export function sourceFromNode(node: Element | null): Element | null {
  if (!node || !node.closest) return null;
  const preferred = node.closest("span[role='button'][draggable='true'], span[role='button'][data-reset-tile-role='source'], span[role='button'][onclick], span[role='button'][ondragstart]");
  if (preferred) return preferred;
  return node.closest("[onclick],[onkeydown],[ondragstart],[draggable],[data-reset-tile-role='source']");
}

export function triggerClick(el: Element): void {
  if (!el) return;
  try {
    el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, view: window }));
    el.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true, view: window }));
    el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
    return;
  } catch (e) {}
  try { if (typeof (el as HTMLElement).click === "function") (el as HTMLElement).click(); } catch (e) {}
}

export function invokeInlineHandler(node: Element, attrName: string, activeText: string, origin: string): boolean {
  const code = String(node.getAttribute?.(attrName) || "").trim();
  if (!code) return false;
  try {
    const fakeDT = {
      getData: () => String(activeText || ""),
      setData: () => {},
      clearData: () => {},
      effectAllowed: "copyMove",
      dropEffect: "move",
      types: ["text/plain", "text"],
    };
    const fakeEvent = {
      type: attrName, target: node, currentTarget: node,
      dataTransfer: fakeDT,
      preventDefault: () => {}, stopPropagation: () => {}, stopImmediatePropagation: () => {},
    };
    const fn = new Function("event", code);
    fn.call(node, fakeEvent);
    dlog((origin || "handler") + ": inline " + attrName + " invoked");
    return true;
  } catch (e) {
    dlog((origin || "handler") + ": inline " + attrName + " failed: " + String(e).slice(0, 120));
    return false;
  }
}

export function sendLiaPayloadFromAttr(node: Element, attrName: string, origin: string): boolean {
  if (!window.LIA || typeof window.LIA.send !== "function") return false;
  const code = String(node.getAttribute?.(attrName) || "").trim();
  if (!code) return false;
  try {
    const start = code.indexOf("{");
    const end = code.lastIndexOf("}");
    if (start < 0 || end <= start) return false;
    const payload = new Function("return (" + code.slice(start, end + 1) + ");")();
    window.LIA.send(payload);
    const cmd = String(payload?.message?.cmd || "");
    const id = String(payload?.message?.param?.id ?? "");
    dlog((origin || "lia") + ": sent " + attrName + " cmd='" + cmd + "' id='" + id + "'");
    return true;
  } catch (e) {
    dlog((origin || "lia") + ": send payload from " + attrName + " failed: " + String(e).slice(0, 120));
    return false;
  }
}

export function applyThemeColorToTargetPlaceholders(root: Document | Element): void {
  const scope = (root && (root as Element).querySelectorAll) ? root as Element : document;
  const nodes = scope.querySelectorAll(
    "[onclick*='dragtarget'], [onkeydown*='dragtarget'], [ondragover*='dragtarget'], [ondragleave*='dragtarget'], " +
    "[onclick*='dragenter'], [onkeydown*='dragenter'], [ondragover*='dragenter'], [ondragleave*='dragenter'], " +
    "[data-reset-tile-role='target'], span[style*='border: 3px dotted'][style*='padding: 1rem'][style*='vertical-align: middle']"
  );
  const accent = pickAccentFrom(document) || "";
  for (const target of Array.from(nodes)) {
    const box = target.firstElementChild || target;
    try { (target as HTMLElement).style.setProperty("border-radius", "var(--lia-tile-radius)", "important"); } catch (e) {}
    try { (target as HTMLElement).style.setProperty("overflow", "hidden", "important"); } catch (e) {}
    try { (target as HTMLElement).style.setProperty("background-color", "var(--lia-tile-bg)", "important"); } catch (e) {}
    Array.from(target.querySelectorAll("*")).forEach(el => {
      try { (el as HTMLElement).style.setProperty("background-color", "transparent", "important"); } catch (e) {}
    });
    const txt = norm((box as HTMLElement)?.textContent || "");
    if (txt === "✛" || txt === "+" || txt === "") {
      try { target.classList.add("lia-target-placeholder"); } catch (e) {}
      try { box.classList.add("lia-target-placeholder"); } catch (e) {}
      if (accent) {
        try { (target as HTMLElement).style.setProperty("color", accent, "important"); } catch (e) {}
        try { (box as HTMLElement).style.setProperty("color", accent, "important"); } catch (e) {}
      }
    } else {
      try { target.classList.remove("lia-target-placeholder"); } catch (e) {}
      try { box.classList.remove("lia-target-placeholder"); } catch (e) {}
      (target as HTMLElement).style.color = "";
      (box as HTMLElement).style.color = "";
      try { (target as HTMLElement).style.setProperty("background-color", "var(--lia-tile-bg)", "important"); } catch (e) {}
      Array.from(target.querySelectorAll("[data-reset-tile-role='source'], [draggable='true']")).forEach(el => {
        try { (el as HTMLElement).style.color = ""; } catch (e) {}
        try { (el as HTMLElement).style.backgroundColor = "transparent"; } catch (e) {}
      });
    }
  }
}

export function expectedTextsByTargetIds(tileRoot: Element | null): { expected: string[]; complete: boolean; knownTargets: number; totalTargets: number } {
  const out = { expected: [] as string[], complete: false, knownTargets: 0, totalTargets: 0 };
  if (!tileRoot) return out;
  const targets = targetNodes(tileRoot);
  out.totalTargets = targets.length;
  if (!targets.length) return out;

  const allSources = sourceCandidates(tileRoot);
  const outsideSources = allSources.filter(n => !isInsideAnyTarget(n, targets));
  const insideSources = allSources.filter(n => isInsideAnyTarget(n, targets));

  for (const t of targets) {
    const tid = extractTargetId(t);
    if (tid === null) { out.expected.push(""); continue; }
    out.knownTargets += 1;
    let found: Element | null = null;
    for (const pool of [outsideSources, insideSources, allSources]) {
      for (const s of pool) {
        if (extractSourceId(s) === tid) { found = s; break; }
      }
      if (found) break;
    }
    out.expected.push(found ? targetDisplayText(found) : "");
  }

  out.complete = out.totalTargets > 0 && out.knownTargets === out.totalTargets && out.expected.every(v => !!norm(v));
  return out;
}

export function sameMultiset(a: string[], b: string[]): boolean {
  const aa = (Array.isArray(a) ? a : []).map(normKey).filter(Boolean).sort();
  const bb = (Array.isArray(b) ? b : []).map(normKey).filter(Boolean).sort();
  if (aa.length !== bb.length) return false;
  return aa.every((v, i) => v === bb[i]);
}
