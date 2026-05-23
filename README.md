# Social Prediction Dashboard – Deutschland vs. Österreich

Vollständig **lokal** laufendes Node.js-Dashboard, das aus **öffentlich
zugänglichen** Quellen eine *soziale Gewinnwahrscheinlichkeit* für beide Teams
berechnet und unter `http://127.0.0.1:4712` anzeigt.

> **Spiel:** Deutschland vs. Österreich · IIHF WM 2026, Gruppe A
> **Zeit:** 23. Mai 2026, 20:15 MESZ (18:15 UTC) · Swiss Life Arena, Zürich

Keine API-Keys, kein OAuth, kein Abo, kein kostenpflichtiger Dienst.

## Schnellstart

```bash
npm install
npm start
# Dashboard öffnen: http://127.0.0.1:4712
```

Einmaliger Sammellauf ohne Server (Debug):

```bash
npm run refresh
```

Tests (offline, mit lokalem Fixture-Server):

```bash
node test/integration.test.mjs
```

## Datenquellen (alle ohne Key)

| Signal | Quelle | Technik |
| --- | --- | --- |
| Medienartikel | Google News RSS | RSS-Parsing |
| Reddit-Posts | `reddit.com/r/<sub>.rss` (Atom) | Atom-Parsing |
| Experten-/Tipp-Prognosen | Google-News-Prognosesuche + optionale Tippseiten | RSS + HTML-Scraping (cheerio) |
| Wettquoten | konfigurierbare öffentliche Wettseiten | HTML-Scraping (cheerio) |

Alle Netzwerkzugriffe laufen über **undici** mit Timeout, Redirect-Folgen und
Backoff-Retry. Fällt eine Quelle aus, läuft das Dashboard weiter und zeigt den
Quellenstatus an.

## Wie die Wahrscheinlichkeit entsteht

Pro Signal wird eine Einzelwahrscheinlichkeit `P(GER gewinnt)` bestimmt:

- **Wettquoten** → implizite Wahrscheinlichkeit aus den Dezimalquoten,
  Buchmacher-Marge (Vig) wird herausgerechnet.
- **Experten** → Stimmenanteil der Prognosen pro Team.
- **Medien/Reddit** → zweisprachige (DE/EN) Lexikon-Sentimentanalyse mit
  Negations- und Richtungserkennung („A schlägt B"), satzweise den Teams
  zugeordnet.
- **Form & Stärke (Prior)** → editierbare Annahme aus `src/config.js`.

Die Signale werden als **gewichteter Mittelwert** kombiniert, wobei jedes Signal
zusätzlich mit einer datenabhängigen Konfidenz `c = n/(n+k)` skaliert wird –
wenig Daten bedeuten wenig Einfluss. Der Prior ist immer vorhanden, sodass auch
ohne Live-Daten ein sinnvoller Ausgangswert existiert (das Dashboard weist
darauf transparent hin).

## Konfiguration

Alles Wichtige steht in [`src/config.js`](src/config.js): Quellen-URLs,
Signalgewichte, Konfidenz-Sättigung, Aktualisierungsintervall und der
Form-/Stärke-Prior. Eigene Wettseiten lassen sich unter `SOURCES.oddsPages`
mit CSS-Selektor und Team-Reihenfolge ergänzen.

## Projektstruktur

```
src/
  server.js            HTTP-Server + JSON-API (127.0.0.1:4712)
  store.js             Zustand, Scheduler, Historie
  config.js            Quellen, Gewichte, Prior (editierbar)
  collectors/          googleNews · reddit · experts · odds
  lib/                 http (undici) · rss · sentiment · text · log
  engine/probability.js  Signal-Fusion -> P(GER)/P(AUT)
public/                Dashboard (HTML/CSS/Vanilla-JS)
test/integration.test.mjs  Offline-End-to-End-Test
```

## Hinweis zu eingeschränkten Umgebungen

In Sandboxes mit Host-Allowlist (z. B. Claude Code on the Web) sind die
externen Quellen oft nicht erreichbar. Das Dashboard startet dann trotzdem,
zeigt den Quellenstatus „error/empty" und nutzt den Prior. Lokal ausgeführt
(`npm start` auf dem eigenen Rechner) greifen die Live-Sammler normal.
