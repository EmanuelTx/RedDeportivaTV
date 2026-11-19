// PASO MANUAL (una sola vez, o cuando venza la sesión): la persona entra al panel de PRODUCCIÓN en una
// ventana de Edge. Este script NO ve ni guarda la contraseña: solo conserva la sesión resultante en
// %LOCALAPPDATA%\RedDeportivaTV-dev\privado\sesion-produccion.json (fuera del repositorio).
// Mientras la ventana está abierta, el navegador BLOQUEA cualquier escritura hacia la base de producción.
//   node iniciar-sesion-produccion.mjs
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";
import { CARPETA_PRIVADA, REF_PRODUCCION } from "./proyecto.mjs";
import { ARCHIVO_SESION_PRODUCCION, SITIO_PRODUCCION, esLecturaPermitida } from "./produccion.mjs";

fs.mkdirSync(CARPETA_PRIVADA, { recursive: true });
const navegador = await chromium.launch({ channel: "msedge", headless: false, args: ["--start-maximized"] });
const contexto = await navegador.newContext({ viewport: null, locale: "es-PY", timezoneId: "America/Asuncion" });
let bloqueos = 0;
await contexto.route("**/*", (ruta) => {
  const q = ruta.request();
  const u = q.url();
  // Se permite lo de solo lectura y el inicio/renovación de sesión de la persona (/auth/v1/token). Nada más.
  const esLogin = q.method() === "POST" && new URL(u).pathname === "/auth/v1/token";
  if (u.includes(REF_PRODUCCION) && !esLogin && !esLecturaPermitida(q.method(), u)) { bloqueos++; return ruta.abort("blockedbyclient"); }
  return ruta.continue();
});
const pagina = await contexto.newPage();
await pagina.goto(SITIO_PRODUCCION + "/admin/");
console.log("Ventana abierta: iniciá sesión en el panel. Cuando veas el panel, el script guarda la sesión y se cierra solo.");

const inicio = Date.now();
let guardada = false;
while (Date.now() - inicio < 10 * 60 * 1000 && navegador.isConnected()) {
  await new Promise((r) => setTimeout(r, 2000));
  try {
    const dentro = await pagina.locator("#salir").isVisible().catch(() => false);
    if (dentro) {
      await pagina.waitForTimeout(1500);
      await contexto.storageState({ path: ARCHIVO_SESION_PRODUCCION });
      guardada = true;
      break;
    }
  } catch { /* la ventana puede estar navegando */ }
}
await navegador.close().catch(() => {});
console.log(guardada ? `Sesión de producción guardada (solo lectura). Escrituras bloqueadas durante la sesión: ${bloqueos}.` : "No se detectó el inicio de sesión (tiempo agotado o ventana cerrada).");
process.exit(guardada ? 0 : 1);
