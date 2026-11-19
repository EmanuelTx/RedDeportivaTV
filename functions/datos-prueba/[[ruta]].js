/* Los datos de prueba no son públicos. Las Functions los leen internamente con ASSETS.fetch (no pasa por aquí). */
import { paginaNoEncontrada } from "../_lib/plantilla.js";

export function onRequest(ctx) {
  return paginaNoEncontrada(ctx);
}
