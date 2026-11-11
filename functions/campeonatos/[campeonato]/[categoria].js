/* Página de categoría: /campeonatos/<campeonato>/<categoria> (la categoría es propia de su campeonato) */
import { catalogos, obtenerCampeonato, slugValido } from "../../_lib/datos.js";
import { paginaCampeonato, paginaNoEncontrada, paginaError } from "../../_lib/plantilla.js";

export async function onRequestGet(ctx) {
  const camp = String(ctx.params.campeonato || "").toLowerCase();
  const categ = String(ctx.params.categoria || "").toLowerCase();
  if (!slugValido(camp) || !slugValido(categ)) return paginaNoEncontrada(ctx);
  try {
    const cat = await catalogos(ctx);
    const datos = await obtenerCampeonato(ctx, camp, categ, cat);
    return datos ? paginaCampeonato(ctx, datos) : paginaNoEncontrada(ctx);
  } catch (error) {
    console.error("categoria:", error);
    return paginaError(ctx);
  }
}

export const onRequestHead = onRequestGet;
