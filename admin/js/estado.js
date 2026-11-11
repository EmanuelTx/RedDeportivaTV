/* =========================================================
   Panel RedDeportivaTV · estado compartido entre las secciones
   ========================================================= */
import { fechaCorta } from "./ui.js";

export const app = {
  sb: null,          // cliente de Supabase (con la sesión del administrador)
  usuario: null,     // usuario de Supabase Auth
  nombre: "",        // nombre en public.administradores
  cat: { campeonatos: [], categorias: [], partidos: [] }
};

export async function recargarCatalogos() {
  const [c, k, p] = await Promise.all([
    app.sb.from("campeonatos").select("*").order("orden").order("nombre"),
    app.sb.from("categorias").select("*").order("orden").order("nombre"),
    app.sb.from("partidos").select("*").order("fecha", { ascending: false, nullsFirst: false })
  ]);
  for (const r of [c, k, p]) if (r.error) throw r.error;
  app.cat = { campeonatos: c.data, categorias: k.data, partidos: p.data };
}

const porId = (lista, id) => lista.find((x) => x.id === id);

export function nombreCampeonato(id) {
  const c = porId(app.cat.campeonatos, id);
  return c ? c.nombre : "";
}
export function nombreCategoria(id) {
  const c = porId(app.cat.categorias, id);
  return c ? c.nombre : "";
}
export function etiquetaPartido(p) {
  if (!p) return "";
  const resultado = p.goles_local != null && p.goles_visitante != null ? " " + p.goles_local + "-" + p.goles_visitante + " " : " vs ";
  return p.equipo_local + resultado + p.equipo_visitante + (p.fecha ? " · " + fechaCorta(p.fecha) : "");
}
export function nombrePartido(id) {
  return etiquetaPartido(porId(app.cat.partidos, id));
}
export function partidoPorId(id) {
  return porId(app.cat.partidos, id);
}

export function opcCampeonatos() {
  return app.cat.campeonatos.map((c) => ({ valor: c.id, texto: c.nombre + (c.temporada ? " (" + c.temporada + ")" : "") + (c.visible ? "" : " · oculto") }));
}
export function opcCategorias() {
  return app.cat.categorias.map((c) => ({ valor: c.id, texto: c.nombre + (c.visible ? "" : " · oculta") }));
}
export function opcPartidos(campeonatoId, categoriaId) {
  return app.cat.partidos
    .filter((p) => (!campeonatoId || p.campeonato_id === campeonatoId) && (!categoriaId || !p.categoria_id || p.categoria_id === categoriaId))
    .map((p) => ({ valor: p.id, texto: etiquetaPartido(p) }));
}
