// freeze.ts — Quiz freeze logic: persists solved/resolved state across slide navigation.
// Stores freeze tokens and feedback text in memory; restores them on re-render.

import { dlog } from "./debug";
import {
  norm, normKey, targetNodes, sourceCandidates, isSolvedOrResolvedQuizNode,
  isReliableFreezeKey, isReliableFreezeUid, quizNodeFrom, tileRootFrom, quizKeyFrom,
  getCurrentSlideHashToken, expectedTextsByTargetIds, sameMultiset, targetDisplayText,
} from "./dom";

// ── Freeze state stores ──────────────────────────────────────────────────────

export function initFreezeStores(): void {
  window.__liaKfFrozenQuizKeys = window.__liaKfFrozenQuizKeys || new Set();
  window.__liaKfFrozenQuizUids = window.__liaKfFrozenQuizUids || new Set();
  window.__liaKfFrozenQuizFeedback = window.__liaKfFrozenQuizFeedback || new Map();
}

// ── Token helpers ────────────────────────────────────────────────────────────

function collectQuizFreezeTokens(quiz: Element | null, tileRoot: Element | null): { keys: string[]; uids: string[] } {
  const out = { keys: [] as string[], uids: [] as string[] };
  const addKey = (k: string) => {
    if (k && isReliableFreezeKey(k) && !out.keys.includes(k)) out.keys.push(k);
  };
  const addUid = (u: string) => {
    if (isReliableFreezeUid(u) && !out.uids.includes(u)) out.uids.push(u);
  };
  const addUidOrScopedInlineKey = (u: string) => {
    const uid = String(u || "").trim();
    if (!uid) return;
    // inline-* ids repeat across slides; scope them by slide hash as keys.
    if (/^inline-\d+$/i.test(uid)) {
      addKey("sig:" + getCurrentSlideHashToken() + ":inline:" + uid);
      return;
    }
    addUid(uid);
  };
  if (quiz) addKey(quizKeyFrom(quiz));
  if (tileRoot) addKey(quizKeyFrom(tileRoot));
  addKey(buildStableQuizSignatureKey(quiz, tileRoot));
  for (const n of [quiz, tileRoot]) {
    if (!n) continue;
    const uid = String(n.getAttribute?.("data-kf-uid") || "").trim();
    addUidOrScopedInlineKey(uid);
    const uq = n.closest?.("[data-kf-uid]");
    addUidOrScopedInlineKey(String(uq?.getAttribute?.("data-kf-uid") || "").trim());
  }
  return out;
}

function feedbackMemoryTokens(quiz: Element | null, tileRoot: Element | null): string[] {
  const { keys, uids } = collectQuizFreezeTokens(quiz, tileRoot);
  return [...keys.map(k => "k:" + k), ...uids.map(u => "u:" + u)];
}

function buildStableQuizSignatureKey(quiz: Element | null, tileRoot: Element | null): string {
  const root = tileRoot || (quiz ? tileRootFrom(quiz) : null) || quiz?.closest?.(".Kachel, .kachelfolge-wrap, [id^='kachelfolge-wrap-']") || null;
  if (!root) return "";

  function domPathToken(node: Element): string {
    const parts: string[] = [];
    let cur: Element | null = node;
    let guard = 0;
    while (cur && cur !== document.body && guard < 16) {
      const tag = String(cur.tagName || "").toLowerCase() || "x";
      let idx = 1;
      let sib = cur.previousElementSibling;
      while (sib) {
        if (String(sib.tagName || "").toLowerCase() === tag) idx += 1;
        sib = sib.previousElementSibling;
      }
      parts.push(tag + ":" + String(idx));
      cur = cur.parentElement;
      guard += 1;
    }
    return parts.reverse().join(">");
  }

  let localIndex = -1;
  try {
    const roots: Element[] = [];
    if (typeof window.__liaResetCollectTileQuizRoots === "function") {
      for (const r of window.__liaResetCollectTileQuizRoots(document.body || document.documentElement) || []) {
        if (!roots.includes(r)) roots.push(r);
      }
    }
    Array.from(document.querySelectorAll?.(".Kachel, .kachelfolge-wrap, [id^='kachelfolge-wrap-']") || []).forEach(el => {
      if (!roots.includes(el) && targetNodes(el).length > 0) roots.push(el);
    });
    localIndex = roots.indexOf(root);
  } catch (e) {}

  if (localIndex < 0) {
    try {
      const fallbackRoots = Array.from(document.querySelectorAll?.(".Kachel, .kachelfolge-wrap, [id^='kachelfolge-wrap-'], .lia-quiz") || [])
        .filter(el => el === root || targetNodes(el).length > 0);
      localIndex = fallbackRoots.indexOf(root);
    } catch (e) {}
  }

  const expectedMap = window.__liaKachelfolgeExpected || {};
  const uid = String(root.getAttribute?.("data-kf-uid") || "").trim();
  let expected: string[] = [];
  if (uid && Array.isArray(expectedMap[uid]) && expectedMap[uid].length) {
    expected = expectedMap[uid].slice();
  } else {
    const info = expectedTextsByTargetIds(root);
    if (info.complete && Array.isArray(info.expected)) expected = info.expected.slice();
  }
  const expectedSig = expected.map(normKey).filter(Boolean).sort().join("|") || "none";
  const pathSig = domPathToken(root) || "nopth";
  return "sig:" + getCurrentSlideHashToken() + ":" + String(localIndex) + ":" + pathSig + ":" + expectedSig;
}

