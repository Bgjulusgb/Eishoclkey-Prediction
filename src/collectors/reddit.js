// Sammler: Reddit-Posts über öffentliche Subreddit-/Such-RSS (kein API-Key).
import { SOURCES, TEAMS } from "../config.js";
import { fetchText, shortUrl } from "../lib/http.js";
import { parseFeed } from "../lib/rss.js";
import { analyze } from "../lib/sentiment.js";
import { normalize } from "../lib/text.js";
import { dedupe, sortByDateDesc, isRelevant } from "./util.js";
import { log } from "../lib/log.js";

const MAX_ITEMS = 40;
const ALL_ALIASES = Object.values(TEAMS).flatMap((t) => t.aliases.map(normalize));

export async function collectReddit() {
  const endpoints = [];
  let all = [];

  for (const src of SOURCES.reddit) {
    const res = await fetchText(src.url, { accept: "application/atom+xml, application/xml;q=0.9" });
    if (!res.ok) {
      endpoints.push({ name: src.name, url: shortUrl(src.url), status: "error", count: 0, error: res.error });
      continue;
    }
    const { items } = parseFeed(res.body);
    // Subreddit-Feeds sind breit -> auf spielrelevante Beiträge filtern.
    const relevant = items.filter((it) => isRelevant(`${it.title} ${it.summary}`, ALL_ALIASES));
    endpoints.push({ name: src.name, url: shortUrl(src.url), status: relevant.length ? "ok" : "empty", count: relevant.length });
    all = all.concat(relevant.map((it) => ({ ...it, sourceType: "reddit", source: src.name })));
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
  log.info("reddit", `${items.length} Posts aus ${endpoints.length} Feeds (Status: ${status})`);

  return {
    key: "reddit",
    label: "Reddit-Community (öffentliche RSS)",
    status,
    fetched: new Date().toISOString(),
    endpoints,
    items,
  };
}

function round(n) {
  return Math.round(n * 1000) / 1000;
}
