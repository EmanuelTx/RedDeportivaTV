/* Archivo histórico: /coberturas/archivo (años y meses según la fecha real) */
import { archivo } from "../_lib/datos.js";
import { paginaArchivo, paginaError } from "../_lib/plantilla.js";

export async function onRequestGet(ctx) {
  try {
    return paginaArchivo(ctx, await archivo(ctx));
  } catch (error) {
    console.error("archivo:", error);
    return paginaError(ctx);
  }
}

export const onRequestHead = onRequestGet;
