// Zentrale Konfiguration des Social-Prediction-Dashboards.
//
// Diese Datei ist der einzige Ort, an dem Annahmen ("Priors") und Quellen
// bewusst hinterlegt sind. Alles andere im Programm wird zur Laufzeit aus
// öffentlich zugänglichen Quellen gesammelt. Werte hier dürfen frei
// angepasst werden – sie beeinflussen nur den Ausgangswert, sobald Live-Daten
// vorliegen, dominieren diese.

export const SERVER = {
  host: "127.0.0.1",
  port: 4712,
};

// Aktualisierungsintervall der Sammler (Millisekunden). Default: 10 Minuten.
// Bewusst nicht aggressiv, um öffentliche Quellen zu schonen.
export const REFRESH_INTERVAL_MS = 10 * 60 * 1000;

// Pro-Request-Timeout für alle Netzwerkzugriffe.
export const REQUEST_TIMEOUT_MS = 12_000;

export const GAME = {
  tournament: "IIHF WM 2026 – Gruppe A",
  home: "Deutschland",
  away: "Österreich",
  venue: "Swiss Life Arena, Zürich",
  // 23. Mai 2026, 20:15 MESZ == 18:15 UTC
  startUTC: "2026-05-23T18:15:00Z",
  timezoneLabel: "MESZ (UTC+2)",
};

// Teamdefinitionen samt Alias-Listen für die Texterkennung in Artikeln,
// Reddit-Posts und Prognosen. Alle Aliase werden klein und akzentbereinigt
// verglichen (siehe lib/text.js).
export const TEAMS = {
  GER: {
    code: "GER",
    name: "Deutschland",
    short: "GER",
    flag: "🇩🇪",
    aliases: [
      "deutschland",
      "germany",
      "german",
      "deutsch",
      "deutsche",
      "deutschen",
      "deb",
      "deb-team",
      "die deutschen",
    ],
  },
  AUT: {
    code: "AUT",
    name: "Österreich",
    short: "AUT",
    flag: "🇦🇹",
    aliases: [
      "osterreich",
      "oesterreich",
      "austria",
      "austrian",
      "austrians",
      "oehv",
      "die osterreicher",
      "rot-weiss-rot",
      "rot weiss rot",
    ],
  },
};

// --- Prior / Annahmen (frei editierbar) -----------------------------------
// Stärkebewertung im Stil einer Elo-Zahl. Quelle: grobe Einordnung anhand der
// IIHF-Weltrangliste der letzten Jahre (Deutschland Top-10, Österreich
// Mittelfeld). Dies ist eine ANNAHME, keine gescrapte Zahl, und dient nur als
// Ausgangswert, falls (noch) keine Live-Signale vorliegen.
export const PRIOR = {
  ratings: { GER: 1520, AUT: 1405 },
  // Logistische Skala (wie Elo): 400 Punkte ~ Faktor 10 in den Quoten.
  ratingScale: 400,
  // Aktuelle Form als kontextueller Nudge. Werte aus der Aufgabenstellung:
  // Österreich 3 Siege / 1 Niederlage, u. a. 9:0 gegen die Schweiz.
  // formScore in etwa [-1..+1]; positiver Wert = gute Form.
  form: {
    GER: { wins: null, losses: null, score: 0.0, note: "Form nicht angegeben" },
    AUT: {
      wins: 3,
      losses: 1,
      score: 0.55,
      note: "3 Siege / 1 Niederlage, u. a. 9:0 gegen die Schweiz",
    },
  },
  // Wie stark der Formunterschied den Prior verschiebt (max. ~Anteil).
  formWeight: 0.12,
};

// Gewichtung der Signale in der Endwahrscheinlichkeit. Werden zur Laufzeit mit
// einer datenabhängigen Konfidenz multipliziert (wenig Daten -> wenig Einfluss).
export const SIGNAL_WEIGHTS = {
  market: 0.4, // Wettquoten = am besten informiertes Signal
  experts: 0.25, // Experten-/Tipp-Prognosen
  news: 0.2, // Mediensentiment
  reddit: 0.1, // Community-Sentiment
  prior: 0.05, // Form/Stärke-Annahme (immer vorhanden)
};

// Sättigungskonstante k für die Konfidenz c = n / (n + k) je Signal.
// Größeres k => mehr Datenpunkte nötig, bis ein Signal voll zählt.
export const CONFIDENCE_SATURATION = {
  market: 2,
  experts: 4,
  news: 8,
  reddit: 10,
};

// --- Quellen --------------------------------------------------------------
// Ausschließlich öffentlich zugängliche RSS/Atom-Feeds und HTML-Seiten.
// Kein API-Key, kein OAuth, kein kostenpflichtiger Dienst.

const newsQueries = [
  "Deutschland Österreich Eishockey WM",
  "IIHF WM 2026 Deutschland Österreich",
  "Germany Austria ice hockey World Championship",
];

export const SOURCES = {
  // Google News RSS (kein Key). hl/gl/ceid steuern Sprache & Region.
  googleNews: newsQueries.map((q) => ({
    query: q,
    url:
      "https://news.google.com/rss/search?q=" +
      encodeURIComponent(q) +
      "&hl=de&gl=DE&ceid=DE:de",
  })),

  // Reddit-Subreddit- und Such-RSS (kein Key). .rss liefert Atom.
  reddit: [
    { name: "r/hockey (Suche)", url: "https://www.reddit.com/r/hockey/search.rss?q=Germany+Austria+IIHF&restrict_sr=1&sort=new" },
    { name: "r/icehockey", url: "https://www.reddit.com/r/icehockey/.rss" },
    { name: "r/iihf", url: "https://www.reddit.com/r/iihf/.rss" },
    { name: "r/Eishockey", url: "https://www.reddit.com/r/Eishockey/.rss" },
  ],

  // HTML-Scraping öffentlicher Prognose-/Tippseiten. Selektoren sind bewusst
  // defensiv; ändert eine Seite ihr Markup, liefert der Sammler einfach nichts
  // (statt abzustürzen). Zusätzlich greift ein RSS-basierter Prognose-Fallback.
  expertPages: [
    {
      name: "Google News (Prognose/Tipp)",
      type: "rss",
      url:
        "https://news.google.com/rss/search?q=" +
        encodeURIComponent("Deutschland Österreich Eishockey Prognose Tipp Favorit") +
        "&hl=de&gl=DE&ceid=DE:de",
    },
  ],

  // HTML-Scraping öffentlicher Wettseiten. Wettquoten-Seiten sind häufig
  // Cloudflare-geschützt; schlägt der Abruf fehl, bleibt das Signal leer.
  // decimalSelector: CSS-Selektor, der die Dezimalquoten in Reihenfolge
  // [Heim/GER, (Unentschieden), Gast/AUT] liefert.
  oddsPages: [
    // Beispielhafter, anpassbarer Eintrag. Standardmäßig leer gelassen, da
    // konkrete Wett-URLs erst zum Spieltag stabil sind.
    // {
    //   name: "Beispiel-Buchmacher",
    //   url: "https://www.example-odds.com/...",
    //   decimalSelector: ".odds-value",
    //   teamOrder: ["GER", "AUT"],
    // },
  ],
};

// Browserähnlicher User-Agent, damit RSS/HTML-Endpunkte nicht blocken.
export const USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) " +
  "Chrome/124.0.0.0 Safari/537.36 SocialPredictionDashboard/1.0";
