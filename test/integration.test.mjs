// Offline-Integrationstest: lokaler Fixture-Server + In-Place-Mutation der
// SOURCES. Prüft die komplette Pipeline ohne externe Netzzugriffe:
// HTTP/Redirect, RSS/Atom + Reddit-JSON, Sentiment, Extraktion (Ergebnisse/
// Prozente/Risiken), Recency/Glaubwürdigkeit/Engagement, Logit-Fusion,
// Unsicherheit, Analyse-Kennzahlen und das Erwartete-Tore-Modell.
//
// Inhalte hier sind klar erkennbare TESTDATEN.
import http from "node:http";
import assert from "node:assert/strict";
import { SOURCES, GOALS } from "../src/config.js";
import { fetchText } from "../src/lib/http.js";
import { analyze, sentimentSignal } from "../src/lib/sentiment.js";
import { recencyWeight } from "../src/lib/recency.js";
import { credibility } from "../src/lib/credibility.js";
import { extractScorelines, extractPercentages, extractRiskFactors } from "../src/lib/extract.js";
import { expectedGoals } from "../src/engine/goals.js";
import { computeProbability } from "../src/engine/probability.js";

const recent = (hAgo) => new Date(Date.now() - hAgo * 3600_000).toUTCString();

const NEWS_RSS = `<?xml version="1.0"?>
<rss version="2.0"><channel><title>Test</title>
  <item><title>Deutschland geht als klarer Favorit ins Spiel - Kicker</title>
    <description>Die Deutschen sind ueberlegen und dominieren die Gruppe.</description>
    <link>http://x/n1</link><pubDate>${recent(2)}</pubDate></item>
  <item><title>Oesterreich bangt um verletzten Verteidiger - ORF</title>
    <description>Der angeschlagene Verteidiger ist fraglich, Oesterreich droht ein Ausfall.</description>
    <link>http://x/n2</link><pubDate>${recent(3)}</pubDate></item>
  <item><title>Deutschland gewinnt Test souveraen - Sport1</title>
    <description>Starke und ueberzeugende Vorstellung der deutschen Mannschaft.</description>
    <link>http://x/n3</link><pubDate>${recent(5)}</pubDate></item>
</channel></rss>`;

const REDDIT_JSON = JSON.stringify({
  data: { children: [
    { kind: "t3", data: { title: "Germany looks dominant against Austria", permalink: "/r/hockey/a",
      selftext: "Germany is strong. Austria struggles and is the underdog.", score: 250, num_comments: 40,
      created_utc: Math.floor(Date.now() / 1000) - 3600, subreddit: "hockey" } },
    { kind: "t3", data: { title: "Austria hype after big win over Germany", permalink: "/r/hockey/b",
      selftext: "Austria is confident and strong.", score: 4, num_comments: 1,
      created_utc: Math.floor(Date.now() / 1000) - 7200, subreddit: "hockey" } },
  ] },
});

const EXPERTS_RSS = `<?xml version="1.0"?>
<rss version="2.0"><channel><title>Tipps</title>
  <item><title>Prognose: Deutschland gewinnt 4:2 gegen Oesterreich</title><link>http://x/e1</link><pubDate>${recent(4)}</pubDate></item>
  <item><title>Experten sehen Deutschland bei 65% Siegchance</title><link>http://x/e2</link><pubDate>${recent(4)}</pubDate></item>
  <item><title>Tipp: Oesterreich ueberrascht und gewinnt</title><link>http://x/e3</link><pubDate>${recent(6)}</pubDate></item>
</channel></rss>`;

const ODDS_HTML = `<!doctype html><html><body><table><tr>
  <td class="odds-value">1.50</td><td class="odds-value">2.60</td>
</tr></table></body></html>`;

function startFixtureServer() {
  const server = http.createServer((req, res) => {
    const send = (b, t = "application/xml; charset=utf-8") => { res.writeHead(200, { "content-type": t }); res.end(b); };
    if (req.url.startsWith("/redirect")) { res.writeHead(302, { location: "/news.rss" }); return res.end(); }
    if (req.url.startsWith("/news")) return send(NEWS_RSS);
    if (req.url.startsWith("/reddit.json")) return send(REDDIT_JSON, "application/json");
    if (req.url.startsWith("/reddit")) return send(REDDIT_JSON, "application/json");
    if (req.url.startsWith("/experts")) return send(EXPERTS_RSS);
    if (req.url.startsWith("/odds")) return send(ODDS_HTML, "text/html; charset=utf-8");
    res.writeHead(404).end("nope");
  });
  return new Promise((r) => server.listen(0, "127.0.0.1", () => r(server)));
}