// ── Feedback memory ──────────────────────────────────────────────────────────

function readQuizFeedbackState(quiz: Element): { text: string; className: string; hidden: number } | null {
  const fb = quiz.querySelector?.(".lia-quiz__feedback");
  if (!fb) return null;
  const text = String(fb.textContent || "").trim();
  const className = String(fb.className || "").trim() || "lia-quiz__feedback";
  const hidden = (fb as HTMLElement).hidden;
  if (!text && hidden) return null;
  return { text, className, hidden: hidden ? 1 : 0 };
}

export function rememberQuizFeedback(quiz: Element | null, tileRoot: Element | null, reason: string): boolean {
  if (!quiz) return false;
  const state = readQuizFeedbackState(quiz);
  if (!state) return false;
  const tokens = feedbackMemoryTokens(quiz, tileRoot);
  if (!tokens.length) return false;
  tokens.forEach(token => {
    try { window.__liaKfFrozenQuizFeedback.set(token, { text: state.text, className: state.className, hidden: state.hidden }); } catch (e) {}
  });
  dlog("kf: remember-feedback reason='" + reason + "' text='" + state.text + "'");
  return true;
}

function rememberedQuizFeedback(quiz: Element | null, tileRoot: Element | null): { text: string; className: string; hidden: number } | null {
  const tokens = feedbackMemoryTokens(quiz, tileRoot);
  for (const token of tokens) {
    try {
      if (window.__liaKfFrozenQuizFeedback.has(token)) return window.__liaKfFrozenQuizFeedback.get(token) || null;
    } catch (e) {}
  }
  return null;
}

function restoreQuizFeedbackFromMemory(quiz: Element | null, tileRoot: Element | null, reason: string): boolean {
  if (!quiz) return false;
  const state = rememberedQuizFeedback(quiz, tileRoot);
  if (!state) return false;
  let fb = quiz.querySelector?.(".lia-quiz__feedback") || null;
  if (!fb && quiz.appendChild) {
    try {
      fb = document.createElement("div");
      fb.className = "lia-quiz__feedback";
      quiz.appendChild(fb);
    } catch (e) { fb = null; }
  }
  if (!fb) return false;
  try { fb.className = String(state.className || "lia-quiz__feedback"); } catch (e) {}
  try { (fb as HTMLElement).textContent = String(state.text || ""); } catch (e) {}
  try { (fb as HTMLElement).hidden = !!state.hidden && !state.text; } catch (e) {}
  dlog("kf: restore-feedback reason='" + reason + "' text='" + String(state.text || "") + "'");
  return true;
}

// ── Core freeze actions ──────────────────────────────────────────────────────

export function rememberFrozenQuiz(quiz: Element | null, tileRoot: Element | null, reason: string): void {
  const tokens = collectQuizFreezeTokens(quiz, tileRoot);
  tokens.keys.forEach(k => { try { window.__liaKfFrozenQuizKeys.add(k); } catch (e) {} });
  tokens.uids.forEach(u => { try { window.__liaKfFrozenQuizUids.add(u); } catch (e) {} });
  try { rememberQuizFeedback(quiz, tileRoot, reason || "remember-freeze"); } catch (e) {}
  dlog("kf: remember-freeze reason='" + reason + "' keys='" + tokens.keys.join("|") + "' uids='" + tokens.uids.join("|") + "'");
}

export function shouldFreezeByMemory(quiz: Element | null, tileRoot: Element | null): boolean {
  const tokens = collectQuizFreezeTokens(quiz, tileRoot);
  for (const k of tokens.keys) {
    if (window.__liaKfFrozenQuizKeys?.has(k)) return true;
  }
  for (const u of tokens.uids) {
    if (window.__liaKfFrozenQuizUids?.has(u)) return true;
  }
  return false;
}

export function isQuizSuccessState(quiz: Element | null): boolean {
  if (!quiz) return false;
  if (isSolvedOrResolvedQuizNode(quiz)) return true;
  const fb = quiz.querySelector?.(".lia-quiz__feedback");
  const fbClass = String(fb?.className || "").toLowerCase();
  const fbText = norm(fb?.textContent || "").toLowerCase();
  return fbClass.includes("text-success") || fbText.includes("herzlichen glückwunsch") || fbText.includes("aufgelöste antwort");
}

