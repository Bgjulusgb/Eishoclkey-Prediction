// Offline-Integrationstest: startet einen lokalen Fixture-Server und lenkt die
// Sammler per In-Place-Mutation der SOURCES darauf. Damit wird die komplette
// Pipeline (HTTP inkl. Redirect, RSS/Atom-Parsing, Sentiment, Odds-Scraping,
// Wahrscheinlichkeits-Engine) ohne externe Netzzugriffe geprüft.
//
// Die Inhalte hier sind klar erkennbare TESTDATEN – keine echten Prognosen.
import http from "node:http";
import assert from "node:assert/strict";
import { SOURCES } from "../src/config.js";
import { fetchText } from "../src/lib/http.js";
import { parseFeed } from "../src/lib/rss.js";
import { analyze, sentimentSignal } from "../src/lib/sentiment.js";

const NEWS_RSS = `<?xml version="1.0"?>
<rss version="2.0"><channel><title>Test News</title>
  <item><title>Deutschland geht als klarer Favorit ins Spiel</title>
    <description>Die Deutschen sind ueberlegen und dominieren die Gruppe.</description>
    <link>http://x/n1</link><pubDate>Fri, 23 May 2026 10:00:00 GMT</pubDate></item>
  <item><title>Oesterreich droht gegen Deutschland eine Niederlage</title>
    <description>Oesterreich gilt als Aussenseiter und ist chancenlos.</description>
    <link>http://x/n2</link><pubDate>Fri, 23 May 2026 09:00:00 GMT</pubDate></item>
  <item><title>Deutschland gewinnt Test souveraen</title>
    <description>Starke und ueberzeugende Vorstellung der deutschen Mannschaft.</description>
    <link>http://x/n3</link><pubDate>Fri, 23 May 2026 08:00:00 GMT</pubDate></item>
</channel></rss>`;

const REDDIT_ATOM = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom"><title>r/test</title>
  <entry><title>Germany looks dominant against Austria</title>
    <link href="http://x/r1"/><updated>2026-05-23T07:00:00Z</updated>
    <content type="html">&lt;p&gt;Germany is strong. Austria struggles and is the underdog.&lt;/p&gt;</content>
    <author><name>u/test</name></author></entry>
  <entry><title>Austria hockey hype after big win</title>
    <link href="http://x/r2"/><updated>2026-05-23T06:00:00Z</updated>
    <content type="html">Austria is confident and strong.</content></entry>
</feed>`;

const EXPERTS_RSS = `<?xml version="1.0"?>
<rss version="2.0"><channel><title>Tipps</title>
  <item><title>Prognose: Deutschland gewinnt klar gegen Oesterreich</title><link>http://x/e1</link></item>
  <item><title>Tipp: Oesterreich ueberrascht und gewinnt</title><link>http://x/e2</link></item>
  <item><title>Experten sehen Deutschland als Favorit</title><link>http://x/e3</link></item>
