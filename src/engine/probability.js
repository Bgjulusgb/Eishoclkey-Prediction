// Wahrscheinlichkeits-Engine: verschmilzt alle Signale zu einer sozialen
// Gewinnwahrscheinlichkeit P(GER) und P(AUT).
//
// Modell: gewichteter Mittelwert über die Signale, wobei jedes Signal mit einer
// datenabhängigen Konfidenz c = n/(n+k) skaliert wird (wenig Daten => wenig
// Einfluss). Der Form-/Stärke-Prior ist immer präsent (Konfidenz 1) und sorgt
// dafür, dass auch ohne Live-Daten ein sinnvoller Ausgangswert existiert.
import { PRIOR, SIGNAL_WEIGHTS, CONFIDENCE_SATURATION, TEAMS } from "../config.js";
import { sentimentSignal } from "../lib/sentiment.js";

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const round = (n, d = 4) => Math.round(n * 10 ** d) / 10 ** d;

// Form-/Stärke-Prior aus config.
export function computePrior() {
  const { ratings, ratingScale, form, formWeight } = PRIOR;
  const diff = ratings.GER - ratings.AUT;
  const pRating = 1 / (1 + 10 ** (-diff / ratingScale));
  const formAdj = formWeight * ((form.AUT.score || 0) - (form.GER.score || 0));
  const pGER = clamp(pRating - formAdj, 0.02, 0.98);
  return {
    pGER,
    pRating: round(pRating),
    formAdj: round(-formAdj),
    ratings,
    form,
  };
}

function confidence(n, k) {
  return n > 0 ? n / (n + k) : 0;
}

/**
 * Verschmilzt die Sammler-Ergebnisse zu einer Endwahrscheinlichkeit.
 * @param {{news:object, reddit:object, experts:object, odds:object}} data
 */
export function computeProbability(data) {
  const prior = computePrior();

  const news = sentimentSignal(data.news?.items || []);
  const reddit = sentimentSignal(data.reddit?.items || []);
  const experts = data.experts?.signal || { pGER: 0.5, n: 0 };
  const market = data.odds?.signal || { pGER: 0.5, n: 0 };

  const signals = [
    {
      key: "market",
      label: "Wettquoten",
      p: market.pGER,
      n: market.n,
      weight: SIGNAL_WEIGHTS.market,
      confidence: confidence(market.n, CONFIDENCE_SATURATION.market),
      detail: market.n ? `${market.n} Buchmacher` : "keine Quoten verfügbar",
    },
    {
      key: "experts",
      label: "Experten-/Tipp-Prognosen",
      p: experts.pGER,
      n: experts.n,
      weight: SIGNAL_WEIGHTS.experts,
      confidence: confidence(experts.n, CONFIDENCE_SATURATION.experts),
      detail: experts.n
        ? `${experts.gerVotes ?? 0} pro GER · ${experts.autVotes ?? 0} pro AUT · ${experts.neutral ?? 0} neutral`
        : "keine Prognosen",
    },
    {
      key: "news",
      label: "Mediensentiment",
      p: news.pGER,
      n: news.n,
      weight: SIGNAL_WEIGHTS.news,
      confidence: confidence(news.n, CONFIDENCE_SATURATION.news),
      detail: news.n
        ? `Sentiment GER ${news.ger.toFixed(2)} vs. AUT ${news.aut.toFixed(2)} (${news.n} Artikel)`
        : "keine Artikel mit Teambezug",
    },
    {
      key: "reddit",
      label: "Reddit-Community",
      p: reddit.pGER,
      n: reddit.n,
      weight: SIGNAL_WEIGHTS.reddit,
      confidence: confidence(reddit.n, CONFIDENCE_SATURATION.reddit),
      detail: reddit.n
        ? `Sentiment GER ${reddit.ger.toFixed(2)} vs. AUT ${reddit.aut.toFixed(2)} (${reddit.n} Posts)`
        : "keine Posts mit Teambezug",
    },
    {
      key: "prior",
      label: "Form & Stärke (Annahme)",
      p: prior.pGER,
      n: 1,
      weight: SIGNAL_WEIGHTS.prior,
      confidence: 1,
      detail: `Rating-Prior ${(prior.pRating * 100).toFixed(0)}% · Formkorrektur ${(prior.formAdj * 100).toFixed(1)} Pp.`,
    },
  ];

  // Gewichteter Mittelwert mit effektivem Gewicht = weight * confidence.
  let num = 0;
  let den = 0;
  for (const s of signals) {
    s.effectiveWeight = round(s.weight * s.confidence);
    num += s.effectiveWeight * s.p;
    den += s.effectiveWeight;
  }
  const pGER = den > 0 ? clamp(num / den, 0.01, 0.99) : prior.pGER;

  // Anteil aktiver Live-Signale (ohne Prior) als Vertrauensindikator.
  const liveSignals = signals.filter((s) => s.key !== "prior");
  const activeLive = liveSignals.filter((s) => s.n > 0).length;
  const liveContribution = round(
    liveSignals.reduce((s, x) => s + x.effectiveWeight, 0) /
      (den || 1),
  );

  return {
    pGER: round(pGER),
    pAUT: round(1 - pGER),
    teams: {
      GER: { ...TEAMS.GER, prob: round(pGER) },
      AUT: { ...TEAMS.AUT, prob: round(1 - pGER) },
    },
    favorite: pGER >= 0.5 ? "GER" : "AUT",
    signals: signals.map((s) => ({
      ...s,
      p: round(s.p),
      confidence: round(s.confidence),
    })),
    prior,
    meta: {
      activeLiveSignals: activeLive,
      totalLiveSignals: liveSignals.length,
      liveContribution, // Anteil der Endwahrscheinlichkeit aus Live-Daten
    },
  };
}