export function freezeSolvedTileQuiz(tileRoot: Element, quizNode: Element | null): void {
  if (!tileRoot) return;
  for (const target of targetNodes(tileRoot)) {
    try { target.setAttribute("tabindex", "-1"); } catch (e) {}
    try { target.setAttribute("aria-disabled", "true"); } catch (e) {}
    (target as HTMLElement).style.pointerEvents = "none";
  }
  for (const source of sourceCandidates(tileRoot)) {
    try { source.setAttribute("tabindex", "-1"); } catch (e) {}
    try { source.setAttribute("draggable", "false"); } catch (e) {}
    try { source.setAttribute("aria-grabbed", "false"); } catch (e) {}
    try { source.setAttribute("aria-disabled", "true"); } catch (e) {}
    (source as HTMLElement).style.pointerEvents = "none";
  }
  const root = quizNode || quizNodeFrom(tileRoot) || tileRoot;
  if (!root?.querySelectorAll) return;
  Array.from(root.querySelectorAll(".lia-quiz__check, .lia-quiz__resolve, button, [role='button']")).forEach(btn => {
    try { (btn as HTMLButtonElement).disabled = true; } catch (e) {}
    try { btn.setAttribute("tabindex", "-1"); } catch (e) {}
    try { btn.setAttribute("aria-disabled", "true"); } catch (e) {}
    try { btn.setAttribute("aria-hidden", "true"); } catch (e) {}
    (btn as HTMLElement).style.pointerEvents = "none";
  });
}

export function freezeResolvedQuizzesInDocument(reason: string): void {
  Array.from(document.querySelectorAll?.(".lia-quiz") || []).forEach(quiz => {
    const tileRoot = tileRootFrom(quiz) || quiz.closest?.(".Kachel, .kachelfolge-wrap, [id^='kachelfolge-wrap-']") || null;
    if (!isSolvedOrResolvedQuizNode(quiz) && !shouldFreezeByMemory(quiz, tileRoot)) return;
    try { restoreQuizFeedbackFromMemory(quiz, tileRoot, reason || "freeze-resolved"); } catch (e) {}
    if (tileRoot) freezeSolvedTileQuiz(tileRoot, tileRoot);
    Array.from(quiz.querySelectorAll?.(".lia-quiz__check, .lia-quiz__resolve, button, [role='button']") || []).forEach(btn => {
      try { (btn as HTMLButtonElement).disabled = true; } catch (e) {}
      try { btn.setAttribute("tabindex", "-1"); } catch (e) {}
      try { btn.setAttribute("aria-disabled", "true"); } catch (e) {}
      try { btn.setAttribute("aria-hidden", "true"); } catch (e) {}
      (btn as HTMLElement).style.pointerEvents = "none";
    });
    try { quiz.setAttribute("data-kf-frozen", "1"); } catch (e) {}
    try { rememberQuizFeedback(quiz, tileRoot, reason || "freeze-resolved"); } catch (e) {}
    rememberFrozenQuiz(quiz, tileRoot, reason || "freeze-resolved");
    dlog("kf: freeze-resolved reason='" + String(reason || "unknown") + "'");
  });
}

// ── Check-button click handler (Kachelfolge order-insensitive grading) ───────

