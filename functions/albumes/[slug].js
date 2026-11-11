/* Enlaces antiguos /albumes/<slug> → /coberturas/<slug> (misma dirección corta). */
import { slugValido } from "../_lib/datos.js";
import { paginaNoEncontrada } from "../_lib/plantilla.js";

export function onRequestGet(ctx) {
  const slug = String(ctx.params.slug || "").toLowerCase();
  if (!slugValido(slug)) return paginaNoEncontrada(ctx);
  const destino = new URL("/coberturas/" + slug, ctx.request.url);
  return new Response(null, { status: 301, headers: { Location: destino.href, "Cache-Control": "public, max-age=3600" } });
}

export const onRequestHead = onRequestGet;
