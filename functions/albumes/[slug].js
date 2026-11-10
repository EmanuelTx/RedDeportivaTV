/* Página pública de cada álbum: /albumes/<slug> */
import { obtenerPublicacion, slugValido } from "../_lib/datos.js";
import { paginaAlbum, paginaNoEncontrada, paginaError } from "../_lib/plantilla.js";

export async function onRequestGet(ctx) {
  const slug = String(ctx.params.slug || "").toLowerCase();
  if (!slugValido(slug)) return paginaNoEncontrada(ctx);
  try {
    const album = await obtenerPublicacion(ctx, "albumes", slug);
    return album ? paginaAlbum(ctx, album) : paginaNoEncontrada(ctx);
  } catch (error) {
    console.error("albumes:", error);
    return paginaError(ctx);
  }
}

export const onRequestHead = onRequestGet;
