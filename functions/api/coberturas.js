/* =========================================================
   /api/coberturas — tarjetas en HTML para "Ver más" y la portada.
   Mismos parámetros que /coberturas, más:
     limite (1–24), formato=video (tarjetas de video), con_video=1
   Respeta RLS: solo contenido publicado.
   ========================================================= */
import { catalogos, leerFiltros, buscar, POR_PAGINA } from "../_lib/datos.js";
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
    const f = leerFiltros(url, cat);
    const limite = Math.min(Math.max(parseInt(url.searchParams.get("limite") || String(POR_PAGINA), 10) || POR_PAGINA, 1), POR_PAGINA);
    const conVideo = url.searchParams.get("con_video") === "1" ? true : null;
    const offset = (f.pagina - 1) * limite;
    const r = await buscar(ctx, cat, f.args, { limite, offset, conVideo });
    const video = url.searchParams.get("formato") === "video";
    return json({
      total: r.total,
      cantidad: r.items.length,
      hayMas: offset + r.items.length < r.total,
      html: r.items.map((t) => (video ? tarjetaVideo(t) : tarjeta(t))).join("")
    });
  } catch (error) {
    console.error("api/coberturas:", error.message);
    return json({ total: 0, cantidad: 0, hayMas: false, html: "", error: "No disponible" }, 503);
  }
}
