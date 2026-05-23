// Wahrscheinlichkeits-Engine: verschmilzt alle Signale wissenschaftlich fundiert
// zu P(GER)/P(AUT), schätzt die Unsicherheit, aggregiert Analyse-Kennzahlen und
// leitet eine Ergebnisprognose (erwartete Tore) ab.
//
// Fusion: log-lineares Opinion-Pooling (Kombination im Log-Odds-Raum) – die
// theoretisch saubere Methode zur Aggregation von Wahrscheinlichkeiten. Jedes
// Signal zählt mit effektivem Gewicht = Basisgewicht × Konfidenz (c = n/(n+k));
// Wettquoten erhalten als kalibrierter Markt einen zusätzlichen Anker-Boost.
import {
  PRIOR, SIGNAL_WEIGHTS, CONFIDENCE_SATURATION, TEAMS,
  COMBINATION, MARKET_ANCHOR_BOOST,
} from "../config.js";
import { sentimentSignal } from "../lib/sentiment.js";
import { expectedGoals } from "./goals.js";

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const round = (n, d = 4) => Math.round(n * 10 ** d) / 10 ** d;
const clampP = (p) => clamp(p, 0.02, 0.98);
const logit = (p) => Math.log(clampP(p) / (1 - clampP(p)));
const sigmoid = (x) => 1 / (1 + Math.exp(-x));

export function computePrior() {
  const { ratings, ratingScale, form, formWeight } = PRIOR;
  const diff = ratings.GER - ratings.AUT;
  const pRating = 1 / (1 + 10 ** (-diff / ratingScale));
  const formAdj = formWeight * ((form.AUT.score || 0) - (form.GER.score || 0));
  const pGER = clamp(pRating - formAdj, 0.02, 0.98);
  return { pGER, pRating: round(pRating), formAdj: round(-formAdj), ratings, form };
}

const confidence = (n, k) => (n > 0 ? n / (n + k) : 0);

// Explizite Prozentangaben aus annotierten Items -> Konsens-P(GER).
function explicitPercentages(items) {
  const ps = [];
  for (const it of items || []) {
    for (const e of it.analysis?.percentages || []) {
      ps.push(e.team === "GER" ? e.p : 1 - e.p);
    }
  }
  if (!ps.length) return { p: 0.5, n: 0, values: [] };
  return { p: ps.reduce((a, b) => a + b, 0) / ps.length, n: ps.length, values: ps.map((p) => round(p, 3)) };
}

// Aggregiert Analyse-Kennzahlen über alle Textquellen.
function aggregateAnalytics(allItems) {
  let buzzGER = 0, buzzAUT = 0;
  const risk = { GER: {}, AUT: {} };
  const scorelines = [];
  for (const code of ["GER", "AUT"]) for (const c of ["injury", "suspension", "goalie", "boost"]) risk[code][c] = { count: 0, samples: [] };

  for (const it of allItems) {
    const w = it.weight ?? 1;
    if (it.analysis?.gerCount) buzzGER += w;
    if (it.analysis?.autCount) buzzAUT += w;
    for (const sl of it.analysis?.scorelines || []) scorelines.push(sl);
    const r = it.analysis?.risk;
    if (r) {
      for (const code of ["GER", "AUT"]) {
        for (const cat of Object.keys(risk[code])) {
          const arr = r[code]?.[cat] || [];
          risk[code][cat].count += arr.length;
          for (const s of arr) if (risk[code][cat].samples.length < 3 && !risk[code][cat].samples.includes(s)) risk[code][cat].samples.push(s);
        }
      }
    }
  }

  // Ergebnis-Konsens aus Textprognosen.
  let scoreConsensus = null;
  if (scorelines.length) {
    const ger = scorelines.reduce((a, s) => a + s.ger, 0) / scorelines.length;
    const aut = scorelines.reduce((a, s) => a + s.aut, 0) / scorelines.length;
    const freq = {};
    for (const s of scorelines) { const k = `${s.ger}:${s.aut}`; freq[k] = (freq[k] || 0) + 1; }
    const most = Object.entries(freq).sort((a, b) => b[1] - a[1])[0];
    scoreConsensus = { avgGER: round(ger, 2), avgAUT: round(aut, 2), n: scorelines.length, mostCommon: most[0], mostCommonCount: most[1] };
  }

  const buzzTotal = buzzGER + buzzAUT;
  return {
    buzz: {
      GER: round(buzzGER, 2), AUT: round(buzzAUT, 2),
      shareGER: buzzTotal ? round(buzzGER / buzzTotal, 3) : 0.5,
    },
    risk,
    scoreConsensus,
  };
}

/**
 * @param {{news,reddit,experts,odds}} data
 * @param {{prevPGER?:number}} ctx
 */
