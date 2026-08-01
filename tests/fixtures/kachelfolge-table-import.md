<!--
author: Martin Lommatzsch
version: 1.0.0
language: de
persistent: true

import: ../../README.md
-->

# Gruppierte Kachelfolgen im Tabellenquiz

## Wortarten zuordnen

| Wortart | Zuordnungen |
| :-----: | :---------: |
| Substantiv/Nomen | @KachelgruppeN(wortarten,`[->[(Haus)]][->[(Kopf)]][->[(Schlange)]][->[(Schule)]][->[(Buch)]][->[(Zug)]]`) |
| Verb | @KachelgruppeN(wortarten,`[->[(lief)]][->[(gesprochen)]][->[(spielt)]][->[(versuchen)]]`) |
| Adjektiv | @KachelgruppeN(wortarten,`[->[(kälter)]][->[(schlecht)]][->[(am besten)]][->[(kurz)]][->[(größer)]][->[(leise)]][->[(älter)]]`) |
| Artikel | @KachelgruppeN(wortarten,`[->[(einer)]][->[(die)]][->[(das)]]`) |
@KachelgruppenCheck(wortarten)

@ADetails(BE=10;Wortarten)
