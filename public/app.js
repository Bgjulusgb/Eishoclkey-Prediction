"use strict";

const POLL_MS = 30_000;
const $ = (id) => document.getElementById(id);
let gameStartMs = null;

const pct = (x, d = 1) => (Number(x) * 100).toFixed(d) + "%";
const pp = (x, d = 1) => `${x >= 0 ? "+" : ""}${(Number(x) * 100).toFixed(d)} Pp.`;
function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function timeAgo(iso) {
  if (!iso) return "";
  const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
  if (s < 60) return "gerade eben";
  if (s < 3600) return Math.floor(s / 60) + " min";
  if (s < 86400) return Math.floor(s / 3600) + " h";
  return Math.floor(s / 86400) + " d";
}

function tickCountdown() {
  if (gameStartMs == null) return;
  const el = $("countdown");
  let diff = Math.floor((gameStartMs - Date.now()) / 1000);
  if (diff <= 0) { el.textContent = diff > -3 * 3600 ? "🔴 läuft" : "beendet"; return; }
  const d = Math.floor(diff / 86400); diff -= d * 86400;
  const h = Math.floor(diff / 3600); diff -= h * 3600;
  const m = Math.floor(diff / 60); const s = diff - m * 60;
  const pad = (n) => String(n).padStart(2, "0");
  el.textContent = (d > 0 ? d + "T " : "") + `${pad(h)}:${pad(m)}:${pad(s)}`;
}

function renderGame(game) {
  $("tournament").textContent = game.tournament;
  $("homeName").textContent = game.home;
  $("awayName").textContent = game.away;
  $("venue").textContent = game.venue;
  gameStartMs = Date.parse(game.startUTC);
  try {
    const dt = new Date(game.startUTC).toLocaleString("de-DE", {
      timeZone: "Europe/Berlin", weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
    });
    $("kickoff").textContent = `${dt} ${game.timezoneLabel || ""}`.trim();
  } catch { $("kickoff").textContent = game.startUTC; }
}

function renderPrediction(pred) {
  if (!pred) return;
  const ger = pred.teams.GER, aut = pred.teams.AUT;
  $("homeFlag").textContent = ger.flag;
  $("awayFlag").textContent = aut.flag;
  $("homeProb").textContent = pct(ger.prob);
  $("awayProb").textContent = pct(aut.prob);
  $("legendHome").textContent = ger.short;
  $("legendAway").textContent = aut.short;
  $("probbarHome").style.width = pct(ger.prob, 2);
  $("probbarAway").style.width = pct(aut.prob, 2);
  $("favoriteTag").textContent = `Favorit: ${pred.favorite === "GER" ? ger.name : aut.name}`;

  // Unsicherheitsband um die GER/AUT-Grenze.
  const u = pred.uncertainty;
  if (u) {
    $("probbarBand").style.left = pct(u.low, 2);
    $("probbarBand").style.width = pct(u.high - u.low, 2);
    $("uncertainty").innerHTML = `Unsicherheit <b>±${(u.stdev * 100).toFixed(1)} Pp.</b> · Band ${pct(u.low, 0)}–${pct(u.high, 0)} (GER)`;
  }

  // Momentum.
  const m = pred.meta?.momentum ?? 0;
  const mEl = $("momentum");
  if (Math.abs(m) < 0.002) { mEl.className = "momentum flat"; mEl.textContent = "Momentum: stabil"; }
  else if (m > 0) { mEl.className = "momentum up"; mEl.textContent = `▲ Momentum ${pp(m)} (GER)`; }
  else { mEl.className = "momentum down"; mEl.textContent = `▼ Momentum ${pp(m)} (GER)`; }

  // Banner zur Datenlage.
  const banner = $("liveBanner");
  if ((pred.meta?.activeLiveSignals ?? 0) === 0) {
    banner.className = "banner";
    banner.innerHTML = "⚠️ <b>Noch keine Live-Daten erreichbar.</b> Die Wahrscheinlichkeit beruht aktuell auf der Form-/Stärke-Annahme (Prior aus <code>config.js</code>). Sobald Feeds, Prognosen oder Quoten erreichbar sind, fließen sie automatisch ein.";
  } else { banner.className = "banner hidden"; banner.innerHTML = ""; }
}

