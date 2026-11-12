/* =========================================================
   Panel RedDeportivaTV · estado compartido entre las secciones
   ========================================================= */
import { fechaCorta } from "./ui.js";

export const app = {
  sb: null,          // cliente de Supabase (con la sesión del administrador)
  usuario: null,     // usuario de Supabase Auth
  nombre: "",        // nombre en public.administradores
  cat: { campeonatos: [], categorias: [], jornadas: [], partidos: [] }
};

export async function recargarCatalogos() {
  const [c, k, j, p] = await Promise.all([
    app.sb.from("campeonatos").select("*").order("orden").order("nombre"),
    app.sb.from("categorias").select("*").order("orden").order("nombre"),
    app.sb.from("jornadas").select("*").order("orden").order("fecha", { nullsFirst: false }).order("nombre"),
    app.sb.from("partidos").select("*").order("fecha", { ascending: false, nullsFirst: false }).order("orden")
  ]);
  for (const r of [c, k, j, p]) if (r.error) throw r.error;
  app.cat = { campeonatos: c.data, categorias: k.data, jornadas: j.data, partidos: p.data };
}

const porId = (lista, id) => lista.find((x) => x.id === id);

export const campeonatoPorId = (id) => porId(app.cat.campeonatos, id);
export const categoriaPorId = (id) => porId(app.cat.categorias, id);
export const jornadaPorId = (id) => porId(app.cat.jornadas, id);
export const partidoPorId = (id) => porId(app.cat.partidos, id);

export function nombreCampeonato(id) {
  const c = campeonatoPorId(id);
  return c ? c.nombre : "";
}
export function nombreCategoria(id) {
  const c = categoriaPorId(id);
  return c ? c.nombre : "";
}
export function nombreJornada(id) {
  const j = jornadaPorId(id);
  return j ? j.nombre : "";
}
/* Nombres para una lista de jornadas: si dos se llaman igual (p. ej.
   "Fecha 2" de Libre y de Senior) se agrega la categoría:
   "Fecha 2 — Libre", "Fecha 2 — Senior". Mismo criterio que la web. */
const claveNombre = (n) => String(n || "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
export function etiquetasJornadas(lista) {
  const veces = {};
  for (const j of lista) veces[claveNombre(j.nombre)] = (veces[claveNombre(j.nombre)] || 0) + 1;
  return lista.map((j) => veces[claveNombre(j.nombre)] < 2 ? j.nombre
    : j.nombre + " — " + (nombreCategoria(j.categoria_id) || "Sin categoría"));
}
/* Nombre de una jornada sin ambigüedad dentro de su campeonato. */
export function nombreJornadaClaro(id) {
  const j = jornadaPorId(id);
  if (!j) return "";
  const hermanas = app.cat.jornadas.filter((x) => x.campeonato_id === j.campeonato_id);
  return etiquetasJornadas(hermanas)[hermanas.indexOf(j)];
}
export function etiquetaPartido(p) {
  if (!p) return "";
  const resultado = p.goles_local != null && p.goles_visitante != null ? " " + p.goles_local + "-" + p.goles_visitante + " " : " vs ";
  return p.equipo_local + resultado + p.equipo_visitante + (p.fecha ? " · " + fechaCorta(p.fecha) : "");
}
export function nombrePartido(id) {
  return etiquetaPartido(partidoPorId(id));
}

export function opcCampeonatos() {
  return app.cat.campeonatos.map((c) => ({ valor: c.id, texto: c.nombre + (c.temporada ? " (" + c.temporada + ")" : "") + (c.visible ? "" : " · oculto") }));
}
/* Categorías: SOLO las del campeonato indicado (cada campeonato tiene las suyas). */
export function opcCategorias(campeonatoId) {
  if (!campeonatoId) return [];
  return app.cat.categorias
    .filter((k) => k.campeonato_id === campeonatoId)
    .map((c) => ({ valor: c.id, texto: c.nombre + (c.visible ? "" : " · oculta") }));
}
/* Jornadas del campeonato y, si se indica, de esa categoría. */
export function opcJornadas(campeonatoId, categoriaId) {
  if (!campeonatoId) return [];
  const lista = app.cat.jornadas
    .filter((j) => j.campeonato_id === campeonatoId && (categoriaId === undefined || (j.categoria_id || null) === (categoriaId || null)));
  const nombres = etiquetasJornadas(lista);
  return lista.map((j, i) => ({ valor: j.id, texto: nombres[i] + (j.fecha ? " · " + fechaCorta(j.fecha) : "") }));
}
export function opcPartidos(campeonatoId, categoriaId, jornadaId) {
  return app.cat.partidos
    .filter((p) => (!campeonatoId || p.campeonato_id === campeonatoId)
      && (!categoriaId || !p.categoria_id || p.categoria_id === categoriaId)
      && (!jornadaId || p.jornada_id === jornadaId))
    .map((p) => ({ valor: p.id, texto: etiquetaPartido(p) + (p.jornada_id ? " · " + nombreJornadaClaro(p.jornada_id) : "") }));
}

/* Dirección de una jornada: campeonato + categoría + nombre (única en el sitio). */
export function slugJornada(slugify, campeonatoId, categoriaId, nombre) {
  const c = campeonatoPorId(campeonatoId);
  const k = categoriaPorId(categoriaId);
  return slugify([c && c.slug, k && k.slug, nombre].filter(Boolean).join(" "));
}
