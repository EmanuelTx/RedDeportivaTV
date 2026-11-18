/* =========================================================
   /api/en-vivo — transmisión EN VIVO vigente (si hay).
   Las reglas RLS solo devuelven transmisiones con en_vivo = true y sin
   hora de fin vencida. Se guarda en caché 30 segundos.
   ========================================================= */
import { configSupabase } from "../_lib/datos.js";

/* ID del video de un enlace de YouTube (watch?v=, youtu.be/, /live/, /embed/, /shorts/). */
function idYoutube(texto) {
  const valido = (id) => (/^[A-Za-z0-9_-]{11}$/.test(id || "") ? id : null);
  try {
    const u = new URL(String(texto || "").trim());
    const host = u.hostname.replace(/^(www|m|music)\./, "");
    if (host === "youtu.be") return valido(u.pathname.slice(1).split("/")[0]);
    if (host === "youtube.com" || host === "youtube-nocookie.com") {
      if (u.searchParams.get("v")) return valido(u.searchParams.get("v"));
      const m = u.pathname.match(/^\/(?:live|shorts|embed|v)\/([A-Za-z0-9_-]{11})/);
      if (m) return m[1];
    }
  } catch (_) { /* no es una URL */ }
  return null;
}

function json(cuerpo, segundos) {
  return new Response(JSON.stringify(cuerpo), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": segundos ? "public, max-age=" + segundos : "no-store",
      "X-Content-Type-Options": "nosniff"
    }
  });
}

export async function onRequestGet(ctx) {
  try {
    const cfg = configSupabase(ctx.env);
    if (!cfg) return json({ en_vivo: [] }, 30);
    const h = { apikey: cfg.clave, Accept: "application/json", "Accept-Profile": "public" };
    if (cfg.clave.startsWith("eyJ")) h.Authorization = "Bearer " + cfg.clave;
    const r = await fetch(cfg.url + "/rest/v1/transmisiones?select=titulo,youtube_url,termina_en&limit=3", { headers: h });
    if (!r.ok) throw new Error("Supabase respondió " + r.status);
    const filas = await r.json();
    const ahora = Date.now();
    const vigentes = filas
      .filter((t) => /^https:\/\/(www\.|m\.)?(youtube\.com|youtu\.be)\//.test(t.youtube_url))
      .filter((t) => !t.termina_en || Date.parse(t.termina_en) > ahora)
      .map((t) => ({ titulo: t.titulo, url: t.youtube_url, id: idYoutube(t.youtube_url) }));
    return json({ en_vivo: vigentes }, 30);
  } catch (error) {
    console.error("en-vivo:", error.message);
    return json({ en_vivo: [] }, 0); // si falla, la web sigue normal sin aviso
  }
}
