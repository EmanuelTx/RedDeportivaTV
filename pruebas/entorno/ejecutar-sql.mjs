// Ejecuta SQL SOLO en el proyecto de PRUEBAS (pooler de sesión de Supabase).
//   node ejecutar-sql.mjs --sql "select 1"
//   node ejecutar-sql.mjs --archivo ../../supabase/migraciones/....sql
// Protecciones: usuario y host fijos al proyecto de pruebas; rechaza cualquier texto
// que mencione la referencia de producción; la contraseña sale del Administrador
// de credenciales de Windows.
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import pg from "pg";
import { REF_PRUEBAS, REF_PRODUCCION, leerSecreto, sinProduccion } from "./proyecto.mjs";

const HOSTS = ["aws-1-sa-east-1.pooler.supabase.com", "aws-0-sa-east-1.pooler.supabase.com"];

/* Comprobación de la identidad REAL de la base (no solo del nombre de usuario):
   la base de pruebas lleva una marca propia con la referencia del proyecto.
   Si falta (primera vez) se crea; si existe con otro valor, se aborta. */
async function verificarIdentidad(c) {
  await c.query("create schema if not exists private");
  await c.query("create table if not exists private.entorno_pruebas (ref text primary key)");
  const { rows } = await c.query("select ref from private.entorno_pruebas");
  if (rows.length === 0) await c.query("insert into private.entorno_pruebas values ($1)", [REF_PRUEBAS]);
  else if (rows.length !== 1 || rows[0].ref !== REF_PRUEBAS) throw new Error("BLOQUEADO: la base conectada no es la de pruebas.");
  const m = await c.query("select count(*)::int n from information_schema.tables where table_schema='private' and table_name='entorno_pruebas'");
  if (m.rows[0].n !== 1) throw new Error("BLOQUEADO: marca de entorno ausente.");
}

export async function conectar() {
  const s = leerSecreto("RDTV-pruebas-db");
  if (!s) throw new Error("Falta la contraseña de pruebas. Ejecutá configurar-credenciales.ps1 (una sola vez).");
  sinProduccion(s.usuario);
  if (s.usuario !== `postgres.${REF_PRUEBAS}`) throw new Error("Usuario inesperado: no es el de pruebas.");
  let ultimo;
  for (const host of HOSTS) {
    sinProduccion(host);
    const cliente = new pg.Client({ host, port: 5432, user: s.usuario, password: s.clave, database: "postgres",
      ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 12000, application_name: "rdtv-pruebas" });
    try { await cliente.connect(); await verificarIdentidad(cliente); return cliente; }
    catch (e) { ultimo = e; try { await cliente.end(); } catch {} if (/BLOQUEADO/.test(e.message)) throw e; }
  }
  throw new Error("No se pudo conectar: " + (ultimo && ultimo.message));
}

export async function ejecutar(sql) {
  sinProduccion(sql);
  const cliente = await conectar();
  try { return await cliente.query({ text: sql, rowMode: undefined }); } finally { await cliente.end(); }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const a = process.argv.slice(2);
  const i = a.indexOf("--archivo"), j = a.indexOf("--sql");
  const sql = i >= 0 ? fs.readFileSync(a[i + 1], "utf8") : j >= 0 ? a[j + 1] : null;
  if (!sql) { console.error("Uso: --sql \"...\"  |  --archivo ruta.sql"); process.exit(2); }
  try {
    const r = await ejecutar(sql);
    for (const x of Array.isArray(r) ? r : [r]) {
      if (x.rows && x.rows.length) console.table(x.rows); else console.log(`(${x.command} ${x.rowCount ?? 0})`);
    }
  } catch (e) { console.error("ERROR:", e.message); process.exit(1); }
}
