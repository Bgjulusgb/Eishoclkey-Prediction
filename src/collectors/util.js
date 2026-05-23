// Gemeinsame Helfer für die Sammler.
import { normalize } from "../lib/text.js";

// Dedupliziert Items anhand Link bzw. (falls fehlend) normalisiertem Titel.
export function dedupe(items) {
  const seen = new Set();
  const out = [];
  for (const it of items) {
    const key = (it.link && it.link.trim()) || normalize(it.title || "");
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(it);
  }
  return out;
}

// Sortiert nach Veröffentlichungsdatum (neueste zuerst); ohne Datum ans Ende.
export function sortByDateDesc(items) {
  return items.slice().sort((a, b) => {
    const ta = a.published ? Date.parse(a.published) : 0;
    const tb = b.published ? Date.parse(b.published) : 0;
    return tb - ta;
  });
}

// Prüft, ob ein Text überhaupt für das Spiel relevant ist (mind. ein Teamalias
// oder ein Eishockey-Bezug). Hält offensichtlich themenfremde Feedeinträge fern.
const HOCKEY_HINTS = ["eishockey", "ice hockey", "hockey", "iihf", "wm", "world championship", "puck", "nhl"];
export function isRelevant(text, teamAliases) {
  const n = normalize(text);
  if (teamAliases.some((a) => n.includes(a))) return true;
  return HOCKEY_HINTS.some((h) => n.includes(h));
}
