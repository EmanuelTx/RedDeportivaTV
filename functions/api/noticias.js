/* =========================================================
   /api/noticias — tarjetas de noticias en HTML.
     limite (1–12) · pagina (para "Ver más")
   Respeta RLS: solo noticias publicadas. Se usa en la portada
   ("Últimas noticias") y en "Ver más" del listado.
   ========================================================= */
import { listarNoticias } from "../_lib/datos.js";
import { tarjetaNoticia } from "../_lib/plantilla.js";

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
    const limite = Math.min(Math.max(parseInt(url.searchParams.get("limite") || "9", 10) || 9, 1), 12);
    const pagina = Math.min(Math.max(parseInt(url.searchParams.get("pagina") || "1", 10) || 1, 1), 50);
    const offset = (pagina - 1) * limite;
    const r = await listarNoticias(ctx, { limite, offset });
    return json({
      total: r.total,
      cantidad: r.items.length,
      hayMas: offset + r.items.length < r.total,
      html: r.items.map((n) => tarjetaNoticia(n)).join("")
    });
  } catch (error) {
    console.error("api/noticias:", error.message);
    return json({ total: 0, cantidad: 0, hayMas: false, html: "", error: "No disponible" }, 503);
  }
}
