// Captura una página del sitio local.  node captura.mjs <ruta> <nombre> [movil] [selector]
//  - hace scroll para activar las animaciones de aparición antes de fotografiar
//  - con selector: fotografía solo ese elemento
import fs from "node:fs";
import path from "node:path";
import { abrir, BASE } from "./navegador.mjs";
import { CARPETA_PRIVADA } from "./proyecto.mjs";

const [ruta, nombre, ...resto] = process.argv.slice(2);
const movil = resto.includes("movil");
const selector = resto.find((x) => x !== "movil");
const dir = path.join(path.dirname(CARPETA_PRIVADA), "capturas");
fs.mkdirSync(dir, { recursive: true });
const nav = await abrir({ movil });
const p = await nav.contexto.newPage();
await p.goto(BASE + ruta, { waitUntil: "networkidle" });
const alto = await p.evaluate(() => document.documentElement.scrollHeight);
for (let y = 0; y < alto; y += 500) { await p.evaluate((v) => window.scrollTo(0, v), y); await p.waitForTimeout(120); }
await p.evaluate(() => window.scrollTo(0, 0));
await p.waitForTimeout(1200);
const salida = path.join(dir, nombre + (movil ? "-movil" : "") + ".png");
if (selector) await p.locator(selector).first().screenshot({ path: salida });
else await p.screenshot({ path: salida, fullPage: !selector });
await nav.cerrar();
console.log(salida);
