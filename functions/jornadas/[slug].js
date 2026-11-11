/* Página de jornada: /jornadas/<slug> — sus partidos en orden y las coberturas generales */
import { catalogos, obtenerJornada, slugValido } from "../_lib/datos.js";
import { paginaJornada, paginaNoEncontrada, paginaError } from "../_lib/plantilla.js";

export async function onRequestGet(ctx) {
  const slug = String(ctx.params.slug || "").toLowerCase();
  if (!slugValido(slug)) return paginaNoEncontrada(ctx);
  try {
    const cat = await catalogos(ctx);
    const datos = await obtenerJornada(ctx, slug, cat);
    return datos ? paginaJornada(ctx, datos) : paginaNoEncontrada(ctx);
  } catch (error) {
    console.error("jornada:", error);
    return paginaError(ctx);
  }
}

export const onRequestHead = onRequestGet;
