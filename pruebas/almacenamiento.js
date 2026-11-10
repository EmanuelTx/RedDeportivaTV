/* =========================================================
   RedDeportivaTV · Pruebas de integración del almacenamiento
   Con fotos reales y la Storage API oficial. Ver almacenamiento.html.
   ========================================================= */
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.4/+esm";
import * as F from "../js/admin/fotos-publicacion.js";

const $ = (id) => document.getElementById(id);
const PRIV = F.BUCKET_PRIVADO;
const PUB = F.BUCKET_PUBLICO;

let numero = 0, fallos = 0, avisos = 0;
let urlsCache = [];

/* ---------- Resultados ---------- */

function anotar(prueba, estado, detalle = "") {
  numero++;
  if (estado === "mal") fallos++;
  if (estado === "aviso") avisos++;
  const fila = document.createElement("tr");
  const texto = { ok: "OK", mal: "FALLA", aviso: "AVISO" }[estado];
  for (const [valor, clase] of [[numero], [texto, estado], [prueba], [detalle]]) {
    const td = document.createElement("td");
    td.textContent = valor;
    if (clase) td.className = clase;
    fila.appendChild(td);
  }
  $("tabla").appendChild(fila);
  $("resumen").textContent =
    numero + " comprobaciones · " + fallos + " fallas · " + avisos + " avisos";
}

function comprobar(prueba, condicion, detalle) {
  anotar(prueba, condicion ? "ok" : "mal", detalle);
  return condicion;
}

async function lanza(fn) {
  try {
    await fn();
    return null;
  } catch (e) {
    return (e && e.message) || String(e);
  }
}

/* ---------- Clientes ---------- */

function datosProyecto() {
  const url = $("url").value.trim().replace(/\/+$/, "");
  const clave = $("clave").value.trim();
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url)) throw new Error("La URL debe ser https://<proyecto>.supabase.co");
  if (!clave) throw new Error("Falta la clave pública.");
  if (clave.startsWith("sb_secret_")) throw new Error("Esa es una clave SECRETA. Usá la clave pública.");
  try {
    const carga = JSON.parse(atob(clave.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    if (carga.role === "service_role") throw new Error("service_role");
  } catch (e) {
    if (e.message === "service_role") throw new Error("Esa es la clave service_role. Usá la clave pública (anon).");
  }
  return { url, clave };
}

function cliente({ url, clave }, nombre, fetchPropio) {
  return createClient(url, clave, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: "rdtv-prueba-" + nombre },
    global: fetchPropio ? { fetch: fetchPropio } : {}
  });
}

/* fetch que falla en la llamada número N cuya URL contiene "patron".
   modo "corte": la petición nunca llega al servidor.
   modo "respuesta-perdida": llega y se ejecuta, pero la respuesta se pierde. */
function fetchConFallo(patron, n, modo) {
  let vistas = 0;
  return async (entrada, opciones) => {
    const u = String(entrada && entrada.url ? entrada.url : entrada);
    if (u.includes(patron) && ++vistas === n) {
      if (modo === "respuesta-perdida") await fetch(entrada, opciones);
      throw new TypeError("Fallo de red simulado");
    }
    return fetch(entrada, opciones);
  };
}

async function conSesion(proyecto, sesion, nombre, fetchPropio) {
  const c = cliente(proyecto, nombre, fetchPropio);
  const { error } = await c.auth.setSession({ access_token: sesion.access_token, refresh_token: sesion.refresh_token });
  if (error) throw new Error("No se pudo copiar la sesión: " + error.message);
  return c;
}

/* Pide una URL sin usar la caché del navegador (sí puede responder el CDN). */
async function pedir(url) {
  try {
    const r = await fetch(url, { cache: "no-store" });
    const cuerpo = r.ok ? await r.arrayBuffer() : null;
    return {
      ok: r.ok,
      estado: r.status,
      bytes: cuerpo ? cuerpo.byteLength : 0,
      tipo: r.headers.get("content-type") || "",
      cache: r.headers.get("cache-control") || ""
    };
  } catch (e) {
    return { ok: false, estado: "sin respuesta (" + e.message + ")", bytes: 0, tipo: "", cache: "" };
  }
}

async function contarAnon(anon, tabla, columna, valor) {
  const { count, error } = await anon.from(tabla).select("id", { count: "exact", head: true }).eq(columna, valor);
  return error ? "error: " + error.message : count;
}

/* ---------- Limpieza ---------- */