function renderGoals(goals) {
  if (!goals) return;
  $("expScore").textContent = goals.modalScore;
  $("lambdaLine").innerHTML = `⌀ erwartete Tore: <b>${goals.lambdaGER.toFixed(2)}</b> – <b>${goals.lambdaAUT.toFixed(2)}</b>`;
  $("modalLine").textContent = `gerundet ${goals.expectedScore} · 2-Wege P(GER) ${pct(goals.twoWayGER, 0)}`;
  const r = goals.regulation;
  $("regGer").style.width = pct(r.ger, 1);
  $("regDraw").style.width = pct(r.draw, 1);
  $("regAut").style.width = pct(r.aut, 1);
  $("regLegend").innerHTML =
    `<span>GER ${pct(r.ger, 0)}</span><span>Remis→OT ${pct(r.draw, 0)}</span><span>AUT ${pct(r.aut, 0)}</span>`;
  const max = Math.max(...goals.topScorelines.map((s) => s.p), 0.0001);
  $("topScorelines").innerHTML = goals.topScorelines.map((s) => `
    <div class="scoreline">
      <span class="scoreline-score">${esc(s.score)}</span>
      <span class="scoreline-bar"><span class="scoreline-fill" style="width:${(s.p / max) * 100}%"></span></span>
      <span class="scoreline-p">${pct(s.p, 1)}</span>
    </div>`).join("");
}

function signalRow(s) {
  const dim = s.n === 0 ? " dim" : "";
  return `<div class="signal">
    <div class="signal-top">
      <span class="signal-label">${esc(s.label)}
        <span class="chip${dim}">n=${s.n}</span>
        <span class="chip${dim}">Gewicht ${(s.effectiveWeight * 100).toFixed(0)}%</span>
      </span>
      <span class="signal-p">P(GER) ${pct(s.p, 0)}</span>
    </div>
    <div class="signal-bar"><div class="signal-fill" style="width:${pct(s.p, 1)}"></div><div class="signal-mid"></div></div>
    <div class="signal-detail">${esc(s.detail)}</div>
  </div>`;
}
function renderSignals(pred) { if (pred) $("signals").innerHTML = pred.signals.map(signalRow).join(""); }

function renderAnalytics(pred) {
  const a = pred.analytics; if (!a) return;
  const share = a.buzz.shareGER;
  $("buzzGer").style.width = pct(share, 1);
  $("buzzAut").style.width = pct(1 - share, 1);
  $("buzzGerLbl").textContent = `GER ${pct(share, 0)} (${a.buzz.GER})`;
  $("buzzAutLbl").textContent = `${pct(1 - share, 0)} (${a.buzz.AUT}) AUT`;

  const ep = a.explicitPercentages;
  const sc = a.scoreConsensus;
  const rows = [
    ["Explizite Prognosen", ep && ep.n ? `Ø ${pct(ep.p, 0)} für GER (${ep.n})` : "keine gefunden"],
    ["Ergebnis-Konsens (Texte)", sc ? `${sc.mostCommon} · Ø ${sc.avgGER}:${sc.avgAUT} (${sc.n})` : "keine gefunden"],
    ["Momentum", `${pp(pred.meta?.momentum ?? 0)} (GER)`],
    ["Datenbasis", `${pred.meta?.activeLiveSignals ?? 0}/${pred.meta?.totalLiveSignals ?? 0} Live-Signale · ${pct(pred.meta?.liveContribution ?? 0, 0)} Live-Anteil`],
  ];
  $("analyticsExtra").innerHTML = rows.map(([k, v]) => `<div class="row"><span class="k">${esc(k)}</span><span class="v">${esc(v)}</span></div>`).join("");
}

const RISK_LABELS = { injury: "Verletzung", suspension: "Sperre", goalie: "Torwart", boost: "Comeback/Rückkehr" };
function renderRiskTeam(elId, teamRisk) {
  const cats = Object.entries(teamRisk || {}).filter(([, v]) => v.count > 0);
  if (!cats.length) { $(elId).innerHTML = `<div class="risk-none">keine Faktoren erkannt</div>`; return; }
  $(elId).innerHTML = cats.map(([cat, v]) => `
    <div class="risk-cat">
      <div class="risk-cat-label"><b>${esc(RISK_LABELS[cat] || cat)}</b> <span class="chip">${v.count}</span></div>
      ${v.samples.map((s) => `<div class="risk-snippet">${esc(s)}</div>`).join("")}
    </div>`).join("");
}
function renderRisk(pred) {
  const r = pred.analytics?.risk; if (!r) return;
  renderRiskTeam("riskGer", r.GER);
  renderRiskTeam("riskAut", r.AUT);
}

function sourceBlock(src) {
  if (!src) return "";
  const eps = (src.endpoints || []).map((e) => `<div class="endpoint">
      <span class="endpoint-name"><span class="dot ${e.status}"></span>${esc(e.name)}</span>
      <span>${e.status === "error" ? esc(e.error || "Fehler") : e.count + " Treffer"}</span>
    </div>`).join("");
  return `<div class="source">
    <div class="source-head"><span class="source-name">${esc(src.label)}</span><span class="badge ${src.status}">${src.status.toUpperCase()}</span></div>
    <div class="endpoints">${eps || '<div class="endpoint">keine Endpunkte</div>'}</div>
  </div>`;
}
function renderSources(sources) {
  $("sources").innerHTML = ["odds", "experts", "news", "reddit"].map((k) => sourceBlock(sources[k])).join("");
}

