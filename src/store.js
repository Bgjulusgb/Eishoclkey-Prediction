// In-Memory-Zustand: hält den letzten Snapshot, plant periodische Aktualisierung
// und führt eine kurze Historie der Wahrscheinlichkeit (für die Sparkline).
import { GAME, REFRESH_INTERVAL_MS } from "./config.js";
import { collectAll } from "./collectors/index.js";
import { computeProbability } from "./engine/probability.js";
import { log } from "./lib/log.js";

const HISTORY_MAX = 240;

const state = {
  game: GAME,
  generatedAt: null,
  refreshing: false,
  lastError: null,
  prediction: null,
  sources: {},
  history: [], // [{ t: ISO, pGER: number }]
};

let timer = null;

export function getState() {
  return state;
}

export async function refresh(reason = "scheduled") {
  if (state.refreshing) {
    log.info("store", "Aktualisierung läuft bereits – übersprungen");
    return state;
  }
  state.refreshing = true;
  const startedAt = Date.now();
  log.info("store", `Aktualisierung gestartet (${reason})`);
  try {
    const sources = await collectAll();
    const prevPGER = state.history.length ? state.history[state.history.length - 1].pGER : undefined;
    const prediction = computeProbability(sources, { prevPGER });
    state.sources = sources;
    state.prediction = prediction;
    state.generatedAt = new Date().toISOString();
    state.lastError = null;
    state.history.push({ t: state.generatedAt, pGER: prediction.pGER });
    if (state.history.length > HISTORY_MAX) state.history.shift();

    const counts = Object.values(sources)
      .map((s) => `${s.key}:${s.items?.length ?? 0}`)
      .join(" ");
    log.ok(
      "store",
      `fertig in ${Date.now() - startedAt}ms · P(GER)=${(prediction.pGER * 100).toFixed(1)}% · ${counts}`,
    );
  } catch (err) {
    state.lastError = err.message || String(err);
    log.error("store", `Aktualisierung fehlgeschlagen: ${state.lastError}`);
  } finally {
    state.refreshing = false;
  }
  return state;
}

export function startScheduler() {
  if (timer) return;
  // Sofort einmal laden, dann periodisch.
  refresh("startup");
  timer = setInterval(() => refresh("scheduled"), REFRESH_INTERVAL_MS);
  if (timer.unref) timer.unref();
  log.info("store", `Scheduler aktiv: alle ${Math.round(REFRESH_INTERVAL_MS / 60000)} min`);
}

export function stopScheduler() {
  if (timer) clearInterval(timer);
  timer = null;
}
