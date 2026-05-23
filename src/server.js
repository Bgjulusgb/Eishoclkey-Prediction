// Lokaler Webserver + JSON-API. Bindet ausschließlich an 127.0.0.1:4712.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SERVER, GAME } from "./config.js";
import { getState, refresh, startScheduler } from "./store.js";
import { log } from "./lib/log.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, "..", "public");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
    "cache-control": "no-store",
  });
  res.end(body);
}

function serveStatic(res, urlPath) {
  // Pfad-Traversal verhindern: nur Dateien innerhalb von PUBLIC_DIR.
  const rel = urlPath === "/" ? "index.html" : urlPath.replace(/^\/+/, "");
  const filePath = path.join(PUBLIC_DIR, rel);
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403).end("Forbidden");
    return;
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { "content-type": "text/plain; charset=utf-8" }).end("Not found");
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { "content-type": MIME[ext] || "application/octet-stream" });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${SERVER.host}:${SERVER.port}`);

  if (url.pathname === "/api/state") {
    return sendJson(res, 200, getState());
  }

  if (url.pathname === "/api/refresh") {
    // Manuelle Aktualisierung (GET oder POST).
    await refresh("manual");
    return sendJson(res, 200, getState());
  }

  if (url.pathname === "/api/health") {
    const s = getState();
    return sendJson(res, 200, { ok: true, generatedAt: s.generatedAt, refreshing: s.refreshing });
  }

  if (req.method === "GET") {
    return serveStatic(res, url.pathname);
  }

  res.writeHead(405, { "content-type": "text/plain; charset=utf-8" }).end("Method not allowed");
});

server.listen(SERVER.port, SERVER.host, () => {
  const url = `http://${SERVER.host}:${SERVER.port}`;
  log.ok("server", `Social Prediction Dashboard läuft auf ${url}`);
  log.info("server", `Spiel: ${GAME.home} vs. ${GAME.away} – ${GAME.tournament}`);
  startScheduler();
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    log.error("server", `Port ${SERVER.port} ist belegt. Läuft das Dashboard bereits?`);
  } else {
    log.error("server", err.message);
  }
  process.exit(1);
});
