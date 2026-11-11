/* =========================================================
   /api/youtube?id=<11 caracteres> — comprobación ORIENTATIVA para el panel.
   Usa el servicio público oEmbed de YouTube (sin clave ni costo).
   - existe: false → el video no existe, es privado o el ID está mal.
   - existe: true  → existe y es público o no listado.
   No garantiza que se pueda insertar en la web: por eso la web siempre
   ofrece además "Ver en YouTube".
   ========================================================= */

export async function onRequestGet(ctx) {
  const id = new URL(ctx.request.url).searchParams.get("id") || "";
  const cabeceras = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex" };
  if (!/^[A-Za-z0-9_-]{11}$/.test(id)) {
    return new Response(JSON.stringify({ valido: false }), { status: 400, headers: cabeceras });
  }
  try {
    const r = await fetch("https://www.youtube.com/oembed?format=json&url=" +
      encodeURIComponent("https://www.youtube.com/watch?v=" + id), { headers: { Accept: "application/json" } });
    if (r.ok) {
      const d = await r.json();
      return new Response(JSON.stringify({ valido: true, existe: true, titulo: d.title || "", canal: d.author_name || "" }), { headers: cabeceras });
    }
    // 401/403: existe pero restringe la inserción; 404/400: no existe o es privado
    const existe = r.status === 401 || r.status === 403;
    return new Response(JSON.stringify({ valido: true, existe, restringido: existe, estado: r.status }), { headers: cabeceras });
  } catch (_) {
    return new Response(JSON.stringify({ valido: true, existe: null }), { status: 502, headers: cabeceras });
  }
}
