// Sammler: Medienartikel über Google News RSS (kein API-Key).
import { SOURCES, TEAMS } from "../config.js";
import { fetchText, shortUrl } from "../lib/http.js";
import { parseFeed } from "../lib/rss.js";
import { analyze } from "../lib/sentiment.js";
import { normalize } from "../lib/text.js";
import { dedupe, sortByDateDesc, isRelevant } from "./util.js";
import { log } from "../lib/log.js";

const MAX_ITEMS = 40;
const ALL_ALIASES = Object.values(TEAMS).flatMap((t) => t.aliases.map(normalize));

export async function collectNews() {
  const endpoints = [];
  let all = [];

  for (const src of SOURCES.googleNews) {
    const res = await fetchText(src.url, { accept: "application/rss+xml, application/xml;q=0.9" });
    if (!res.ok) {
      endpoints.push({ name: src.query, url: shortUrl(src.url), status: "error", count: 0, error: res.error });
      continue;
    }
    const { items } = parseFeed(res.body);
    const relevant = items.filter((it) => isRelevant(`${it.title} ${it.summary}`, ALL_ALIASES));
    endpoints.push({ name: src.query, url: shortUrl(src.url), status: relevant.length ? "ok" : "empty", count: relevant.length });
    all = all.concat(relevant.map((it) => ({ ...it, sourceType: "news" })));
  }

  const items = sortByDateDesc(dedupe(all))
    .slice(0, MAX_ITEMS)
    .map((it) => {
      const a = analyze(`${it.title}. ${it.summary}`);
      return {
        ...it,
        sentiment: round(a.overall),
        leansGER: round(a.perTeam.GER.mean),
        leansAUT: round(a.perTeam.AUT.mean),
      };
    });

  const anyOk = endpoints.some((e) => e.status === "ok");
  const anyError = endpoints.some((e) => e.status === "error");
  const status = items.length ? "ok" : anyError && !anyOk ? "error" : "empty";
  log.info("news", `${items.length} Artikel aus ${endpoints.length} Feeds (Status: ${status})`);

  return {
    key: "news",
    label: "Medienartikel (Google News RSS)",
    status,
    fetched: new Date().toISOString(),
    endpoints,
    items,
  };
}

function round(n) {
  return Math.round(n * 1000) / 1000;
}
