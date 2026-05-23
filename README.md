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
| Medienartikel | Google News RSS (DE/AT/EN-Editionen, Themen: Aufstellung/Verletzung) | RSS-Parsing |
| Reddit-Posts | `reddit.com/.../.json` (Engagement) mit `.rss`-Fallback | JSON + Atom |
| Experten-/Tipp-Prognosen | Google-News-Prognosesuche (DE/EN) + optionale Tippseiten | RSS + HTML-Scraping (cheerio) |
| Wettquoten | konfigurierbare öffentliche Wettseiten | HTML-Scraping (cheerio) |

Alle Netzwerkzugriffe laufen über **undici** mit Timeout, Redirect-Folgen,
Backoff-Retry und begrenzter Parallelität. Fällt eine Quelle aus, läuft das
Dashboard weiter und zeigt den Quellenstatus an.

## Wie die Wahrscheinlichkeit entsteht

Jedes Item (Artikel/Post/Prognose) wird angereichert mit Sentiment, einer
**Aktualitätsgewichtung** (Halbwertszeit), einer **Glaubwürdigkeitsgewichtung**
(je Quelle) und – bei Reddit – einer **Engagement-Gewichtung** (Upvotes/
Kommentare). Daraus entsteht pro Signal eine Einzelwahrscheinlichkeit
`P(GER gewinnt)`:

- **Wettquoten** → implizite Wahrscheinlichkeit aus den Dezimalquoten, Vig
  herausgerechnet (Markt-Anker).
- **Experten** → Stimmenanteil der Prognosen + explizite Prozentangaben aus dem
  Text.
- **Medien/Reddit** → zweisprachige (DE/EN) Lexikon-Sentimentanalyse mit
  Negations- und Richtungserkennung („A schlägt B"), satzweise und gewichtet
  den Teams zugeordnet.
- **Form & Stärke (Prior)** → editierbare Annahme aus `src/config.js`.

Die Signale werden per **Logit-Pooling** (log-lineares Opinion-Pooling im
Log-Odds-Raum) fusioniert – die theoretisch saubere Methode zur Aggregation von
Wahrscheinlichkeiten. Effektives Gewicht = Basisgewicht × Konfidenz
`c = n/(n+k)`; Wettquoten erhalten als kalibrierter Markt einen zusätzlichen
Anker-Boost. Zusätzlich werden ausgegeben:

- **Unsicherheitsband** aus Signal-Uneinigkeit + Datenmenge,
- **Momentum** (Veränderung seit dem letzten Lauf),
- **Buzz/Aufmerksamkeit** je Team,
- **Risikofaktoren** (Verletzung/Sperre/Torwart/Comeback) aus dem Text,
- **Ergebnisprognose**: ein **Poisson/Skellam-Tormodell** leitet aus der
  Siegwahrscheinlichkeit erwartete Tore je Team, die wahrscheinlichsten
  Endergebnisse und die Ausgänge in regulärer Spielzeit ab.

## Konfiguration

Alles Wichtige steht in [`src/config.js`](src/config.js): Quellen-URLs,
Kombinationsmethode (`COMBINATION`), Signalgewichte, Markt-Anker, Konfidenz-
Sättigung, Recency/Glaubwürdigkeit/Risiko-Schlüsselwörter, das Tormodell
(`GOALS`) und der Form-/Stärke-Prior. Eigene Wettseiten lassen sich unter
`SOURCES.oddsPages` mit CSS-Selektor und Team-Reihenfolge ergänzen.

## Projektstruktur

```
src/
  server.js            HTTP-Server + JSON-API (127.0.0.1:4712)
  store.js             Zustand, Scheduler, Historie, Momentum
  config.js            Quellen, Gewichte, Prior, Tormodell (editierbar)
  collectors/          googleNews · reddit (JSON/RSS) · experts · odds
  lib/                 http (undici) · rss · sentiment · text · recency ·
                       credibility · extract · annotate · concurrency · log
  engine/
    probability.js     Signal-Fusion (Logit) -> P(GER)/P(AUT) + Analyse
    goals.js           Poisson/Skellam-Ergebnisprognose
public/                Dashboard (HTML/CSS/Vanilla-JS)
test/integration.test.mjs  Offline-End-to-End-Test (14 Checks)
```

## Hinweis zu eingeschränkten Umgebungen

In Sandboxes mit Host-Allowlist (z. B. Claude Code on the Web) sind die
externen Quellen oft nicht erreichbar. Das Dashboard startet dann trotzdem,
zeigt den Quellenstatus „error/empty" und nutzt den Prior. Lokal ausgeführt
(`npm start` auf dem eigenen Rechner) greifen die Live-Sammler normal.
