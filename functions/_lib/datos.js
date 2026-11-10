/* =========================================================
   Acceso a datos para las páginas dinámicas (Cloudflare Pages Functions).

   - Si están configuradas las variables SUPABASE_URL y SUPABASE_ANON_KEY
     en Cloudflare, se lee desde Supabase (solo contenido publicado).
   - Si no, se usan los datos de prueba de /datos-prueba/*.json.

   La clave "anon" de Supabase es pública por diseño: la seguridad la dan
   las reglas (RLS) de la base de datos. La clave "service_role" NUNCA
   debe usarse acá ni en ningún archivo del repositorio.
   ========================================================= */

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function slugValido(slug) {
  return typeof slug === "string" && slug.length > 0 && slug.length <= 120 && SLUG_RE.test(slug);
}

/* Columnas que se piden a Supabase. Se ajustan en la etapa 1,
   cuando se cree el esquema definitivo de la base de datos. */
const CONSULTAS = {
  noticias: "slug,titulo,descripcion,contenido,portada,portada_alt,campeonato,categoria,fecha",
  albumes: "slug,titulo,descripcion,portada,portada_alt,campeonato,categoria,fecha,partido,fotos"
};

async function desdeSupabase(env, tabla, slug) {
  const url =
    env.SUPABASE_URL.replace(/\/+$/, "") + "/rest/v1/" + tabla +
    "?slug=eq." + encodeURIComponent(slug) +
    // No se filtra por "estado": los visitantes no tienen permiso sobre esa
    // columna y RLS ya devuelve solo lo publicado.
    "&select=" + CONSULTAS[tabla] + "&limit=1";
  const r = await fetch(url, {
    headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: "Bearer " + env.SUPABASE_ANON_KEY }
  });
  if (!r.ok) throw new Error("Supabase respondió " + r.status);
  const filas = await r.json();
  return filas[0] || null;
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
  const { env } = ctx;
  if (env.SUPABASE_URL && env.SUPABASE_ANON_KEY) return desdeSupabase(env, tabla, slug);
  return desdePrueba(ctx, tabla, slug);
}
