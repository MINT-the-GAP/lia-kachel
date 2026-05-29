<!--
author:   Martin Lommatzsch, Jihad Hyadi
version:  0.0.1
language: de
comment:  lia-Kachel plugin — Kachelfolge drag-and-drop tile quizzes with touch support

script: ./dist/index.js

@onload
window.__liaKachelfolgeExpected = window.__liaKachelfolgeExpected || {};
window.__liaKfAssignedSources = window.__liaKfAssignedSources || new WeakMap();
@end

@Kachelfolge: @KachelfolgeBase_(@uid,classic,`@0`)
@KachelfolgeN: @KachelfolgeBase_(@uid,seq,`@0`)

@KachelfolgeBase_
<div id="kachelfolge-wrap-@0" class="kachelfolge-wrap" data-kf-uid="@0" data-kf-mode="@1">
  @2
</div>
<script modify="false">
(function () {
  var uid = "@0";
  var mode = "@1";
  var raw = String.raw`@2`;
  var expected = [];
  raw.replace(/\[->\[([^\]]*)\]\]/g, function (_, inner) {
    var m = inner.match(/\(([^)]*)\)/);
    if (m) expected.push(String(m[1] || "").trim());
    return _;
  });
  window.__liaKachelfolgeExpected = window.__liaKachelfolgeExpected || {};
  window.__liaKachelfolgeExpected[uid] = expected;

  function norm(s) { return String(s || "").replace(/\s+/g, " ").trim(); }

  function setupSequentialTargets(wrap, expectedCount) {
    if (!wrap || expectedCount <= 0) return;
    function collectRealTargets() {
      return Array.prototype.slice.call(wrap.children || []).filter(function (el) {
        if (!el || !(el instanceof Element)) return false;
        if (String(el.getAttribute("data-kf-seq-dummy") || "") === "1") return false;
        if (String(el.getAttribute("data-kf-uid") || "") !== uid) return false;
        return true;
      });
    }
    function ensureDummy(realTargets) {
      if (!realTargets.length) return null;
      var existing = wrap.querySelector("[data-kf-seq-dummy='1']");
      if (existing) return existing;
      var src = realTargets[realTargets.length - 1] || realTargets[0];
      var dummy = document.createElement(src && src.tagName ? src.tagName : "span");
      try { dummy.setAttribute("data-kf-seq-dummy", "1"); } catch(e) {}
      try { dummy.setAttribute("data-kf-uid", uid); } catch(e) {}
      dummy.className = "lia-target-placeholder kf-seq-dummy";
      try { dummy.style.cssText = String(src.getAttribute("style") || src.style.cssText || ""); } catch(e) {}
      dummy.textContent = "✛";
      dummy.style.pointerEvents = "none";
      wrap.appendChild(dummy);
      return dummy;
    }
    function isFilled(el) {
      var t = norm(el && el.textContent || "");
      return !!t && t !== "✛" && t !== "+";
    }
    function setVisible(el, on) {
      if (!el) return;
      if (typeof el.dataset.kfSeqOrigDisplay === "undefined") el.dataset.kfSeqOrigDisplay = el.style.display || "";
      if (on) { el.style.display = el.dataset.kfSeqOrigDisplay || "inline-block"; el.style.visibility = ""; }
      else { el.style.display = "none"; }
    }
    function updateSequentialVisibility() {
      var realTargets = collectRealTargets();
      if (!realTargets.length) return;
      var dummy = ensureDummy(realTargets);
      var filled = 0;
      for (var i = 0; i < realTargets.length; i++) { if (isFilled(realTargets[i])) filled += 1; }
      var visibleReal = Math.min(filled + 1, realTargets.length);
      realTargets.forEach(function (el, idx) { setVisible(el, idx < visibleReal); });
      if (dummy) setVisible(dummy, filled >= Math.min(expectedCount, realTargets.length));
    }
    var obs = new MutationObserver(updateSequentialVisibility);
    obs.observe(wrap, { subtree: true, childList: true, characterData: true, attributes: true });
    updateSequentialVisibility();
    window.setTimeout(updateSequentialVisibility, 60);
    window.setTimeout(updateSequentialVisibility, 260);
    window.setTimeout(updateSequentialVisibility, 700);
  }

  function initWrap() {
    var wrap = document.getElementById("kachelfolge-wrap-" + uid);
    if (!wrap) return false;
    wrap.setAttribute("data-kf-uid", uid);
    var candidates = wrap.querySelectorAll ? Array.prototype.slice.call(wrap.querySelectorAll("[onclick],[ondragover],[ondragstart],[class*='lia-quiz']")) : [];
    candidates.forEach(function(el) { try { el.setAttribute("data-kf-uid", uid); } catch(e) {} });
    if (mode === "seq") setupSequentialTargets(wrap, expected.length);
    return true;
  }

  [0, 30, 120, 260, 700].forEach(function(delay) {
    window.setTimeout(initWrap, delay);
  });
})();
</script>
@end

