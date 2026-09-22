<!--
author:     Martin Lommatzsch; Jihad Hyadi
version:    1.0.0
language:   de
narrator:   Deutsch Female
comment:    Native LiaScript-Kacheln mit Touch-Drag-and-Drop, gruppierten Kachelfolgen und automatischer Inhaltsprüfung in .Kachel-Regionen.
repository: https://github.com/MINT-the-GAP/lia-kachel

script: ./dist/index.js

@Kachelfolge: @Kachelfolge_(@uid,`@0`)

@KachelfolgeN: @KachelfolgeN_(@uid,`@0`)

@KachelgruppeN: @KachelgruppeN_(@uid,@0,`@1`)

@KachelgruppenCheck: <script>window.LiaKachel.kachelgruppen.check('@0')</script>

@KachelgruppeN_: <span id='lia-kachelgruppe-@0' data-lia-kachelgruppe='@1' data-lia-kachelfolge-mode='progressive'>@2<span data-lia-kachelfolge-dummy='true' aria-hidden='true' inert>✛</span></span>

@Kachelfolge_
<div id="lia-kachelfolge-@0" data-lia-kachelfolge="@0">
@1
</div>
<script>
window.LiaKachel.kachelfolge.check("@0", "@'1")
</script>

@end

@KachelfolgeN_
<div id="lia-kachelfolge-@0" data-lia-kachelfolge="@0" data-lia-kachelfolge-mode="progressive">
@1<span data-lia-kachelfolge-dummy="true" aria-hidden="true" inert>✛</span>
</div>
<script>
window.LiaKachel.kachelfolge.check("@0", "@'1")
</script>

@end

-->

# lia-Kachel

Das Template hat drei klar getrennte Schichten:

- styles.css ist die einzige Quelle für die Gestaltung aller nativen Quell-,
  Ziel-, belegten und aufgelösten LiaScript-Kacheln. Beim Build wird sie in
  dist/index.js eingebettet, damit ein Import kein externes CSS mit falschem
  MIME-Typ laden muss.
- src/ enthält die wartbare TypeScript-Quelle für Maus, Touch, Stift,
  reihenfolgeunabhängige Auswertung, progressive Zielanzeige und die
  automatische Inhaltsprüfung in `.Kachel`-Regionen.
- dist/index.js ist das daraus gebaute, direkt importierbare Browser-Skript.

Die Oberfläche bleibt vollständig nativ: Das Projekt erzeugt keine eigenen
Targets, Sources, Prüfbuttons oder Rückmeldungen. Die Drag-Schicht übersetzt
Gesten in LiaScripts Ereignisfolge. `@Kachelfolge` und `@KachelfolgeN`
ergänzen die native Auswertung. `@KachelgruppeN` und genau ein
`@KachelgruppenCheck` verbinden mehrere Tabellenzeilen mit einem gemeinsamen
nativen Quiz. Ein `<div class="Kachel">` schaltet für die darin enthaltenen
nativen Multi-Drop-Quizze automatisch die zielweise Inhaltsprüfung ein.
Versuche, Scoring, Persistenz, Auflösen und Feedback bleiben immer bei
LiaScript.

## Funktionsumfang

- Drag-and-Drop mit Maus, Touch und Stift über Pointer Events
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
- gruppierte progressive Kachelfolgen in Markdown-Tabellen mit globalen
  nativen Quelladressen und genau einem gemeinsamen Validator
- `<div class="Kachel">` für zielweise Inhaltsprüfung mit austauschbaren,
  gleich beschrifteten Sources – ohne zusätzliches Makro oder Skript im Kurs
- reihenfolgeunabhängige Prüfung anhand nativer Kachel-Identitäten statt Text

## Einbindung

Für reproduzierbare Kurse empfiehlt sich der feste Versionsimport:

