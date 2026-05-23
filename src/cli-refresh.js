// Einmaliger Sammellauf ohne Server – nützlich zum Testen/Debuggen.
// Aufruf: npm run refresh
import { collectAll } from "./collectors/index.js";
import { computeProbability } from "./engine/probability.js";

const sources = await collectAll();
const prediction = computeProbability(sources);

const summary = {
  pGER: prediction.pGER,
  pAUT: prediction.pAUT,
  favorite: prediction.favorite,
  meta: prediction.meta,
  signals: prediction.signals.map((s) => ({
    key: s.key,
    p: s.p,
    n: s.n,
    effectiveWeight: s.effectiveWeight,
    detail: s.detail,
  })),
  itemCounts: Object.fromEntries(
    Object.values(sources).map((s) => [s.key, { status: s.status, items: s.items?.length ?? 0 }]),
  ),
};

console.log(JSON.stringify(summary, null, 2));
