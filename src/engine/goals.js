// Erwartete-Tore-Modell: leitet aus der (2-Wege-)Siegwahrscheinlichkeit ein
// Poisson-Tormodell ab und liefert erwartete Tore je Team sowie eine
// Ergebnis-Wahrscheinlichkeitsverteilung (Skellam).
//
// Idee: erwartete Gesamttore T (konfigurierbar) werden so auf beide Teams
// aufgeteilt (Anteil r für GER), dass das resultierende Poisson-Modell genau
// die vorgegebene Siegwahrscheinlichkeit reproduziert. Lösung per Bisektion.
import { GOALS } from "../config.js";

const round = (n, d = 3) => Math.round(n * 10 ** d) / 10 ** d;

function factTable(n) {
  const f = [1];
  for (let i = 1; i <= n; i++) f[i] = f[i - 1] * i;
  return f;
}

function poissonColumn(lambda, N, fact) {
  const col = new Array(N + 1);
  for (let k = 0; k <= N; k++) col[k] = (Math.exp(-lambda) * lambda ** k) / fact[k];
  return col;
}

// Ergebniswahrscheinlichkeiten (regulär) für gegebene λ.
function outcomeProbs(lG, lA, N, fact) {
  const pg = poissonColumn(lG, N, fact);
  const pa = poissonColumn(lA, N, fact);
  let win = 0, eq = 0, loss = 0, mass = 0;
  for (let i = 0; i <= N; i++) {
    for (let j = 0; j <= N; j++) {
      const p = pg[i] * pa[j];
      mass += p;
      if (i > j) win += p;
      else if (i === j) eq += p;
      else loss += p;
    }
  }
  return { win: win / mass, eq: eq / mass, loss: loss / mass, pg, pa };
}

// 2-Wege-Siegwahrscheinlichkeit GER (Unentschieden hälftig, ~OT/SO).
function twoWay(lG, lA, N, fact) {
  const o = outcomeProbs(lG, lA, N, fact);
  return o.win + 0.5 * o.eq;
}

/**
 * @param {number} pGER  Ziel-Siegwahrscheinlichkeit GER (2-Wege, inkl. OT)
 * @returns Ergebnisprognose
 */
export function expectedGoals(pGER, opts = {}) {
  const total = opts.expectedTotal ?? GOALS.expectedTotal;
  const N = opts.maxGoals ?? GOALS.maxGoals;
  const topN = opts.topN ?? GOALS.topN;
  const fact = factTable(N);

  // Bisektion über den GER-Toranteil r, bis 2-Wege-Prob = pGER.
  let lo = 0.02, hi = 0.98;
  for (let it = 0; it < 50; it++) {
    const r = (lo + hi) / 2;
    const f = twoWay(r * total, (1 - r) * total, N, fact);
    if (f < pGER) lo = r;
    else hi = r;
  }
  const r = (lo + hi) / 2;
  const lG = r * total;
  const lA = (1 - r) * total;

  const o = outcomeProbs(lG, lA, N, fact);

  // Wahrscheinlichste Ergebnisse.
  const grid = [];
  for (let i = 0; i <= N; i++)
    for (let j = 0; j <= N; j++) grid.push({ ger: i, aut: j, p: o.pg[i] * o.pa[j] });
  grid.sort((a, b) => b.p - a.p);
  const top = grid.slice(0, topN).map((g) => ({ score: `${g.ger}:${g.aut}`, ger: g.ger, aut: g.aut, p: round(g.p, 4) }));

  return {
    lambdaGER: round(lG, 2),
    lambdaAUT: round(lA, 2),
    expectedTotal: total,
    expectedScore: `${Math.round(lG)}:${Math.round(lA)}`,
    modalScore: top[0]?.score ?? "-",
    twoWayGER: round(o.win + 0.5 * o.eq, 3),
    regulation: { ger: round(o.win, 3), draw: round(o.eq, 3), aut: round(o.loss, 3) },
    topScorelines: top,
  };
}
