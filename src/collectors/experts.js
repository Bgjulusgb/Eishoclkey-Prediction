// Sammler: Experten-/Tipp-Prognosen (RSS-Prognosesuche + optionales HTML-
// Scraping). Jede Prognose wird einem Team zugeordnet (GER / AUT / neutral);
// explizite Prozentangaben werten in der Engine zusätzlich.
import * as cheerio from "cheerio";
import { SOURCES, FETCH_CONCURRENCY } from "../config.js";
import { fetchText, shortUrl } from "../lib/http.js";
import { parseFeed } from "../lib/rss.js";
import { annotateItem } from "../lib/annotate.js";
import { mapLimit } from "../lib/concurrency.js";
import { dedupe, sortByDateDesc } from "./util.js";
import { log } from "../lib/log.js";

const MAX_ITEMS = 40;

// Zuordnung aus den bereits annotierten Sentiment-Leans ableiten.
function classify(it) {
  const d = (it.leansGER || 0) - (it.leansAUT || 0);
  let favors = "neutral";
  if (d > 0.1) favors = "GER";
  else if (d < -0.1) favors = "AUT";
  return { favors, delta: Math.round(d * 1000) / 1000 };
}

async function fromRss(src) {
  const res = await fetchText(src.url, { accept: "application/rss+xml, application/xml;q=0.9" });
  if (!res.ok) return { endpoint: { name: src.name, url: shortUrl(src.url), status: "error", count: 0, error: res.error }, items: [] };
  const { items } = parseFeed(res.body);
  return { endpoint: { name: src.name, url: shortUrl(src.url), status: items.length ? "ok" : "empty", count: items.length }, items: items.map((it) => ({ ...it, source: it.author || src.name })) };
}

async function fromHtml(src) {
  const res = await fetchText(src.url);
  if (!res.ok) return { endpoint: { name: src.name, url: shortUrl(src.url), status: "error", count: 0, error: res.error }, items: [] };
  const items = [];
  try {
    const $ = cheerio.load(res.body);
    $(src.itemSelector).each((_, el) => {
      const node = $(el);
      const title = (src.titleSelector ? node.find(src.titleSelector) : node).first().text().trim();
      const link = (src.linkSelector ? node.find(src.linkSelector) : node).first().attr("href") || src.url;
      if (title) items.push({ title, summary: node.text().trim().slice(0, 280), link, source: src.name });
    });
  } catch (err) {
    return { endpoint: { name: src.name, url: shortUrl(src.url), status: "error", count: 0, error: err.message }, items: [] };
  }
  return { endpoint: { name: src.name, url: shortUrl(src.url), status: items.length ? "ok" : "empty", count: items.length }, items };
}

export async function collectExperts() {
  const now = Date.now();
  const results = await mapLimit(SOURCES.expertPages, FETCH_CONCURRENCY, (src) => (src.type === "html" ? fromHtml(src) : fromRss(src)));

  const endpoints = results.map((r) => r.endpoint);
  const all = results.flatMap((r) => r.items);
  const items = sortByDateDesc(dedupe(all))
    .slice(0, MAX_ITEMS)
    .map((it) => annotateItem(it, "expert", now))
    .map((it) => ({ ...it, ...classify(it) }));

  let gerVotes = 0, autVotes = 0, neutral = 0;
  for (const it of items) {
    if (it.favors === "GER") gerVotes += 1;
    else if (it.favors === "AUT") autVotes += 1;
    else neutral += 1;
  }
  const total = items.length;
  const pGER = total ? (gerVotes + 0.5 * neutral) / total : 0.5;

  const anyOk = endpoints.some((e) => e.status === "ok");
  const anyError = endpoints.some((e) => e.status === "error");
  const status = items.length ? "ok" : anyError && !anyOk ? "error" : "empty";
  log.info("experts", `${items.length} Prognosen (GER:${gerVotes} AUT:${autVotes} neutral:${neutral})`);

  return {
    key: "experts", label: "Experten-/Tipp-Prognosen", status, fetched: new Date().toISOString(),
    endpoints, items,
    signal: { pGER, n: total, gerVotes, autVotes, neutral },
  };
}
