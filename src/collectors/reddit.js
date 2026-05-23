// Sammler: Reddit-Posts. JSON-Endpunkte (liefern Upvotes/Kommentare ->
// Engagement-Gewichtung) werden bevorzugt, RSS/Atom dient als Fallback.
// Beide ohne API-Key.
import { SOURCES, TEAMS, FETCH_CONCURRENCY } from "../config.js";
import { fetchText, shortUrl } from "../lib/http.js";
import { parseFeed } from "../lib/rss.js";
import { annotateItem } from "../lib/annotate.js";
import { stripHtml, normalize } from "../lib/text.js";
import { mapLimit } from "../lib/concurrency.js";
import { dedupe, sortByDateDesc, isRelevant } from "./util.js";
import { log } from "../lib/log.js";

const MAX_ITEMS = 50;
const ALL_ALIASES = Object.values(TEAMS).flatMap((t) => t.aliases.map(normalize));

// Engagement -> Gewicht (1..~3), gestaucht über log10.
function engagementWeight(score = 0, comments = 0) {
  return Math.min(3, 1 + Math.log10(1 + Math.max(0, score) + 2 * Math.max(0, comments)));
}

function parseRedditJson(text) {
  let doc;
  try { doc = JSON.parse(text); } catch { return null; }
  const children = doc?.data?.children;
  if (!Array.isArray(children)) return null;
  return children
    .map((c) => c?.data)
    .filter(Boolean)
    .map((d) => ({
      title: stripHtml(d.title || ""),
      link: d.permalink ? `https://www.reddit.com${d.permalink}` : d.url || "",
      summary: stripHtml((d.selftext || "").slice(0, 400)),
      published: d.created_utc ? new Date(d.created_utc * 1000).toISOString() : null,
      source: d.subreddit ? `r/${d.subreddit}` : "reddit",
      engagementW: engagementWeight(d.score, d.num_comments),
    }));
}

async function fetchSource(src) {
  // 1) JSON bevorzugen.
  if (src.json) {
    const res = await fetchText(src.json, { accept: "application/json" });
    if (res.ok) {
      const items = parseRedditJson(res.body);
      if (items) return { name: src.name, via: "json", url: src.json, items };
    }
  }
  // 2) RSS-Fallback.
  if (src.rss) {
    const res = await fetchText(src.rss, { accept: "application/atom+xml, application/xml;q=0.9" });
    if (res.ok) {
      const { items } = parseFeed(res.body);
      return { name: src.name, via: "rss", url: src.rss, items: items.map((it) => ({ ...it, source: src.name })), error: null };
    }
    return { name: src.name, via: "rss", url: src.rss, items: [], error: res.error };
  }
  return { name: src.name, via: "json", url: src.json, items: [], error: "kein Endpunkt erreichbar" };
}

export async function collectReddit() {
  const now = Date.now();
  const fetched = await mapLimit(SOURCES.reddit, FETCH_CONCURRENCY, fetchSource);

  const endpoints = [];
  let all = [];
  for (const f of fetched) {
    const relevant = (f.items || []).filter((it) => isRelevant(`${it.title} ${it.summary}`, ALL_ALIASES));
    endpoints.push({
      name: `${f.name} [${f.via}]`,
      url: shortUrl(f.url),
      status: f.error ? "error" : relevant.length ? "ok" : "empty",
      count: relevant.length,
      error: f.error || undefined,
    });
    all = all.concat(relevant);
  }

  const items = sortByDateDesc(dedupe(all)).slice(0, MAX_ITEMS).map((it) => annotateItem(it, "reddit", now));

  const anyOk = endpoints.some((e) => e.status === "ok");
  const anyError = endpoints.some((e) => e.status === "error");
  const status = items.length ? "ok" : anyError && !anyOk ? "error" : "empty";
  log.info("reddit", `${items.length} Posts aus ${endpoints.length} Quellen (Status: ${status})`);

  return { key: "reddit", label: "Reddit-Community (JSON/RSS, engagementgewichtet)", status, fetched: new Date().toISOString(), endpoints, items };
}
