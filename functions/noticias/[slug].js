/* Página pública de cada noticia: /noticias/<slug> */
import { obtenerPublicacion, slugValido } from "../_lib/datos.js";
import { paginaNoticia, paginaNoEncontrada, paginaError } from "../_lib/plantilla.js";

export async function onRequestGet(ctx) {
  const slug = String(ctx.params.slug || "").toLowerCase();
  if (!slugValido(slug)) return paginaNoEncontrada(ctx);
  try {
    const noticia = await obtenerPublicacion(ctx, "noticias", slug);
    return noticia ? paginaNoticia(ctx, noticia) : paginaNoEncontrada(ctx);
  } catch (error) {
    console.error("noticias:", error);
    return paginaError(ctx);
  }
}

export const onRequestHead = onRequestGet;
