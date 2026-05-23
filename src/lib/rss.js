// RSS- und Atom-Parser auf Basis von fast-xml-parser.
// Normalisiert beide Formate auf ein einheitliches Item-Schema:
//   { title, link, summary, published (ISO|null), author }
import { XMLParser } from "fast-xml-parser";
import { stripHtml } from "./text.js";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  trimValues: true,
});

const asArray = (v) => (Array.isArray(v) ? v : v == null ? [] : [v]);

// Extrahiert Klartext aus einem Feld, das String, {#text} oder {@_href} sein kann.
function textOf(v) {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  if (typeof v === "object") return textOf(v["#text"] ?? "");
  return "";
}

// Findet die beste Link-URL in einem RSS/Atom-Item.
function linkOf(node) {
  if (typeof node.link === "string") return node.link;
  const links = asArray(node.link);
  // Atom: bevorzuge rel="alternate" bzw. den ersten href.
  const alt = links.find((l) => l && l["@_rel"] === "alternate");
  const pick = alt || links.find((l) => l && l["@_href"]) || links[0];
  if (pick && typeof pick === "object") return pick["@_href"] || textOf(pick);
  if (typeof pick === "string") return pick;
  // Fallbacks für RSS-Varianten.
  return textOf(node.guid) || "";
}

function dateOf(node) {
  const raw = node.pubDate || node.published || node.updated || node["dc:date"] || "";
  const t = Date.parse(textOf(raw));
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

/**
 * Parst einen RSS/Atom-String in normalisierte Items.
 * @returns {{items: Array, format: string}}
 */
export function parseFeed(xml) {
  let doc;
  try {
    doc = parser.parse(xml);
  } catch {
    return { items: [], format: "invalid" };
  }

  // RSS 2.0
  if (doc?.rss?.channel) {
    const ch = doc.rss.channel;
    const items = asArray(ch.item).map((it) => ({
      title: stripHtml(textOf(it.title)),
      link: linkOf(it),
      summary: stripHtml(textOf(it.description) || textOf(it["content:encoded"])),
      published: dateOf(it),
      author: stripHtml(textOf(it["dc:creator"]) || textOf(it.author) || textOf(it.source)),
    }));
    return { items, format: "rss" };
  }

  // Atom 1.0 (u. a. Reddit)
  if (doc?.feed) {
    const items = asArray(doc.feed.entry).map((e) => ({
      title: stripHtml(textOf(e.title)),
      link: linkOf(e),
      summary: stripHtml(textOf(e.summary) || textOf(e.content)),
      published: dateOf(e),
      author: stripHtml(textOf(e.author?.name) || textOf(e.author)),
    }));
    return { items, format: "atom" };
  }

  // RDF / RSS 1.0
  if (doc?.["rdf:RDF"]) {
    const items = asArray(doc["rdf:RDF"].item).map((it) => ({
      title: stripHtml(textOf(it.title)),
      link: linkOf(it),
      summary: stripHtml(textOf(it.description)),
      published: dateOf(it),
      author: stripHtml(textOf(it["dc:creator"])),
    }));
    return { items, format: "rdf" };
  }

  return { items: [], format: "unknown" };
}
