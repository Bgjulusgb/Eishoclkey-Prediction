// Glaubwürdigkeitsgewichtung je Quelle: Basisfaktor nach Quellentyp, multipliziert
// mit einem Stichwort-Treffer aus CREDIBILITY.keywords (Name oder Domain).
import { CREDIBILITY } from "../config.js";
import { normalize } from "./text.js";

function domainOf(link) {
  try {
    return new URL(link).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

/**
 * @param {"news"|"reddit"|"expert"|"odds"} sourceType
 * @param {string} sourceName  Publisher-/Subreddit-Name
 * @param {string} link        Artikel-/Post-URL
 * @returns {number} Faktor (~0.6..1.6)
 */
export function credibility(sourceType, sourceName = "", link = "") {
  const base = CREDIBILITY.base[sourceType] ?? 1.0;
  const hay = normalize(`${sourceName} ${domainOf(link)}`);
  let factor = 1.0;
  for (const [kw, w] of Object.entries(CREDIBILITY.keywords)) {
    if (hay.includes(normalize(kw))) {
      // stärkster Treffer (am weitesten von 1 entfernt) gewinnt
      if (Math.abs(w - 1) > Math.abs(factor - 1)) factor = w;
    }
  }
  return Math.max(0.5, Math.min(1.8, base * factor));
}
