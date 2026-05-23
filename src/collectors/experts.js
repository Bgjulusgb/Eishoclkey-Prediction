// Sammler: Experten-/Tipp-Prognosen.
// Unterstützt RSS-Feeds (z. B. Google-News-Prognosesuche) und optionales
// HTML-Scraping konfigurierter Tippseiten via cheerio. Jede Prognose wird
// anhand des Sentiments einem Team zugeordnet (GER / AUT / neutral).
import * as cheerio from "cheerio";
import { SOURCES } from "../config.js";
import { fetchText, shortUrl } from "../lib/http.js";
import { parseFeed } from "../lib/rss.js";
import { analyze } from "../lib/sentiment.js";
import { dedupe, sortByDateDesc } from "./util.js";
import { log } from "../lib/log.js";

const MAX_ITEMS = 30;

// Ordnet eine Prognose einem Team zu.
function classify(title, summary) {
  const a = analyze(`${title}. ${summary}`);
  const d = a.perTeam.GER.mean - a.perTeam.AUT.mean;
  let favors = "neutral";
  if (d > 0.1) favors = "GER";
  else if (d < -0.1) favors = "AUT";
  return { favors, delta: Math.round(d * 1000) / 1000 };
}

async function fromRss(src) {
  const res = await fetchText(src.url, { accept: "application/rss+xml, application/xml;q=0.9" });
  if (!res.ok) return { endpoint: { name: src.name, url: shortUrl(src.url), status: "error", count: 0, error: res.error }, items: [] };
  const { items } = parseFeed(res.body);
  return {
    endpoint: { name: src.name, url: shortUrl(src.url), status: items.length ? "ok" : "empty", count: items.length },
    items: items.map((it) => ({ ...it, sourceType: "expert", source: src.name })),
  };
}

async function fromHtml(src) {
  const res = await fetchText(src.url);
  if (!res.ok) return { endpoint: { name: src.name, url: shortUrl(src.url), status: "error", count: 0, error: res.error }, items: [] };
  let items = [];
  try {
    const $ = cheerio.load(res.body);
    $(src.itemSelector).each((_, el) => {
      const node = $(el);
      const title = (src.titleSelector ? node.find(src.titleSelector) : node).first().text().trim();
      const link = (src.linkSelector ? node.find(src.linkSelector) : node).first().attr("href") || src.url;
      if (title) items.push({ title, summary: node.text().trim().slice(0, 280), link, sourceType: "expert", source: src.name });
    });
  } catch (err) {
    return { endpoint: { name: src.name, url: shortUrl(src.url), status: "error", count: 0, error: err.message }, items: [] };
  }
  return {
    endpoint: { name: src.name, url: shortUrl(src.url), status: items.length ? "ok" : "empty", count: items.length },
    items,
  };
}

export async function collectExperts() {
  const endpoints = [];
  let all = [];

  for (const src of SOURCES.expertPages) {
    const { endpoint, items } = src.type === "html" ? await fromHtml(src) : await fromRss(src);
    endpoints.push(endpoint);
    all = all.concat(items);
  }

  const items = sortByDateDesc(dedupe(all))
    .slice(0, MAX_ITEMS)
    .map((it) => ({ ...it, ...classify(it.title, it.summary) }));

  // Signal: Stimmenanteil pro Team (neutral zählt halb für beide).
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
    key: "experts",
    label: "Experten-/Tipp-Prognosen",
    status,
    fetched: new Date().toISOString(),
    endpoints,
    items,
    signal: { pGER, n: total, gerVotes, autVotes, neutral },
  };
}
