// Datos NO secretos de los proyectos y protecciones contra tocar producción.
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const AQUI = path.dirname(fileURLToPath(import.meta.url));
export const REF_PRODUCCION = "mopsakafycvolxxgatga"; // NUNCA se usa desde estas herramientas
export const REF_PRUEBAS = "czblgqmcahjnbxbcgwke";
export const URL_PRUEBAS = `https://${REF_PRUEBAS}.supabase.co`;
export const CLAVE_PUBLICA_PRUEBAS = "sb_publishable_3TZg6JNXDpF6AKJ8Umca5A_neTLiM1l"; // publicable: no es secreta
export const PUERTO_LOCAL = 8140;
export const CARPETA_PRIVADA = path.join(process.env.LOCALAPPDATA || "", "RedDeportivaTV-dev", "privado");

/** Falla si cualquier texto (URL, host, usuario…) menciona la base de producción. */
export function sinProduccion(...textos) {
  for (const t of textos) if (String(t ?? "").includes(REF_PRODUCCION)) throw new Error("BLOQUEADO: se intentó usar el proyecto de PRODUCCIÓN.");
}

/** Lee un secreto del Administrador de credenciales de Windows (nunca de archivos). */
export function leerSecreto(nombre) {
  const out = execFileSync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", path.join(AQUI, "leer-secreto.ps1"), "-Nombre", nombre], { encoding: "utf8" }).trim();
  return out && out !== "null" ? JSON.parse(out) : null;
}

/** Guarda un secreto en el Administrador de credenciales (la clave viaja por stdin). */
export function guardarSecreto(nombre, usuario, clave) {
  execFileSync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", path.join(AQUI, "guardar-secreto.ps1"), "-Nombre", nombre, "-Usuario", usuario], { input: clave, encoding: "utf8" });
}
