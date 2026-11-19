// Compatibilidad: el panel de la versión PUBLICADA (servida en :8151) contra la base de pruebas YA migrada.
// Inicia sesión con el robot de pruebas, recorre las secciones y crea/borra una cobertura como lo haría el panel viejo.
import { abrir } from "./navegador.mjs";
import { leerSecreto } from "./proyecto.mjs";
const BASE = "http://localhost:8151";
const cred = leerSecreto("RDTV-pruebas-admin");
const nav = await abrir({});
const p = await nav.contexto.newPage();
const errores = [];
p.on("pageerror", (e) => errores.push(e.message));
p.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|ytimg/.test(m.text())) errores.push(m.text()); });
let fallos = 0;
const rep = (ok, t) => { if (!ok) fallos++; console.log((ok ? "  OK  " : "FALLA ") + t); };
await p.goto(BASE + "/admin/");
await p.fill("#loginCorreo", cred.usuario);
await p.fill("#loginClave", cred.clave);
await p.click("#loginBoton");
await p.waitForSelector("#salir", { state: "visible", timeout: 20000 });
for (const ruta of ["coberturas", "partidos", "jornadas", "noticias", "transmisiones", "campeonatos", "categorias", "publicaciones"]) {
  await p.goto(BASE + "/admin/#/" + ruta);
  await p.waitForTimeout(1500);
  const t = await p.evaluate(() => document.querySelector("main")?.innerText || document.body.innerText);
  rep(t.length > 40 && !/error|no se pudo cargar/i.test(t.slice(0, 300)), "panel viejo: #/" + ruta + " carga");
}
// El panel viejo crea una cobertura (insert directo) y el día se ordena solo
const res = await p.evaluate(async () => {
  const { app } = await import("/admin/js/estado.js");
  const { data: camp } = await app.sb.from("campeonatos").select("id").eq("slug", "area-4").single();
  const { data: a, error } = await app.sb.from("albumes").insert({ slug: "compat-viejo-prueba", titulo: "Compat viejo", fecha: "2026-12-12", tipo: "campeonato", campeonato_id: camp.id, visible: false, estado: "borrador", estado_fotos: "preparacion" }).select("id").single();
  if (error) return "insert: " + error.message;
  const { error: e2 } = await app.sb.from("albumes").delete().eq("id", a.id);
  return e2 ? "delete: " + e2.message : "ok";
});
rep(res === "ok", "panel viejo: crear y borrar una cobertura funciona (" + res + ")");
rep(errores.length === 0, "panel viejo sin errores de consola" + (errores.length ? ": " + errores[0] : ""));
await nav.cerrar();
console.log(fallos ? `\n${fallos} problema(s).` : "\nPanel viejo compatible con la base migrada.");
