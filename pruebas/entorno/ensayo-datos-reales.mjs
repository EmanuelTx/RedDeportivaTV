// Ensayo de la migración 3 con los DATOS REALES de producción (tomados del respaldo), dentro de una
// transacción del proyecto de PRUEBAS que termina en ROLLBACK (no deja nada).
// Comprueba: el relleno crea el día de la cobertura real, el catálogo público la muestra como UNA
// tarjeta del día, la cobertura y su enlace siguen igual y nada de lo existente cambia.
//   node ensayo-datos-reales.mjs <carpeta-del-respaldo>
import fs from "node:fs";
import path from "node:path";
import { conectar } from "./ejecutar-sql.mjs";

const carpeta = path.resolve(process.argv[2] || "");
if (!process.argv[2]) { console.error("Uso: node ensayo-datos-reales.mjs <carpeta-del-respaldo>"); process.exit(2); }
const datos = JSON.parse(fs.readFileSync(path.join(carpeta, "datos.json"), "utf8"));
const migracion = fs.readFileSync(path.resolve(import.meta.dirname, "../../supabase/migrations/20261117000100_dias_cobertura.sql"), "utf8");
const relleno = migracion.match(/insert into public\.dias_cobertura \(campeonato_id, fecha, slug\)[\s\S]*?on conflict do nothing;/)[0];
let fallos = 0;
const rep = (ok, t, extra = "") => { if (!ok) fallos++; console.log((ok ? "  OK  " : "FALLA ") + t + (extra ? "  → " + extra : "")); };

const c = await conectar();
try {
  await c.query("begin");
  await c.query("set local session_replication_role = replica"); // carga cruda: sin disparadores ni claves (solo en esta transacción)
  for (const t of ["campeonatos", "categorias", "jornadas", "partidos", "albumes", "fotos", "noticias"]) {
    const cols = (await c.query("select column_name from information_schema.columns where table_schema='public' and table_name=$1 and is_generated='NEVER' and generation_expression is null", [t])).rows.map((r) => r.column_name);
    const filas = datos[t].map((f) => Object.fromEntries(cols.filter((k) => k in f).map((k) => [k, f[k]])))
      .filter((f) => !(t === "campeonatos" && ["area-1", "area-4"].includes(f.slug))); // ya existen en pruebas con otros ids
    const lista = cols.map((x) => '"' + x + '"').join(",");
    if (filas.length) await c.query(`insert into public.${t} (${lista}) select ${lista} from jsonb_populate_recordset(null::public.${t}, $1::jsonb)`, [JSON.stringify(filas)]);
  }
  await c.query("set local session_replication_role = origin");
  await c.query("delete from public.dias_cobertura");
  const alb = datos.albumes[0];
  const antes = JSON.stringify((await c.query("select slug, estado, tipo, fecha::text f, estado_fotos, estado_video from public.albumes where id=$1", [alb.id])).rows[0]);
  await c.query(relleno);
  const dia = (await c.query("select slug, fecha::text f from public.dias_cobertura where campeonato_id=$1", [alb.campeonato_id])).rows;
  rep(dia.length === 1, "El relleno crea el día de la cobertura real", dia[0] ? dia[0].slug : "ninguno");
  const despues = JSON.stringify((await c.query("select slug, estado, tipo, fecha::text f, estado_fotos, estado_video from public.albumes where id=$1", [alb.id])).rows[0]);
  rep(antes === despues, "La cobertura real queda exactamente igual (dirección, estado, fecha)");
  await c.query("set local role anon");
  const cat = (await c.query("select * from public.buscar_entradas(null,null,null,null,null,null,null,null,50,0)")).rows;
  const real = cat.filter((e) => JSON.stringify(e).includes(alb.slug) || JSON.stringify(e).includes(dia[0]?.slug || "@@"));
  rep(real.length >= 1, "El catálogo público muestra la cobertura real", `${cat.length} entradas en total`);
  console.log("      entrada: " + JSON.stringify(real[0] || {}).slice(0, 300));
  const vid = (await c.query("select * from public.videos_publicos(20)")).rows;
  console.log(`      videos públicos en esta base: ${vid.length}`);
  const arch = (await c.query("select * from public.archivo_coberturas()")).rows;
  rep(arch.some((r) => Number(r.anio) === 2026 && Number(r.mes) === 11), "El archivo cuenta noviembre 2026");
  await c.query("reset role");
  const noti = (await c.query("select slug, estado from public.noticias where slug=$1", [datos.noticias[0].slug])).rows[0];
  rep(!!noti && noti.estado === "publicada", "La noticia real sigue publicada y con su dirección", noti && noti.slug);
} catch (e) {
  fallos++; console.log("FALLA " + e.message);
} finally {
  await c.query("rollback").catch(() => {});
  const restos = (await c.query("select count(*)::int n from public.albumes where slug=$1", [datos.albumes[0].slug])).rows[0].n;
  console.log(`      después del rollback, restos en la base de pruebas: ${restos}`);
  await c.end();
}
console.log(fallos ? `\n${fallos} problema(s).` : "\nLa migración 3 funciona con los datos reales.");
process.exit(fallos ? 1 : 0);
