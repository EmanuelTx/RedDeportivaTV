/* =========================================================
   Acceso a datos para las páginas dinámicas (Cloudflare Pages Functions).

   - Si están configuradas en Cloudflare las variables SUPABASE_URL y
     SUPABASE_PUBLISHABLE_KEY, se lee desde Supabase. Las reglas RLS
     devuelven solo contenido publicado.
   - Si no, se usan los datos de prueba de /datos-prueba/*.json.

   La clave publicable (sb_publishable_...) es pública por diseño: la
   seguridad la dan las reglas RLS de la base de datos. Las claves
   secretas (sb_secret_... / service_role) NUNCA se usan acá: si alguien
   las configura por error, se rechazan.
   ========================================================= */

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const BUCKET_PUBLICO = "fotos-publicas";

export function slugValido(slug) {
  return typeof slug === "string" && slug.length > 0 && slug.length <= 120 && SLUG_RE.test(slug);
}

/* ---------- Configuración ---------- */

function esClaveSecreta(clave) {
  if (clave.startsWith("sb_secret_")) return true;
  if (clave.startsWith("eyJ")) {
    try {
      const carga = JSON.parse(atob(clave.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
      return carga.role === "service_role";
    } catch (_) {
      return true; // no se puede comprobar: no se usa
    }
  }
  return false;
}

/* Devuelve { url, clave } o null si Supabase no está configurado.
   Lanza un error si la configuración es peligrosa o inválida. */
export function configSupabase(env) {
  const url = String(env.SUPABASE_URL || "").trim().replace(/\/+$/, "");
  const clave = String(env.SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_ANON_KEY || "").trim();
  if (!url && !clave) return null;
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url)) throw new Error("SUPABASE_URL inválida");
  if (!clave) throw new Error("Falta SUPABASE_PUBLISHABLE_KEY");
  if (esClaveSecreta(clave)) throw new Error("Se configuró una clave SECRETA: no se usa");
  return { url, clave };
}

function cabeceras(clave) {
  // Accept-Profile: el esquema "public" se pide explícitamente porque en este
  // proyecto el esquema por defecto de la Data API es graphql_public.
  const h = { apikey: clave, Accept: "application/json", "Accept-Profile": "public" };
  // Las claves anon antiguas (JWT) también van como Bearer; las nuevas sb_publishable_ no.
  if (clave.startsWith("eyJ")) h.Authorization = "Bearer " + clave;
  return h;
}

export function urlPublica(cfg, ruta) {
  if (!ruta) return null;
  return cfg.url + "/storage/v1/object/public/" + BUCKET_PUBLICO + "/" + ruta.split("/").map(encodeURIComponent).join("/");
}

/* ---------- Consultas (solo columnas públicas) ---------- */

const RELACIONES =
  "campeonato:campeonatos(nombre,slug),categoria:categorias(nombre,slug)," +
  "partido:partidos(equipo_local,equipo_visitante,fecha,goles_local,goles_visitante)";

const CONSULTAS = {
  noticias:
    "id,slug,titulo,descripcion,contenido,portada_path,portada_alt,publicado_en,actualizado_en," + RELACIONES,
  albumes:
    "id,slug,titulo,descripcion,fecha,portada_path,portada_alt,publicado_en,actualizado_en," + RELACIONES +
    ",fotos(path,mini_path,ancho,alto,alt,descripcion,orden)"
};

function textoPartido(p) {
  if (!p) return "";
  const goles = p.goles_local != null && p.goles_visitante != null ? " " + p.goles_local + "-" + p.goles_visitante + " " : " vs ";
  return p.equipo_local + goles + p.equipo_visitante;
}

/* Convierte una fila de Supabase al formato que usa la plantilla. */
function normalizar(cfg, tabla, fila) {
  const fotos = (fila.fotos || [])
    .slice()
    .sort((a, b) => a.orden - b.orden)
    .map((f) => ({
      src: urlPublica(cfg, f.path),
      mini: urlPublica(cfg, f.mini_path),
      alt: f.alt || "",
      descripcion: f.descripcion || "",
      ancho: f.ancho,
      alto: f.alto
    }));
  return {
    tipo: tabla,
    slug: fila.slug,
    titulo: fila.titulo,
    descripcion: fila.descripcion || "",
    contenido: fila.contenido || "",
    portada: urlPublica(cfg, fila.portada_path) || (fotos[0] && fotos[0].src) || null,
    portada_alt: fila.portada_alt || "",
    campeonato: fila.campeonato ? fila.campeonato.nombre : "",
    categoria: fila.categoria ? fila.categoria.nombre : "",
    partido: textoPartido(fila.partido),
    fecha: fila.fecha || (fila.partido && fila.partido.fecha) || fila.publicado_en || "",
    fotos
  };
}

async function desdeSupabase(cfg, tabla, slug) {
  // No se filtra por "estado": los visitantes no tienen permiso sobre esa
  // columna y RLS ya devuelve solo lo publicado.
  const url =
    cfg.url + "/rest/v1/" + tabla +
    "?slug=eq." + encodeURIComponent(slug) +
    "&select=" + encodeURIComponent(CONSULTAS[tabla]) + "&limit=1";
  const r = await fetch(url, { headers: cabeceras(cfg.clave) });
  if (!r.ok) throw new Error("Supabase respondió " + r.status);
  const filas = await r.json();
  return filas[0] ? normalizar(cfg, tabla, filas[0]) : null;
}

async function desdePrueba(ctx, tabla, slug) {
  const r = await ctx.env.ASSETS.fetch(new URL("/datos-prueba/" + tabla + ".json", ctx.request.url));
  if (!r.ok) return null;
  const lista = await r.json();
  const item = lista.find((x) => x.slug === slug && x.estado === "publicada");
  return item ? Object.assign({ prueba: true }, item) : null;
}

/* Devuelve la publicación o null si no existe / no está publicada.
   Lanza un error si el servicio de datos no responde. */
export async function obtenerPublicacion(ctx, tabla, slug) {
  if (!CONSULTAS[tabla]) throw new Error("Tabla no permitida");
  const cfg = configSupabase(ctx.env);
  if (cfg) return desdeSupabase(cfg, tabla, slug);
  return desdePrueba(ctx, tabla, slug);
}