async function limpiarAlbum(admin, id) {
  let estado = await F.completar(admin, "albumes", id);
  if (estado !== "borrador") estado = await F.despublicar(admin, "albumes", id);
  const prefijo = F.carpeta("albumes", id);
  for (const bucket of [PUB, PRIV]) {
    const rutas = await F.listar(admin, bucket, prefijo);
    if (rutas.length) {
      const { error } = await admin.storage.from(bucket).remove(rutas);
      if (error) throw new Error("Borrar archivos: " + error.message);
    }
  }
  const { error } = await admin.from("albumes").delete().eq("id", id);
  if (error) throw new Error("Borrar álbum: " + error.message);
  const quedan = (await F.listar(admin, PUB, prefijo)).length + (await F.listar(admin, PRIV, prefijo)).length;
  return quedan;
}

async function iniciarSesion(proyecto) {
  const admin = cliente(proyecto, "admin");
  const { data, error } = await admin.auth.signInWithPassword({
    email: $("correo").value.trim(),
    password: $("contrasena").value
  });
  $("contrasena").value = "";
  if (error) throw new Error("No se pudo iniciar sesión: " + error.message);
  const filas = await admin.from("administradores").select("user_id").eq("user_id", data.session.user.id);
  if (filas.error || filas.data.length !== 1) throw new Error("Ese usuario no está registrado como administrador.");
  return { admin, sesion: data.session };
}

/* ---------- Pruebas ---------- */

