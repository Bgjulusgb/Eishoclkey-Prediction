// Zentrale Konfiguration des Social-Prediction-Dashboards.
//
// Einziger Ort für Annahmen ("Priors") und Quellen. Alles Übrige wird zur
// Laufzeit aus öffentlich zugänglichen Quellen gesammelt. Kein API-Key, kein
// OAuth, kein kostenpflichtiger Dienst.

export const SERVER = { host: "127.0.0.1", port: 4712 };

// Aktualisierungsintervall der Sammler (ms). Default: 10 Minuten.
export const REFRESH_INTERVAL_MS = 10 * 60 * 1000;

// Pro-Request-Timeout für alle Netzwerkzugriffe.
export const REQUEST_TIMEOUT_MS = 12_000;

// Max. gleichzeitige Netzwerk-Requests (höflich gegenüber öffentlichen Quellen).
export const FETCH_CONCURRENCY = 6;

export const GAME = {
  tournament: "IIHF WM 2026 – Gruppe A",
  home: "Deutschland",
  away: "Österreich",
  venue: "Swiss Life Arena, Zürich",
  neutralVenue: true, // Zürich ist für beide neutral -> kein Heimvorteil
  startUTC: "2026-05-23T18:15:00Z", // 20:15 MESZ
  timezoneLabel: "MESZ (UTC+2)",
};

export const TEAMS = {
  GER: {
    code: "GER", name: "Deutschland", short: "GER", flag: "🇩🇪",
    aliases: ["deutschland", "germany", "german", "deutsch", "deutsche", "deutschen", "deb", "deb-team", "die deutschen", "dfb-adler", "adler"],
  },
  AUT: {
    code: "AUT", name: "Österreich", short: "AUT", flag: "🇦🇹",
    aliases: ["osterreich", "oesterreich", "austria", "austrian", "austrians", "oehv", "die osterreicher", "rot-weiss-rot", "rot weiss rot"],
  },
};

// --- Prior / Annahmen (frei editierbar) -----------------------------------
// Stärkebewertung im Elo-Stil. Grobe Einordnung nach IIHF-Weltrangliste
// (Deutschland Top-10, Österreich Mittelfeld). ANNAHME, keine gescrapte Zahl.
export const PRIOR = {
  ratings: { GER: 1520, AUT: 1405 },
  ratingScale: 400,
  // Aktuelle Form (aus der Aufgabenstellung): Österreich 3 Siege / 1 Niederlage,
  // u. a. 9:0 gegen die Schweiz. score in etwa [-1..+1].
  form: {
    GER: { wins: null, losses: null, score: 0.0, note: "Form nicht angegeben" },
    AUT: { wins: 3, losses: 1, score: 0.55, note: "3 Siege / 1 Niederlage, u. a. 9:0 gegen die Schweiz" },
  },
  formWeight: 0.12,
};

// --- Signal-Fusion --------------------------------------------------------
// Kombinationsmethode: "logit" = log-lineares Opinion-Pooling (im Log-Odds-Raum),
// wissenschaftlich sauber für die Aggregation von Wahrscheinlichkeiten.
// "linear" = gewichteter Mittelwert (einfacher, weniger kalibriert).
export const COMBINATION = "logit";

// Basisgewichte der Signale. Werden zur Laufzeit mit datenabhängiger Konfidenz
// c = n/(n+k) multipliziert (wenig Daten -> wenig Einfluss).
export const SIGNAL_WEIGHTS = {
  market: 0.42, // Wettquoten = bestes, marktkalibriertes Signal (Anker)
  experts: 0.23, // Experten-/Tipp-Prognosen (inkl. expliziter Prozentangaben)
  news: 0.18, // Mediensentiment (recency- & glaubwürdigkeitsgewichtet)
  reddit: 0.1, // Community-Sentiment (engagementgewichtet)
  prior: 0.07, // Form/Stärke-Annahme (immer vorhanden)
};

// Markt-Anker: Sind Quoten vorhanden, wird ihr effektives Gewicht zusätzlich
// um diesen Faktor verstärkt (Quoten sind per Konstruktion kalibriert).
export const MARKET_ANCHOR_BOOST = 1.6;

// Sättigungskonstante k für die Konfidenz c = n/(n+k) je Signal.
export const CONFIDENCE_SATURATION = { market: 2, experts: 4, news: 8, reddit: 10 };

// --- Auswertung / Analyse -------------------------------------------------
// Recency-Gewichtung: Halbwertszeit der Aktualität in Stunden.
export const RECENCY = { halfLifeHours: 36, noDateWeight: 0.5 };

// Glaubwürdigkeit nach Quelle (Name-/Domain-Stichwort -> Faktor). Default 1.
// Basisfaktor je Quellentyp wird in lib/annotate.js gesetzt.
export const CREDIBILITY = {
  base: { news: 1.0, reddit: 0.8, expert: 1.2, odds: 1.0 },
  keywords: {
    iihf: 1.4, "the athletic": 1.4, espn: 1.3, tsn: 1.3, nhl: 1.2,
    "eishockey news": 1.35, eishockeynews: 1.35, hockeyweb: 1.25, "sport.orf": 1.3, orf: 1.25,
    sport1: 1.2, kicker: 1.25, sky: 1.2, ran: 1.15, sportschau: 1.25, "laola1": 1.15,
    krone: 0.95, bild: 0.95, blog: 0.85, forum: 0.8, fan: 0.85,
  },
};

