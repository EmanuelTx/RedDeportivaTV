// Revisión de TODAS las secciones del panel PUBLICADO con la sesión de administrador guardada, en PC y celular.
// Solo lectura: el navegador bloquea cualquier escritura hacia producción (se informa cuántas intentó el panel).
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";
import { CARPETA_PRIVADA, REF_PRODUCCION } from "./proyecto.mjs";
import { ARCHIVO_SESION_PRODUCCION, SITIO_PRODUCCION, esLecturaPermitida } from "./produccion.mjs";

const dirCap = path.join(path.dirname(CARPETA_PRIVADA), "capturas", "publicado");
fs.mkdirSync(dirCap, { recursive: true });
let fallos = 0, bloqueadas = 0;
const rep = (ok, t, x = "") => { if (!ok) fallos++; console.log((ok ? "  OK  " : "FALLA ") + t + (x ? "  → " + x : "")); };
const navegador = await chromium.launch({ channel: "msedge", headless: true });

for (const movil of [false, true]) {
  const T = movil ? "[celular] " : "[PC] ";
  const ctx = await navegador.newContext({ storageState: ARCHIVO_SESION_PRODUCCION, ...(movil ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { viewport: { width: 1366, height: 800 } }), locale: "es-PY", timezoneId: "America/Asuncion" });
  await ctx.route("**/*", (r) => {
    const q = r.request(), u = q.url();
    const login = q.method() === "POST" && new URL(u).pathname === "/auth/v1/token";
    if (u.includes(REF_PRODUCCION) && !login && !esLecturaPermitida(q.method(), u)) { bloqueadas++; console.log("   bloqueado: " + q.method() + " " + new URL(u).pathname + " (en " + r.request().frame().url().replace(/^https?:\/\/[^/]+/, "") + ")"); return r.abort("blockedbyclient"); }
    return r.continue();
  });
  const p = await ctx.newPage();
  const errores = [];
  p.on("pageerror", (e) => errores.push(e.message));
  p.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|ytimg|blockedbyclient/.test(m.text())) errores.push(m.text()); });
  await p.goto(SITIO_PRODUCCION + "/admin/#/", { waitUntil: "networkidle" });
  await p.waitForSelector("#salir:visible", { timeout: 25000 });
  rep(true, T + "Sesión de administrador activa");

  // Secciones del menú (se leen del propio panel)
  if (movil) await p.locator("#menuBoton").click();
  const secciones = await p.evaluate(() => [...document.querySelectorAll("nav a[href^='#/']")].map((a) => [a.getAttribute("href"), a.textContent.trim()]));
  rep(secciones.length >= 8, T + "El menú del panel lista sus secciones", secciones.map((s) => s[1]).join(", "));
  if (movil) await p.locator("#menuBoton").click();
  for (const [href, nombre] of secciones) {
    await p.goto(SITIO_PRODUCCION + "/admin/" + href);
    await p.waitForTimeout(1600);
    const info = await p.evaluate(() => { const m = document.querySelector("main") || document.body; return { t: m.innerText, d: document.documentElement.scrollWidth - innerWidth }; });
    rep(info.t.length > 30 && !/no se pudo cargar|error inesperado|algo sali/i.test(info.t.slice(0, 500)), T + `Sección «${nombre}» carga`);
    rep(info.d <= 1, T + `Sección «${nombre}» sin desborde horizontal`, info.d + " px");
    await p.screenshot({ path: path.join(dirCap, "panel-" + nombre.toLowerCase().replace(/[^a-z0-9]+/g, "-") + (movil ? "-celular" : "-pc") + ".png"), fullPage: true });
  }
  // Detalle del día real
  await p.goto(SITIO_PRODUCCION + "/admin/#/dias");
  await p.waitForSelector("h1:has-text('Coberturas del día')");
  await p.waitForTimeout(1500);
  const enlace = p.locator("a[href^='#/dias/']").first();
  rep((await enlace.count()) > 0, T + "«Coberturas del día»: aparece el día real");
  await enlace.click();
  await p.waitForTimeout(2000);
  const det = await p.evaluate(() => document.body.innerText);
  rep(/Video resumen del d[ií]a/i.test(det) && /Sport Caaguaz/.test(det) && /Guardar video del d[ií]a/i.test(det), T + "Detalle del día: video resumen y partido real");
  rep(/Todav[ií]a no/.test(det), T + "Detalle del día: estado del video «Todavía no» (el día aún no tiene video resumen)");
  await p.screenshot({ path: path.join(dirCap, "panel-dia-real" + (movil ? "-celular" : "-pc") + ".png"), fullPage: true });
  // Editar la cobertura real (solo abrir)
  await p.locator("a[href^='#/coberturas/']").first().click();
  await p.waitForTimeout(2500);
  const ed = await p.evaluate(() => document.body.innerText);
  rep(/Sport Caaguaz/.test(ed) && /28 fotos|28/.test(ed), T + "Edición de la cobertura real: abre y muestra sus fotos");
  rep(errores.length === 0, T + "Panel sin errores de consola", errores.slice(0, 2).join(" | "));
  await ctx.close();
}
await navegador.close();
console.log(`\nEscrituras a producción bloqueadas (lo esperado es 0): ${bloqueadas}`);
console.log(fallos ? `${fallos} problema(s). Capturas en ${dirCap}` : `Todo en orden. Capturas en ${dirCap}`);
process.exit(fallos ? 1 : 0);
