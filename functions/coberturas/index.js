/* Catálogo de coberturas: /coberturas?q=&campeonato=&categoria=&jornada=&tipo=&anio=&mes=&desde=&hasta=&pagina= */
import { catalogos, leerFiltros, buscar, archivo, POR_PAGINA } from "../_lib/datos.js";
import { paginaCatalogo, paginaError } from "../_lib/plantilla.js";

export async function onRequestGet(ctx) {
  try {
    const url = new URL(ctx.request.url);
    const cat = await catalogos(ctx);
    const f = leerFiltros(url, cat);
    // Muestra de una vez las páginas 1..N: al volver desde una cobertura,
    // el visitante encuentra lo que ya había cargado con "Ver más".
    const [resultado, arch] = await Promise.all([
      buscar(ctx, cat, f.args, { limite: Math.min(POR_PAGINA * f.pagina, 100), offset: 0 }),
      archivo(ctx)
    ]);
    return paginaCatalogo(ctx, { f, cat, resultado, arch, origenUrl: url });
  } catch (error) {
    console.error("coberturas:", error);
    return paginaError(ctx);
  }
}

export const onRequestHead = onRequestGet;
