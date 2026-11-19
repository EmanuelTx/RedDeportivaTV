/* Archivo interno del repositorio: no es una página pública. Responder 404. */
import { paginaNoEncontrada } from "./_lib/plantilla.js";

export function onRequest(ctx) {
  return paginaNoEncontrada(ctx);
}
