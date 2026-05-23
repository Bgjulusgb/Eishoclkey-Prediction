// Dünner Wrapper um undici (fetch) mit Timeout, automatischem Folgen von
// Redirects, browserähnlichem User-Agent und Exponential-Backoff-Retry für
// Netzwerkfehler. undici.fetch folgt Redirects standardmäßig – wichtig für
// Google News RSS und Reddit, die auf Endpunkte weiterleiten.
import { fetch } from "undici";
import { REQUEST_TIMEOUT_MS, USER_AGENT } from "../config.js";
import { log } from "./log.js";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Lädt eine URL als Text. Wirft NICHT – gibt bei Fehler { ok:false } zurück,
 * damit ein einzelner toter Endpunkt nie das ganze Dashboard kippt.
 * @returns {Promise<{ok:boolean,status:number,body:string,url:string,error?:string}>}
 */
export async function fetchText(url, { retries = 2, accept } = {}) {
  let lastErr = "unknown";
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        method: "GET",
        redirect: "follow",
        signal: controller.signal,
        headers: {
          "user-agent": USER_AGENT,
          accept: accept || "text/html,application/xhtml+xml,application/xml,application/rss+xml;q=0.9,*/*;q=0.8",
          "accept-language": "de-DE,de;q=0.9,en;q=0.8",
        },
      });
      const status = res.status;
      // 4xx/5xx: kein Retry (außer 429/503), Inhalt aber zurückgeben.
      if (status >= 400 && status !== 429 && status !== 503) {
        const body = await res.text().catch(() => "");
        clearTimeout(timer);
        return { ok: false, status, body, url, error: `HTTP ${status}` };
      }
      if (status === 429 || status === 503) {
        clearTimeout(timer);
        lastErr = `HTTP ${status}`;
        throw new Error(lastErr); // -> Retry
      }
      const body = await res.text();
      clearTimeout(timer);
      return { ok: true, status, body, url };
    } catch (err) {
      clearTimeout(timer);
      lastErr = err.name === "AbortError" ? "timeout" : err.message || String(err);
      if (attempt < retries) {
        const backoff = 1000 * 2 ** attempt;
        log.warn("http", `${shortUrl(url)} fehlgeschlagen (${lastErr}) – Retry in ${backoff}ms`);
        await sleep(backoff);
      }
    }
  }
  return { ok: false, status: 0, body: "", url, error: lastErr };
}

export function shortUrl(url) {
  try {
    const u = new URL(url);
    return u.host + u.pathname.slice(0, 24);
  } catch {
    return String(url).slice(0, 40);
  }
}
