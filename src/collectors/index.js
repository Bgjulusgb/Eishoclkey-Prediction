// Orchestriert alle Sammler. Läuft robust: ein einzelner Fehler in einem
// Sammler darf die übrigen nicht verhindern (Promise.allSettled).
import { collectNews } from "./googleNews.js";
import { collectReddit } from "./reddit.js";
import { collectExperts } from "./experts.js";
import { collectOdds } from "./odds.js";
import { log } from "../lib/log.js";

function fallback(key, label, reason) {
  return { key, label, status: "error", fetched: new Date().toISOString(), endpoints: [], items: [], error: reason };
}

export async function collectAll() {
  const tasks = [
    ["news", "Medienartikel (Google News RSS)", collectNews],
    ["reddit", "Reddit-Community (öffentliche RSS)", collectReddit],
    ["experts", "Experten-/Tipp-Prognosen", collectExperts],
    ["odds", "Wettquoten (HTML-Scraping)", collectOdds],
  ];

  const results = await Promise.allSettled(tasks.map(([, , fn]) => fn()));
  const out = {};
  results.forEach((r, i) => {
    const [key, label] = tasks[i];
    if (r.status === "fulfilled") {
      out[key] = r.value;
    } else {
      log.error(key, `Sammler abgestürzt: ${r.reason?.message || r.reason}`);
      out[key] = fallback(key, label, String(r.reason?.message || r.reason));
    }
  });
  return out;
}
