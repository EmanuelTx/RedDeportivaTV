/* Página de cada cobertura: /coberturas/<slug> (dirección permanente) */
import { catalogos, obtenerCobertura, slugValido } from "../_lib/datos.js";
import { paginaCobertura, paginaNoEncontrada, paginaError } from "../_lib/plantilla.js";

export async function onRequestGet(ctx) {
  const slug = String(ctx.params.slug || "").toLowerCase();
  if (!slugValido(slug)) return paginaNoEncontrada(ctx);
  try {
    const cat = await catalogos(ctx);
    const cobertura = await obtenerCobertura(ctx, slug, cat);
    return cobertura ? paginaCobertura(ctx, cobertura) : paginaNoEncontrada(ctx);
  } catch (error) {
    console.error("cobertura:", error);
    return paginaError(ctx);
  }
}

export const onRequestHead = onRequestGet;
