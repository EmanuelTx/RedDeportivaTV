/* =========================================================
   /api/config — configuración PÚBLICA para el panel de administración.

   Entrega la URL del proyecto y la clave publicable (sb_publishable_...),
   que se configuran como variables en Cloudflare para no guardarlas en
   GitHub. Ambas son públicas por diseño (cualquier navegador que use el
   panel las necesita); la seguridad la dan RLS y el inicio de sesión.
   Nunca entrega claves secretas: configSupabase() las rechaza.
   ========================================================= */
import { configSupabase } from "../_lib/datos.js";

function json(cuerpo, estado) {
  return new Response(JSON.stringify(cuerpo), {
    status: estado,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "X-Robots-Tag": "noindex, nofollow"
    }
  });
}

export function onRequestGet(ctx) {
  try {
    const cfg = configSupabase(ctx.env);
    if (!cfg) return json({ configurado: false }, 503);
    return json({ configurado: true, supabaseUrl: cfg.url, supabaseKey: cfg.clave }, 200);
  } catch (error) {
    console.error("config:", error.message);
    return json({ configurado: false, error: "Configuración inválida" }, 500);
  }
}
