/* =========================================================
   Acceso a datos para las páginas dinámicas (Cloudflare Pages Functions).

   - Con SUPABASE_URL y SUPABASE_PUBLISHABLE_KEY configuradas en
     Cloudflare, se lee desde Supabase. Las reglas RLS devuelven solo lo
     publicado: nunca borradores, fotos privadas ni videos en edición.
   - Sin esas variables, las noticias usan /datos-prueba/*.json.

   La clave publicable (sb_publishable_...) es pública por diseño. Las
   claves secretas (sb_secret_... / service_role) NUNCA se usan: si
   alguien las configura por error, se rechazan.
   ========================================================= */

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const BUCKET_PUBLICO = "fotos-publicas";
export const POR_PAGINA = 24;

export function slugValido(slug) {
  return typeof slug === "string" && slug.length > 0 && slug.length <= 160 && SLUG_RE.test(slug);
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

/* Devuelve { url, clave } o null si Supabase no está configurado. */
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
  // El esquema "public" se pide explícitamente: en este proyecto el
  // esquema por defecto de la Data API es graphql_public.
  const h = { apikey: clave, Accept: "application/json", "Accept-Profile": "public", "Content-Profile": "public" };
  if (clave.startsWith("eyJ")) h.Authorization = "Bearer " + clave;
  return h;
}

export function urlPublica(cfg, ruta) {
  if (!ruta) return null;
  return cfg.url + "/storage/v1/object/public/" + BUCKET_PUBLICO + "/" + ruta.split("/").map(encodeURIComponent).join("/");
}

export function miniaturaYoutube(id, calidad = "hqdefault") {
  return id ? "https://i.ytimg.com/vi/" + encodeURIComponent(id) + "/" + calidad + ".jpg" : null;
}

async function consultar(cfg, ruta) {
  const r = await fetch(cfg.url + "/rest/v1/" + ruta, { headers: cabeceras(cfg.clave) });
  if (!r.ok) throw new Error("Supabase respondió " + r.status + " en " + ruta.split("?")[0]);
  return r.json();
}

async function rpc(cfg, nombre, args) {
  const r = await fetch(cfg.url + "/rest/v1/rpc/" + nombre, {
    method: "POST",
    headers: Object.assign({ "Content-Type": "application/json" }, cabeceras(cfg.clave)),
    body: JSON.stringify(args || {})
  });
  if (!r.ok) throw new Error("Supabase respondió " + r.status + " en " + nombre);
  return r.json();
}

function requerirConfig(ctx) {
  const cfg = configSupabase(ctx.env);
  if (!cfg) throw new Error("Supabase no está configurado");
  return cfg;
}

/* ---------- Catálogos (campeonatos, categorías, jornadas) ---------- */

export async function catalogos(ctx) {
  const cfg = requerirConfig(ctx);
  const [campeonatos, categorias, jornadas] = await Promise.all([
    consultar(cfg, "campeonatos?select=id,nombre,slug,temporada,descripcion,orden&order=orden.asc,nombre.asc"),
    consultar(cfg, "categorias?select=id,campeonato_id,nombre,slug,orden&order=orden.asc,nombre.asc"),
    consultar(cfg, "jornadas?select=id,campeonato_id,categoria_id,nombre,slug,fecha,orden&order=orden.asc,fecha.asc.nullslast,nombre.asc")
  ]);
  const porId = (lista) => Object.fromEntries(lista.map((x) => [x.id, x]));
  return { campeonatos, categorias, jornadas, campeonato: porId(campeonatos), categoria: porId(categorias), jornada: porId(jornadas) };
}

/* Nombres de jornadas para un selector: si en la lista hay dos jornadas con
   el mismo nombre (p. ej. "Fecha 2" de Libre y de Senior), se agrega la
   categoría: "Fecha 2 — Libre", "Fecha 2 — Senior". */
