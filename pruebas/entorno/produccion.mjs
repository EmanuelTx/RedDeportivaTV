// Acceso de SOLO LECTURA a PRODUCCIÓN, exclusivo para respaldos.
// Reglas (no desactivar):
//  - Solo se usa una sesión de administrador que la propia persona abrió a mano en el navegador
//    (guardada fuera del repositorio). Ningún script conoce ni guarda contraseñas de producción.
//  - Toda petición a Supabase de producción pasa por `pedir()`, que SOLO permite GET/HEAD y la
//    renovación de la sesión (/auth/v1/token). Cualquier otra cosa lanza un error.
import fs from "node:fs";
import path from "node:path";
import { CARPETA_PRIVADA, REF_PRODUCCION } from "./proyecto.mjs";

export const URL_PRODUCCION = `https://${REF_PRODUCCION}.supabase.co`;
export const SITIO_PRODUCCION = "https://reddeportivatv.pages.dev";
export const ARCHIVO_SESION_PRODUCCION = path.join(CARPETA_PRIVADA, "sesion-produccion.json");

const FUNCIONES_DE_LECTURA = /^\/rest\/v1\/rpc\/(uso_almacenamiento|buscar_coberturas|buscar_entradas|archivo_coberturas|posibles_duplicados|videos_publicos)$/;

/** ¿Esta petición a producción es de solo lectura (o renovación de sesión)? */
export function esLecturaPermitida(metodo, url) {
  const u = new URL(url);
  const m = String(metodo || "GET").toUpperCase();
  if (m === "GET" || m === "HEAD" || m === "OPTIONS") return true;
  // Funciones de CONSULTA (STABLE en Postgres: la base les impide escribir). PostgREST las invoca por POST.
  if (m === "POST" && FUNCIONES_DE_LECTURA.test(u.pathname)) return true;
  // Enlaces firmados temporales para VER fotos privadas (no modifican nada).
  if (m === "POST" && /^\/storage\/v1\/object\/sign\/(fotos-borradores|fotos-originales|fotos-publicas)(\/|$)/.test(u.pathname)) return true;
  return m === "POST" && u.pathname === "/auth/v1/token" && u.searchParams.get("grant_type") === "refresh_token";
}

export async function claveProduccion() {
  const r = await fetch(SITIO_PRODUCCION + "/api/config", { cache: "no-store" });
  const c = await r.json();
  if (!c.supabaseUrl || !c.supabaseUrl.includes(REF_PRODUCCION)) throw new Error("La web publicada no apunta a producción.");
  return c.supabaseKey; // clave publicable (pública por diseño)
}

function leerSesion() {
  if (!fs.existsSync(ARCHIVO_SESION_PRODUCCION)) throw new Error("No hay sesión de producción guardada: ejecutá iniciar-sesion-produccion.mjs (una vez).");
  const estado = JSON.parse(fs.readFileSync(ARCHIVO_SESION_PRODUCCION, "utf8"));
  for (const o of estado.origins || []) {
    for (const item of o.localStorage || []) {
      if (/^sb-.*-auth-token$/.test(item.name) || item.name === "rdtv-admin") return { estado, item, sesion: JSON.parse(item.value) };
    }
  }
  throw new Error("La sesión guardada no contiene el inicio de sesión de Supabase.");
}

let cache = null;
/** Devuelve un token de acceso vigente (lo renueva si hace falta y guarda la sesión renovada). */
export async function tokenProduccion() {
  const apikey = await claveProduccion();
  const { estado, item, sesion } = leerSesion();
  const ahora = Math.floor(Date.now() / 1000);
  if (cache && cache.expira - 60 > ahora) return { token: cache.token, apikey };
  if (sesion.expires_at - 60 > ahora) { cache = { token: sesion.access_token, expira: sesion.expires_at }; return { token: sesion.access_token, apikey }; }
  const url = `${URL_PRODUCCION}/auth/v1/token?grant_type=refresh_token`;
  if (!esLecturaPermitida("POST", url)) throw new Error("BLOQUEADO");
  const r = await fetch(url, { method: "POST", headers: { apikey, "Content-Type": "application/json" }, body: JSON.stringify({ refresh_token: sesion.refresh_token }) });
  if (!r.ok) throw new Error("La sesión de producción venció. Repetí iniciar-sesion-produccion.mjs. (" + r.status + ")");
  const nueva = await r.json();
  item.value = JSON.stringify(Object.assign({}, sesion, nueva, { expires_at: nueva.expires_at || ahora + (nueva.expires_in || 3600) }));
  fs.writeFileSync(ARCHIVO_SESION_PRODUCCION, JSON.stringify(estado));
  cache = { token: nueva.access_token, expira: nueva.expires_at || ahora + (nueva.expires_in || 3600) };
  return { token: nueva.access_token, apikey };
}

/** ÚNICA puerta de salida hacia producción: solo lectura. */
export async function pedir(ruta, { metodo = "GET", cabeceras = {}, binario = false } = {}) {
  const url = ruta.startsWith("http") ? ruta : URL_PRODUCCION + ruta;
  if (!url.startsWith(URL_PRODUCCION + "/")) throw new Error("BLOQUEADO: destino distinto de producción.");
  if (!esLecturaPermitida(metodo, url)) throw new Error("BLOQUEADO: solo lectura en producción (" + metodo + " " + new URL(url).pathname + ").");
  const { token, apikey } = await tokenProduccion();
  const r = await fetch(url, { method: metodo, headers: Object.assign({ apikey, Authorization: "Bearer " + token, "Accept-Profile": "public" }, cabeceras) });
  return binario ? r : r;
}
