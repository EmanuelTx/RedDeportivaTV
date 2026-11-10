/* La documentación interna no es una página pública: responder 404. */
import { paginaNoEncontrada } from "../_lib/plantilla.js";

export function onRequest(ctx) {
  return paginaNoEncontrada(ctx);
}
