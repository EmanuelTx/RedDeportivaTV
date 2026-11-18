/* Todas las noticias publicadas: /noticias?pagina= */
import { listarNoticias } from "../_lib/datos.js";
import { paginaNoticias, paginaError } from "../_lib/plantilla.js";

const POR_PAGINA = 9;

export async function onRequestGet(ctx) {
  try {
    const url = new URL(ctx.request.url);
    const pagina = Math.min(Math.max(parseInt(url.searchParams.get("pagina") || "1", 10) || 1, 1), 50);
    // Muestra de una vez las páginas 1..N (al volver de una noticia se ve lo ya cargado)
    const r = await listarNoticias(ctx, { limite: Math.min(POR_PAGINA * pagina, 50), offset: 0 });
    return paginaNoticias(ctx, { items: r.items, total: r.total, pagina, origenUrl: url });
  } catch (error) {
    console.error("noticias (listado):", error);
    return paginaError(ctx);
  }
}

export const onRequestHead = onRequestGet;
