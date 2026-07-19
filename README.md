<!--
author:     Martin Lommatzsch, Jihad Hyadi
version:    0.0.1
language:   de
narrator:   Deutsch Female
comment:    Native LiaScript-Kacheln mit Touch-Drag-and-Drop, Kachelfolgen und automatischer Inhaltsprüfung in .Kachel-Regionen.
repository: https://github.com/MINT-the-GAP/lia-kachel

script: ./dist/index.js
link: ./styles.css

@Kachelfolge: @Kachelfolge_(@uid,`@0`)

@KachelfolgeN: @KachelfolgeN_(@uid,`@0`)

@Kachelfolge_
<span hidden aria-hidden="true" id="lia-kachelfolge-@0" data-lia-kachelfolge="@0"></span>@1
<script>
window.LiaKachel.kachelfolge.check("@0", "@'1")
</script>

@end

@KachelfolgeN_
<span hidden aria-hidden="true" id="lia-kachelfolge-@0" data-lia-kachelfolge="@0" data-lia-kachelfolge-mode="progressive"></span>@1
<script>
window.LiaKachel.kachelfolge.check("@0", "@'1")
</script>

@end

-->

# lia-Kachel

Das Template hat drei klar getrennte Schichten:

- styles.css gestaltet alle nativen Quell-, Ziel-, belegten und aufgelösten
  LiaScript-Kacheln.
- src/ enthält die wartbare TypeScript-Quelle für Touch, Stift,
  reihenfolgeunabhängige Auswertung, progressive Zielanzeige und die
  automatische Inhaltsprüfung in `.Kachel`-Regionen.
- dist/index.js ist das daraus gebaute, direkt importierbare Browser-Skript.

Die Oberfläche bleibt vollständig nativ: Das Projekt erzeugt keine eigenen
Targets, Sources, Prüfbuttons oder Rückmeldungen. Die Touch-Schicht übersetzt
Gesten in LiaScripts Ereignisfolge. `@Kachelfolge` und `@KachelfolgeN`
ergänzen die native Auswertung. Ein `<div class="Kachel">` schaltet für die
darin enthaltenen nativen Multi-Drop-Quizze automatisch die zielweise
Inhaltsprüfung ein. Versuche, Scoring, Persistenz, Auflösen und Feedback
bleiben immer bei LiaScript.

## Funktionsumfang

- Drag-and-Drop mit Touch und Stift über Pointer Events
- Fallback über Touch Events für Browser ohne Pointer Events
- Bewegungsschwelle von 8 px, damit ein Antippen ein Antippen bleibt
- eigener, nicht interaktiver Drag-Ghost
- automatisches vertikales Scrollen in langen Quizzen
- Verschieben und Entfernen bereits belegter Kacheln
- sichere Trennung mehrerer Quizze über LiaScripts internen track-Pfad
- idempotente Installation bei mehrfachen oder verschachtelten Imports
- `@Kachelfolge` mit beliebig vielen Targets und beliebig vielen unabhängigen
  Makroaufrufen
- `@KachelfolgeN` mit anfangs genau einem sichtbaren Target und schrittweiser
  Freigabe weiterer nativer Targets
- `<div class="Kachel">` für zielweise Inhaltsprüfung mit austauschbaren,
  gleich beschrifteten Sources – ohne zusätzliches Makro oder Skript im Kurs
- reihenfolgeunabhängige Prüfung anhand nativer Kachel-Identitäten statt Text

## Einbindung

Für reproduzierbare Kurse empfiehlt sich der feste Versionsimport:

```markdown
import: https://raw.githubusercontent.com/MINT-the-GAP/lia-kachel/0.6.0/README.md
```

Wer bewusst immer den neuesten Stand verwenden möchte, importiert `main`:

```markdown
import: https://raw.githubusercontent.com/MINT-the-GAP/lia-kachel/main/README.md
```

Für die lokale Entwicklung kann diese README.md direkt im LiaScript-Editor
oder über den LiaScript-Entwicklungsserver geöffnet werden.

## Native Source und Targets

Diese Aufgabe prüft leere und belegte Targets, richtige und falsche Quellen
sowie eine zufällige Reihenfolge:

<!-- data-randomize="true" -->
Ziehe die Farben in die drei Ziele:
[->[(Rot)|Haus]] [->[(Blau)|Katze]] [->[(Grün)|Auto]].

## Doppelte Beschriftungen und Quizgrenzen

Dieses zweite Quiz besitzt absichtlich doppelte Beschriftungen. Eine
Touch-Quelle aus dem ersten Quiz darf kein Target dieses Quiz markieren.

<!-- data-randomize="true" -->
In diese Lücke gehört [->[(gelb)]], in diese ebenfalls [->[(gelb)|blau]].

## Reihenfolgeunabhängige Kachelfolge

