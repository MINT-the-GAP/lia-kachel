<!--
author:   lia-Kachel integration test
language: de
import:   ../../README.md
-->

# Kachelfolge-Importtest

## Zwei unabhängige Makros

Beide Quizze stehen absichtlich auf derselben Folie. Gleiche Beschriftungen
und falsche Quellen dürfen die Quizgrenzen oder die Auswertung nicht vermischen.

Quiz A:

<!-- data-randomize="true" -->
@Kachelfolge(`[->[(A-1)|gleich|falsch-A1]][->[falsch-A2|(A-2)]][->[(gleich)|falsch-A3]][->[(A-4)|falsch-A4]]`)

Quiz B:

<!-- data-randomize="true" -->
@Kachelfolge(`[->[(B-1)|gleich|falsch-B1]][->[(B-2)|falsch-B2]][->[(gleich)|falsch-B3]]`)

## Sechs direkt aufeinanderfolgende Makros

Diese Aufrufe besitzen absichtlich keine Leerzeilen untereinander. Trotzdem
muss jeder Aufruf genau ein eigenes natives Quiz mit eigenem Track ergeben.

@Kachelfolge(`[->[(Q1-A)|falsch]][->[(Q1-B)|falsch]]`)
@Kachelfolge(`[->[(Q2-A)|falsch]][->[(Q2-B)|falsch]]`)
@Kachelfolge(`[->[(Q3-A)|falsch]][->[(Q3-B)|falsch]]`)
@Kachelfolge(`[->[(Q4-A)|falsch]][->[(Q4-B)|falsch]]`)
@Kachelfolge(`[->[(Q5-A)|falsch]][->[(Q5-B)|falsch]]`)
@Kachelfolge(`[->[(Q6-A)|falsch]][->[(Q6-B)|falsch]]`)

## Ein einzelnes Target

<!-- data-randomize="false" -->
@Kachelfolge(`[->[("einzig, mit Komma")|falsch]]`)

## Zwölf Targets

Die umgekehrte Reihenfolge `12, 11, …, 1` muss ebenso richtig sein wie die
kanonische Reihenfolge.

<!-- data-randomize="true" -->
@Kachelfolge(`[->[(01)|falsch-01]][->[(02)|falsch-02]][->[(03)|falsch-03]][->[(04)|falsch-04]][->[(05)|falsch-05]][->[(06)|falsch-06]][->[(07)|falsch-07]][->[(08)|falsch-08]][->[(09)|falsch-09]][->[(10)|falsch-10]][->[(11)|falsch-11]][->[(12)|falsch-12]]`)