```markdown
import: https://raw.githubusercontent.com/MINT-the-GAP/lia-kachel/0.7.0/README.md
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

Runde Klammern müssen innerhalb jeder Option ausgeglichen sein. Ein literales
Pipe-Zeichen wird als `\|` geschrieben; gültig verschachtelte Inhalte wie
`((x))` bleiben erlaubt. Eine unausgeglichene Spezifikation wird ohne
Autokorrektur als `KachelfolgeSpecError` mit Target, Option und 1-basiger
Zeichenposition abgelehnt; derselbe Autorenfehler wird höchstens einmal
geloggt.

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
aktuell sichtbaren Targets belegt sind, erscheint das nächste. Nach dem letzten
nativen Target erscheint ein zusätzliches, mit `✛` markiertes N+1-Feld. Es ist
rein visuell, nimmt keine Kachel an und gehört nicht zur Auswertung. Dadurch
verrät auch die vollständige Belegung nicht vor dem Prüfen, ob die gesuchte
Menge bereits vollständig ist.

Ob eine eingesetzte Kachel richtig oder falsch ist, spielt für das Aufdecken
keine Rolle. Beim Verschieben oder Entfernen wird kein zusätzliches natives
Target freigeschaltet, und ein bereits belegtes Target wird nie ausgeblendet.
Das N+1-Feld verschwindet wieder, sobald mindestens ein natives Target leer ist.

<!-- data-randomize="true" -->
Finde die unbekannt lange Menge und ordne sie beliebig an:
@KachelfolgeN(`[->[(Kupfer)|Holz]][->[Glas|(Silber)|Stein]][->[(Gold)|Papier]][->[Wasser|(Platin)]]`)

Das Makro erzeugt weiterhin sämtliche bewerteten Sources und Targets nativ in
genau einem LiaScript-Quiz. Die noch nicht freigegebenen Targets sind lediglich
aus Layout, Fokusreihenfolge und Accessibility-Baum ausgeblendet. Nur das
abschließende N+1-Feld ist ein inertes, für assistive Technik ausgeblendetes
Anzeigeelement; es gibt keine zweite Auswertungslogik.

Damit die richtige Anzahl nicht aus dem Quellenpool herleitbar ist, sollte die
Aufgabe falsche Optionen enthalten und mit `data-randomize="true"` gemischt
werden. Das Makro verbirgt die Targetzahl; inhaltlich offensichtliche Hinweise
in Beschriftungen oder Aufgabenstellung kann es naturgemäß nicht verbergen.

Ein Makroaufruf gehört jeweils auf eine eigene Zeile. Er darf erklärenden Text,
aber kein zusätzliches natives `[->[...]]` außerhalb seines Parameters im
selben Absatz enthalten. Mehrere `@Kachelfolge`- und
`@KachelfolgeN`-Zeilen dürfen direkt aufeinanderfolgen; jede wird automatisch
zu einem eigenen Quizabsatz. Diese beiden Makros sind Blockmakros und deshalb
nicht für Tabellenzellen vorgesehen. Verwende dort die folgende Gruppen-API.

## Gruppierte Kachelfolgen in einem Tabellenquiz

Eine Markdown-Tabelle mit Eingaben ist genau **ein** natives LiaScript-Quiz.
Für logisch getrennte, progressive Gruppen verwendet jede Tabellenzelle das
einzeilige `@KachelgruppeN`. Unmittelbar nach der letzten Tabellenzeile folgt
auf der direkt nächsten Quellzeile genau ein `@KachelgruppenCheck`. Zwischen
Tabelle und Check-Makro darf keine Leerzeile stehen:

~~~ markdown
| Wortart | Zuordnungen |
| :-----: | :---------: |
| Substantiv/Nomen | @KachelgruppeN(wortarten,`[->[(Haus)]][->[(Kopf)]][->[(Schlange)]][->[(Schule)]][->[(Buch)]][->[(Zug)]]`) |
| Verb | @KachelgruppeN(wortarten,`[->[(lief)]][->[(gesprochen)]][->[(spielt)]][->[(versuchen)]]`) |
| Adjektiv | @KachelgruppeN(wortarten,`[->[(kälter)]][->[(schlecht)]][->[(am besten)]][->[(kurz)]][->[(größer)]][->[(leise)]][->[(älter)]]`) |
| Artikel | @KachelgruppeN(wortarten,`[->[(einer)]][->[(die)]][->[(das)]]`) |
@KachelgruppenCheck(wortarten)
~~~

`wortarten` ist der explizite Schlüssel dieses einen Gruppenquiz. Er muss mit
einem Buchstaben beginnen, darf danach nur Buchstaben, Ziffern, `_` und `-`
enthalten und muss innerhalb der gerenderten Folie eindeutig sein. Derselbe
Schlüssel steht in allen Zellmakros und im abschließenden Check-Makro.

Der Gruppenvalidator liest die globalen nativen Target-IDs und
Quelladressen `[Ursprungs-Target, Optionsindex]`. Er ordnet deshalb jede lokal
formulierte Gruppe korrekt auf den gemeinsamen Tabellen-Track ab. Innerhalb
einer Gruppe ist jede Permutation der richtigen Quellen zulässig; eine Quelle
aus einer anderen Gruppe bleibt falsch. Sichtbare Beschriftungen werden nicht
verglichen, sodass doppelte Texte möglich sind.

Jede Gruppe steuert nur ihre eigenen Targets: Anfangs ist genau eines sichtbar,
nach jeder Belegung wird in derselben Gruppe das nächste freigeschaltet. Erst
bei vollständiger Belegung erscheint ihr inertes, nicht fokussierbares und mit
`aria-hidden` aus dem Accessibility-Baum entferntes N+1-Feld.

Die Gruppen müssen zusammen alle Multi-Drop-Targets des Tabellenquiz abdecken.
Weitere native Eingaben oder ungruppierte Multi-Drop-Targets dürfen nicht im
selben Tabellenquiz stehen. Mehrere gruppierte Tabellen auf derselben Folie
benötigen verschiedene Schlüssel und jeweils genau ein eigenes
`@KachelgruppenCheck`. Die Zellmakros enthalten kein Script; nur das eine
Check-Makro ist der LiaScript-Validator. Check, Auflösen, Versuche, Feedback,
Scoring und Persistenz bleiben dadurch ein gemeinsamer nativer Zustand.
Für die native IndexedDB-Speicherung über einen vollständigen Seiten-Reload
hinweg benötigt der Kurs wie im vollständigen Beispiel eine Major-Version ab
`1.0.0`. `persistent: true` bewahrt zusätzlich den Folien-DOM beim Wechsel auf
eine andere Folie. Beide Mechanismen stammen von LiaScript, nicht vom Template.

Ein vollständiger direkt nutzbarer Kurs liegt unter
[`examples/wortarten-tabelle.md`](examples/wortarten-tabelle.md).

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
| `@KachelgruppeN` + `@KachelgruppenCheck` | Gruppenweise Quellidentitäten in genau einem nativen Tabellenquiz; jede Gruppe schreitet unabhängig fort. |

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
npx playwright install chromium firefox
npm run verify
~~~

npm run verify prüft die TypeScript-Typen, baut dist/index.js und testet Parser,
Identitätsvergleich, zielweise Inhaltsprüfung, progressive Freigabe sowie die
Auslieferungs- und Importverträge. Zusätzlich kompiliert der fest gepinnte
lokale LiaScript-DevServer die vollständigen Fixtures und führt die
Browserregressionen in aktuellem Chromium und Firefox aus. Das Bundle in dist/
wird mit versioniert; es wird nie von Hand bearbeitet.

Der lokale Preview des hier gepinnten Devservers legt selbst bei einer
Kurs-Major-Version keinen Kurszustands-Store in IndexedDB an. Der Reload-Test
prüft deshalb den nativen Neustart und insbesondere, dass keine Wrapper,
Listener, Observer oder N+1-Felder dupliziert werden. Die dauerhafte
Zustandsspeicherung in einem sie unterstützenden LiaScript-Host wird nicht durch
dieses Template ersetzt.

~~~ text
src/
  dom.ts       LiaScript-Selektoren, Quizgrenzen und native DragEvents
  content.ts   zielweise Prüfung gerenderter Kachelinhalte
  groups.ts    gruppenweise Tabellenprüfung über native globale Adressen
  kachelfolge.ts Parser und nativer, reihenfolgeunabhängiger Validator
  progressive.ts schrittweise Anzeige nativer Targets
  styles.ts    einmalige Installation der eingebetteten styles.css
  touch.ts     Gestenzustand, Ghost, Abbruch und Auto-Scroll
  index.ts     einmalige Installation
styles.css     gemeinsame, beim Build eingebettete CSS-Quelle
dist/
  index.js     generierte JavaScript-Ausgabe
tests/
  *.test.mjs  Parser-, Gruppen-, Inhalts- und Auslieferungsverträge
  browser/    echte LiaScript-Regressionen in Chromium und Firefox
  fixtures/
    kachelfolge-import.md
    kachelfolge-n-import.md
    kachelfolge-table-import.md
    kachel-region-import.md
    touch-import.md
examples/
  wortarten-tabelle.md
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
zusätzlich die noch nicht erreichten nativen Targets aus und zeigt nach ihrer
vollständigen Belegung ein inertes N+1-Feld. Die Gruppen-API verwendet dieselbe
Progression, prüft aber jede explizit markierte Gruppe gegen die globalen
Adressen genau eines nativen Tabellen-Tracks. `div.Kachel` vergleicht dagegen
ausschließlich den sichtbaren Soll- und Istinhalt am jeweiligen Target.

Die Gruppenprüfung ist an LiaScripts native Multi-Drop-Handler, globale
Target-IDs und die kompilierte Quizlösung gebunden und wird gegen die mit dem
DevServer gepinnte LiaScript-Version browsergetestet. Kann dieser Vertrag nach
einem LiaScript-Update nicht eindeutig hergestellt werden, wird die Belegung
nicht als richtig akzeptiert und derselbe Diagnosefehler höchstens einmal
geloggt. Es gibt keine zweite Drag-and-Drop-Implementierung, keine DOM-Klone
nativer Targets, keine eigenen Check-/Resolve-Schaltflächen und kein manuell
nachgebautes Quiz-Feedback.