const tests = [];
const test = (name, fn) => tests.push([name, fn]);

// --- Sentiment -------------------------------------------------------------
test("Sentiment ordnet Lob dem genannten Team zu", () => {
  const a = analyze("Deutschland ist klarer Favorit und dominiert.");
  assert.ok(a.perTeam.GER.mean > 0.2);
  assert.equal(a.perTeam.AUT.count, 0);
});
test("Negation kehrt Polaritaet um", () => {
  assert.ok(analyze("Deutschland ist nicht stark.").perTeam.GER.mean < analyze("Deutschland ist stark.").perTeam.GER.mean);
});
test("Richtungssatz: A gewinnt gegen B -> A+, B-", () => {
  const a = analyze("Deutschland gewinnt klar gegen Oesterreich.");
  assert.ok(a.perTeam.GER.mean > 0 && a.perTeam.AUT.mean < 0);
});
test("sentimentSignal gewichtet annotierte Items", () => {
  const items = [
    { analysis: { gerMean: 0.8, gerCount: 1, autMean: 0, autCount: 0 }, weight: 3 },
    { analysis: { gerMean: 0, gerCount: 0, autMean: 0.5, autCount: 1 }, weight: 0.2 },
  ];
  const s = sentimentSignal(items);
  assert.equal(s.n, 2);
  assert.ok(s.pGER > 0.6, `pGER ${s.pGER}`);
});

// --- Recency / Credibility -------------------------------------------------
test("Recency: neuer schlaegt aelter", () => {
  const now = Date.now();
  assert.ok(recencyWeight(new Date(now).toISOString(), now) > recencyWeight(new Date(now - 48 * 3600_000).toISOString(), now));
});
test("Credibility: bekannte Quelle > unbekannt, news-Basis > reddit-Basis", () => {
  assert.ok(credibility("news", "Kicker", "http://kicker.de/x") > credibility("news", "Randomblog", "http://random.example/x"));
  assert.ok(credibility("news", "x", "") > credibility("reddit", "x", ""));
});

// --- Extraktion ------------------------------------------------------------
test("Ergebnis-Extraktion (beide Teams flankieren)", () => {
  assert.deepEqual(extractScorelines("Deutschland gewinnt 4:2 gegen Oesterreich"), [{ ger: 4, aut: 2 }]);
});
test("Ergebnis-Extraktion ignoriert Uhrzeiten (20:15)", () => {
  assert.equal(extractScorelines("Anpfiff um 20:15 Uhr in Zuerich").length, 0);
});
test("Prozent-Extraktion ordnet Team zu", () => {
  assert.deepEqual(extractPercentages("Deutschland bei 65% Favorit"), [{ team: "GER", p: 0.65 }]);
});
test("Risiko-Extraktion erkennt Verletzung beim Team", () => {
  const r = extractRiskFactors("Oesterreich bangt um verletzten Verteidiger.");
  assert.ok(r.AUT.injury.length >= 1 && r.GER.injury.length === 0);
});

// --- Erwartete Tore (Poisson/Skellam) --------------------------------------
test("expectedGoals reproduziert die Siegwahrscheinlichkeit", () => {
  const g = expectedGoals(0.5);
  assert.ok(Math.abs(g.twoWayGER - 0.5) < 0.02, `twoWay ${g.twoWayGER}`);
  assert.ok(Math.abs(g.lambdaGER - g.lambdaAUT) < 0.1);
  const sum = g.regulation.ger + g.regulation.draw + g.regulation.aut;
  assert.ok(Math.abs(sum - 1) < 0.02, `reg sum ${sum}`);
});
test("expectedGoals: hoehere pGER -> mehr GER-Tore", () => {
  const g = expectedGoals(0.72);
  assert.ok(g.lambdaGER > g.lambdaAUT);
  assert.ok(Math.abs(g.twoWayGER - 0.72) < 0.02);
  assert.equal(g.topScorelines.length, GOALS.topN);
});

