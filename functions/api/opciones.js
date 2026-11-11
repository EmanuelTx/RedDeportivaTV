/* /api/opciones?campeonato=<slug>&categoria=<slug>
   Opciones de los filtros que dependen del contexto: las categorías del
   campeonato elegido y las jornadas de esa selección. */
import { catalogos } from "../_lib/datos.js";

export async function onRequestGet(ctx) {
  const cabeceras = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "public, max-age=300", "X-Robots-Tag": "noindex" };
  try {
    const url = new URL(ctx.request.url);
    const cat = await catalogos(ctx);
    const camp = cat.campeonatos.find((c) => c.slug === url.searchParams.get("campeonato"));
    const categorias = camp ? cat.categorias.filter((k) => k.campeonato_id === camp.id) : [];
    const categ = categorias.find((k) => k.slug === url.searchParams.get("categoria"));
    const jornadas = camp ? cat.jornadas.filter((j) => j.campeonato_id === camp.id && (!categ || j.categoria_id === categ.id)) : [];
    return new Response(JSON.stringify({
      categorias: categorias.map((k) => ({ slug: k.slug, nombre: k.nombre })),
      jornadas: jornadas.map((j) => ({ slug: j.slug, nombre: j.nombre }))
    }), { headers: cabeceras });
  } catch (error) {
    console.error("api/opciones:", error.message);
    return new Response(JSON.stringify({ categorias: [], jornadas: [] }), { status: 503, headers: Object.assign({}, cabeceras, { "Cache-Control": "no-store" }) });
  }
}