async function ejecutar() {
  $("tabla").textContent = "";
  numero = fallos = avisos = 0;
  urlsCache = [];
  $("cache").disabled = true;

  let proyecto, archivo, admin, sesion, albumId;
  try {
    proyecto = datosProyecto();
    archivo = $("foto").files[0];
    if (!archivo) throw new Error("Elegí una foto.");
    await F.validarImagen(archivo);
    ({ admin, sesion } = await iniciarSesion(proyecto));
    comprobar("Inicio de sesión de un administrador registrado", true, sesion.user.email);
  } catch (e) {
    anotar("Preparación", "mal", e.message);
    return;
  }
  const anon = cliente(proyecto, "anon");
  const ts = Date.now();

  try {
    const nuevo = await admin.from("albumes")
      .insert({ slug: "prueba-integracion-" + ts, titulo: "Prueba de integración (se borra sola)" })
      .select("id").single();
    if (nuevo.error) throw new Error("Crear álbum de prueba: " + nuevo.error.message);
    albumId = nuevo.data.id;
    const prefijo = F.carpeta("albumes", albumId);
    const contar = async () => ({
      pub: (await F.listar(admin, PUB, prefijo)).length,
      priv: (await F.listar(admin, PRIV, prefijo)).length
    });

    /* 1. Validación de archivos en el bucket */
    let r = await admin.storage.from(PRIV).upload(prefijo + "/no-es-foto.jpg",
      new Blob(["hola"], { type: "text/plain" }), { contentType: "text/plain" });
    comprobar("El bucket rechaza archivos que no son imágenes", !!r.error, r.error ? r.error.message : "lo aceptó");
    if (!r.error) await admin.storage.from(PRIV).remove([prefijo + "/no-es-foto.jpg"]);

    r = await admin.storage.from(PRIV).upload(prefijo + "/muy-grande.jpg",
      new Blob([new Uint8Array(F.PESO_MAXIMO + 1024)], { type: "image/jpeg" }), { contentType: "image/jpeg" });
    comprobar("El bucket rechaza archivos de más de 5 MB", !!r.error, r.error ? r.error.message : "lo aceptó");
    if (!r.error) await admin.storage.from(PRIV).remove([prefijo + "/muy-grande.jpg"]);

    /* 2. Subida privada */
    const fotos = [];
    for (let i = 0; i < 3; i++) fotos.push(await F.subirFotoAlbum(admin, albumId, archivo, { alt: "Prueba " + (i + 1), orden: i }));
    let c = await contar();
    comprobar("Admin sube 3 fotos reales al bucket privado", fotos.every((f) => f.bucket === PRIV) && c.priv === 3 && c.pub === 0,
      "privado " + c.priv + " · público " + c.pub);
    const ruta = fotos[0].path;

    const descarga = await admin.storage.from(PRIV).download(ruta);
    comprobar("Admin puede abrir su foto privada", !descarga.error && descarga.data.size === archivo.size,
      descarga.error ? descarga.error.message : descarga.data.size + " bytes");

    /* 3. El visitante no puede abrir la foto privada */
    let p = await pedir(proyecto.url + "/storage/v1/object/public/" + PRIV + "/" + ruta);
    comprobar("Visitante: la URL pública del bucket privado no entrega la foto", !p.ok, "HTTP " + p.estado);
    p = await pedir(proyecto.url + "/storage/v1/object/" + PRIV + "/" + ruta);
    comprobar("Visitante: sin sesión no puede descargarla", !p.ok, "HTTP " + p.estado);
    const dAnon = await anon.storage.from(PRIV).download(ruta);
    comprobar("Visitante: download() con la clave pública falla", !!dAnon.error, dAnon.error ? dAnon.error.message : "la descargó");
    const sAnon = await anon.storage.from(PRIV).createSignedUrl(ruta, 60);
    comprobar("Visitante: no puede crear un enlace firmado", !!sAnon.error, sAnon.error ? sAnon.error.message : "lo creó");
    const lAnon = await anon.storage.from(PRIV).list(prefijo);
    comprobar("Visitante: no puede listar el bucket privado", !!lAnon.error || lAnon.data.length === 0,
      lAnon.error ? lAnon.error.message : lAnon.data.length + " archivos");
    p = await pedir(F.urlPublica(anon, ruta) + "?v=antes-" + ts);
    comprobar("Visitante: la foto todavía no está en el bucket público", !p.ok, "HTTP " + p.estado);
    comprobar("Visitante: no ve el álbum borrador", (await contarAnon(anon, "albumes", "id", albumId)) === 0);

    /* 4. Publicar */
    let estado = await F.publicar(admin, "albumes", albumId);
    c = await contar();
    comprobar("Publicar: queda publicada con las 3 fotos en el bucket público", estado === "publicada" && c.pub === 3 && c.priv === 0,
      estado + " · público " + c.pub + " · privado " + c.priv);
    comprobar("Visitante: ve el álbum y sus 3 fotos",
      (await contarAnon(anon, "albumes", "id", albumId)) === 1 && (await contarAnon(anon, "fotos", "album_id", albumId)) === 3);
    const urlSitio = F.urlPublica(anon, ruta); // la misma que usará la web
    p = await pedir(urlSitio + "?v=publicada-" + ts);
    comprobar("Visitante: la URL pública entrega la foto completa", p.ok && p.bytes === archivo.size,
      "HTTP " + p.estado + " · " + p.bytes + " bytes · " + p.tipo);
    anotar("Caché de la foto pública", /max-age=600\b/.test(p.cache) ? "ok" : "aviso", p.cache || "(sin Cache-Control)");
    p = await pedir(urlSitio); // deja la URL en la caché del CDN, como pasaría en la web
    comprobar("Visitante: la URL sin parámetros también funciona", p.ok, "HTTP " + p.estado);

    /* 5. Despublicar */
    estado = await F.despublicar(admin, "albumes", albumId);
    c = await contar();
    comprobar("Despublicar: vuelve a borrador con las 3 fotos en el privado", estado === "borrador" && c.priv === 3 && c.pub === 0,
      estado + " · privado " + c.priv + " · público " + c.pub);
    comprobar("Visitante: deja de ver el álbum y sus fotos",
      (await contarAnon(anon, "albumes", "id", albumId)) === 0 && (await contarAnon(anon, "fotos", "album_id", albumId)) === 0);
    p = await pedir(urlSitio + "?v=despublicada-" + Date.now());
    comprobar("Visitante: el servidor ya no entrega la foto (sin caché)", !p.ok, "HTTP " + p.estado);
    urlsCache = [urlSitio];
    await revisarCache();

    /* 6. Corte de red a mitad de la publicación */
    let sbFalla = await conSesion(proyecto, sesion, "falla1", fetchConFallo("/storage/v1/object/move", 2, "corte"));
    let error = await lanza(() => F.publicar(sbFalla, "albumes", albumId));
    let rev = await F.revisar(admin, "albumes", albumId);
    comprobar("Corte al publicar: el panel recibe el error", !!error, error || "no hubo error");
    comprobar("Corte al publicar: queda marcada como pendiente (\"publicando\")",
      rev.estado === "publicando" && rev.pendiente, rev.estado + " · público " + rev.enPublico.length + " · privado " + rev.enPrivado.length);
    comprobar("Corte al publicar: el visitante no ve una publicación a medias", (await contarAnon(anon, "albumes", "id", albumId)) === 0);
    let forzar = await admin.from("albumes").update({ estado: "publicada" }).eq("id", albumId).select("id");
    comprobar("Corte al publicar: la base no deja marcarla publicada con fotos sin mover", !!forzar.error,
      forzar.error ? forzar.error.message : "lo permitió");
    estado = await F.completar(admin, "albumes", albumId);
    rev = await F.revisar(admin, "albumes", albumId);
    comprobar("Corte al publicar: completar() la termina bien", estado === "publicada" && rev.coherente && rev.enPublico.length === 3,
      estado + " · público " + rev.enPublico.length);

    /* 7. Corte de red a mitad de la despublicación */
    sbFalla = await conSesion(proyecto, sesion, "falla2", fetchConFallo("/storage/v1/object/move", 2, "corte"));
    error = await lanza(() => F.despublicar(sbFalla, "albumes", albumId));
    rev = await F.revisar(admin, "albumes", albumId);
    comprobar("Corte al despublicar: el panel recibe el error", !!error, error || "no hubo error");
    comprobar("Corte al despublicar: queda pendiente (\"despublicando\")",
      rev.estado === "despublicando" && rev.pendiente, rev.estado + " · público " + rev.enPublico.length + " · privado " + rev.enPrivado.length);
    comprobar("Corte al despublicar: el visitante ya no la ve", (await contarAnon(anon, "albumes", "id", albumId)) === 0);
    forzar = await admin.from("albumes").update({ estado: "borrador" }).eq("id", albumId).select("id");
    comprobar("Corte al despublicar: la base no deja cerrarla con fotos en el público", !!forzar.error,
      forzar.error ? forzar.error.message : "lo permitió");
    estado = await F.completar(admin, "albumes", albumId);
    rev = await F.revisar(admin, "albumes", albumId);
    comprobar("Corte al despublicar: completar() la termina bien", estado === "borrador" && rev.coherente && rev.enPrivado.length === 3,
      estado + " · privado " + rev.enPrivado.length);

    /* 8. Sin red desde el principio */
    sbFalla = await conSesion(proyecto, sesion, "falla3", fetchConFallo("/rest/v1/", 1, "corte"));
    error = await lanza(() => F.publicar(sbFalla, "albumes", albumId));
    rev = await F.revisar(admin, "albumes", albumId);
    comprobar("Sin red al empezar: no cambia nada", !!error && rev.estado === "borrador" && rev.enPrivado.length === 3 && rev.enPublico.length === 0,
      rev.estado + " · privado " + rev.enPrivado.length);

    /* 9. Se pierde la respuesta de un move (el archivo sí se movió) */
    sbFalla = await conSesion(proyecto, sesion, "falla4", fetchConFallo("/storage/v1/object/move", 1, "respuesta-perdida"));
    error = await lanza(async () => { estado = await F.publicar(sbFalla, "albumes", albumId); });
    rev = await F.revisar(admin, "albumes", albumId);
    comprobar("Respuesta perdida: lo detecta y termina de publicar", !error && estado === "publicada" && rev.coherente && rev.enPublico.length === 3,
      error || estado + " · público " + rev.enPublico.length);
    estado = await F.despublicar(admin, "albumes", albumId);
    comprobar("Vuelve a borrador al terminar", estado === "borrador", estado);
  } catch (e) {
    anotar("Error inesperado", "mal", e.message);
  } finally {
    if (albumId) {
      try {
        const quedan = await limpiarAlbum(admin, albumId);
        comprobar("Limpieza: se borró el álbum de prueba y sus archivos", quedan === 0, quedan + " archivos restantes");
      } catch (e) {
        anotar("Limpieza", "mal", e.message + " · usá \"Borrar restos de pruebas anteriores\"");
      }
    }
    await admin.auth.signOut({ scope: "local" });
    $("cache").disabled = urlsCache.length === 0;
  }
}

