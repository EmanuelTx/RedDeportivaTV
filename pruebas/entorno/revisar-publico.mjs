// Recorre las páginas públicas del sitio local (contra PRUEBAS), revisa errores de consola,
// desbordes horizontales y textos clave, y guarda capturas en %LOCALAPPDATA%\RedDeportivaTV-dev\capturas.
//   node revisar-publico.mjs [movil]
import fs from "node:fs";
import path from "node:path";
import { abrir, BASE } from "./navegador.mjs";
import { CARPETA_PRIVADA } from "./proyecto.mjs";

const movil = process.argv.includes("movil");
const CARPETA = path.join(path.dirname(CARPETA_PRIVADA), "capturas", movil ? "movil" : "pc");
fs.mkdirSync(CARPETA, { recursive: true });
const nav = await abrir({ movil });
let fallos = 0;
const reporte = (ok, t) => { if (!ok) fallos++; console.log((ok ? "  OK  " : "FALLA ") + t); };

async function ver(ruta, nombre, comprobar) {
  const p = await nav.contexto.newPage();
  const errores = [];
  p.on("pageerror", (e) => errores.push(e.message));
  p.on("console", (m) => { if (m.type() === "error" && !/favicon|ytimg|Failed to load resource/.test(m.text())) errores.push(m.text()); });
  const r = await p.goto(BASE + ruta, { waitUntil: "networkidle", timeout: 30000 }).catch((e) => ({ status: () => "error: " + e.message }));
  await p.waitForTimeout(900);
  const estado = r.status();
  const desborde = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  const texto = await p.evaluate(() => document.body.textContent.replace(/\s+/g, " "));
  reporte(estado === 200, `${ruta} → ${estado}`);
  reporte(desborde <= 1, `${ruta} sin desborde horizontal (${desborde}px)`);
  reporte(errores.length === 0, `${ruta} sin errores de consola${errores.length ? ": " + errores[0] : ""}`);
  if (comprobar) for (const [t, f] of Object.entries(comprobar)) reporte(f(texto, p), `${ruta}: ${t}`);
  await p.screenshot({ path: path.join(CARPETA, nombre + ".png"), fullPage: true });
  await p.close();
  return texto;
}

await ver("/", "inicio", {
  "EN VIVO visible": (t) => /EN VIVO/.test(t),
  "Últimas noticias con 3 publicadas": (t) => /Gran jornada de fútbol/.test(t) && /Sub-14: un empate/.test(t),
  "no muestra el borrador": (t) => !/Premiación del torneo/.test(t),
  "tarjeta del día Área 4": (t) => /Area 4/i.test(t) && /17 nov 2026/.test(t)
});
await ver("/coberturas", "coberturas", {
  "una sola tarjeta para el día 17": (t) => (t.match(/17 nov 2026/g) || []).length === 1,
  "indica 8 partidos publicados (2 siguen en borrador)": (t) => /8 partidos/.test(t)
});
await ver("/dias/area-4-2026-11-17", "dia", {
  "muestra las 5 categorías": (t) => ["Sub-12", "Sub-14", "Sub-16", "Libre", "Senior"].every((c) => t.includes(c)),
  "muestra un partido": (t) => /Tigres/.test(t) && /Halcones/.test(t),
  "video resumen": (t) => /resumen/i.test(t)
});
await ver("/coberturas/sim-area-4-sub-12-tigres-vs-halcones-2026-11-17", "partido", {
  "fotos del partido": (t) => /Tigres/.test(t)
});
await ver("/noticias", "noticias", {
  "lista publicadas": (t) => /Gran jornada/.test(t) && /La categoría Libre/.test(t),
  "sin borrador": (t) => !/Premiación/.test(t)
});
await ver("/noticias/sim-gran-jornada-en-area-4", "noticia", { "título": (t) => /Gran jornada/.test(t) });
const borrador = await nav.contexto.newPage();
const rb = await borrador.goto(BASE + "/noticias/sim-borrador-premiacion");
reporte(rb.status() === 404, "/noticias/<borrador> → 404 (privado)");
await borrador.close();
await ver("/coberturas?q=halcones", "busqueda-equipo", { "encuentra por equipo": (t) => /1 cobertura para/.test(t) });
await ver("/coberturas?q=sub-14", "busqueda-categoria", { "encuentra por categoría": (t) => /1 cobertura para/.test(t) });
await ver("/coberturas/archivo", "archivo");
const api = await (await fetch(BASE + "/api/videos?limite=6")).json();
reporte(Array.isArray(api.videos) || Array.isArray(api), "/api/videos responde");
console.log("Videos:", JSON.stringify(api).slice(0, 400));
const ev = await (await fetch(BASE + "/api/en-vivo")).json();
reporte(Array.isArray(ev.en_vivo) && ev.en_vivo.length === 1 && !!ev.en_vivo[0].id,"/api/en-vivo activo → " + JSON.stringify(ev).slice(0, 160));
if (nav.avisos.length) console.log("Bloqueos de seguridad:", nav.avisos);
await nav.cerrar();
console.log(fallos ? `\n${fallos} problema(s). Capturas en ${CARPETA}` : `\nTodo en orden. Capturas en ${CARPETA}`);
