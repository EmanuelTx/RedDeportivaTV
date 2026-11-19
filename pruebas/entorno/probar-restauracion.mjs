// Ensayo de restauración de un respaldo de producción, SOLO en el proyecto de PRUEBAS y sin tocar sus datos:
//  1) comprueba que cada archivo del respaldo coincide con su huella SHA-256;
//  2) carga todas las tablas en un esquema temporal `ensayo_rest` y compara fila por fila con el respaldo;
//  3) revisa la integridad referencial (sin huérfanos) y que cada foto tenga sus archivos;
//  4) borra el esquema temporal.
//   node probar-restauracion.mjs <carpeta-del-respaldo>
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { conectar } from "./ejecutar-sql.mjs";

const carpeta = path.resolve(process.argv[2] || "");
if (!process.argv[2] || !fs.existsSync(path.join(carpeta, "datos.json"))) { console.error("Uso: node probar-restauracion.mjs <carpeta-del-respaldo>"); process.exit(2); }
const datos = JSON.parse(fs.readFileSync(path.join(carpeta, "datos.json"), "utf8"));
const man = JSON.parse(fs.readFileSync(path.join(carpeta, "manifiesto.json"), "utf8"));
let fallos = 0;
const rep = (ok, t) => { if (!ok) fallos++; console.log((ok ? "  OK  " : "FALLA ") + t); };

// ---- 1. Archivos ----
let malos = 0;
for (const a of man.archivos) {
  const f = path.join(carpeta, "archivos", a.bucket, ...a.ruta.split("/"));
  const ok = fs.existsSync(f) && crypto.createHash("sha256").update(fs.readFileSync(f)).digest("hex") === a.sha256;
  if (!ok) { malos++; console.log("      archivo dañado o ausente: " + a.bucket + "/" + a.ruta); }
}
rep(malos === 0, `Archivos del respaldo íntegros: ${man.archivos.length} (${(man.total_bytes / 1024 / 1024).toFixed(1)} MB), huellas SHA-256 coinciden`);
rep((man.problemas || []).length === 0 && (man.errores || []).length === 0, "El respaldo no registró errores ni fotos sin archivo");

// ---- 2. Tablas ----
const norm = (v) => (typeof v === "string" && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d/.test(v) ? new Date(v).toISOString() : v);
const igual = (a, b) => JSON.stringify(Object.keys(a).sort().map((k) => [k, norm(a[k])])) === JSON.stringify(Object.keys(b).sort().map((k) => [k, norm(b[k])]));
const c = await conectar();
try {
  await c.query("drop schema if exists ensayo_rest cascade");
  await c.query("create schema ensayo_rest");
  const orden = ["campeonatos", "categorias", "jornadas", "partidos", "albumes", "fotos", "noticias", "transmisiones", "administradores"];
  for (const t of orden) {
    const cols = (await c.query("select column_name from information_schema.columns where table_schema='public' and table_name=$1 and is_generated='NEVER' and generation_expression is null order by ordinal_position", [t])).rows.map((r) => r.column_name);
    await c.query(`create table ensayo_rest.${t} as select ${cols.map((x) => '"' + x + '"').join(",")} from public.${t} with no data`);
    const fuente = datos[t].map((fila) => Object.fromEntries(cols.filter((k) => k in fila).map((k) => [k, fila[k]])));
    await c.query(`insert into ensayo_rest.${t} select * from jsonb_populate_recordset(null::ensayo_rest.${t}, $1::jsonb)`, [JSON.stringify(fuente)]);
    const rest = (await c.query(`select to_jsonb(r) j from ensayo_rest.${t} r`)).rows.map((r) => r.j);
    const clave = t === "administradores" ? "user_id" : "id";
    const mapa = new Map(rest.map((r) => [r[clave], r]));
    const distintas = fuente.filter((f) => !mapa.has(f[clave]) || !igual(f, Object.fromEntries(Object.keys(f).map((k) => [k, mapa.get(f[clave])[k]])))).length;
    rep(rest.length === fuente.length && rest.length === man.tablas[t] && distintas === 0, `Tabla ${t}: ${rest.length} filas restauradas, idénticas al respaldo`);
  }
  // ---- 3. Integridad referencial y archivos ----
  const h = async (sql) => Number((await c.query(sql)).rows[0].n);
  rep((await h("select count(*)::int n from ensayo_rest.fotos f left join ensayo_rest.albumes a on a.id=f.album_id where a.id is null")) === 0, "Sin fotos huérfanas (todas pertenecen a una cobertura)");
  rep((await h("select count(*)::int n from ensayo_rest.albumes a where a.campeonato_id is not null and not exists (select 1 from ensayo_rest.campeonatos x where x.id=a.campeonato_id)")) === 0, "Sin coberturas con campeonato inexistente");
  rep((await h("select count(*)::int n from ensayo_rest.partidos p where p.jornada_id is not null and not exists (select 1 from ensayo_rest.jornadas x where x.id=p.jornada_id)")) === 0, "Sin partidos con jornada inexistente");
  const rutas = new Set(man.archivos.map((a) => a.ruta));
  const sinArchivo = datos.fotos.filter((f) => !rutas.has(f.path) || (f.mini_path && !rutas.has(f.mini_path))).length;
  rep(sinArchivo === 0, `Cada foto (${datos.fotos.length}) tiene su archivo y miniatura en el respaldo`);
  const slugs = datos.albumes.map((a) => a.slug).concat(datos.noticias.map((n) => "n:" + n.slug));
  console.log(`      enlaces conservados: ${datos.albumes.length} coberturas y ${datos.noticias.length} noticias con su dirección original`);
} finally {
  await c.query("drop schema if exists ensayo_rest cascade").catch(() => {});
  await c.end();
}
console.log(fallos ? `\n${fallos} problema(s): el respaldo NO es confiable.` : "\nRestauración ensayada: el respaldo se puede recuperar completo.");
process.exit(fallos ? 1 : 0);