Jede `[->[...]]`-Einheit erzeugt ein Target. Pro Einheit ist genau eine Option
durch runde Klammern als richtig markiert; die richtige Option darf vorne,
mittig oder hinten stehen. Daneben können beliebig viele falsche Kacheln
stehen. Bei einer Einheit ohne Alternativen ist die einzige Kachel wie in
LiaScript automatisch richtig.

Die richtigen Kacheln dürfen in **beliebiger Reihenfolge** in den Targets
liegen. Für vier richtige Kacheln sind also beispielsweise `1-2-3-4`,
`4-2-3-1` und jede andere Permutation korrekt.

<!-- data-randomize="true" -->
Ordne die vier richtigen Kacheln beliebig an:
@Kachelfolge(`[->[(richtig1)|falschA]][->[(richtig2)|falschB|falschC]][->[(richtig3)]][->[(richtig4)|falschD]]`)

Die Auswertung verwendet intern die native LiaScript-Adresse jeder Quelle
`[Ursprungs-Target, Optionsindex]`. Deshalb bleiben doppelte Beschriftungen
unterscheidbar: Eine gleichnamige falsche Kachel wird nicht versehentlich als
richtig gewertet. Mehrere `@Kachelfolge`-Aufrufe auf derselben Folie sind
voneinander isoliert.

## Kachelfolge mit unbekannter Länge

`@KachelfolgeN` verwendet dieselbe Syntax und dieselbe
reihenfolgeunabhängige Identitätsprüfung. Der Unterschied liegt ausschließlich
in der Anzeige: Zu Beginn ist genau ein natives Target sichtbar. Sobald alle
aktuell sichtbaren Targets belegt sind, erscheint das nächste. Erst wenn das
letzte Target belegt wurde und kein weiteres erscheint, ist die Länge für die
lernende Person erkennbar.

Ob eine eingesetzte Kachel richtig oder falsch ist, spielt für das Aufdecken
keine Rolle. Beim Verschieben oder Entfernen wird kein zusätzliches Target
freigeschaltet, und ein bereits belegtes Target wird nie ausgeblendet.

<!-- data-randomize="true" -->
Finde die unbekannt lange Menge und ordne sie beliebig an:
@KachelfolgeN(`[->[(Kupfer)|Holz]][->[Glas|(Silber)|Stein]][->[(Gold)|Papier]][->[Wasser|(Platin)]]`)

Das Makro erzeugt weiterhin sämtliche Sources und Targets nativ in genau einem
LiaScript-Quiz. Die noch nicht freigegebenen Targets sind lediglich aus Layout,
Fokusreihenfolge und Accessibility-Baum ausgeblendet. Es gibt keine
nachgebauten Targets und keine zweite Auswertungslogik.

Damit die richtige Anzahl nicht aus dem Quellenpool herleitbar ist, sollte die
Aufgabe falsche Optionen enthalten und mit `data-randomize="true"` gemischt
werden. Das Makro verbirgt die Targetzahl; inhaltlich offensichtliche Hinweise
in Beschriftungen oder Aufgabenstellung kann es naturgemäß nicht verbergen.

Ein Makroaufruf gehört jeweils auf eine eigene Zeile. Er darf erklärenden Text,
aber kein zusätzliches natives `[->[...]]` außerhalb seines Parameters im
selben Absatz enthalten. Mehrere `@Kachelfolge`- und
`@KachelfolgeN`-Zeilen dürfen direkt aufeinanderfolgen; jede wird automatisch
zu einem eigenen Quizabsatz.

## Inhaltsbasierte Kachelregion

Für die Inhaltsprüfung ist kein Makro und kein kurseigenes Skript nötig. Ein
`div` mit dem Klassentoken `Kachel` umschließt einfach die unveränderte
native LiaScript-Quizsyntax:

```markdown
<div class="Kachel">

Wähle in den ersten drei Feldern gelb und danach rot aus.

<!-- data-solution-button="5" data-randomize="true" -->
In diese Lücke muss [->[(gelb)]] rein. \
In diese muss auch [->[(gelb)]] rein und in diese [->[(gelb)]] auch. \
Das Adjektiv [->[(rot)]] ist [->[pink|grün|(rot)]].

</div>
```

Das Beispiel ist direkt ausführbar:

<div class="Kachel">

Wähle in den ersten drei Feldern gelb und danach rot aus.

<!-- data-solution-button="5" data-randomize="true" -->
In diese Lücke muss [->[(gelb)]] rein. \
In diese muss auch [->[(gelb)]] rein und in diese [->[(gelb)]] auch. \
Das Adjektiv [->[(rot)]] ist [->[pink|grün|(rot)]].

</div>

Innerhalb der Region wird jedes Target anhand des **gerenderten Inhalts** der
eingesetzten Kachel geprüft. Die runden Klammern in der normalen
LiaScript-Syntax bestimmen weiterhin den Sollinhalt des jeweiligen Targets.
Physisch verschiedene Sources mit demselben Inhalt sind austauschbar. Für die
drei `gelb`-Targets darf also jede verfügbare `gelb`-Kachel verwendet
werden – selbst eine gleichlautende Source, die in ihrer ursprünglichen
Optionsliste nicht als richtig markiert war. Eine `gelb`-Kachel in einem
`rot`-Target bleibt falsch.

