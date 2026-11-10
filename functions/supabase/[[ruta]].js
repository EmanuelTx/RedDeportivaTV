/* Los archivos SQL del repositorio no son páginas públicas: responder 404. */
import { paginaNoEncontrada } from "../_lib/plantilla.js";

export function onRequest(ctx) {
  return paginaNoEncontrada(ctx);
}
