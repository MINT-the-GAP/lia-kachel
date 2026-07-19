<!--
author:   lia-Kachel progressive integration test
language: de
import:   ../../README.md
-->

# Importtest für @KachelfolgeN

## Unbekannte Länge mit falschen und gleichnamigen Kacheln

Zu Beginn darf pro Quiz nur ein Target sichtbar sein. Jede Belegung öffnet
höchstens ein weiteres Target; die richtigen Kacheln bleiben beliebig
permutierbar.

Quiz N-A:

<!-- data-randomize="true" -->
@KachelfolgeN(`[->[gleich|(A-1)|falsch-A1]][->[falsch-A2|(A-2)]][->[(gleich)|falsch-A3]][->[falsch-A4|(A-4)|gleich]]`)

Quiz N-B:

<!-- data-randomize="true" -->
@KachelfolgeN(`[->[(B-1)|gleich|falsch-B1]][->[gleich|(B-2)|falsch-B2]][->[(gleich)|falsch-B3]]`)

## Direkt aufeinanderfolgende progressive Makros

@KachelfolgeN(`[->[(C-1)|falsch-C1]][->[falsch-C2|(C-2)]]`)
@KachelfolgeN(`[->[falsch-D1|(D-1)]][->[(D-2)|falsch-D2]]`)

## Ein einziges Target

<!-- data-randomize="true" -->
@KachelfolgeN(`[->[falsch|(einzig)]]`)

## Zwölf Targets

<!-- data-randomize="true" -->
@KachelfolgeN(`[->[(01)|falsch-01]][->[falsch-02|(02)]][->[(03)|falsch-03]][->[falsch-04|(04)]][->[(05)|falsch-05]][->[falsch-06|(06)]][->[(07)|falsch-07]][->[falsch-08|(08)]][->[(09)|falsch-09]][->[falsch-10|(10)]][->[(11)|falsch-11]][->[falsch-12|(12)]]`)