Beim Prüfen wird nur eine nötige Inhaltszuordnung an die native Quizlogik
übergeben. LiaScript selbst verarbeitet anschließend genau einen Prüfversuch
und behält seine eigenen Rückmeldungen, Teilbewertungen, Versuche, Lösung,
Scoring und Persistenz. Außerhalb eines `div.Kachel` gilt unverändert die
native Identitätsprüfung.

Der Vergleich normalisiert Unicode nach NFC, geschützte Leerzeichen und
sonstige Whitespace-Folgen. Groß-/Kleinschreibung und Satzzeichen bleiben
bedeutsam: `x`, `X` und `x.` sind drei verschiedene Inhalte. Maßgeblich
ist der sichtbare Text; für rein bildliche Kacheln dienen alternativ
Bild-`alt` oder `aria-label` als Inhalt.

| Modus | Bewertungsregel |
| --- | --- |
| `<div class="Kachel">` | Inhalt muss am jeweiligen Target stimmen; gleichlautende Sources sind austauschbar. |
| `@Kachelfolge` | Die Menge nativer Quellidentitäten muss stimmen; die Targetreihenfolge ist egal. |
| `@KachelfolgeN` | Wie `@Kachelfolge`, zusätzlich mit schrittweise sichtbaren Targets. |

Eine Region darf beliebig viele native Multi-Drop-Quizabsätze enthalten. Jeder
Quizabsatz bleibt über seinen LiaScript-Track von allen anderen Quizzen
isoliert und darf beliebig viele Targets sowie beliebig viele
Ablenkungsoptionen besitzen. Auch mehrere Regionen auf einer Folie und
zusätzliche Klassennamen wie `class="Kachel meine-aufgabe"` sind erlaubt.
Der Klassentoken `Kachel` ist absichtlich großgeschrieben.

Die Inhaltsprüfung gilt für native Inline-Multi-Drop-Targets `[->[…]]`.
Insbesondere ein Quiz mit nur einem Target sollte im Fließtext stehen, zum
Beispiel `Einzelwert: [->[(solo)]].` Ein Target als alleiniger Inhalt eines
Absatzes wird von LiaScript als anderer Drop-Typ gerendert und fällt deshalb
auf die native Standardauswertung zurück. Kann die Bibliothek die kompilierte
native Lösung nach einem LiaScript-Update nicht eindeutig erkennen, bleibt
ebenfalls sicherheitshalber die native Standardauswertung aktiv und die
Browserkonsole erhält genau einen Diagnosehinweis.

## Entwicklung

~~~ text
npm ci
npm run verify
~~~

npm run verify prüft die TypeScript-Typen, baut dist/index.js und testet Parser,
Identitätsvergleich, zielweise Inhaltsprüfung, progressive Freigabe sowie die
statischen Auslieferungs- und Importverträge. Das Bundle in dist/ wird mit
versioniert; es wird nie von Hand bearbeitet.

~~~ text
src/
  dom.ts       LiaScript-Selektoren, Quizgrenzen und native DragEvents
  content.ts   zielweise Prüfung gerenderter Kachelinhalte
  kachelfolge.ts Parser und nativer, reihenfolgeunabhängiger Validator
  progressive.ts schrittweise Anzeige nativer Targets
  touch.ts     Gestenzustand, Ghost, Abbruch und Auto-Scroll
  index.ts     einmalige Installation
dist/
  index.js     generierte JavaScript-Ausgabe
tests/
  *.test.mjs  Parser-, Inhalts-, Auslieferungs- und Importverträge
  fixtures/
    kachelfolge-import.md
    kachelfolge-n-import.md
    kachel-region-import.md
    touch-import.md
~~~

## CSS-Variablen

Das Design kann von einem Kurs über folgende Variablen angepasst werden:

```css
:root {
  --lia-kachel-radius: 12px;
  --lia-kachel-background: rgba(var(--lia-grey, 136, 136, 136), 0.14);
  --lia-kachel-target-min-width: clamp(5.85rem, 14.3vw, 9.1rem);
  --lia-kachel-min-height: 3rem;
}
```

## Abgrenzung

`@Kachelfolge` verändert ausschließlich die Regel, nach der die vorhandenen
nativen Sources als Gesamtmenge geprüft werden. `@KachelfolgeN` blendet
zusätzlich die noch nicht erreichten nativen Targets aus. `div.Kachel`
vergleicht dagegen ausschließlich den sichtbaren Soll- und Istinhalt am
jeweiligen Target. Die Region wertet weder Aufgabenprosa noch rohe
Markdown-Quellen heuristisch aus. Es gibt keine zweite
Drag-and-Drop-Implementierung, keine DOM-Klone und kein manuell nachgebautes
Quiz-Feedback.
