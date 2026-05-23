// Sammler: Wettquoten via HTML-Scraping konfigurierter öffentlicher Seiten.
// Rechnet Dezimalquoten in implizite Wahrscheinlichkeiten um und entfernt die
// Buchmacher-Marge (Vig) durch Normalisierung.
//
// Hinweis: Wettseiten sind oft Cloudflare-geschützt und ändern ihr Markup.
// Schlägt der Abruf fehl oder passt der Selektor nicht, bleibt das Signal leer
// (kein Absturz). Konkrete Seiten in config.js (SOURCES.oddsPages) hinterlegen.
import * as cheerio from "cheerio";
import { SOURCES, FETCH_CONCURRENCY } from "../config.js";
import { fetchText, shortUrl } from "../lib/http.js";
import { mapLimit } from "../lib/concurrency.js";
import { log } from "../lib/log.js";

const PLAUSIBLE = (o) => Number.isFinite(o) && o >= 1.01 && o <= 51;
const round = (n, d = 3) => Math.round(n * 10 ** d) / 10 ** d;

function parseDecimal(str) {
  const v = parseFloat(String(str).replace(",", ".").replace(/[^0-9.]/g, ""));
  return PLAUSIBLE(v) ? v : NaN;
}

// Implizite Wahrscheinlichkeit P(GER) aus Dezimalquoten, Vig entfernt.
// 3-Wege-Markt (mit Remis) wird auf den 2-Wege-Ausgang normalisiert.
function impliedFromBook(odds, teamOrder) {
  const iGER = teamOrder.indexOf("GER");
  const iAUT = teamOrder.indexOf("AUT");
  if (iGER < 0 || iAUT < 0) return null;
  const oGER = odds[iGER], oAUT = odds[iAUT];
  if (!PLAUSIBLE(oGER) || !PLAUSIBLE(oAUT)) return null;
  const invGER = 1 / oGER, invAUT = 1 / oAUT;
  // Overround als Indikator der Buchmacher-Marge (informativ).
  const overround = odds.reduce((a, o) => a + (PLAUSIBLE(o) ? 1 / o : 0), 0);
  return { oddsGER: oGER, oddsAUT: oAUT, pGER: invGER / (invGER + invAUT), overround };
}

async function scrapeBook(src) {
  const res = await fetchText(src.url);
  if (!res.ok) return { endpoint: { name: src.name, url: shortUrl(src.url), status: "error", count: 0, error: res.error }, book: null };
  try {
    const $ = cheerio.load(res.body);
    const values = [];
    $(src.decimalSelector).each((_, el) => {
      const v = parseDecimal($(el).text());
      if (PLAUSIBLE(v)) values.push(v);
    });
    const teamOrder = src.teamOrder || ["GER", "AUT"];
    const implied = impliedFromBook(values.slice(0, teamOrder.length), teamOrder);
    if (!implied) return { endpoint: { name: src.name, url: shortUrl(src.url), status: "empty", count: 0 }, book: null };
    return { endpoint: { name: src.name, url: shortUrl(src.url), status: "ok", count: 1 }, book: { name: src.name, ...implied } };
  } catch (err) {
    return { endpoint: { name: src.name, url: shortUrl(src.url), status: "error", count: 0, error: err.message }, book: null };
  }
}

export async function collectOdds() {
  const results = await mapLimit(SOURCES.oddsPages, FETCH_CONCURRENCY, scrapeBook);
  const endpoints = results.map((r) => r.endpoint);
  const books = results.map((r) => r.book).filter(Boolean);

  const n = books.length;
  const pGER = n ? books.reduce((s, b) => s + b.pGER, 0) / n : 0.5;
  const ps = books.map((b) => b.pGER);
  const spread = n ? round(Math.max(...ps) - Math.min(...ps), 3) : 0;
  const avgOverround = n ? round(books.reduce((s, b) => s + b.overround, 0) / n, 3) : null;
  const status = n ? "ok" : SOURCES.oddsPages.length ? "error" : "empty";

  if (SOURCES.oddsPages.length === 0) log.info("odds", "keine Wettseiten konfiguriert (SOURCES.oddsPages) – Signal inaktiv");
  else log.info("odds", `${n}/${SOURCES.oddsPages.length} Buchmacher gelesen (Status: ${status})`);

  return {
    key: "odds", label: "Wettquoten (HTML-Scraping)", status, fetched: new Date().toISOString(), endpoints,
    items: books.map((b) => ({
      title: b.name,
      summary: `GER ${b.oddsGER.toFixed(2)} : ${b.oddsAUT.toFixed(2)} AUT → P(GER)=${(b.pGER * 100).toFixed(1)}% (Overround ${(b.overround * 100).toFixed(1)}%)`,
      link: "", sourceType: "odds", pGER: round(b.pGER, 3),
    })),
    signal: { pGER: round(pGER, 4), n, spread, avgOverround },
  };
}
