// Texthilfsfunktionen: Normalisierung, Akzentbereinigung, Tokenisierung,
// HTML-Strippen. Bewusst sprachneutral (Deutsch + Englisch).

// Kombinierende Diakritika (U+0300–U+036F), als RegExp ohne Literalzeichen.
const COMBINING_MARKS = new RegExp("[\\u0300-\\u036f]", "g");

// Kleinbuchstaben + Diakritika entfernen (ä->a, ö->o, ü->u, ß->ss, é->e ...).
export function normalize(input = "") {
  return String(input)
    .toLowerCase()
    .replace(/ß/g, "ss")
    .normalize("NFD")
    .replace(COMBINING_MARKS, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Entfernt HTML-Tags und dekodiert die häufigsten Entities.
export function stripHtml(input = "") {
  return String(input)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, " ")
    .trim();
}

// Zerlegt normalisierten Text in Wort-Tokens.
export function tokenize(normalized = "") {
  return normalized.split(/[^a-z0-9-]+/).filter(Boolean);
}

// Teilt Text grob in Sätze (für satzweise Team-Zuordnung).
export function splitSentences(input = "") {
  return String(input)
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
}
