/* =========================================================
   /api/videos?limite=4 — videos para la sección "Videos" de la portada:
   el video resumen de cada día y los videos propios de partidos, sin
   repetir ninguno, del más reciente al más antiguo (por fecha real).
   Devuelve datos (no HTML) para que la portada mezcle estos videos con
   los fijos de js/data.js sin duplicados. Respeta RLS.
   ========================================================= */
import { catalogos, videosPublicos } from "../_lib/datos.js";

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
    const limite = Math.min(Math.max(parseInt(new URL(ctx.request.url).searchParams.get("limite") || "4", 10) || 4, 1), 12);
    const cat = await catalogos(ctx);
    return json({ videos: await videosPublicos(ctx, cat, limite) });
  } catch (error) {
    console.error("api/videos:", error.message);
    return json({ videos: [], error: "No disponible" }, 503);
  }
}
