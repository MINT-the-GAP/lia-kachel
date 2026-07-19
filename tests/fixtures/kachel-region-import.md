<!--
author:   lia-Kachel region integration test
language: de
import:   ../../README.md
-->

# Importtest für div.Kachel

## Exaktes Fünf-Target-Beispiel

<div class="Kachel">

Wähle in den ersten drei Feldern gelb und danach rot aus.

<!-- data-solution-button="5" data-randomize="true" -->
In diese Lücke muss [->[(gelb)]] rein. \
In diese muss auch [->[(gelb)]] rein und in diese [->[(gelb)]] auch. \
Das Adjektiv [->[(rot)]] ist [->[pink|grün|(rot)]].

</div>

## Gleichlautende nativ falsche Quellen

Die Anweisung verrät absichtlich keine Sollwerte.

<div class="Kachel extra-klasse">

<!-- data-randomize="true" -->
[->[(gelb)|gelb|blau]] \
[->[gelb|(gelb)|grün]] \
[->[blau|gelb|(gelb)]] \
[->[(rot)|rot|pink]]

</div>

## Direkt aufeinanderfolgende Regionen

<div class="Kachel">

[->[(C-1)|gleich]] [->[gleich|(C-2)]]

</div>

<div class="Kachel">

[->[gleich|(D-1)]] [->[(D-2)|gleich]]

</div>

## Ein Target ohne Ablenkungsoption

<div class="Kachel">

Einzelwert: [->[solo]].

</div>

## Zwölf Targets mit wiederholten Inhalten

<div class="Kachel">

<!-- data-randomize="true" -->
[->[(x)|a01]] [->[a02|(x)]] [->[(x)|a03]] \
[->[a04|(y)]] [->[(y)|a05]] [->[a06|(z)]] \
[->[(x)|a07]] [->[a08|(y)]] [->[(z)|a09]] \
[->[a10|(x)]] [->[(y)|a11]] [->[a12|(z)]]

</div>

## Zwei native Quizabschnitte in derselben Region

<div class="Kachel">

Erster Quizabsatz: [->[(eins)|eins]] [->[eins|(eins)]].

Zweiter Quizabsatz: [->[zwei|(zwei)]] [->[(zwei)|zwei]].

</div>
