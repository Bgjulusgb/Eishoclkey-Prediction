// Minimaler Logger mit Zeitstempel und Level.
const COLORS = { info: "\x1b[36m", warn: "\x1b[33m", error: "\x1b[31m", ok: "\x1b[32m" };
const RESET = "\x1b[0m";

function emit(level, scope, msg) {
  const ts = new Date().toISOString().slice(11, 19);
  const color = COLORS[level] || "";
  console.log(`${color}${ts} ${level.toUpperCase().padEnd(5)}${RESET} [${scope}] ${msg}`);
}

export const log = {
  info: (scope, msg) => emit("info", scope, msg),
  ok: (scope, msg) => emit("ok", scope, msg),
  warn: (scope, msg) => emit("warn", scope, msg),
  error: (scope, msg) => emit("error", scope, msg),
};
