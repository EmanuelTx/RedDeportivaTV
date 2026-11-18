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

/* Devuelve { items, total } con datos listos para las tarjetas.
   Los partidos de un mismo campeonato y día se agrupan en UNA tarjeta
   ("cobertura del día"); lo demás (eventos, generales, anteriores sin fecha)
   queda como tarjeta suelta. El agrupamiento lo hace la base (buscar_entradas). */
export async function buscar(ctx, cat, args, { limite = POR_PAGINA, offset = 0 } = {}) {
  const cfg = requerirConfig(ctx);
  const filas = await rpc(cfg, "buscar_entradas", Object.assign({}, args, {
    p_limite: Math.min(limite, 100), p_offset: offset
  }));
  return {
    total: filas[0] ? Number(filas[0].total) : 0,
    items: filas.map((f) => (f.es_dia ? tarjetaDia(cfg, cat, f) : tarjetaDesdeFila(cfg, cat, f)))
  };
}

/* Tarjeta de una cobertura del día: campeonato + fecha real + categorías + partidos. */
function tarjetaDia(cfg, cat, f) {
  const camp = cat.campeonato[f.campeonato_id];
  const categorias = (f.categorias || [])
    .map((id) => cat.categoria[id]).filter(Boolean)
    .sort((a, b) => (a.orden - b.orden) || a.nombre.localeCompare(b.nombre, "es"))
    .map((k) => k.nombre);
  return {
    esDia: true,
    ruta: "/dias/" + f.slug,
    slug: f.slug,
    titulo: camp ? camp.nombre : "Cobertura del día",
    tipo: "dia",
    fecha: f.fecha,
    campeonato: camp ? camp.nombre : "",
    categorias,
    partidos: Number(f.partidos) || 0,
    partidosConFotos: Number(f.con_fotos) || 0,
    fotos: Boolean(f.fotos_disponibles),
    video: f.video_publico || null,
    estadoFotos: estadoPublico(f.fotos_estado_publico, f.fotos_disponibles),
    estadoVideo: estadoPublico(f.video_estado_publico, f.video_publico),
    imagen: f.portada_publica ? urlPublica(cfg, rutaMini(f.portada_publica)) : miniaturaYoutube(f.video_publico),
    imagenAlternativa: f.portada_publica ? urlPublica(cfg, f.portada_publica) : miniaturaYoutube(f.video_publico, "mqdefault")
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
  // Cobertura del día a la que pertenece (para el enlace y el video resumen general)
  let dia = null;
  if ((a.tipo === "partido" || a.tipo === "jornada") && a.campeonato_id && a.fecha) {
    const d = (await consultar(cfg, "dias_cobertura?campeonato_id=eq." + a.campeonato_id + "&fecha=eq." + encodeURIComponent(a.fecha) +
      "&select=slug,video_publico,video_estado_publico&limit=1"))[0];
    if (d) dia = { ruta: "/dias/" + d.slug, video: d.video_publico || null, estadoVideo: estadoPublico(d.video_estado_publico, d.video_publico) };
  }
  return {
    dia,
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

/* ---------- Noticia individual ---------- */

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
    fecha: (p && p.fecha) || fechaParaguay(n.publicado_en)
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

/* =========================================================
   Fecha de Paraguay
   Las fechas con hora (publicado_en, etc.) vienen en UTC. Paraguay usa
   UTC-3: una noticia publicada a las 22:00 en Asunción ya es "mañana" en
   UTC. Las fechas sin hora (fecha de un partido) se dejan tal cual: no se
   inventan ni se corren.
   ========================================================= */
const FORMATO_DIA_PY = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Asuncion", year: "numeric", month: "2-digit", day: "2-digit" });
export function fechaParaguay(valor) {
  if (!valor) return "";
  const s = String(valor);
  if (!s.includes("T")) return s.slice(0, 10);
  const d = new Date(s);
  return isNaN(d) ? "" : FORMATO_DIA_PY.format(d); // AAAA-MM-DD
}

/* =========================================================
   Cobertura del día: /dias/<slug>
   Devuelve el día con sus partidos organizados por categoría → jornada →
   orden de encuentro. Cada partido conserva su galería, resultado y enlace.
   ========================================================= */
export async function obtenerDia(ctx, slug, cat) {
  const cfg = requerirConfig(ctx);
  const d = (await consultar(cfg, "dias_cobertura?slug=eq." + encodeURIComponent(slug) +
    "&select=id,campeonato_id,fecha,slug,descripcion,video_publico,video_estado_publico&limit=1"))[0];
  if (!d) return null;
  const columnas = "id,slug,titulo,tipo,portada_publica,video_publico,fotos_disponibles,fotos_estado_publico,video_estado_publico," +
    "categoria_id,jornada_id,partido_id,partido:partidos(equipo_local,equipo_visitante,goles_local,goles_visitante,hora,lugar,fase,orden),fotos(id)";
  const filas = await consultar(cfg, "albumes?campeonato_id=eq." + d.campeonato_id + "&fecha=eq." + encodeURIComponent(d.fecha) +
    "&tipo=in.(partido,jornada)&select=" + encodeURIComponent(columnas) + "&limit=300");

  const item = (f) => {
    const t = tarjetaDesdeFila(cfg, cat, Object.assign({ campeonato_id: d.campeonato_id, fecha: d.fecha }, f));
    t.cantidadFotos = Array.isArray(f.fotos) ? f.fotos.length : 0; // el visitante solo tiene permiso por columnas (sin count(*))
    t.partido = f.partido || null;
    t.orden = f.partido && f.partido.orden != null ? f.partido.orden : 0;
    t.hora = f.partido && f.partido.hora ? String(f.partido.hora).slice(0, 5) : "";
    return t;
  };
  const porCategoria = new Map();
  const generales = [];
  for (const f of filas) {
    if (f.tipo === "jornada") { generales.push(item(f)); continue; }
    const kc = f.categoria_id || "";
    const kj = f.jornada_id || "";
    if (!porCategoria.has(kc)) porCategoria.set(kc, new Map());
    const jornadas = porCategoria.get(kc);
    if (!jornadas.has(kj)) jornadas.set(kj, []);
    jornadas.get(kj).push(item(f));
  }
  const ordenCat = (a, b) => {
    const ka = cat.categoria[a], kb = cat.categoria[b];
    if (!ka || !kb) return ka ? -1 : kb ? 1 : 0;           // "sin categoría" al final
    return (ka.orden - kb.orden) || ka.nombre.localeCompare(kb.nombre, "es");
  };
  const ordenJor = (a, b) => {
    const ja = cat.jornada[a], jb = cat.jornada[b];
    if (!ja || !jb) return ja ? -1 : jb ? 1 : 0;
    return (ja.orden - jb.orden) || String(ja.fecha || "").localeCompare(String(jb.fecha || "")) || ja.nombre.localeCompare(jb.nombre, "es");
  };
  const categorias = [...porCategoria.keys()].sort(ordenCat).map((kc) => ({
    categoria: cat.categoria[kc] || null,
    jornadas: [...porCategoria.get(kc).keys()].sort(ordenJor).map((kj) => ({
      jornada: cat.jornada[kj] || null,
      partidos: porCategoria.get(kc).get(kj).sort((x, y) => (x.orden - y.orden) || x.hora.localeCompare(y.hora) || x.titulo.localeCompare(y.titulo, "es"))
    }))
  }));
  const todos = categorias.flatMap((c) => c.jornadas.flatMap((j) => j.partidos));
  const conImagen = todos.concat(generales).find((t) => t.imagen);
  return {
    slug: d.slug,
    fecha: d.fecha,
    descripcion: d.descripcion || "",
    campeonato: cat.campeonato[d.campeonato_id] || null,
    video: d.video_publico || null,
    estadoVideo: estadoPublico(d.video_estado_publico, d.video_publico),
    categorias,
    generales,
    totalPartidos: todos.length,
    totalConFotos: todos.filter((t) => t.fotos).length,
    imagen: conImagen ? conImagen.imagenAlternativa : miniaturaYoutube(d.video_publico, "hqdefault")
  };
}

/* =========================================================
   Videos (sección Videos de la portada): el video resumen de cada día y
   los videos propios de partidos, sin repetir ninguno.
   ========================================================= */
export async function videosPublicos(ctx, cat, limite = 4) {
  const cfg = requerirConfig(ctx);
  const filas = await rpc(cfg, "videos_publicos", { p_limite: Math.min(Math.max(limite, 1), 24) });
  return filas.map((v) => {
    const camp = cat.campeonato[v.campeonato_id];
    const categ = cat.categoria[v.categoria_id];
    return {
      id: v.youtube_id,
      esDia: Boolean(v.es_dia),
      ruta: (v.es_dia ? "/dias/" : "/coberturas/") + v.slug,
      titulo: v.es_dia ? "Resumen del día" + (camp ? " · " + camp.nombre : "") : v.titulo,
      categoria: v.es_dia ? "Resumen del día" : [camp && camp.nombre, categ && categ.nombre].filter(Boolean).join(" · ") || "Video",
      campeonato: camp ? camp.nombre : "",
      fecha: v.fecha || ""
    };
  });
}

/* =========================================================
   Noticias: listado público (solo las publicadas; las reglas RLS de la
   base nunca devuelven borradores ni noticias a medio publicar).
   ========================================================= */
const COLUMNAS_LISTA_NOTICIA = "slug,titulo,descripcion,portada_path,portada_alt,publicado_en,campeonato:campeonatos(nombre)";

export async function listarNoticias(ctx, { limite = 9, offset = 0, excluir = null } = {}) {
  const cfg = configSupabase(ctx.env);
  if (!cfg) return { items: [], total: 0 };
  const h = Object.assign({ Prefer: "count=exact" }, cabeceras(cfg.clave));
  const r = await fetch(cfg.url + "/rest/v1/noticias?select=" + encodeURIComponent(COLUMNAS_LISTA_NOTICIA) +
    (excluir ? "&slug=neq." + encodeURIComponent(excluir) : "") +
    "&order=publicado_en.desc.nullslast,id.desc&limit=" + Math.min(Math.max(limite, 1), 50) + "&offset=" + Math.max(offset, 0), { headers: h });
  if (!r.ok) throw new Error("Supabase respondió " + r.status + " en noticias");
  const total = Number((r.headers.get("content-range") || "").split("/")[1]) || 0;
  const filas = await r.json();
  return {
    total,
    items: filas.map((n) => ({
      slug: n.slug,
      titulo: n.titulo,
      descripcion: n.descripcion || "",
      imagen: urlPublica(cfg, n.portada_path),
      imagenAlt: n.portada_alt || "",
      fecha: fechaParaguay(n.publicado_en),
      campeonato: n.campeonato ? n.campeonato.nombre : ""
    }))
  };
}
