// Servidor LOCAL que imita Cloudflare Pages: sirve los archivos del repositorio y ejecuta
// las Functions reales (functions/**) contra el proyecto de PRUEBAS. Solo escucha en localhost.
//   node servidor-local.mjs [puerto]
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { AQUI, URL_PRUEBAS, CLAVE_PUBLICA_PRUEBAS, PUERTO_LOCAL, sinProduccion } from "./proyecto.mjs";

// RDTV_RAIZ permite servir OTRA copia del sitio (p. ej. la versión publicada, para pruebas de compatibilidad).
const RAIZ = process.env.RDTV_RAIZ ? path.resolve(process.env.RDTV_RAIZ) : path.resolve(AQUI, "..", "..");
const FUNC = path.join(RAIZ, "functions");
const puerto = Number(process.argv[2]) || PUERTO_LOCAL;
sinProduccion(URL_PRUEBAS, CLAVE_PUBLICA_PRUEBAS);
const env = { SUPABASE_URL: URL_PRUEBAS, SUPABASE_PUBLISHABLE_KEY: CLAVE_PUBLICA_PRUEBAS };
const TIPOS = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".ico": "image/x-icon", ".woff2": "font/woff2", ".txt": "text/plain; charset=utf-8", ".xml": "application/xml" };

// ---- tabla de rutas a partir de functions/ ----
const rutas = [];
(function recorrer(dir, prefijo) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith("_")) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { recorrer(p, prefijo + "/" + e.name); continue; }
    if (!e.name.endsWith(".js")) continue;
    const base = e.name.slice(0, -3);
    const partes = (base === "index" ? prefijo : prefijo + "/" + base).split("/").filter(Boolean);
    const nombres = []; let patron = "^";
    for (const s of partes) {
      let m;
      if ((m = s.match(/^\[\[(.+)\]\]$/))) { nombres.push(m[1]); patron += "(?:/(.*))?"; }
      else if ((m = s.match(/^\[(.+)\]$/))) { nombres.push(m[1]); patron += "/([^/]+)"; }
      else patron += "/" + s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }
    rutas.push({ re: new RegExp(patron + "/?$"), nombres, archivo: p, peso: partes.filter((s) => !s.startsWith("[")).length * 10 - partes.filter((s) => s.startsWith("[[")).length * 100 });
  }
})(FUNC, "");
rutas.sort((a, b) => b.peso - a.peso);

const assets = { fetch: async (r) => { const u = new URL(r instanceof Request ? r.url : String(r)); const f = archivoEstatico(u.pathname); return f ? new Response(fs.readFileSync(f), { headers: { "content-type": TIPOS[path.extname(f)] || "application/octet-stream" } }) : new Response("no encontrado", { status: 404 }); } };

function archivoEstatico(ruta) {
  let p = decodeURIComponent(ruta); if (p.endsWith("/")) p += "index.html";
  const f = path.resolve(RAIZ, "." + p);
  if (!f.startsWith(RAIZ + path.sep) || /(^|[\\/])(\.git|node_modules|\.claude|respaldos)([\\/]|$)/.test(path.relative(RAIZ, f))) return null;
  return fs.existsSync(f) && fs.statSync(f).isFile() ? f : null;
}

http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://localhost:${puerto}`);
    for (const r of rutas) {
      const m = url.pathname.match(r.re); if (!m) continue;
      const mod = await import(pathToFileURL(r.archivo).href + "?t=" + fs.statSync(r.archivo).mtimeMs);
      const metodo = req.method === "HEAD" ? "GET" : req.method;
      const fn = mod["onRequest" + metodo[0] + metodo.slice(1).toLowerCase()] || mod.onRequest;
      if (!fn) break;
      const params = Object.fromEntries(r.nombres.map((n, i) => [n, decodeURIComponent(m[i + 1] ?? "")]));
      const cuerpoReq = new Request(url.href, { method: req.method, headers: req.headers });
      const resp = await fn({ request: cuerpoReq, env, params, data: {}, waitUntil() {}, next: () => assets.fetch(cuerpoReq), env_: undefined });
      res.writeHead(resp.status, Object.fromEntries([...resp.headers.entries(), ["cache-control", "no-store"]]));
      return res.end(Buffer.from(await resp.arrayBuffer()));
    }
    const f = archivoEstatico(url.pathname) || (url.pathname === "/" ? archivoEstatico("/index.html") : null);
    if (!f) { res.writeHead(404, { "content-type": "text/html; charset=utf-8" }); return res.end(fs.existsSync(path.join(RAIZ, "404.html")) ? fs.readFileSync(path.join(RAIZ, "404.html")) : "404"); }
    res.writeHead(200, { "content-type": TIPOS[path.extname(f)] || "application/octet-stream", "cache-control": "no-store" });
    res.end(fs.readFileSync(f));
  } catch (e) { console.error(e); res.writeHead(500); res.end("Error: " + e.message); }
}).listen(puerto, "127.0.0.1", () => console.log(`Servidor de pruebas en http://localhost:${puerto}/ (proyecto de PRUEBAS)`));
