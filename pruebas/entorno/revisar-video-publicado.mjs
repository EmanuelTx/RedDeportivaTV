// Video en el sitio publicado (solo lectura): el bloque de video de la cobertura real (mismo componente que
// usa el video resumen del día), la sección Videos de la portada y la API. El video resumen del DÍA se probó
// de punta a punta en el proyecto de pruebas, porque no se modifica contenido real.
import { chromium } from "playwright-core";
const S = "https://reddeportivatv.pages.dev";
const REAL = "torneo-integracion-de-la-plaza-san-isidro-libre-sport-caaguazu-vs-san-luis";
let fallos = 0;
const rep = (ok, t, x = "") => { if (!ok) fallos++; console.log((ok ? "  OK  " : "FALLA ") + t + (x ? "  → " + x : "")); };
const api = await (await fetch(S + "/api/videos?limite=12")).json();
console.log("  videos en la API:", JSON.stringify(api.videos.map((v) => [v.titulo, v.esDia ? "día" : "partido", v.ruta])));
rep(api.videos.length >= 1 && new Set(api.videos.map((v) => v.id)).size === api.videos.length, "API de videos: hay videos y ninguno repetido");
rep(api.videos.every((v) => v.ruta && v.id), "API de videos: cada video enlaza a su página");
const nav = await chromium.launch({ channel: "msedge", headless: true });
for (const movil of [false, true]) {
  const T = movil ? "[celular] " : "[PC] ";
  const ctx = await nav.newContext(movil ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } : { viewport: { width: 1366, height: 800 } });
  const p = await ctx.newPage();
  await p.goto(S + "/coberturas/" + REAL, { waitUntil: "networkidle" });
  const marco = p.locator("[data-youtube]").first();
  rep((await marco.count()) === 1, T + "Cobertura real: bloque de video presente");
  rep((await p.locator("iframe").count()) === 0, T + "El video no se carga ni se reproduce solo (sin iframe hasta tocar)");
  await marco.locator(".cob-video__play").click();
  await p.waitForSelector("iframe", { timeout: 8000 }).catch(() => {});
  const src = (await p.locator("iframe").first().getAttribute("src").catch(() => "")) || "";
  rep(/youtube(-nocookie)?\.com\/embed\//.test(src), T + "Al tocar ▶ se carga el reproductor de YouTube", src.replace(/\?.*/, ""));
  await p.goto(S + "/", { waitUntil: "networkidle" });
  await p.locator("#videos").scrollIntoViewIfNeeded();
  await p.waitForTimeout(1500);
  const tarjetas = await p.locator("#videos .video, #videos article, #videos .video-card").count();
  rep(tarjetas >= 1, T + "Portada: la sección Videos muestra tarjetas", tarjetas + " tarjetas");
  const sinDup = await p.evaluate(() => { const ids = [...document.querySelectorAll("#videos [data-youtube], #videos [data-video]")].map((e) => e.dataset.youtube || e.dataset.video); return new Set(ids).size === ids.length; });
  rep(sinDup, T + "Portada: sin videos repetidos");
  await ctx.close();
}
await nav.close();
console.log(fallos ? `\n${fallos} problema(s).` : "\nVideo en orden.");
