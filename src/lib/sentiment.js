// Lexikonbasierte, zweisprachige (DE/EN) Sentimentanalyse mit
// Negationsbehandlung und satzweiser Team-Zuordnung.
//
// Bewusst transparent und regelbasiert: kein ML-Modell, kein externer Dienst.
// Liefert einen Wert in etwa [-1, +1] sowie eine Zuordnung des Sentiments zu
// den beteiligten Teams (anhand der Alias-Treffer pro Satz).
import { TEAMS } from "../config.js";
import { normalize, tokenize, splitSentences } from "./text.js";

// Polaritätslexikon (normalisierte, akzentfreie Tokens -> Gewicht).
const LEXICON = {
  // --- positiv (DE) ---
  sieg: 2, siege: 2, gewinnt: 2, gewinnen: 1.5, gewonnen: 2, favorit: 2,
  favoriten: 2, stark: 1.5, starke: 1.5, starkste: 2, uberlegen: 2,
  dominiert: 2, dominieren: 1.8, dominant: 1.8, souveran: 1.8, top: 1.2,
  glanzend: 2, hervorragend: 2, formstark: 1.8, treffsicher: 1.5,
  selbstbewusst: 1.3, optimistisch: 1.3, hoffnung: 1, brillant: 2,
  triumph: 2, fuhrung: 1, fuhrt: 1, vorsprung: 1.2, klasse: 1.5,
  uberzeugend: 1.8, sicher: 1, chance: 0.8, chancen: 0.8,
  // --- positiv (EN) ---
  win: 2, wins: 2, winning: 1.5, won: 2, favourite: 2, favorite: 2,
  strong: 1.5, dominant: 1.8, dominate: 1.8, dominates: 1.8, confident: 1.3,
  unstoppable: 2, brilliant: 2, superb: 2, lead: 1, leading: 1.2,
  advantage: 1.2, clinical: 1.3, impressive: 1.8, comfortable: 1,
  // --- negativ (DE) ---
  niederlage: -2, niederlagen: -2, verliert: -2, verlieren: -1.5,
  verloren: -2, schwach: -1.8, schwache: -1.8, chancenlos: -2,
  problem: -1.2, probleme: -1.2, verletzt: -1.5, verletzung: -1.5,
  ausfall: -1.5, ausfalle: -1.5, krise: -2, debakel: -2.5, fehler: -1,
  unterlegen: -1.8, aussenseiter: -1.2, zweifel: -1.2, sorge: -1.2,
  sorgen: -1.2, pleite: -2, blamage: -2.5, schwierig: -1, enttauschung: -1.8,
  // --- negativ (EN) ---
  loss: -2, lose: -1.8, loses: -2, losing: -1.5, lost: -1.8, weak: -1.8,
  struggle: -1.5, struggles: -1.5, struggling: -1.5, injury: -1.5,
  injured: -1.5, doubt: -1.2, doubts: -1.2, underdog: -1.2, crisis: -2,
  defeat: -2, defeated: -2, poor: -1.5, mistake: -1, mistakes: -1.2,
  concern: -1.2, concerns: -1.2, trouble: -1.3, disappointing: -1.8,
};

const NEGATORS = new Set([
  "nicht", "kein", "keine", "keinen", "nie", "niemals", "ohne", "kaum",
  "not", "no", "never", "without", "hardly", "barely", "wenig",
]);

const BOOSTERS = {
  sehr: 1.5, klar: 1.4, deutlich: 1.4, absolut: 1.6, total: 1.5,
  hochst: 1.5, extrem: 1.6, very: 1.5, clearly: 1.4, absolutely: 1.6,
  totally: 1.5, hugely: 1.6, really: 1.3,
};

const DAMPENERS = { etwas: 0.6, leicht: 0.6, slightly: 0.6, somewhat: 0.6, eher: 0.7 };

const NEGATION_WINDOW = 3;

// Vorberechnete, normalisierte Alias-Liste je Team.
const TEAM_ALIASES = Object.fromEntries(
  Object.values(TEAMS).map((t) => [t.code, t.aliases.map(normalize)]),
);

// Bewertet einen einzelnen Satz/Textblock -> Score in etwa [-1, 1].
export function scoreSentence(text) {
  const tokens = tokenize(normalize(text));
  let sum = 0;
  let matches = 0;
  let negateFor = 0; // wie viele folgende Tokens negiert werden
  let mult = 1; // Booster/Dampener für das nächste Sentimenttoken

  for (const tok of tokens) {
    if (NEGATORS.has(tok)) {
      negateFor = NEGATION_WINDOW;
      continue;
    }
    if (BOOSTERS[tok]) { mult *= BOOSTERS[tok]; continue; }
    if (DAMPENERS[tok]) { mult *= DAMPENERS[tok]; continue; }

    const base = LEXICON[tok];
    if (base !== undefined) {
      let val = base * mult;
      if (negateFor > 0) val = -val;
      sum += val;
      matches += 1;
      mult = 1;
    }
    if (negateFor > 0) negateFor -= 1;
  }

  // Squashing -> beschränkt auf (-1, 1), akkumuliert aber Evidenz.
  const score = matches === 0 ? 0 : Math.tanh(sum / 3);
  return { score, matches };
}

// Findet die in einem Satz erwähnten Teams (anhand der Aliase).
function teamsInSentence(normSentence) {
  const found = [];
  for (const [code, aliases] of Object.entries(TEAM_ALIASES)) {
    if (aliases.some((a) => normSentence.includes(a))) found.push(code);
  }
  return found;
}

