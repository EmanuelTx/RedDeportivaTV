// Navegador automatizado (Playwright + Microsoft Edge ya instalado) para probar el sitio local.
//  - La sesión del administrador de PRUEBAS se guarda FUERA del repositorio
//    (%LOCALAPPDATA%\RedDeportivaTV-dev\privado) y se reutiliza entre ejecuciones.
//  - Todas las peticiones a la base de PRODUCCIÓN, o a cualquier proyecto Supabase que
//    no sea el de pruebas, se cancelan antes de salir del navegador.
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";
import { CARPETA_PRIVADA, REF_PRODUCCION, REF_PRUEBAS, PUERTO_LOCAL, leerSecreto, sinProduccion } from "./proyecto.mjs";

export const BASE = `http://localhost:${PUERTO_LOCAL}`;
const ARCHIVO_SESION = path.join(CARPETA_PRIVADA, "sesion-admin.json");

/** Bloquea producción y cualquier Supabase ajeno al proyecto de pruebas. */
export async function protegerContexto(contexto, avisos = []) {
  await contexto.route("**/*", (ruta) => {
    const u = ruta.request().url();
    let host = "";
    try { host = new URL(u).hostname; } catch { /* data:, blob: */ }
    if (u.includes(REF_PRODUCCION) || (host.endsWith(".supabase.co") && !host.startsWith(REF_PRUEBAS + "."))) {
      avisos.push("BLOQUEADO: " + u.slice(0, 120));
      return ruta.abort("blockedbyclient");
    }
    return ruta.continue();
  });
}

/** Abre Edge. `conSesion: true` reutiliza la sesión guardada (si existe). */
export async function abrir({ conSesion = false, movil = false, visible = false } = {}) {
  fs.mkdirSync(CARPETA_PRIVADA, { recursive: true });
  const navegador = await chromium.launch({ channel: "msedge", headless: !visible, args: visible ? ["--start-maximized"] : [] });
  const opciones = movil
    ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
    : { viewport: { width: 1366, height: 800 } };
  if (visible && !movil) opciones.viewport = null; // ventana real: usa el tamaño de la ventana
  if (conSesion && fs.existsSync(ARCHIVO_SESION)) opciones.storageState = ARCHIVO_SESION;
  const contexto = await navegador.newContext({ ...opciones, locale: "es-PY", timezoneId: "America/Asuncion" });
  const avisos = [];
  await protegerContexto(contexto, avisos);
  return { navegador, contexto, avisos, cerrar: () => navegador.close() };
}

/** Entra al panel con el robot de pruebas y guarda la sesión. Si ya hay sesión válida, no hace nada. */
export async function iniciarSesionAdmin(pagina, contexto, { forzar = false } = {}) {
  await pagina.goto(`${BASE}/admin/#/`);
  const ya = await pagina.waitForSelector("#salir:visible, #loginCorreo:visible", { timeout: 20000 });
  const estaDentro = await pagina.locator("#salir").isVisible();
  if (estaDentro && !forzar) return "sesion-reutilizada";
  if (!estaDentro) {
    const cred = leerSecreto("RDTV-pruebas-admin");
    if (!cred) throw new Error("Falta el administrador de pruebas: ejecutá crear-admin-pruebas.mjs");
    sinProduccion(cred.usuario);
    await pagina.fill("#loginCorreo", cred.usuario);
    await pagina.fill("#loginClave", cred.clave);
    await pagina.click("#loginBoton");
    await pagina.waitForSelector("#salir", { state: "visible", timeout: 20000 });
  }
  await contexto.storageState({ path: ARCHIVO_SESION });
  return "sesion-nueva";
}
