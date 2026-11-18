// Revisa «Coberturas del día» del panel de administración (PC y celular) con la sesión guardada.
import fs from "node:fs";
import path from "node:path";
import { abrir, iniciarSesionAdmin, BASE } from "./navegador.mjs";
import { CARPETA_PRIVADA } from "./proyecto.mjs";

const dir = path.join(path.dirname(CARPETA_PRIVADA), "capturas");
fs.mkdirSync(dir, { recursive: true });
let fallos = 0;
const rep = (ok, t) => { if (!ok) fallos++; console.log((ok ? "  OK  " : "FALLA ") + t); };

for (const movil of [false, true]) {
  const sufijo = movil ? "-movil" : "";
  const nav = await abrir({ conSesion: true, movil });
  const p = await nav.contexto.newPage();
  const errores = [];
  p.on("pageerror", (e) => errores.push(e.message));
  p.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|ytimg/.test(m.text())) errores.push(m.text()); });
  await iniciarSesionAdmin(p, nav.contexto);

  await p.goto(BASE + "/admin/#/dias");
  await p.waitForSelector("h1:has-text('Coberturas del día')", { timeout: 15000 });
  await p.waitForTimeout(1500);
  const lista = await p.evaluate(() => document.body.innerText);
  rep(/17\/11|17 nov|2026-11-17|martes/i.test(lista) || /Area 4|Área 4/i.test(lista), `lista de días${sufijo} muestra el día simulado`);
  await p.screenshot({ path: path.join(dir, "panel-dias" + sufijo + ".png"), fullPage: true });

  const enlace = p.locator("a[href^='#/dias/']").first();
  const n = await enlace.count();
  rep(n > 0, `lista${sufijo} tiene enlace al detalle`);
  if (n) {
    await enlace.click();
    await p.waitForTimeout(2000);
    const det = await p.evaluate(() => document.body.innerText);
    rep(/Video resumen|video del día|Video del día/i.test(det), `detalle${sufijo} muestra la sección de video`);
    rep(/Sub-12/.test(det) && /Senior/.test(det), `detalle${sufijo} agrupa partidos por categoría`);
    const desborde = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    rep(desborde <= 1, `detalle${sufijo} sin desborde (${desborde}px)`);
    await p.screenshot({ path: path.join(dir, "panel-dia-detalle" + sufijo + ".png"), fullPage: true });
  }
  rep(errores.length === 0, `panel${sufijo} sin errores de consola${errores.length ? ": " + errores.slice(0, 2).join(" | ") : ""}`);
  await nav.cerrar();
}
console.log(fallos ? `\n${fallos} problema(s).` : "\nPanel en orden.");