// Welches Team wird im (normalisierten) Satz zuerst genannt?
function firstTeamMentioned(normSentence) {
  let bestCode = null;
  let bestIdx = Infinity;
  for (const [code, aliases] of Object.entries(TEAM_ALIASES)) {
    for (const a of aliases) {
      const idx = normSentence.indexOf(a);
      if (idx >= 0 && idx < bestIdx) {
        bestIdx = idx;
        bestCode = code;
      }
    }
  }
  return bestCode;
}

// Richtungs-Hinweise für Vergleichssätze ("A schlägt B", "A verliert gegen B").
// Auf normalisiertem (akzentfreiem) Text angewandt.
const WIN_CUES = /\b(gewinnt|gewinnen|gewonnen|sieg|siegt|siege|schlagt|besiegt|besiegen|favorit|favoriten|win|wins|won|beat|beats|defeats|defeat)\b/;
const LOSE_CUES = /\b(verliert|verlieren|verloren|niederlage|niederlagen|unterliegt|unterlag|loses|lose|lost|defeated)\b/;

/**
 * Analysiert einen kompletten Text (Titel + Zusammenfassung) und ordnet das
 * Sentiment satzweise den beteiligten Teams zu.
 * @returns {{
 *   overall:number,
 *   matches:number,
 *   perTeam: Record<string,{sum:number,count:number,mean:number}>
 * }}
 */
export function analyze(text = "") {
  const sentences = splitSentences(text);
  const perTeam = {};
  for (const code of Object.keys(TEAMS)) perTeam[code] = { sum: 0, count: 0, mean: 0 };

  let overallSum = 0;
  let overallMatches = 0;

  for (const sentence of sentences.length ? sentences : [text]) {
    const norm = normalize(sentence);
    const { score, matches } = scoreSentence(sentence);
    overallSum += score;
    overallMatches += matches;

    const teams = teamsInSentence(norm);
    const hasWin = WIN_CUES.test(norm);
    const hasLose = LOSE_CUES.test(norm);
    // Vergleichssatz mit eindeutiger Richtung (genau eine Cue-Art, beide Teams).
    const directional = teams.length >= 2 && hasWin !== hasLose;

    if (!directional && (teams.length === 0 || matches === 0)) continue;

    if (teams.length === 1) {
      perTeam[teams[0]].sum += score;
      perTeam[teams[0]].count += 1;
    } else if (directional) {
      // Subjekt = zuerst genanntes Team. "A gewinnt gegen B" -> A+, B-.
      const subject = firstTeamMentioned(norm);
      const other = teams.find((c) => c !== subject) || subject;
      const mag = Math.abs(score) || 0.6; // auch ohne Lexikontreffer wirksam
      const subjectWins = hasWin;
      perTeam[subject].sum += subjectWins ? mag : -mag;
      perTeam[subject].count += 1;
      perTeam[other].sum += subjectWins ? -mag : mag;
      perTeam[other].count += 1;
    } else {
      // Kein Richtungs-Hinweis: Sentiment gleichmäßig auf die Teams aufteilen.
      const share = score / teams.length;
      for (const code of teams) {
        perTeam[code].sum += share;
        perTeam[code].count += 1;
      }
    }
  }

  for (const code of Object.keys(perTeam)) {
    const t = perTeam[code];
    t.mean = t.count ? Math.tanh(t.sum) : 0;
  }

  return {
    overall: sentences.length ? Math.tanh(overallSum / Math.max(sentences.length, 1)) : 0,
    matches: overallMatches,
    perTeam,
  };
}

/**
 * Aggregiert mehrere Items zu einem Signal: P(GER gewinnt) ∈ [0,1] aus der
 * (gewichteten) Differenz der mittleren Team-Sentiments. Liegt eine
 * Annotation (item.analysis + item.weight) vor, wird sie wiederverwendet und
 * das Item nach Aktualität/Glaubwürdigkeit/Engagement gewichtet; sonst wird
 * ungewichtet frisch analysiert.
 * @param {Array<{title?:string,summary?:string,weight?:number,analysis?:object}>} items
 * @returns {{pGER:number,n:number,ger:number,aut:number,mentionsGER:number,mentionsAUT:number}}
 */
export function sentimentSignal(items) {
  let gerNum = 0, gerDen = 0, autNum = 0, autDen = 0;
  let mentionsGER = 0, mentionsAUT = 0, contributed = 0;
  for (const it of items) {
    let gMean, gCount, aMean, aCount, w;
    if (it.analysis) {
      gMean = it.analysis.gerMean; gCount = it.analysis.gerCount;
      aMean = it.analysis.autMean; aCount = it.analysis.autCount;
      w = it.weight ?? 1;
    } else {
      const a = analyze(`${it.title || ""}. ${it.summary || ""}`);
      gMean = a.perTeam.GER.mean; gCount = a.perTeam.GER.count;
      aMean = a.perTeam.AUT.mean; aCount = a.perTeam.AUT.count;
      w = 1;
    }
    if (gCount) { gerNum += w * gMean; gerDen += w; mentionsGER += 1; }
    if (aCount) { autNum += w * aMean; autDen += w; mentionsAUT += 1; }
    if (gCount || aCount) contributed += 1;
  }
  const ger = gerDen ? gerNum / gerDen : 0;
  const aut = autDen ? autNum / autDen : 0;
  // Differenz der Sentiments -> Wahrscheinlichkeit via Logistik.
  const pGER = 1 / (1 + Math.exp(-1.6 * (ger - aut)));
  return { pGER, n: contributed, ger, aut, mentionsGER, mentionsAUT };
}
