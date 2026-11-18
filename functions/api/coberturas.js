/* =========================================================
   /api/coberturas — tarjetas en HTML para "Ver más" y la portada.
   Mismos parámetros que /coberturas, más:
     limite (1–24); formato=video (compatibilidad: usar /api/videos)
   Respeta RLS: solo contenido publicado.
   ========================================================= */
import { catalogos, leerFiltros, buscar, videosPublicos, POR_PAGINA } from "../_lib/datos.js";
import { tarjeta, tarjetaVideo } from "../_lib/plantilla.js";

function json(cuerpo, estado = 200) {
  return new Response(JSON.stringify(cuerpo), {
    status: estado,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": estado === 200 ? "public, max-age=60" : "no-store",
      "X-Content-Type-Options": "nosniff",
      "X-Robots-Tag": "noindex"
    }
  });
}

export async function onRequestGet(ctx) {
  try {
    const url = new URL(ctx.request.url);
    const cat = await catalogos(ctx);
    const limite = Math.min(Math.max(parseInt(url.searchParams.get("limite") || String(POR_PAGINA), 10) || POR_PAGINA, 1), POR_PAGINA);
    // Compatibilidad: la portada anterior pedía las tarjetas de video acá.
    // Ahora usa /api/videos; se mantiene para páginas que estén en la caché del navegador.
    if (url.searchParams.get("formato") === "video") {
      const videos = await videosPublicos(ctx, cat, limite);
      return json({ total: videos.length, cantidad: videos.length, hayMas: false,
        html: videos.map((v) => tarjetaVideo({ video: v.id, ruta: v.ruta, titulo: v.titulo, campeonato: v.campeonato, fecha: v.fecha })).join("") });
    }
    const f = leerFiltros(url, cat);
    const offset = (f.pagina - 1) * limite;
    const r = await buscar(ctx, cat, f.args, { limite, offset });
    return json({
      total: r.total,
      cantidad: r.items.length,
      hayMas: offset + r.items.length < r.total,
      html: r.items.map((t) => tarjeta(t)).join("")
    });
  } catch (error) {
    console.error("api/coberturas:", error.message);
    return json({ total: 0, cantidad: 0, hayMas: false, html: "", error: "No disponible" }, 503);
  }
}