function sentimentTag(v) {
  if (v > 0.12) return '<span class="tag pos">positiv</span>';
  if (v < -0.12) return '<span class="tag neg">negativ</span>';
  return '<span class="tag neutral">neutral</span>';
}
function leanTags(it) {
  let out = "";
  if (it.leansGER > 0.15) out += '<span class="tag ger">→ GER</span>';
  if (it.leansAUT > 0.15) out += '<span class="tag aut">→ AUT</span>';
  return out;
}
function feedItem(it, opts = {}) {
  const link = it.link ? `<a href="${esc(it.link)}" target="_blank" rel="noopener">${esc(it.title)}</a>` : `<span>${esc(it.title)}</span>`;
  let tags = "";
  if (opts.favors) {
    const cls = it.favors === "GER" ? "ger" : it.favors === "AUT" ? "aut" : "neutral";
    tags += `<span class="tag ${cls}">${it.favors === "neutral" ? "neutral" : "tippt " + it.favors}</span>`;
  }
  if (opts.sentiment && typeof it.sentiment === "number") tags += sentimentTag(it.sentiment) + leanTags(it);
  const meta = [
    it.source ? `<span class="item-src">${esc(it.source)}</span>` : "",
    it.published ? `<span class="item-src">${timeAgo(it.published)}</span>` : "",
    opts.weight && typeof it.weight === "number" ? `<span class="weight-chip">Gewicht ${it.weight.toFixed(2)}</span>` : "",
    tags,
  ].filter(Boolean).join("");
  const sub = opts.showSummary && it.summary ? `<div class="item-src">${esc(it.summary)}</div>` : "";
  return `<div class="item">${link}<div class="item-meta">${meta}</div>${sub}</div>`;
}
function renderFeed(elId, countId, src, opts) {
  const items = src?.items || [];
  $(countId).textContent = items.length ? `(${items.length})` : "";
  if (!items.length) {
    $(elId).innerHTML = `<div class="empty-note">${src?.status === "error" ? "Quelle aktuell nicht erreichbar." : "Noch keine Einträge."}</div>`;
    return;
  }
  $(elId).innerHTML = items.map((it) => feedItem(it, opts)).join("");
}

function renderSpark(history) {
  const svg = $("spark");
  const pts = (history || []).filter((h) => typeof h.pGER === "number");
  if (pts.length < 2) { svg.innerHTML = `<text x="6" y="28" fill="#93a0c4" font-size="11">zu wenig Verlaufsdaten</text>`; return; }
  const W = 300, H = 48;
  const xs = (i) => (i / (pts.length - 1)) * W;
  const ys = (p) => H - p * H;
  const line = pts.map((h, i) => `${xs(i).toFixed(1)},${ys(h.pGER).toFixed(1)}`).join(" ");
  svg.innerHTML =
    `<line x1="0" y1="${ys(0.5)}" x2="${W}" y2="${ys(0.5)}" stroke="#263159" stroke-dasharray="3 3"/>` +
    `<polyline fill="none" stroke="#f5c542" stroke-width="2" points="${line}"/>` +
    `<circle cx="${xs(pts.length - 1).toFixed(1)}" cy="${ys(pts[pts.length - 1].pGER).toFixed(1)}" r="2.5" fill="#f5c542"/>`;
}

function render(state) {
  renderGame(state.game);
  renderPrediction(state.prediction);
  renderGoals(state.prediction?.goals);
  renderSignals(state.prediction);
  renderAnalytics(state.prediction || {});
  renderRisk(state.prediction || {});
  renderSources(state.sources || {});
  renderFeed("odds", "oddsCount", state.sources?.odds, { showSummary: true });
  renderFeed("news", "newsCount", state.sources?.news, { sentiment: true, weight: true });
  renderFeed("reddit", "redditCount", state.sources?.reddit, { sentiment: true, weight: true });
  renderFeed("experts", "expertsCount", state.sources?.experts, { favors: true });
  renderSpark(state.history);

  $("updated").textContent = state.generatedAt ? "aktualisiert " + timeAgo(state.generatedAt) : "noch nicht geladen";
  $("genState").textContent = state.refreshing ? "lädt …" : "";
  tickCountdown();
}

async function load() {
  try { render(await (await fetch("/api/state")).json()); }
  catch (err) { $("updated").textContent = "Verbindungsfehler"; console.error(err); }
}
async function manualRefresh() {
  const btn = $("refreshBtn");
  btn.disabled = true; btn.textContent = "⟳ lädt …";
  try { render(await (await fetch("/api/refresh")).json()); }
  catch (err) { console.error(err); }
  finally { btn.disabled = false; btn.textContent = "⟳ Aktualisieren"; }
}

$("refreshBtn").addEventListener("click", manualRefresh);
setInterval(tickCountdown, 1000);
setInterval(load, POLL_MS);
load();