-->

# lia-Kachel

LiaScript-Plugin für verbesserte **Kachel-Quizarten** (Drag-and-Drop Tile Quizzes) mit:

- Abgerundeten Kacheln passend zum LiaScript-Design-System
- **Touch-Unterstützung** für Drag & Drop auf Mobilgeräten
- **Cross-Root-Drop-Emulation** (Kacheln aus verschiedenen Quiz-Bereichen)
- **Reihenfolge-unabhängige Auswertung** mit `@Kachelfolge`
- **Sequenzielle Anzeige** (nur nächstes Feld sichtbar) mit `@KachelfolgeN`
- **Quiz-Einfrieren** nach korrekter Lösung oder Auflösen

__Try it on LiaScript:__
https://liascript.github.io/course/?https://raw.githubusercontent.com/MINT-the-GAP/lia-Kachel/main/README.md

__See the project on GitHub:__
https://github.com/MINT-the-GAP/lia-Kachel

---

## Einbindung

`import: https://raw.githubusercontent.com/MINT-the-GAP/lia-Kachel/main/README.md`

---

## Makros

### `@Kachelfolge` — Reihenfolge egal

Erzeugt eine Kachelsequenz, bei der die Reihenfolge der Antworten egal ist.

```markdown
<!-- data-randomize="true" -->
Wähle die richtigen Farben aus:
@Kachelfolge(`[->[(rot)]][->[(blau)]][->[(grün)|Haus]]`)
```

**Syntax der Kacheln:** `[->[(Antwort)]]` oder `[->[(Antwort)|Beschriftung]]`

- `(Antwort)` — die korrekte Antwort (in runden Klammern)
- Alternativen ohne Klammern werden als falsche Optionen angeboten (z.B. `[->[(rot)|blau|grün]]`)

Wähle die richtigen Farben aus:
@Kachelfolge(`[->[(rot)]][->[(blau)]][->[(grün)|Haus]]`)

### `@KachelfolgeN` — Sequenziell (unbekannte Anzahl)

Zeigt immer nur das nächste freie Feld an — nützlich wenn die Anzahl der zu wählenden Kacheln unbekannt ist.

```markdown
Wähle alle roten Farbtöne aus:
@KachelfolgeN(`[->[(Karmesin)]][->[(Scharlach)]][->[(Rubinrot)|Kobalt]]`)
```

Wähle alle roten Farbtöne aus:
@KachelfolgeN(`[->[(Karmesin)]][->[(Scharlach)]][->[(Rubinrot)|Kobalt]]`)

### `<div class="Kachel">` — Inline-Kachelbereich

Für normale LiaScript-Tile-Quizze (ohne Makro) kann der Drag-&-Drop-Bereich mit einem `<div class="Kachel">` umschlossen werden, damit das Plugin ihn erkennt und Touch-Support aktiviert:

```markdown
<div class="Kachel">

Wähle in den ersten drei Feldern gelb und danach rot aus.

<!-- data-solution-button="5" data-randomize="true" -->
In diese Lücke muss [->[(gelb)]] rein. \
In diese muss auch [->[(gelb)]] rein und in diese [->[(gelb)]] auch. \
Das Adjektiv [->[(rot)]] ist [->[pink|grün|(rot)]].

</div>
```

<div class="Kachel">

Wähle in den ersten drei Feldern gelb und danach rot aus.

<!-- data-solution-button="5" data-randomize="true" -->
In diese Lücke muss [->[(gelb)]] rein. \
In diese muss auch [->[(gelb)]] rein und in diese [->[(gelb)]] auch. \
Das Adjektiv [->[(rot)]] ist [->[pink|grün|(rot)]].

</div>

---

## Konfiguration

Die üblichen LiaScript-Quiz-Optionen funktionieren direkt über dem Makro:

```markdown
<!-- data-randomize="true" -->
@Kachelfolge(`[->[(A)]][->[(B)]][->[(C)]]`)

<!-- data-solution-button="2" -->
@Kachelfolge(`[->[(1)]][->[(2)|Label]][->[(3)]]`)

<!-- data-show-partial-solution="true" -->
@Kachelfolge(`[->[(X)]][->[(Y)]]`)
```