/* La URL de una foto despublicada puede seguir en la caché del CDN un rato. */
async function revisarCache() {
  for (const u of urlsCache) {
    const p = await pedir(u);
    if (!p.ok) anotar("Caché: la foto despublicada ya no se ve en su URL pública", "ok", "HTTP " + p.estado);
    else anotar("Caché: la foto despublicada todavía se ve desde la caché del CDN", "aviso",
      "Es esperable hasta " + Number(F.CACHE_SEGUNDOS) / 60 + " min. Volvé a comprobar más tarde.");
  }
}

async function limpiarRestos() {
  $("tabla").textContent = "";
  numero = fallos = avisos = 0;
  try {
    const { admin } = await iniciarSesion(datosProyecto());
    const { data, error } = await admin.from("albumes").select("id, slug").like("slug", "prueba-integracion-%");
    if (error) throw new Error(error.message);
    if (!data.length) anotar("No hay restos de pruebas", "ok");
    for (const a of data) {
      const quedan = await limpiarAlbum(admin, a.id);
      comprobar("Borrado " + a.slug, quedan === 0, quedan + " archivos restantes");
    }
    await admin.auth.signOut({ scope: "local" });
  } catch (e) {
    anotar("Limpieza", "mal", e.message);
  }
}

function soloLocal() {
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname);
  if (!local) {
    document.querySelectorAll("button, input").forEach((el) => (el.disabled = true));
    $("resumen").textContent = "Esta herramienta solo funciona en localhost.";
  }
  return local;
}

if (soloLocal()) {
  $("ejecutar").addEventListener("click", ejecutar);
  $("limpiar").addEventListener("click", limpiarRestos);
  $("cache").addEventListener("click", () => revisarCache());
}
