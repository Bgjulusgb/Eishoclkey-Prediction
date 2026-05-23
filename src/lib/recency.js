// Aktualitätsgewichtung: neuere Beiträge zählen mehr (exponentieller Zerfall).
import { RECENCY } from "../config.js";

const LN2 = Math.log(2);

/**
 * Gewicht in (0,1]: 1 für "jetzt", Halbierung je halfLifeHours.
 * Beiträge ohne Datum erhalten ein moderates Standardgewicht.
 */
export function recencyWeight(publishedISO, now = Date.now()) {
  if (!publishedISO) return RECENCY.noDateWeight;
  const t = Date.parse(publishedISO);
  if (!Number.isFinite(t)) return RECENCY.noDateWeight;
  const ageHours = Math.max(0, (now - t) / 3_600_000);
  return Math.exp((-LN2 * ageHours) / RECENCY.halfLifeHours);
}
