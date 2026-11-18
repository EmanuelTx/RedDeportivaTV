// Mide la portada en celular: altura, paneles duplicados, desbordes y tamaños de letra mínimos.
import { abrir, BASE } from "./navegador.mjs";
const nav = await abrir({ movil: true });
const p = await nav.contexto.newPage();
await p.goto(BASE + "/", { waitUntil: "networkidle" });
await p.waitForTimeout(1000);
const r = await p.evaluate(() => ({
  alto: document.documentElement.scrollHeight,
  ancho: document.documentElement.scrollWidth,
  vista: innerWidth,
  paneles: document.querySelectorAll(".envivo").length,
  noticias: document.querySelectorAll("#noticiasGrid .noticia").length,
  secciones: [...document.querySelectorAll("main > section, body > section")].map((s) => (s.id || s.className).slice(0, 30) + ":" + Math.round(s.getBoundingClientRect().height)),
  envivoAlto: Math.round(document.querySelector(".envivo")?.getBoundingClientRect().height || 0)
}));
console.log(JSON.stringify(r, null, 1));
await p.screenshot({ path: process.env.LOCALAPPDATA + "\\RedDeportivaTV-dev\\capturas\\movil-arriba.png" });
await nav.cerrar();
