/* Página pública de cada noticia: /noticias/<slug> */
import { obtenerPublicacion, listarNoticias, slugValido } from "../_lib/datos.js";
import { paginaNoticia, paginaNoEncontrada, paginaError } from "../_lib/plantilla.js";

export async function onRequestGet(ctx) {
  const slug = String(ctx.params.slug || "").toLowerCase();
  if (!slugValido(slug)) return paginaNoEncontrada(ctx);
  try {
    const noticia = await obtenerPublicacion(ctx, "noticias", slug);
    if (!noticia) return paginaNoEncontrada(ctx);
    // "Más noticias": si falla, la noticia se muestra igual
    try { noticia.mas = (await listarNoticias(ctx, { limite: 3, excluir: slug })).items; } catch (_) { noticia.mas = []; }
    return paginaNoticia(ctx, noticia);
  } catch (error) {
    console.error("noticias:", error);
    return paginaError(ctx);
  }
}

export const onRequestHead = onRequestGet;