export function etiquetasJornadas(lista, cat) {
  const clave = (n) => String(n || "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
  const veces = {};
  for (const j of lista) veces[clave(j.nombre)] = (veces[clave(j.nombre)] || 0) + 1;
  return lista.map((j) => {
    if (veces[clave(j.nombre)] < 2) return j.nombre;
    const k = (cat.categoria || {})[j.categoria_id];
    return j.nombre + " — " + (k ? k.nombre : "Sin categoría");
  });
}

export const ORDENES = ["fecha", "reciente"];

/* ---------- Búsqueda ---------- */

/* Filtros de la URL (?q=&campeonato=&categoria=&jornada=&tipo=&anio=&mes=&desde=&hasta=&orden=&pagina=)
   orden: "fecha" (predeterminado, fecha real del partido o evento) o
   "reciente" (agregadas o completadas últimamente, aunque sean antiguas).
   → parámetros de buscar_coberturas. Los filtros usan direcciones (slugs). */
export function leerFiltros(url, cat) {
  const p = url.searchParams;
  const f = {
    q: (p.get("q") || "").trim().slice(0, 120),
    campeonato: p.get("campeonato") || "",
    categoria: p.get("categoria") || "",
    jornada: p.get("jornada") || "",
    tipo: p.get("tipo") || "",
    anio: p.get("anio") || "",
    mes: p.get("mes") || "",
    desde: p.get("desde") || "",
    hasta: p.get("hasta") || "",
    orden: ORDENES.includes(p.get("orden")) ? p.get("orden") : "fecha",
    pagina: Math.min(Math.max(parseInt(p.get("pagina") || "1", 10) || 1, 1), 50)
  };
  const camp = cat.campeonatos.find((c) => c.slug === f.campeonato) || null;
  const categ = camp ? cat.categorias.find((k) => k.campeonato_id === camp.id && k.slug === f.categoria) || null : null;
  const jorn = cat.jornadas.find((j) => j.slug === f.jornada) || null;
  if (!camp) { f.campeonato = ""; f.categoria = ""; }
  if (!categ) f.categoria = "";
  if (!jorn) f.jornada = "";
  if (!["partido", "jornada", "campeonato", "evento"].includes(f.tipo)) f.tipo = "";

  let desde = /^\d{4}-\d{2}-\d{2}$/.test(f.desde) ? f.desde : null;
  let hasta = /^\d{4}-\d{2}-\d{2}$/.test(f.hasta) ? f.hasta : null;
  const anio = /^\d{4}$/.test(f.anio) ? parseInt(f.anio, 10) : null;
  const mes = /^\d{1,2}$/.test(f.mes) && +f.mes >= 1 && +f.mes <= 12 ? parseInt(f.mes, 10) : null;
  if (!anio) f.anio = "";
  if (!mes || !anio) f.mes = "";
  if (anio && !desde && !hasta) {
    const dos = (n) => String(n).padStart(2, "0");
    if (mes) {
      desde = anio + "-" + dos(mes) + "-01";
      hasta = anio + "-" + dos(mes) + "-" + dos(new Date(Date.UTC(anio, mes, 0)).getUTCDate());
    } else {
      desde = anio + "-01-01";
      hasta = anio + "-12-31";
    }
  }
  if (!desde) f.desde = "";
  if (!hasta) f.hasta = "";
  f.args = {
    p_texto: f.q || null,
    p_campeonato: camp ? camp.id : null,
    p_categoria: categ ? categ.id : null,
    p_jornada: jorn ? jorn.id : null,
    p_tipo: f.tipo || null,
    p_desde: desde,
    p_hasta: hasta,
    p_orden: f.orden
  };
  f.activos = ["q", "campeonato", "categoria", "jornada", "tipo", "anio", "desde", "hasta"].filter((k) => f[k]).length;
  return f;
}

/* Devuelve { items, total } con datos listos para las tarjetas. */
export async function buscar(ctx, cat, args, { limite = POR_PAGINA, offset = 0, conVideo = null } = {}) {
  const cfg = requerirConfig(ctx);
  const filas = await rpc(cfg, "buscar_coberturas", Object.assign({}, args, {
    p_limite: Math.min(limite, 100), p_offset: offset, p_con_video: conVideo
  }));
  return {
    total: filas[0] ? Number(filas[0].total) : 0,
    items: filas.map((f) => tarjetaDesdeFila(cfg, cat, f))
  };
}

function tarjetaDesdeFila(cfg, cat, f) {
  const camp = cat.campeonato[f.campeonato_id];
  const categ = cat.categoria[f.categoria_id];
  const jorn = cat.jornada[f.jornada_id];
  return {
    slug: f.slug,
    titulo: f.titulo,
    tipo: f.tipo,
    fecha: f.fecha,
    campeonato: camp ? camp.nombre : "",
    categoria: categ ? categ.nombre : "",
    jornada: jorn ? jorn.nombre : "",
    fotos: Boolean(f.fotos_disponibles),
    video: f.video_publico || null,
    estadoFotos: estadoPublico(f.fotos_estado_publico, f.fotos_disponibles),
    estadoVideo: estadoPublico(f.video_estado_publico, f.video_publico),
    imagen: f.portada_publica ? urlPublica(cfg, rutaMini(f.portada_publica)) : miniaturaYoutube(f.video_publico),
    imagenAlternativa: f.portada_publica ? urlPublica(cfg, f.portada_publica) : miniaturaYoutube(f.video_publico, "mqdefault")
  };
}

/* Estado público de fotos o video: disponible | preparacion/edicion |
   pendiente | no_aplica. Lo calcula la base; "disponible" se confirma con
   el contenido realmente publicado (nunca se muestra algo que no lo está). */
const ESTADOS = ["disponible", "preparacion", "edicion", "pendiente", "no_aplica"];
function estadoPublico(estado, contenido) {
  if (contenido) return "disponible";
  return ESTADOS.includes(estado) && estado !== "disponible" ? estado : "pendiente";
}

/* Las fotos se guardan como <base>.jpg y su miniatura como <base>-mini.jpg.
   Si la miniatura no existiera, la tarjeta usa la foto grande (ver js/coberturas.js). */
function rutaMini(ruta) {
  return /-mini\.[a-z]+$/.test(ruta) ? ruta : ruta.replace(/\.(jpe?g|png|webp)$/i, "-mini.jpg");
}

export async function archivo(ctx) {
  const cfg = requerirConfig(ctx);
  return rpc(cfg, "archivo_coberturas", {});
}

/* ---------- Una cobertura ---------- */

const COLUMNAS_COBERTURA =
  "id,slug,titulo,descripcion,fecha,tipo,portada_publica,portada_alt,publicado_en,actualizado_en," +
  "fotos_disponibles,video_publico,fotos_estado_publico,video_estado_publico,campeonato_id,categoria_id,jornada_id," +
  "partido:partidos(equipo_local,equipo_visitante,goles_local,goles_visitante,fecha,hora,lugar,fase,orden)," +
  "fotos(path,mini_path,ancho,alto,alt,descripcion,orden)";

export async function obtenerCobertura(ctx, slug, cat) {
  const cfg = requerirConfig(ctx);
  const filas = await consultar(cfg, "albumes?slug=eq." + encodeURIComponent(slug) +
    "&select=" + encodeURIComponent(COLUMNAS_COBERTURA) + "&limit=1");
  const a = filas[0];
  if (!a) return null;
  const fotos = (a.fotos || []).slice().sort((x, y) => x.orden - y.orden).map((f) => ({
    src: urlPublica(cfg, f.path),
    mini: urlPublica(cfg, f.mini_path),
    alt: f.alt || "",
    descripcion: f.descripcion || "",
    ancho: f.ancho,
    alto: f.alto
  }));
  return {
    slug: a.slug,
    titulo: a.titulo,
    tipo: a.tipo,
    descripcion: a.descripcion || "",
    fecha: a.fecha,
    publicado_en: a.publicado_en,
    campeonato: cat.campeonato[a.campeonato_id] || null,
    categoria: cat.categoria[a.categoria_id] || null,
    jornada: cat.jornada[a.jornada_id] || null,
    partido: a.partido || null,
    fotosDisponibles: Boolean(a.fotos_disponibles),
    video: a.video_publico || null,
    estadoFotos: estadoPublico(a.fotos_estado_publico, a.fotos_disponibles && fotos.length),
    estadoVideo: estadoPublico(a.video_estado_publico, a.video_publico),
    portada: urlPublica(cfg, a.portada_publica) || (fotos[0] && fotos[0].src) || miniaturaYoutube(a.video_publico, "hqdefault"),
    portada_alt: a.portada_alt || "",
    fotos: a.fotos_disponibles ? fotos : []
  };
}

/* ---------- Jornada: partidos en orden + coberturas ---------- */

export async function obtenerJornada(ctx, slug, cat) {
  const cfg = requerirConfig(ctx);
  const jornada = cat.jornadas.find((j) => j.slug === slug);
  if (!jornada) return null;
  const [partidos, cob] = await Promise.all([
    consultar(cfg, "partidos?jornada_id=eq." + jornada.id +
      "&select=id,equipo_local,equipo_visitante,goles_local,goles_visitante,fecha,hora,lugar,fase,orden" +
      "&order=orden.asc,fecha.asc.nullslast,hora.asc.nullslast"),
    rpc(cfg, "buscar_coberturas", { p_jornada: jornada.id, p_limite: 100, p_offset: 0 })
  ]);
  const porPartido = {};
  const generales = [];
  for (const f of cob) {
    const t = tarjetaDesdeFila(cfg, cat, f);
    if (f.partido_id) porPartido[f.partido_id] = t;
    else generales.push(t);
  }
  return {
    jornada,
    campeonato: cat.campeonato[jornada.campeonato_id] || null,
    categoria: cat.categoria[jornada.categoria_id] || null,
    partidos: partidos.map((p) => Object.assign({}, p, { cobertura: porPartido[p.id] || null })),
    generales
  };
}

/* ---------- Campeonato y categoría ---------- */

export async function obtenerCampeonato(ctx, slugCampeonato, slugCategoria, cat) {
  const campeonato = cat.campeonatos.find((c) => c.slug === slugCampeonato);
  if (!campeonato) return null;
  let categoria = null;
  if (slugCategoria) {
    categoria = cat.categorias.find((k) => k.campeonato_id === campeonato.id && k.slug === slugCategoria);
    if (!categoria) return null;
  }
  const categorias = cat.categorias.filter((k) => k.campeonato_id === campeonato.id);
  const jornadas = cat.jornadas.filter((j) => j.campeonato_id === campeonato.id && (!categoria || j.categoria_id === categoria.id));
  const recientes = await buscar(ctx, cat, {
    p_campeonato: campeonato.id, p_categoria: categoria ? categoria.id : null, p_orden: "fecha"
  }, { limite: 12 });
  return { campeonato, categoria, categorias, jornadas, recientes };
}

/* ---------- Noticias (sin cambios de comportamiento) ---------- */

const CONSULTA_NOTICIA =
  "id,slug,titulo,descripcion,contenido,portada_path,portada_alt,publicado_en,actualizado_en," +
  "campeonato:campeonatos(nombre,slug),categoria:categorias!noticias_categoria_id_fkey(nombre,slug)," +
  "partido:partidos(equipo_local,equipo_visitante,fecha,goles_local,goles_visitante)";

async function noticiaDesdeSupabase(cfg, slug) {
  const filas = await consultar(cfg, "noticias?slug=eq." + encodeURIComponent(slug) +
    "&select=" + encodeURIComponent(CONSULTA_NOTICIA) + "&limit=1");
  const n = filas[0];
  if (!n) return null;
  const p = n.partido;
  return {
    tipo: "noticias",
    slug: n.slug,
    titulo: n.titulo,
    descripcion: n.descripcion || "",
    contenido: n.contenido || "",
    portada: urlPublica(cfg, n.portada_path),
    portada_alt: n.portada_alt || "",
    campeonato: n.campeonato ? n.campeonato.nombre : "",
    categoria: n.categoria ? n.categoria.nombre : "",
    partido: p ? p.equipo_local + (p.goles_local != null && p.goles_visitante != null ? " " + p.goles_local + "-" + p.goles_visitante + " " : " vs ") + p.equipo_visitante : "",
    fecha: (p && p.fecha) || n.publicado_en || ""
  };
}

async function desdePrueba(ctx, tabla, slug) {
  const r = await ctx.env.ASSETS.fetch(new URL("/datos-prueba/" + tabla + ".json", ctx.request.url));
  if (!r.ok) return null;
  const lista = await r.json();
  const item = lista.find((x) => x.slug === slug && x.estado === "publicada");
  return item ? Object.assign({ prueba: true }, item) : null;
}

/* Noticias: devuelve la publicación o null si no existe / no está publicada. */
export async function obtenerPublicacion(ctx, tabla, slug) {
  if (tabla !== "noticias") throw new Error("Tabla no permitida");
  const cfg = configSupabase(ctx.env);
  if (cfg) return noticiaDesdeSupabase(cfg, slug);
  return desdePrueba(ctx, tabla, slug);
}

export function esUuid(v) {
  return UUID_RE.test(String(v || ""));
}
