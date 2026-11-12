/* Sube los archivos reales del álbum anterior «Fecha 2 Area 4» (solo proyecto de PRUEBAS). */
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.4/+esm";

const PRODUCCION = "mopsakafycvolxxgatga"; // nunca usar contra este proyecto
const ALBUM = "90fce53a-154a-49eb-8ec4-7e5ac91d7eb2";
const FUENTES = ["futbol-duelo", "futsal-arquero", "futbol-festejo-gol", "futbol-nino-7", "futsal-festejo", "futbol-duelo"];
const $ = (id) => document.getElementById(id);
const log = (t) => { $("salida").textContent += t + "\n"; };

const local = ["localhost", "127.0.0.1"].includes(location.hostname);
const cfg = local ? await (await fetch("/api/config", { cache: "no-store" })).json() : null;
const bloqueado = !cfg || !cfg.supabaseUrl || cfg.supabaseUrl.includes(PRODUCCION);
$("proyecto").textContent = bloqueado
  ? "⛔ Configuración ausente o de PRODUCCIÓN: no se hace nada."
  : "Proyecto: " + cfg.supabaseUrl;
$("subir").disabled = bloqueado;

async function medidas(blob) {
  const img = await createImageBitmap(blob);
  const m = { ancho: img.width, alto: img.height };
  img.close();
  return m;
}

$("subir").addEventListener("click", async () => {
  $("salida").textContent = "";
  const sb = createClient(cfg.supabaseUrl, cfg.supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false, storageKey: "rdtv-legado" }
  });
  const { data: ses, error: e1 } = await sb.auth.signInWithPassword({ email: $("correo").value.trim(), password: $("contrasena").value });
  $("contrasena").value = "";
  if (e1) return log("No se pudo iniciar sesión: " + e1.message);
  const { data: fotos, error: e2 } = await sb.from("fotos").select("id,path,mini_path,orden").eq("album_id", ALBUM).order("orden");
  if (e2) return log("No se pudieron leer las fotos: " + e2.message);
  log("Fotos registradas: " + fotos.length);
  let ok = 0;
  for (let i = 0; i < fotos.length; i++) {
    const f = fotos[i];
    const grande = await (await fetch("/assets/img/fotos/" + FUENTES[i] + "-1600.jpg")).blob();
    const mini = await (await fetch("/assets/img/fotos/" + FUENTES[i] + "-800.jpg")).blob();
    for (const [ruta, blob] of [[f.path, grande], [f.mini_path, mini]]) {
      const { error } = await sb.storage.from("fotos-publicas").upload(ruta, blob, { contentType: "image/jpeg", cacheControl: "600", upsert: false });
      log((error ? "✗ " : "✓ ") + ruta.split("/").pop() + (error ? " — " + error.message : ""));
    }
    const m = await medidas(grande);
    const { error: e3 } = await sb.from("fotos").update({ peso_bytes: grande.size, ancho: m.ancho, alto: m.alto }).eq("id", f.id);
    if (!e3) ok++;
  }
  // Comprobación: cada registro tiene su archivo y no hay archivos sin registro
  const { data: lista } = await sb.storage.from("fotos-publicas").list("albumes/" + ALBUM, { limit: 100 });
  const nombres = new Set((lista || []).filter((x) => x.id).map((x) => "albumes/" + ALBUM + "/" + x.name));
  const faltan = fotos.flatMap((f) => [f.path, f.mini_path]).filter((r) => !nombres.has(r));
  log("\nArchivos en el bucket: " + nombres.size + " · Registros actualizados: " + ok + "/" + fotos.length +
      " · Archivos faltantes: " + faltan.length);
  await sb.auth.signOut({ scope: "local" });
  log(faltan.length === 0 && nombres.size === fotos.length * 2 ? "\nCONSISTENTE ✓" : "\nINCONSISTENTE ✗");
});
