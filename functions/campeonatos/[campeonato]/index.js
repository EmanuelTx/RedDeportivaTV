/* Página de campeonato: /campeonatos/<campeonato> */
import { catalogos, obtenerCampeonato, slugValido } from "../../_lib/datos.js";
import { paginaCampeonato, paginaNoEncontrada, paginaError } from "../../_lib/plantilla.js";

export async function onRequestGet(ctx) {
  const slug = String(ctx.params.campeonato || "").toLowerCase();
  if (!slugValido(slug)) return paginaNoEncontrada(ctx);
  try {
    const cat = await catalogos(ctx);
    const datos = await obtenerCampeonato(ctx, slug, null, cat);
    return datos ? paginaCampeonato(ctx, datos) : paginaNoEncontrada(ctx);
  } catch (error) {
    console.error("campeonato:", error);
    return paginaError(ctx);
  }
}

export const onRequestHead = onRequestGet;
