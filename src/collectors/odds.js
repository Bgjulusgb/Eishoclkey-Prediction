// Sammler: Wettquoten via HTML-Scraping konfigurierter öffentlicher Seiten.
// Rechnet Dezimalquoten in implizite Wahrscheinlichkeiten um und entfernt die
// Buchmacher-Marge (Vig) durch Normalisierung.
//
// Hinweis: Wettseiten sind oft Cloudflare-geschützt und ändern ihr Markup.
// Schlägt der Abruf fehl oder passt der Selektor nicht, bleibt das Signal leer
// (kein Absturz). Konkrete Seiten werden in config.js (SOURCES.oddsPages)
// hinterlegt.
import * as cheerio from "cheerio";
import { SOURCES } from "../config.js";
import { fetchText, shortUrl } from "../lib/http.js";
import { log } from "../lib/log.js";

const PLAUSIBLE = (o) => Number.isFinite(o) && o >= 1.01 && o <= 51;

function parseDecimal(str) {
  const v = parseFloat(String(str).replace(",", ".").replace(/[^0-9.]/g, ""));
  return PLAUSIBLE(v) ? v : NaN;
}

// Implizite Wahrscheinlichkeit P(GER) aus Dezimalquoten, Vig entfernt.
// Bei 3-Wege-Markt (mit Unentschieden) wird auf den 2-Wege-Ausgang (GER/AUT)
// normalisiert, das Remis also proportional aufgeteilt.
function impliedFromBook(odds, teamOrder) {
  const idxGER = teamOrder.indexOf("GER");
  const idxAUT = teamOrder.indexOf("AUT");
  if (idxGER < 0 || idxAUT < 0) return null;
  const oGER = odds[idxGER];
  const oAUT = odds[idxAUT];
  if (!PLAUSIBLE(oGER) || !PLAUSIBLE(oAUT)) return null;
  const invGER = 1 / oGER;
  const invAUT = 1 / oAUT;
  const pGER = invGER / (invGER + invAUT);
  return { oddsGER: oGER, oddsAUT: oAUT, pGER };
}

async function scrapeBook(src) {
  const res = await fetchText(src.url);
  if (!res.ok) {
    return { endpoint: { name: src.name, url: shortUrl(src.url), status: "error", count: 0, error: res.error }, book: null };
  }
  try {
    const $ = cheerio.load(res.body);
    const values = [];
    $(src.decimalSelector).each((_, el) => {
      const v = parseDecimal($(el).text());
      if (PLAUSIBLE(v)) values.push(v);
    });
    const teamOrder = src.teamOrder || ["GER", "AUT"];
    const odds = values.slice(0, teamOrder.length);
    const implied = impliedFromBook(odds, teamOrder);
    if (!implied) {
      return { endpoint: { name: src.name, url: shortUrl(src.url), status: "empty", count: 0 }, book: null };
    }
    return {
      endpoint: { name: src.name, url: shortUrl(src.url), status: "ok", count: 1 },
      book: { name: src.name, ...implied },
    };
  } catch (err) {
    return { endpoint: { name: src.name, url: shortUrl(src.url), status: "error", count: 0, error: err.message }, book: null };
  }
}

export async function collectOdds() {
  const endpoints = [];
  const books = [];

  for (const src of SOURCES.oddsPages) {
    const { endpoint, book } = await scrapeBook(src);
    endpoints.push(endpoint);
    if (book) books.push(book);
  }

  const n = books.length;
  const pGER = n ? books.reduce((s, b) => s + b.pGER, 0) / n : 0.5;
  const status = n ? "ok" : SOURCES.oddsPages.length ? "error" : "empty";

  if (SOURCES.oddsPages.length === 0) {
    log.info("odds", "keine Wettseiten konfiguriert (SOURCES.oddsPages) – Signal inaktiv");
  } else {
    log.info("odds", `${n}/${SOURCES.oddsPages.length} Buchmacher gelesen (Status: ${status})`);
  }

  return {
    key: "odds",
    label: "Wettquoten (HTML-Scraping)",
    status,
    fetched: new Date().toISOString(),
    endpoints,
    items: books.map((b) => ({
      title: b.name,
      summary: `GER ${b.oddsGER.toFixed(2)} : ${b.oddsAUT.toFixed(2)} AUT  →  P(GER)=${(b.pGER * 100).toFixed(1)}%`,
      link: "",
      sourceType: "odds",
      pGER: b.pGER,
    })),
    signal: { pGER, n },
  };
}