export function computeProbability(data, ctx = {}) {
  const prior = computePrior();
  const news = sentimentSignal(data.news?.items || []);
  const reddit = sentimentSignal(data.reddit?.items || []);
  const market = data.odds?.signal || { pGER: 0.5, n: 0 };

  // Experten: Stimmenanteil + explizite Prozentangaben aus Expertenquellen.
  const expExplicit = explicitPercentages(data.experts?.items);
  let expertsP = data.experts?.signal?.pGER ?? 0.5;
  let expertsN = data.experts?.signal?.n ?? 0;
  const voteN = expertsN;
  if (expExplicit.n) {
    expertsP = (expertsP * voteN + expExplicit.p * expExplicit.n) / (voteN + expExplicit.n || 1);
    expertsN = voteN + expExplicit.n;
  }

  const signals = [
    { key: "market", label: "Wettquoten", p: market.pGER, n: market.n, weight: SIGNAL_WEIGHTS.market,
      confidence: confidence(market.n, CONFIDENCE_SATURATION.market),
      detail: market.n ? `${market.n} Buchmacher (Markt-Anker)` : "keine Quoten verfügbar" },
    { key: "experts", label: "Experten-/Tipp-Prognosen", p: expertsP, n: expertsN, weight: SIGNAL_WEIGHTS.experts,
      confidence: confidence(expertsN, CONFIDENCE_SATURATION.experts),
      detail: expertsN ? `${voteN} Tipps${expExplicit.n ? ` + ${expExplicit.n} explizite %` : ""}` : "keine Prognosen" },
    { key: "news", label: "Mediensentiment", p: news.pGER, n: news.n, weight: SIGNAL_WEIGHTS.news,
      confidence: confidence(news.n, CONFIDENCE_SATURATION.news),
      detail: news.n ? `Sentiment GER ${news.ger.toFixed(2)} vs AUT ${news.aut.toFixed(2)} (${news.n} Artikel, gewichtet)` : "keine Artikel mit Teambezug" },
    { key: "reddit", label: "Reddit-Community", p: reddit.pGER, n: reddit.n, weight: SIGNAL_WEIGHTS.reddit,
      confidence: confidence(reddit.n, CONFIDENCE_SATURATION.reddit),
      detail: reddit.n ? `Sentiment GER ${reddit.ger.toFixed(2)} vs AUT ${reddit.aut.toFixed(2)} (${reddit.n} Posts, engagementgewichtet)` : "keine Posts mit Teambezug" },
    { key: "prior", label: "Form & Stärke (Annahme)", p: prior.pGER, n: 1, weight: SIGNAL_WEIGHTS.prior,
      confidence: 1, detail: `Rating-Prior ${(prior.pRating * 100).toFixed(0)}% · Formkorrektur ${(prior.formAdj * 100).toFixed(1)} Pp.` },
  ];

  // Effektives Gewicht = Basisgewicht × Konfidenz; Markt-Anker verstärkt Quoten.
  for (const s of signals) {
    let ew = s.weight * s.confidence;
    if (s.key === "market" && s.n > 0) ew *= MARKET_ANCHOR_BOOST;
    s.effectiveWeight = round(ew);
  }
  const totalEW = signals.reduce((a, s) => a + s.effectiveWeight, 0) || 1;

  // Fusion.
  let pGER;
  if (COMBINATION === "linear") {
    pGER = signals.reduce((a, s) => a + s.effectiveWeight * s.p, 0) / totalEW;
  } else {
    const L = signals.reduce((a, s) => a + s.effectiveWeight * logit(s.p), 0) / totalEW;
    pGER = sigmoid(L);
  }
  pGER = clamp(pGER, 0.01, 0.99);

  // Unsicherheit: gewichtete Streuung der Einzelsignale + Stichprobenterm.
  const pBar = signals.reduce((a, s) => a + s.effectiveWeight * s.p, 0) / totalEW;
  const variance = signals.reduce((a, s) => a + s.effectiveWeight * (s.p - pBar) ** 2, 0) / totalEW;
  const disagreement = Math.sqrt(variance);
  const liveSignals = signals.filter((s) => s.key !== "prior");
  const activeLive = liveSignals.filter((s) => s.n > 0).length;
  const effSamples = liveSignals.reduce((a, s) => a + s.confidence, 0);
  const sampling = 0.35 / Math.sqrt(2 + 4 * effSamples);
  const stdev = Math.min(0.4, Math.sqrt(disagreement ** 2 + sampling ** 2));
  const uncertainty = {
    stdev: round(stdev, 3),
    low: round(clamp(pGER - stdev, 0.01, 0.99), 3),
    high: round(clamp(pGER + stdev, 0.01, 0.99), 3),
    disagreement: round(disagreement, 3),
  };

  // Analyse-Kennzahlen.
  const allItems = [...(data.news?.items || []), ...(data.reddit?.items || []), ...(data.experts?.items || [])];
  const analytics = aggregateAnalytics(allItems);
  analytics.explicitPercentages = explicitPercentages(allItems);
  const momentum = typeof ctx.prevPGER === "number" ? round(pGER - ctx.prevPGER, 4) : 0;

  // Ergebnisprognose.
  const goals = expectedGoals(pGER);

  const liveContribution = round(liveSignals.reduce((a, s) => a + s.effectiveWeight, 0) / totalEW, 3);

  return {
    pGER: round(pGER), pAUT: round(1 - pGER), favorite: pGER >= 0.5 ? "GER" : "AUT",
    teams: { GER: { ...TEAMS.GER, prob: round(pGER) }, AUT: { ...TEAMS.AUT, prob: round(1 - pGER) } },
    signals: signals.map((s) => ({ ...s, p: round(s.p), confidence: round(s.confidence) })),
    prior,
    uncertainty,
    goals,
    analytics,
    meta: {
      combination: COMBINATION,
      activeLiveSignals: activeLive,
      totalLiveSignals: liveSignals.length,
      liveContribution,
      momentum,
    },
  };
}
