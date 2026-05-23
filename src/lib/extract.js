// Strukturierte Extraktion aus Freitext:
//  - vorhergesagte Ergebnisse  ("Deutschland 4:2 Österreich", "gewinnt 3:1")
//  - explizite Gewinn-Prozente  ("60 %", "Chance von 60 Prozent")
//  - Risiko-/Kontextfaktoren    (Verletzung, Sperre, Torwart, Comeback)
import { TEAMS, RISK_KEYWORDS } from "../config.js";
import { normalize, splitSentences } from "./text.js";

const TEAM_ALIASES = Object.fromEntries(
  Object.values(TEAMS).map((t) => [t.code, t.aliases.map(normalize)]),
);

const WIN_CUE = /(gewinnt|gewinnen|gewonnen|siegt|sieg|schlagt|besiegt|favorit|win|wins|beat|beats|defeats)/;
const LOSE_CUE = /(verliert|verloren|niederlage|unterliegt|loses|lost|defeated)/;
const WINDOW = 42;

// Alle Team-Alias-Positionen im normalisierten Text, nach Index sortiert.
function teamPositions(norm) {
  const out = [];
  for (const [code, aliases] of Object.entries(TEAM_ALIASES)) {
    for (const a of aliases) {
      let i = norm.indexOf(a);
      while (i >= 0) {
        out.push({ code, index: i });
        i = norm.indexOf(a, i + a.length);
      }
    }
  }
  return out.sort((p, q) => p.index - q.index);
}

function nearestTeam(positions, idx, side) {
  let best = null;
  for (const p of positions) {
    if (side === "left" && p.index < idx && idx - p.index <= WINDOW) {
      if (!best || p.index > best.index) best = p;
    } else if (side === "right" && p.index > idx && p.index - idx <= WINDOW) {
      if (!best || p.index < best.index) best = p;
    }
  }
  return best;
}

/** Vorhergesagte Ergebnisse -> [{ ger, aut }]. */
export function extractScorelines(text) {
  const norm = normalize(text);
  const positions = teamPositions(norm);
  const out = [];
  const re = /\b(\d{1,2})\s*[:\-]\s*(\d{1,2})\b/g;
  let m;
  while ((m = re.exec(norm))) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (a > 12 || b > 12) continue; // Zeiten/Jahre/Unsinn ausschließen
    const idx = m.index;
    const left = nearestTeam(positions, idx, "left");
    const right = nearestTeam(positions, idx, "right");
    const ctx = norm.slice(Math.max(0, idx - WINDOW), idx + WINDOW);

    if (left && right && left.code !== right.code) {
      out.push(left.code === "GER" ? { ger: a, aut: b } : { ger: b, aut: a });
    } else {
      const subject = left || right;
      if (!subject) continue;
      const hi = Math.max(a, b);
      const lo = Math.min(a, b);
      let subjGoals;
      if (WIN_CUE.test(ctx)) subjGoals = hi;
      else if (LOSE_CUE.test(ctx)) subjGoals = lo;
      else continue; // mehrdeutig
      const otherGoals = subjGoals === hi ? lo : hi;
      out.push(subject.code === "GER" ? { ger: subjGoals, aut: otherGoals } : { ger: otherGoals, aut: subjGoals });
    }
  }
  return out;
}

/** Explizite Gewinn-Prozente -> [{ team, p }] (p in 0..1). */
export function extractPercentages(text) {
  const norm = normalize(text);
  const positions = teamPositions(norm);
  const out = [];
  const re = /(?<!\d)(\d{1,3})\s*(?:%|prozent|percent)/g;
  let m;
  while ((m = re.exec(norm))) {
    const pct = Number(m[1]);
    if (pct < 1 || pct > 99) continue;
    const idx = m.index;
    const left = nearestTeam(positions, idx, "left");
    const right = nearestTeam(positions, idx, "right");
    const team = left || right;
    if (!team) continue;
    out.push({ team: team.code, p: pct / 100 });
  }
  return out;
}

/** Risiko-/Kontextfaktoren je Team -> { GER:{injury:[],...}, AUT:{...} }. */
export function extractRiskFactors(text) {
  const result = { GER: {}, AUT: {} };
  for (const code of ["GER", "AUT"]) for (const cat of Object.keys(RISK_KEYWORDS)) result[code][cat] = [];

  for (const sentence of splitSentences(text)) {
    const norm = normalize(sentence);
    const teams = [];
    for (const [code, aliases] of Object.entries(TEAM_ALIASES)) {
      if (aliases.some((a) => norm.includes(a))) teams.push(code);
    }
    if (teams.length === 0) continue;
    for (const [cat, words] of Object.entries(RISK_KEYWORDS)) {
      if (words.some((w) => norm.includes(normalize(w)))) {
        const snippet = sentence.trim().slice(0, 160);
        for (const code of teams) result[code][cat].push(snippet);
      }
    }
  }
  return result;
}