export function handleCheckButtonClick(ev: MouseEvent, btn: Element): void {
  const tileRoot = tileRootFrom(btn);
  const modeNode = btn.closest?.("[data-kf-mode]") || null;
  let mode = String(modeNode?.getAttribute?.("data-kf-mode") || "").trim().toLowerCase();
  if ((!mode || (mode !== "classic" && mode !== "seq")) && tileRoot) {
    // Fallback for layouts where the mode attribute is attached to a nearby wrapper.
    const localModeNode = tileRoot.closest?.("[data-kf-mode]") || tileRoot.querySelector?.("[data-kf-mode]") || null;
    mode = String(localModeNode?.getAttribute?.("data-kf-mode") || "").trim().toLowerCase();
  }
  const isMacroMode = mode === "classic" || mode === "seq";

  const targets = tileRoot ? targetNodes(tileRoot) : [];
  const actualSync = targets.map(t => targetDisplayText(t));

  const nativeExpectedInfo = expectedTextsByTargetIds(tileRoot);
  const isNativeIdTextCorrect =
    nativeExpectedInfo.complete &&
    actualSync.length === nativeExpectedInfo.expected.length &&
    actualSync.every((val, idx) => normKey(val) === normKey(nativeExpectedInfo.expected[idx]));

  dlog("kf: native-check complete=" + (nativeExpectedInfo.complete ? 1 : 0) + " actual='" + actualSync.join("|") + "' expected='" + nativeExpectedInfo.expected.join("|") + "' ok=" + (isNativeIdTextCorrect ? 1 : 0));

  if (!targets.length) return;
  if (!actualSync.every(v => !!norm(v))) return;

  let isCorrect = false;
  let groupUid = "native-id";
  let expectedForLog: string[] = nativeExpectedInfo.expected.map(v => norm(v)).filter(Boolean);
  const expectedMap = window.__liaKachelfolgeExpected || {};

  if (isMacroMode) {
    const matchingUidsSet = new Set<string>();

    function addUidFromNode(node: Element | null | undefined): void {
      const uid = String(node?.getAttribute?.("data-kf-uid") || "").trim();
      if (!uid) return;
      if (!Array.isArray(expectedMap[uid]) || expectedMap[uid].length === 0) return;
      matchingUidsSet.add(uid);
    }

    addUidFromNode(btn.closest?.("[data-kf-uid]") || null);
    addUidFromNode(tileRoot?.closest?.("[data-kf-uid]") || null);
    addUidFromNode(tileRoot);

    if (tileRoot?.querySelectorAll) {
      Array.from(tileRoot.querySelectorAll("[data-kf-uid]")).forEach(n => addUidFromNode(n));
    }

    const matchingUids = Array.from(matchingUidsSet);
    if (!matchingUids.length) return;

    const combinedExpectedRaw: string[] = [];
    matchingUids.forEach(u => {
      const e = expectedMap[u];
      if (Array.isArray(e)) combinedExpectedRaw.push(...e);
    });
    const combinedExpected = combinedExpectedRaw.map(v => norm(v)).filter(Boolean);
    groupUid = matchingUids.join("+");

    if (combinedExpected.length !== targets.length) {
      dlog("kf: skip custom-check weak-expected uid='" + groupUid + "' expectedRaw='" + combinedExpectedRaw.join("|") + "'");
      return;
    }

    expectedForLog = combinedExpected;
    isCorrect = combinedExpected.length > 0 && sameMultiset(actualSync, combinedExpected);
  } else {
    // Plain div.Kachel: require strict position-based expected sequence.
    const localUids = new Set<string>();
    const addLocalUid = (node: Element | null | undefined) => {
      const uid = String(node?.getAttribute?.("data-kf-uid") || "").trim();
      if (!uid) return;
      localUids.add(uid);
    };

    addLocalUid(btn.closest?.("[data-kf-uid]") || null);
    addLocalUid(tileRoot?.closest?.("[data-kf-uid]") || null);
    addLocalUid(tileRoot);
    if (tileRoot?.querySelectorAll) {
      Array.from(tileRoot.querySelectorAll("[data-kf-uid]")).forEach(n => addLocalUid(n));
    }

    const candidates = Array.from(localUids)
      .map(uid => ({ uid, expected: Array.isArray(expectedMap[uid]) ? expectedMap[uid].map(v => norm(v)).filter(Boolean) : [] }))
      .filter(item => item.expected.length === targets.length);

    if (!candidates.length) return;

    const chosen = candidates[0];
    groupUid = chosen.uid;
    expectedForLog = chosen.expected;
    isCorrect = actualSync.length === chosen.expected.length &&
      actualSync.every((val, idx) => normKey(val) === normKey(chosen.expected[idx]));
  }

  if (!isCorrect) return;

  try { ev.stopImmediatePropagation(); } catch (e) {}

  window.setTimeout(() => {
    if (!tileRoot) return;
    dlog("kf: check uid='" + groupUid + "' actual='" + actualSync.join("|") + "' expected='" + expectedForLog.join("|") + "' ok=1");

    const quizNode = quizNodeFrom(btn) || tileRoot;
    if (quizNode?.classList) {
      quizNode.classList.remove("resolved");
      quizNode.classList.add("solved");
    }

    let feedback = quizNode?.querySelector?.(".lia-quiz__feedback") || null;
    if (!feedback && quizNode?.appendChild) {
      feedback = document.createElement("div");
      feedback.className = "lia-quiz__feedback";
      quizNode.appendChild(feedback);
    }
    if (feedback) {
      feedback.classList.remove("text-error", "text-disabled");
      feedback.classList.add("text-success");
      (feedback as HTMLElement).textContent = "Herzlichen Glückwunsch, das war die richtige Antwort";
      (feedback as HTMLElement).hidden = false;
    }

    freezeSolvedTileQuiz(tileRoot, tileRoot);
    try { (btn as HTMLButtonElement).disabled = true; (btn as HTMLElement).style.pointerEvents = "none"; } catch (e) {}
    dlog("kf: freeze uid='" + groupUid + "' targets='" + actualSync.join("|") + "'");
  }, 30);
}
