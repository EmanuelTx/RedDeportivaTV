/* Cobertura del día: /dias/<campeonato>-<aaaa-mm-dd> (dirección permanente) */
import { catalogos, obtenerDia, slugValido } from "../_lib/datos.js";
import { paginaDia, paginaNoEncontrada, paginaError } from "../_lib/plantilla.js";

export async function onRequestGet(ctx) {
  const slug = String(ctx.params.slug || "").toLowerCase();
  if (!slugValido(slug)) return paginaNoEncontrada(ctx);
  try {
    const cat = await catalogos(ctx);
    const dia = await obtenerDia(ctx, slug, cat);
    return dia ? paginaDia(ctx, dia) : paginaNoEncontrada(ctx);
  } catch (error) {
    console.error("dia:", error);
    return paginaError(ctx);
  }
}

export const onRequestHead = onRequestGet;
