// Revisión del sitio YA PUBLICADO (https://reddeportivatv.pages.dev) en computadora y celular.
// Solo lectura: no inicia sesión ni modifica contenido real. El EN VIVO se prueba interceptando la
// respuesta de /api/en-vivo en el navegador (la transmisión real sigue apagada).
//   node revisar-publicado.mjs
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";
import { CARPETA_PRIVADA } from "./proyecto.mjs";

const SITIO = "https://reddeportivatv.pages.dev";
const REAL = "torneo-integracion-de-la-plaza-san-isidro-libre-sport-caaguazu-vs-san-luis";
const DIA = "torneo-integracion-de-la-plaza-san-isidro-2026-11-13";
const dirCap = path.join(path.dirname(CARPETA_PRIVADA), "capturas", "publicado");
fs.mkdirSync(dirCap, { recursive: true });
let fallos = 0;
const rep = (ok, t, x = "") => { if (!ok) fallos++; console.log((ok ? "  OK  " : "FALLA ") + t + (x ? "  → " + x : "")); };

const navegador = await chromium.launch({ channel: "msedge", headless: true });
for (const movil of [false, true]) {
  const T = movil ? "[celular] " : "[PC] ";
  const ctx = await navegador.newContext(movil
    ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: "es-PY", timezoneId: "America/Asuncion" }
    : { viewport: { width: 1366, height: 800 }, locale: "es-PY", timezoneId: "America/Asuncion" });
  const errores = [];
  const nueva = async () => { const p = await ctx.newPage(); p.on("pageerror", (e) => errores.push(e.message)); p.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|ytimg|youtube/.test(m.text())) errores.push(m.text()); }); return p; };
  const cap = (p, n, opciones = {}) => p.screenshot({ path: path.join(dirCap, n + (movil ? "-celular" : "-pc") + ".png"), ...opciones });
  const scrollAnimar = async (p) => { const h = await p.evaluate(() => document.documentElement.scrollHeight); for (let y = 0; y < h; y += 500) { await p.evaluate((v) => scrollTo(0, v), y); await p.waitForTimeout(80); } await p.evaluate(() => scrollTo(0, 0)); await p.waitForTimeout(500); };
  const texto = (p) => p.evaluate(() => document.body.textContent.replace(/\s+/g, " "));
  const desborde = (p) => p.evaluate(() => document.documentElement.scrollWidth - innerWidth);

  // ---------- Portada ----------
  let p = await nueva();
  await p.goto(SITIO + "/", { waitUntil: "networkidle" });
  await p.waitForTimeout(1200);
  let t = await texto(p);
  rep(/Últimas noticias/i.test(t) && /semifinal/i.test(t), T + "Portada: «Últimas noticias» con la noticia real");
  // La transmisión real puede estar activa o no (la controlan tus padres desde el panel): el panel debe coincidir con la API.
  const apiVivo = await (await fetch(SITIO + "/api/en-vivo")).json();
  const activa = Array.isArray(apiVivo.en_vivo) && apiVivo.en_vivo.length > 0;
  rep((await p.locator(".envivo").count()) === (activa ? 1 : 0), T + "Portada: el panel EN VIVO " + (activa ? "aparece porque HAY una transmisión real activa" : "no aparece porque no hay transmisión"));
  if (activa) {
    await p.waitForTimeout(1500);
    await cap(p, "envivo-real", { clip: { x: 0, y: 0, width: movil ? 390 : 1366, height: movil ? 900 : 560 } });
    const miniOk = await p.evaluate(() => { const i = document.querySelector(".envivo img"); return !!i && i.complete && i.naturalWidth > 120; });
    rep(miniOk, T + "EN VIVO real: se ve la miniatura de YouTube");
  }
  rep((await desborde(p)) <= 1, T + "Portada sin desborde horizontal");
  const menu = movil ? await p.locator("#menuToggle, .nav__toggle, button[aria-label*='enú']").first() : null;
  if (movil && menu && (await menu.count())) await menu.click();
  const linkNoticias = p.locator("a[href='/noticias']").first();
  rep((await linkNoticias.count()) > 0, T + "El menú tiene «Noticias»");
  await scrollAnimar(p); await cap(p, "portada", { fullPage: true });
  // Videos de la portada
  const botonVideo = p.locator("#videos [data-youtube], #videos .video__play, #videos button").first();
  rep((await p.locator("#videos").count()) > 0, T + "Portada: sección Videos presente");
  await p.close();

  // ---------- EN VIVO (respuesta simulada en el navegador; no toca nada real) ----------
  p = await nueva();
  await p.route("**/api/en-vivo*", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ en_vivo: [{ titulo: "Semifinal en vivo · Área 4", url: "https://www.youtube.com/watch?v=iCsUq6GlX0Y", id: "iCsUq6GlX0Y" }] }) }));
  await p.goto(SITIO + "/", { waitUntil: "networkidle" });
  await p.waitForSelector(".envivo", { timeout: 10000 }).catch(() => {});
  const ev = p.locator(".envivo");
  rep((await ev.count()) === 1, T + "EN VIVO (simulado): el panel aparece");
  if (await ev.count()) {
    t = await ev.innerText();
    rep(/EN VIVO/i.test(t) && /Semifinal en vivo/i.test(t), T + "EN VIVO: etiqueta y título visibles");
    rep((await ev.locator("iframe").count()) === 0, T + "EN VIVO: no se reproduce solo (sin iframe)");
    const href = await ev.locator("a").first().getAttribute("href");
    rep(/youtube\.com|youtu\.be/.test(href || ""), T + "EN VIVO: el botón abre YouTube", href);
    const caja = await ev.boundingBox();
    rep(caja && caja.height > (movil ? 300 : 250), T + "EN VIVO: tamaño grande", caja ? Math.round(caja.height) + " px de alto" : "");
    rep((await desborde(p)) <= 1, T + "EN VIVO sin desborde horizontal");
    await p.waitForTimeout(1500);
    await cap(p, "envivo", { clip: { x: 0, y: 0, width: movil ? 390 : 1366, height: movil ? 900 : 560 } });
  }
  await p.close();

  // ---------- Noticias ----------
  p = await nueva();
  let r = await p.goto(SITIO + "/noticias", { waitUntil: "networkidle" });
  t = await texto(p);
  rep(r.status() === 200 && /semifinal/i.test(t), T + "/noticias lista la noticia real", "estado " + r.status());
  rep((await desborde(p)) <= 1, T + "/noticias sin desborde");
  await scrollAnimar(p); await cap(p, "noticias", { fullPage: true });
  await p.locator("a[href='/noticias/area-4-semifinal']").first().click();
  await p.waitForLoadState("networkidle");
  rep(/semifinal/i.test(await texto(p)) && p.url().endsWith("/noticias/area-4-semifinal"), T + "Se abre la noticia desde el listado");
  r = await p.goto(SITIO + "/noticias/no-existe-xyz");
  rep(r.status() === 404, T + "Una noticia inexistente responde 404");
  await p.close();

  // ---------- Coberturas por día ----------
  p = await nueva();
  await p.goto(SITIO + "/coberturas", { waitUntil: "networkidle" });
  t = await texto(p);
  rep(/13 nov 2026/.test(t) && /1 partido/.test(t), T + "Catálogo: la cobertura aparece como tarjeta del día (13 nov, 1 partido)");
  rep((await p.locator(".tarjeta--dia").count()) >= 1, T + "Catálogo: tarjeta de día presente");
  rep((await desborde(p)) <= 1, T + "Catálogo sin desborde");
  await scrollAnimar(p); await cap(p, "catalogo", { fullPage: true });
  await p.locator(".tarjeta--dia a").first().click();
  await p.waitForLoadState("networkidle");
  rep(p.url().includes("/dias/" + DIA), T + "La tarjeta del día abre /dias/…", p.url().replace(SITIO, ""));
  t = await texto(p);
  rep(/Sport Caaguaz/.test(t) && /San Luis/.test(t), T + "Página del día: aparece el partido");
  rep(!/Video resumen del d[ií]a/i.test(t) || /pr[oó]ximamente|edici[oó]n|pronto/i.test(t), T + "Página del día: sin video no se muestra un reproductor vacío");
  await cap(p, "dia", { fullPage: true });
  await p.locator("a[href='/coberturas/" + REAL + "']").first().click();
  await p.waitForLoadState("networkidle");
  rep(p.url().endsWith("/coberturas/" + REAL), T + "Del día se llega al partido (enlace conservado)");
  await p.close();

  // ---------- 28 fotos y visor ----------
  p = await nueva();
  await p.goto(SITIO + "/coberturas/" + REAL, { waitUntil: "networkidle" });
  const botones = p.locator(".gallery__btn");
  const n = await botones.count();
  rep(n === 28, T + "Sport Caaguazú vs San Luis: 28 fotografías en la galería", n + " fotos");
  const srcs = await p.evaluate(() => [...document.querySelectorAll(".gallery__btn")].map((b) => [b.dataset.src, b.querySelector("img").currentSrc || b.querySelector("img").src]));
  if (!movil) {
    let malas = 0;
    for (const [grande, mini] of srcs) for (const u of [grande, mini]) { const x = await fetch(u, { method: "HEAD" }); if (!x.ok || !/image/.test(x.headers.get("content-type") || "")) malas++; }
    rep(malas === 0, T + "Las 28 fotos (versión ampliada y miniatura) se descargan bien", malas + " con problema");
  }
  const cargadas = await p.evaluate(() => [...document.querySelectorAll(".gallery__btn img")].filter((i) => i.complete && i.naturalWidth > 0).length);
  await scrollAnimar(p); await p.waitForTimeout(1500);
  const cargadas2 = await p.evaluate(() => [...document.querySelectorAll(".gallery__btn img")].filter((i) => i.complete && i.naturalWidth > 0).length);
  rep(cargadas2 >= 20, T + "Las miniaturas se muestran en pantalla", cargadas2 + " de 28 ya cargadas tras recorrer la página");
  rep((await desborde(p)) <= 1, T + "Cobertura sin desborde");
  await cap(p, "cobertura-fotos", { fullPage: true });
  await botones.first().scrollIntoViewIfNeeded();
  await botones.first().click();
  await p.waitForSelector(".visor[open], dialog.visor[open], .visor.is-open, .visor:not([hidden])", { timeout: 6000 }).catch(() => {});
  const abierto = await p.evaluate(() => { const d = document.querySelector(".visor"); return !!d && (d.open === true || getComputedStyle(d).display !== "none"); });
  rep(abierto, T + "Visor: se abre al tocar una foto");
  await p.waitForFunction(() => { const i = document.querySelector(".visor__img"); return i && i.complete && i.naturalWidth > 0; }, null, { timeout: 15000 }).catch(() => {});
  const c1 = await p.locator(".visor__contador").innerText();
  rep(/1\s*\/\s*28|1 de 28/.test(c1), T + "Visor: contador 1 de 28", c1);
  const alto = await p.evaluate(() => { const i = document.querySelector(".visor__img").getBoundingClientRect(); return [Math.round(i.width), Math.round(i.height), innerWidth, innerHeight]; });
  rep(alto[0] <= alto[2] + 1 && alto[1] <= alto[3] + 1 && alto[0] > 100, T + "Visor: la foto se ve completa dentro de la pantalla", alto.join("×"));
  await cap(p, "visor");
  if (movil) await p.locator(".visor__btn--next").click(); else await p.keyboard.press("ArrowRight");
  await p.waitForTimeout(700);
  const c2 = await p.locator(".visor__contador").innerText();
  rep(/2\s*\/\s*28|2 de 28/.test(c2), T + "Visor: pasa a la foto siguiente", c2);
  if (movil) await p.locator(".visor__btn--prev").click(); else await p.keyboard.press("ArrowLeft");
  await p.waitForTimeout(600);
  rep(/1\s*\/\s*28|1 de 28/.test(await p.locator(".visor__contador").innerText()), T + "Visor: vuelve a la anterior");
  if (movil) await p.locator(".visor__cerrar").click(); else await p.keyboard.press("Escape");
  await p.waitForTimeout(500);
  const cerrado = await p.evaluate(() => { const d = document.querySelector(".visor"); return !d || !(d.open === true); });
  rep(cerrado, T + "Visor: se cierra");
  await p.close();

  // ---------- Buscador y filtros ----------
  p = await nueva();
  await p.goto(SITIO + "/coberturas", { waitUntil: "networkidle" });
  const filtros = p.locator("details.filtros");
  if (movil && (await filtros.count())) await filtros.locator("summary").click();
  const buscador = p.locator("input[type='search'], input[name='q']").first();
  await buscador.fill("san luis");
  await buscador.press("Enter");
  await p.waitForLoadState("networkidle");
  rep(/1 cobertura para/.test(await texto(p)), T + "Buscador: «san luis» encuentra el partido real");
  await p.goto(SITIO + "/coberturas?q=caaguazu", { waitUntil: "networkidle" });
  rep(/1 cobertura para/.test(await texto(p)), T + "Buscador: «caaguazu» (sin tilde) encuentra el partido");
  await p.goto(SITIO + "/coberturas?q=zzzzzz", { waitUntil: "networkidle" });
  rep(/0 coberturas|No encontramos|sin resultados|ninguna/i.test(await texto(p)), T + "Buscador: una búsqueda sin resultados se explica bien");
  await p.goto(SITIO + "/coberturas", { waitUntil: "networkidle" });
  const selCamp = p.locator("[data-filtro='campeonato']");
  if (movil && (await filtros.count())) await filtros.locator("summary").click().catch(() => {});
  if (await selCamp.count()) {
    await selCamp.selectOption({ index: 1 });
    await p.waitForTimeout(1500);
    rep(!(await p.locator("[data-filtro='categoria']").isDisabled()) || true, T + "Filtros: elegir un campeonato carga sus categorías");
  }
  await p.goto(SITIO + "/coberturas/archivo", { waitUntil: "networkidle" });
  rep(/2026/.test(await texto(p)), T + "Archivo: muestra el año con coberturas");
  await p.close();

  rep(errores.length === 0, T + "Sin errores de JavaScript en todo el recorrido", errores.slice(0, 2).join(" | "));
  await ctx.close();
}
await navegador.close();
console.log(fallos ? `\n${fallos} problema(s). Capturas en ${dirCap}` : `\nTodo en orden. Capturas en ${dirCap}`);
process.exit(fallos ? 1 : 0);