// Risiko-/Kontext-Schlüsselwörter (DE/EN) für die Faktor-Extraktion je Team.
export const RISK_KEYWORDS = {
  injury: ["verletzt", "verletzung", "verletzungssorgen", "angeschlagen", "ausfall", "ausfalle", "fraglich", "injury", "injured", "sidelined", "doubtful", "out"],
  suspension: ["gesperrt", "sperre", "suspendiert", "suspension", "banned", "suspended"],
  goalie: ["torwart", "torhuter", "goalie", "keeper", "schlussmann", "starting goalie"],
  boost: ["comeback", "kehrt zuruck", "returns", "fit", "back in", "rueckkehr", "ruckkehr"],
};

// Erwartete-Tore-Modell (Poisson/Skellam) -> Ergebnisprognose.
export const GOALS = {
  expectedTotal: 6.2, // erwartete Gesamttore (IIHF-Schnitt grob), editierbar
  maxGoals: 12, // Obergrenze der Tor-Verteilung
  topN: 6, // wie viele wahrscheinlichste Ergebnisse anzeigen
};

// --- Quellen --------------------------------------------------------------
const GN = (q, { hl = "de", gl = "DE", ceid = "DE:de" } = {}) =>
  "https://news.google.com/rss/search?q=" + encodeURIComponent(q) + `&hl=${hl}&gl=${gl}&ceid=${ceid}`;

export const SOURCES = {
  // Google News RSS (kein Key): mehrere Sprach-/Regionen-Editionen + Themen.
  googleNews: [
    { query: "Deutschland Österreich Eishockey WM", url: GN("Deutschland Österreich Eishockey WM") },
    { query: "IIHF WM 2026 Deutschland Österreich", url: GN("IIHF WM 2026 Deutschland Österreich") },
    { query: "Deutschland Österreich Aufstellung Verletzung Eishockey", url: GN("Deutschland Österreich Aufstellung Verletzung Eishockey") },
    { query: "Österreich Eishockey WM 2026 (AT-Edition)", url: GN("Österreich Deutschland Eishockey WM", { hl: "de", gl: "AT", ceid: "AT:de" }) },
    { query: "Germany Austria ice hockey World Championship (EN)", url: GN("Germany Austria ice hockey World Championship 2026", { hl: "en-US", gl: "US", ceid: "US:en" }) },
    { query: "Germany Austria IIHF preview lineup injury (EN)", url: GN("Germany Austria IIHF 2026 preview lineup injury", { hl: "en-US", gl: "US", ceid: "US:en" }) },
  ],

  // Reddit: JSON bevorzugt (liefert Upvotes/Kommentare -> Engagement), RSS als
  // Fallback. Beide ohne Key.
  reddit: [
    { name: "reddit (Suche)", json: "https://www.reddit.com/search.json?q=Germany+Austria+IIHF&sort=new&limit=25", rss: "https://www.reddit.com/search.rss?q=Germany+Austria+IIHF&sort=new" },
    { name: "r/hockey (Suche)", json: "https://www.reddit.com/r/hockey/search.json?q=Germany+Austria+IIHF&restrict_sr=1&sort=new&limit=25", rss: "https://www.reddit.com/r/hockey/search.rss?q=Germany+Austria+IIHF&restrict_sr=1&sort=new" },
    { name: "r/icehockey", json: "https://www.reddit.com/r/icehockey/new.json?limit=25", rss: "https://www.reddit.com/r/icehockey/.rss" },
    { name: "r/iihf", json: "https://www.reddit.com/r/iihf/new.json?limit=25", rss: "https://www.reddit.com/r/iihf/.rss" },
    { name: "r/Eishockey", json: "https://www.reddit.com/r/Eishockey/new.json?limit=25", rss: "https://www.reddit.com/r/Eishockey/.rss" },
  ],

  // Experten-/Tipp-Prognosen: RSS-Prognosesuche (DE/EN) + optionales HTML-Scraping.
  expertPages: [
    { name: "Google News: Prognose/Tipp/Favorit", type: "rss", url: GN("Deutschland Österreich Eishockey Prognose Tipp Favorit Vorschau") },
    { name: "Google News: prediction/odds/preview (EN)", type: "rss", url: GN("Germany Austria hockey prediction preview odds", { hl: "en-US", gl: "US", ceid: "US:en" }) },
    // Beispiel für HTML-Scraping einer Tippseite (anpassbar):
    // { name: "Tippseite", type: "html", url: "https://...", itemSelector: ".tip", titleSelector: "h3", linkSelector: "a" },
  ],

  // Wettquoten: HTML-Scraping. MECHANISMUS FERTIG, standardmäßig ohne aktive
  // URL (Wettseiten sind oft Cloudflare-geschützt und ändern ihr Markup).
  // Eigenen Buchmacher hier ergänzen:
  //   { name, url, decimalSelector: CSS, teamOrder: ["GER","AUT"] | ["GER","DRAW","AUT"] }
  oddsPages: [
    // {
    //   name: "Beispiel-Buchmacher",
    //   url: "https://www.example-odds.com/match/ger-aut",
    //   decimalSelector: ".odds .value",
    //   teamOrder: ["GER", "AUT"],
    // },
  ],
};

export const USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) " +
  "Chrome/124.0.0.0 Safari/537.36 SocialPredictionDashboard/2.0";
