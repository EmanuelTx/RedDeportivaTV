// Acciones del panel ejecutadas con su propio código (mismo camino que los botones).
import { ejecutar } from "./ejecutar-sql.mjs";
import { abrir, iniciarSesionAdmin } from "./navegador.mjs";

/** Elimina coberturas de PRUEBA cuyo slug empieza con `prefijo` (despublica, borra archivos y filas). */
export async function borrarCoberturas(prefijo) {
  const ids = (await ejecutar("select id from albumes where slug like $$" + prefijo.replace(/[^a-z0-9-]/g, "") + "%$$")).rows.map((r) => r.id);
  if (!ids.length) return 0;
  const nav = await abrir({ conSesion: true });
  try {
    const p = await nav.contexto.newPage();
    await iniciarSesionAdmin(p, nav.contexto);
    await p.evaluate(async (lista) => {
      const { app } = await import("/admin/js/estado.js");
      const F = await import("/js/admin/fotos-publicacion.js");
      for (const id of lista) await F.borrarPublicacion(app.sb, "albumes", id);
    }, ids);
  } finally { await nav.cerrar(); }
  return ids.length;
}
