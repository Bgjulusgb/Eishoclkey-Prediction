// Reichert ein rohes Item (Titel/Zusammenfassung/Link/Datum/Quelle) mit der
// gesamten Analyse an: Sentiment + Team-Zuordnung, Gewichtungen (Aktualität,
// Glaubwürdigkeit, Engagement) und strukturierte Extraktion.
import { analyze } from "./sentiment.js";
import { recencyWeight } from "./recency.js";
import { credibility } from "./credibility.js";
import { extractScorelines, extractPercentages, extractRiskFactors } from "./extract.js";

const round = (n, d = 3) => Math.round(n * 10 ** d) / 10 ** d;

/**
 * @param {object} item        { title, summary, link, published, source, engagementW? }
 * @param {"news"|"reddit"|"expert"|"odds"} sourceType
 * @param {number} now         Date.now()
 */
export function annotateItem(item, sourceType, now = Date.now()) {
  const text = `${item.title || ""}. ${item.summary || ""}`;
  const a = analyze(text);
  const recencyW = recencyWeight(item.published, now);
  const credW = credibility(sourceType, item.source || item.author, item.link);
  const engagementW = item.engagementW ?? 1;
  const weight = recencyW * credW * engagementW;

  return {
    ...item,
    sourceType,
    sentiment: round(a.overall),
    leansGER: round(a.perTeam.GER.mean),
    leansAUT: round(a.perTeam.AUT.mean),
    weight: round(weight),
    analysis: {
      recencyW: round(recencyW),
      credW: round(credW),
      engagementW: round(engagementW),
      gerMean: a.perTeam.GER.mean,
      gerCount: a.perTeam.GER.count,
      autMean: a.perTeam.AUT.mean,
      autCount: a.perTeam.AUT.count,
      scorelines: extractScorelines(text),
      percentages: extractPercentages(text),
      risk: extractRiskFactors(text),
    },
  };
}
