// Sammler: Medienartikel über Google News RSS (kein API-Key).
import { SOURCES, TEAMS, FETCH_CONCURRENCY } from "../config.js";
import { fetchText, shortUrl } from "../lib/http.js";
import { parseFeed } from "../lib/rss.js";
import { annotateItem } from "../lib/annotate.js";
import { normalize } from "../lib/text.js";
import { mapLimit } from "../lib/concurrency.js";
import { dedupe, sortByDateDesc, isRelevant } from "./util.js";
import { log } from "../lib/log.js";

const MAX_ITEMS = 60;
const ALL_ALIASES = Object.values(TEAMS).flatMap((t) => t.aliases.map(normalize));

// Google-News-Titel sind "Schlagzeile - Publisher" -> beides trennen.
function splitPublisher(title) {
  const i = title.lastIndexOf(" - ");
  if (i > 0 && i > title.length - 40) return { title: title.slice(0, i).trim(), publisher: title.slice(i + 3).trim() };
  return { title, publisher: "" };
}

export async function collectNews() {
  const now = Date.now();
  const results = await mapLimit(SOURCES.googleNews, FETCH_CONCURRENCY, async (src) => {
    const res = await fetchText(src.url, { accept: "application/rss+xml, application/xml;q=0.9" });
    if (!res.ok) return { endpoint: { name: src.query, url: shortUrl(src.url), status: "error", count: 0, error: res.error }, items: [] };
    const { items } = parseFeed(res.body);
    const relevant = items.filter((it) => isRelevant(`${it.title} ${it.summary}`, ALL_ALIASES));
    const mapped = relevant.map((it) => {
      const { title, publisher } = splitPublisher(it.title);
      return { ...it, title, source: publisher || it.author || "" };
    });
    return { endpoint: { name: src.query, url: shortUrl(src.url), status: relevant.length ? "ok" : "empty", count: relevant.length }, items: mapped };
  });

  const endpoints = results.map((r) => r.endpoint);
  const all = results.flatMap((r) => r.items);
  const items = sortByDateDesc(dedupe(all)).slice(0, MAX_ITEMS).map((it) => annotateItem(it, "news", now));

  const anyOk = endpoints.some((e) => e.status === "ok");
  const anyError = endpoints.some((e) => e.status === "error");
  const status = items.length ? "ok" : anyError && !anyOk ? "error" : "empty";
  log.info("news", `${items.length} Artikel aus ${endpoints.length} Feeds (Status: ${status})`);

  return { key: "news", label: "Medienartikel (Google News RSS)", status, fetched: new Date().toISOString(), endpoints, items };
}