// --- Logit-Fusion ----------------------------------------------------------
test("Logit-Pooling + Markt-Anker: starke Quote dominiert", () => {
  const pred = computeProbability({ odds: { signal: { pGER: 0.8, n: 3 } } });
  assert.equal(pred.meta.combination, "logit");
  assert.equal(pred.favorite, "GER");
  assert.ok(pred.pGER > 0.65, `pGER ${pred.pGER}`);
  assert.ok(pred.uncertainty.low < pred.pGER && pred.pGER < pred.uncertainty.high);
});

// --- Volle Pipeline gegen lokale Fixtures ----------------------------------
test("End-to-End inkl. Extraktion, Engagement, Tore", async () => {
  const server = await startFixtureServer();
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const r = await fetchText(`${base}/redirect`);
    assert.ok(r.ok && r.body.includes("Favorit"), "Redirect nicht gefolgt");

    SOURCES.googleNews.length = 0;
    SOURCES.googleNews.push({ query: "test", url: `${base}/news.rss` });
    SOURCES.reddit.length = 0;
    SOURCES.reddit.push({ name: "r/test", json: `${base}/reddit.json`, rss: `${base}/reddit.atom` });
    SOURCES.expertPages.length = 0;
    SOURCES.expertPages.push({ name: "tips", type: "rss", url: `${base}/experts.rss` });
    SOURCES.oddsPages.length = 0;
    SOURCES.oddsPages.push({ name: "TestBook", url: `${base}/odds.html`, decimalSelector: ".odds-value", teamOrder: ["GER", "AUT"] });

    const { collectAll } = await import("../src/collectors/index.js");
    const data = await collectAll();

    assert.equal(data.news.status, "ok");
    assert.equal(data.reddit.status, "ok");
    // Reddit-JSON: Engagement-Gewicht beim viralen Post deutlich > 1.
    const viral = data.reddit.items.find((i) => /dominant/i.test(i.title));
    assert.ok(viral && viral.analysis.engagementW > 1.5, `engagementW ${viral?.analysis.engagementW}`);
    // Publisher aus Google-News-Titel extrahiert.
    assert.ok(data.news.items.some((i) => i.source === "Kicker"));

    // Odds: 1.50 vs 2.60 -> ~0.634
    const expOdds = 1 / 1.5 / (1 / 1.5 + 1 / 2.6);
    assert.ok(Math.abs(data.odds.signal.pGER - expOdds) < 0.005);

    const pred = computeProbability(data, { prevPGER: 0.5 });
    assert.equal(pred.meta.activeLiveSignals, 4);
    assert.equal(pred.meta.combination, "logit");
    assert.equal(pred.favorite, "GER");
    assert.ok(typeof pred.meta.momentum === "number");

    // Analyse-Kennzahlen.
    assert.equal(pred.analytics.scoreConsensus.mostCommon, "4:2");
    assert.ok(pred.analytics.explicitPercentages.n >= 1);
    assert.ok(Math.abs(pred.analytics.explicitPercentages.p - 0.65) < 0.06, `explicit ${pred.analytics.explicitPercentages.p}`);
    assert.ok(pred.analytics.risk.AUT.injury.count >= 1);
    assert.ok(pred.analytics.buzz.GER > 0 && pred.analytics.buzz.AUT > 0);

    // Tore-Modell konsistent zur Endwahrscheinlichkeit.
    assert.ok(Math.abs(pred.goals.twoWayGER - pred.pGER) < 0.03, `goals ${pred.goals.twoWayGER} vs ${pred.pGER}`);
    assert.equal(pred.goals.topScorelines.length, GOALS.topN);
    const regSum = pred.goals.regulation.ger + pred.goals.regulation.draw + pred.goals.regulation.aut;
    assert.ok(Math.abs(regSum - 1) < 0.02);
  } finally {
    server.close();
  }
});

// --- Runner ----------------------------------------------------------------
let pass = 0, fail = 0;
for (const [name, fn] of tests) {
  try { await fn(); pass++; console.log(`\x1b[32mPASS\x1b[0m ${name}`); }
  catch (e) { fail++; console.log(`\x1b[31mFAIL\x1b[0m ${name}\n      ${e.message}`); }
}
console.log(`\n${pass} bestanden, ${fail} fehlgeschlagen`);
process.exit(fail ? 1 : 0);
