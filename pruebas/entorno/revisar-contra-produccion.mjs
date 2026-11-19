// Comprobación SIN ESCRITURAS contra producción ya migrada:
//  A) el panel PUBLICADO (pages.dev) con la sesión de administrador guardada;
//  B) la web NUEVA servida en localhost:8152 (modo producción-lectura) y su panel nuevo.
// El navegador bloquea toda petición de escritura hacia la base de producción (solo GET y /auth/v1/token).
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";
import { CARPETA_PRIVADA, REF_PRODUCCION } from "./proyecto.mjs";
import { ARCHIVO_SESION_PRODUCCION, SITIO_PRODUCCION, esLecturaPermitida } from "./produccion.mjs";

const NUEVA = "http://localhost:8152";
const REAL = "torneo-integracion-de-la-plaza-san-isidro-libre-sport-caaguazu-vs-san-luis";
const DIA = "torneo-integracion-de-la-plaza-san-isidro-2026-11-13";
let fallos = 0;
const rep = (ok, t, x = "") => { if (!ok) fallos++; console.log((ok ? "  OK  " : "FALLA ") + t + (x ? "  → " + x : "")); };
let bloqueadas = 0;

const estado = JSON.parse(fs.readFileSync(ARCHIVO_SESION_PRODUCCION, "utf8"));
const clonado = JSON.parse(JSON.stringify(estado));
clonado.origins[0].origin = NUEVA; // misma sesión de lectura, para el panel nuevo en localhost
const tmp = path.join(CARPETA_PRIVADA, "sesion-produccion-local.json");
fs.writeFileSync(tmp, JSON.stringify(clonado));

const navegador = await chromium.launch({ channel: "msedge", headless: true });
async function contexto(state, movil = false) {
  const ctx = await navegador.newContext({ storageState: state, viewport: movil ? { width: 390, height: 844 } : { width: 1366, height: 800 }, isMobile: movil, locale: "es-PY", timezoneId: "America/Asuncion" });
  await ctx.route("**/*", (r) => {
    const q = r.request(), u = q.url();
    const login = q.method() === "POST" && new URL(u).pathname === "/auth/v1/token";
    if (u.includes(REF_PRODUCCION) && !login && !esLecturaPermitida(q.method(), u)) { bloqueadas++; return r.abort("blockedbyclient"); }
    return r.continue();
  });
  return ctx;
}
async function recorrer(ctx, base, rutas, etiqueta) {
  const p = await ctx.newPage();
  const errores = [];
  p.on("pageerror", (e) => errores.push(e.message));
  p.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|ytimg|403|blockedbyclient/.test(m.text())) errores.push(m.text()); });
  await p.goto(base + "/admin/#/");
  await p.waitForSelector("#salir:visible, #loginCorreo:visible", { timeout: 25000 });
  rep(await p.locator("#salir").isVisible(), `${etiqueta}: sesión de administrador activa`);
  for (const r of rutas) {
    await p.goto(base + "/admin/#/" + r);
    await p.waitForTimeout(1800);
    const t = await p.evaluate(() => (document.querySelector("main") || document.body).innerText);
    rep(t.length > 40 && !/no se pudo cargar|error inesperado/i.test(t.slice(0, 400)), `${etiqueta}: #/${r} carga`);
  }
  rep(errores.length === 0, `${etiqueta}: sin errores de consola`, errores[0] || "");
  return p;
}

// ---- A) panel publicado ----
{
  const ctx = await contexto(ARCHIVO_SESION_PRODUCCION);
  await recorrer(ctx, SITIO_PRODUCCION, ["coberturas", "partidos", "jornadas", "noticias", "transmisiones", "campeonatos", "categorias", "publicaciones"], "Panel PUBLICADO");
  await ctx.close();
}
// ---- B) web nueva contra producción ----
{
  const ctx = await contexto(undefined);
  const pub = await ctx.newPage();
  const errores = [];
  pub.on("pageerror", (e) => errores.push(e.message));
  const ver = async (ruta, comprobar) => {
    const r = await pub.goto(NUEVA + ruta, { waitUntil: "networkidle" });
    await pub.waitForTimeout(700);
    const t = await pub.evaluate(() => document.body.textContent.replace(/\s+/g, " "));
    const desborde = await pub.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    rep(r.status() === 200, `Web nueva ${ruta} → ${r.status()}`);
    rep(desborde <= 1, `Web nueva ${ruta} sin desborde`);
    if (comprobar) for (const [n, f] of Object.entries(comprobar)) rep(f(t), `Web nueva ${ruta}: ${n}`);
  };
  await ver("/", { "noticia real en «Últimas noticias»": (t) => /semifinal/i.test(t) });
  await ver("/coberturas", { "cobertura real como tarjeta del día": (t) => /13 nov 2026/.test(t) && /1 partido/.test(t) });
  await ver("/dias/" + DIA, { "el partido real aparece": (t) => /Sport Caaguaz/.test(t) && /San Luis/.test(t) });
  await ver("/coberturas/" + REAL, { "la cobertura real sigue igual": (t) => /Sport Caaguaz/.test(t) });
  await ver("/noticias", { "lista la noticia real": (t) => /semifinal/i.test(t) });
  await ver("/noticias/area-4-semifinal", { "noticia real": (t) => /semifinal/i.test(t) });
  await ver("/coberturas?q=san+luis", { "búsqueda encuentra la real": (t) => /1 cobertura para/.test(t) });
  await ver("/coberturas/archivo");
  const fotos = await (await pub.goto(NUEVA + "/coberturas/" + REAL)).text();
  const n = (fotos.match(/fotos-publicas\/albumes/g) || []).length;
  rep(n >= 28, `Las 28 fotos de la cobertura real se siguen mostrando`, `${n} referencias`);
  rep(errores.length === 0, "Web nueva sin errores de JavaScript", errores[0] || "");
  await ctx.close();

  const ctxA = await contexto(tmp);
  const p = await recorrer(ctxA, NUEVA, ["coberturas", "dias", "partidos", "noticias", "transmisiones"], "Panel NUEVO");
  await p.goto(NUEVA + "/admin/#/dias");
  await p.waitForSelector("h1:has-text('Coberturas del día')");
  await p.waitForTimeout(1500);
  const lista = await p.evaluate(() => document.body.innerText);
  rep(/13 nov|2026/.test(lista) && /Torneo Integraci/i.test(lista), "Panel nuevo «Coberturas del día»: lista el día real");
  await ctxA.close();
}
await navegador.close();
fs.rmSync(tmp, { force: true });
console.log(`\nEscrituras a producción bloqueadas por el navegador: ${bloqueadas}`);
console.log(fallos ? `${fallos} problema(s).` : "Todo en orden.");
process.exit(fallos ? 1 : 0);
