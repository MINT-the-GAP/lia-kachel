<!--
author: Martin Lommatzsch; Jihad Hyadi
version: 1.0.0
language: de
persistent: true
narrator: Deutsch Female
comment: Kopierbarer Beispielkurs für gruppierte progressive Kachelfolgen in einem nativen LiaScript-Tabellenquiz.

import: https://raw.githubusercontent.com/MINT-the-GAP/lia-kachel/0.7.0/README.md
-->

# Gruppierte Kachelfolgen

## Wortarten zuordnen

Ordne alle Wörter ihrer Wortart zu. Innerhalb einer Zeile ist jede Reihenfolge
zulässig.

| Wortart | Zuordnungen |
| :-----: | :---------: |
| Substantiv/Nomen | @KachelgruppeN(wortarten,`[->[(Haus)]][->[(Kopf)]][->[(Schlange)]][->[(Schule)]][->[(Buch)]][->[(Zug)]]`) |
| Verb | @KachelgruppeN(wortarten,`[->[(lief)]][->[(gesprochen)]][->[(spielt)]][->[(versuchen)]]`) |
| Adjektiv | @KachelgruppeN(wortarten,`[->[(kälter)]][->[(schlecht)]][->[(am besten)]][->[(kurz)]][->[(größer)]][->[(leise)]][->[(älter)]]`) |
| Artikel | @KachelgruppeN(wortarten,`[->[(einer)]][->[(die)]][->[(das)]]`) |
@KachelgruppenCheck(wortarten)