</channel></rss>`;

const ODDS_HTML = `<!doctype html><html><body>
  <table><tr>
    <td class="odds-value">1.50</td>
    <td class="odds-value">2.60</td>
  </tr></table></body></html>`;

function startFixtureServer() {
  const server = http.createServer((req, res) => {
    const send = (body, type = "application/xml; charset=utf-8") => {
      res.writeHead(200, { "content-type": type });
      res.end(body);
    };
    if (req.url.startsWith("/redirect")) {
      res.writeHead(302, { location: "/news.rss" });
      return res.end();
    }
    if (req.url.startsWith("/news")) return send(NEWS_RSS);
    if (req.url.startsWith("/reddit")) return send(REDDIT_ATOM);
    if (req.url.startsWith("/experts")) return send(EXPERTS_RSS);
    if (req.url.startsWith("/odds")) return send(ODDS_HTML, "text/html; charset=utf-8");
    res.writeHead(404).end("nope");
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
}

const tests = [];
const test = (name, fn) => tests.push([name, fn]);

// --- Unit-nahe Bausteine ---------------------------------------------------
test("Sentiment ordnet Lob dem genannten Team zu", () => {
  const a = analyze("Deutschland ist klarer Favorit und dominiert.");
  assert.ok(a.perTeam.GER.mean > 0.2, `GER mean ${a.perTeam.GER.mean}`);
  assert.equal(a.perTeam.AUT.count, 0);
});

test("Negation kehrt Polaritaet um", () => {
  const pos = analyze("Deutschland ist stark.").perTeam.GER.mean;
  const neg = analyze("Deutschland ist nicht stark.").perTeam.GER.mean;
  assert.ok(neg < pos, `neg ${neg} sollte < pos ${pos} sein`);
});

test("sentimentSignal liefert pGER>0.5 wenn GER positiver bewertet wird", () => {
  const items = [
    { title: "Deutschland dominiert", summary: "ueberlegen und stark" },
    { title: "Oesterreich chancenlos", summary: "schwach und Aussenseiter" },
  ];
  const sig = sentimentSignal(items);
  assert.ok(sig.pGER > 0.5, `pGER ${sig.pGER}`);
  assert.equal(sig.n, 2);
});

// --- Volle Pipeline gegen lokale Fixtures ----------------------------------
test("End-to-End: Sammler + Engine gegen lokale Fixtures (inkl. Redirect)", async () => {
  const server = await startFixtureServer();
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    // fetchText folgt dem 302-Redirect.
    const r = await fetchText(`${base}/redirect`);
    assert.ok(r.ok && r.body.includes("Favorit"), "Redirect wurde nicht gefolgt");

    // SOURCES in-place auf Fixtures umlenken (gleiche Objektreferenz wie in den Sammlern).
    SOURCES.googleNews.length = 0;
    SOURCES.googleNews.push({ query: "test", url: `${base}/news.rss` });
    SOURCES.reddit.length = 0;
    SOURCES.reddit.push({ name: "r/test", url: `${base}/reddit.atom` });
    SOURCES.expertPages.length = 0;
    SOURCES.expertPages.push({ name: "tips", type: "rss", url: `${base}/experts.rss` });
    SOURCES.oddsPages.length = 0;
    SOURCES.oddsPages.push({ name: "TestBook", url: `${base}/odds.html`, decimalSelector: ".odds-value", teamOrder: ["GER", "AUT"] });

    // Sammler erst NACH der Mutation importieren/aufrufen.
    const { collectAll } = await import("../src/collectors/index.js");
    const { computeProbability, computePrior } = await import("../src/engine/probability.js");

    const data = await collectAll();
    assert.equal(data.news.status, "ok", "news sollte ok sein");
    assert.ok(data.news.items.length >= 2, `news items ${data.news.items.length}`);
    assert.equal(data.reddit.status, "ok", "reddit sollte ok sein");
    assert.ok(data.reddit.items.length >= 1, `reddit items ${data.reddit.items.length}`);

    // Experten: 2x GER, 1x AUT -> pGER ~ 0.667
    assert.equal(data.experts.signal.n, 3);
    assert.ok(Math.abs(data.experts.signal.pGER - 2 / 3) < 0.01, `experts pGER ${data.experts.signal.pGER}`);

    // Odds: 1.50 vs 2.60 -> implied pGER ~ 0.634
    assert.equal(data.odds.signal.n, 1);
    const expectedOdds = 1 / 1.5 / (1 / 1.5 + 1 / 2.6);
    assert.ok(Math.abs(data.odds.signal.pGER - expectedOdds) < 0.005, `odds pGER ${data.odds.signal.pGER}`);

    // Engine: alle vier Live-Signale aktiv, Endwert plausibel (GER favorisiert).
    const pred = computeProbability(data);
    assert.equal(pred.meta.activeLiveSignals, 4, "alle Live-Signale sollten aktiv sein");
    assert.ok(pred.meta.liveContribution > 0.5, `liveContribution ${pred.meta.liveContribution}`);
    assert.ok(pred.pGER > 0.5 && pred.pGER < 0.85, `finale pGER ${pred.pGER}`);
    assert.equal(pred.favorite, "GER");
    assert.ok(Math.abs(pred.pGER + pred.pAUT - 1) < 1e-9, "pGER+pAUT muss 1 ergeben");

    // Prior bleibt deterministisch.
    const prior = computePrior();
    assert.ok(prior.pGER > 0.55 && prior.pGER < 0.62, `prior ${prior.pGER}`);
  } finally {
    server.close();
  }
});

// --- Runner ----------------------------------------------------------------
let passed = 0;
let failed = 0;
for (const [name, fn] of tests) {
  try {
    await fn();
    passed += 1;
    console.log(`\x1b[32mPASS\x1b[0m ${name}`);
  } catch (err) {
    failed += 1;
    console.log(`\x1b[31mFAIL\x1b[0m ${name}\n      ${err.message}`);
  }
}
console.log(`\n${passed} bestanden, ${failed} fehlgeschlagen`);
process.exit(failed ? 1 : 0);
