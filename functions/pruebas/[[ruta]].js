/* Las herramientas de prueba no se publican: responder 404.
   Se ejecutan solo en localhost. */
import { paginaNoEncontrada } from "../_lib/plantilla.js";

export function onRequest(ctx) {
  return paginaNoEncontrada(ctx);
}
