// Complemento del respaldo: copia de la BASE de producción con datos que la sesión administrativa no ve
// (cuentas de acceso, administradores, registro de migraciones, metadatos de Storage) y la estructura
// (definiciones de tablas, restricciones, índices, políticas, funciones, disparadores y permisos).
// SOLO LECTURA (la sesión es READ ONLY). Los datos son sensibles (incluye huellas de contraseñas): quedan en
// respaldos/ (ignorado por git). Uso:  node respaldo-completo-db.mjs <carpeta-del-respaldo>
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { conectarProduccion } from "./produccion-sql.mjs";

const carpeta = path.resolve(process.argv[2] || "");
if (!process.argv[2] || !fs.existsSync(carpeta)) { console.error("Uso: node respaldo-completo-db.mjs <carpeta-del-respaldo>"); process.exit(2); }
const salida = path.join(carpeta, "base");
fs.mkdirSync(salida, { recursive: true });
const c = await conectarProduccion(); // solo lectura
const resumen = { creado: new Date().toISOString(), tablas: {}, estructura: {} };
const guardar = (nombre, valor) => {
  const texto = typeof valor === "string" ? valor : JSON.stringify(valor, null, 1);
  fs.writeFileSync(path.join(salida, nombre), texto);
  return crypto.createHash("sha256").update(texto).digest("hex").slice(0, 16);
};
try {
  // ---- Datos: todas las tablas de public, private, auth (usuarios) y storage (metadatos) ----
  const tablas = (await c.query(`
    select table_schema s, table_name t from information_schema.tables
    where table_type='BASE TABLE' and ((table_schema in ('public','private')) or (table_schema='auth' and table_name in ('users','identities'))
          or (table_schema='storage' and table_name in ('buckets','objects')))
    order by 1,2`)).rows;
  for (const { s, t } of tablas) {
    const filas = (await c.query(`select to_jsonb(x) j from ${s}.${t} x`)).rows.map((r) => r.j);
    const h = guardar(`datos_${s}.${t}.json`, filas);
    resumen.tablas[`${s}.${t}`] = { filas: filas.length, huella: h };
    console.log(`  ${(s + "." + t).padEnd(34)} ${String(filas.length).padStart(4)} filas`);
  }
  // ---- Estructura ----
  const q = async (nombre, sql) => { const r = (await c.query(sql)).rows; resumen.estructura[nombre] = { filas: r.length, huella: guardar(`estructura_${nombre}.json`, r) }; };
  await q("columnas", `select table_schema, table_name, column_name, data_type, is_nullable, column_default, is_generated, generation_expression
    from information_schema.columns where table_schema in ('public','private') order by 1,2,ordinal_position`);
  await q("restricciones", `select conrelid::regclass::text tabla, conname, pg_get_constraintdef(oid) def from pg_constraint
    where connamespace in ('public'::regnamespace,'private'::regnamespace) order by 1,2`);
  await q("indices", `select schemaname, tablename, indexname, indexdef from pg_indexes where schemaname in ('public','private') order by 1,2,3`);
  await q("politicas", `select schemaname, tablename, policyname, cmd, roles, qual, with_check from pg_policies where schemaname in ('public','storage') order by 1,2,3`);
  await q("funciones", `select n.nspname s, p.proname f, pg_get_function_identity_arguments(p.oid) args, p.prosecdef security_definer, pg_get_functiondef(p.oid) def
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private') order by 1,2,3`);
  await q("disparadores", `select tgrelid::regclass::text tabla, tgname, pg_get_triggerdef(oid) def from pg_trigger where not tgisinternal
    and tgrelid::regclass::text !~ '^(auth|storage|realtime|vault|extensions)\\.' order by 1,2`);
  await q("permisos_tablas", `select table_schema, table_name, grantee, privilege_type from information_schema.role_table_grants
    where table_schema in ('public','private') and grantee in ('anon','authenticated') order by 1,2,3,4`);
  await q("permisos_columnas", `select table_schema, table_name, column_name, grantee, privilege_type from information_schema.column_privileges
    where table_schema='public' and grantee in ('anon','authenticated') order by 1,2,3,4,5`);
  await q("rls", `select schemaname, tablename, rowsecurity from pg_tables where schemaname in ('public','private') order by 1,2`);
  await q("extensiones", `select extname, extversion from pg_extension order by 1`);
  resumen.version = (await c.query("select version() v")).rows[0].v;
} finally { await c.end(); }
fs.writeFileSync(path.join(salida, "resumen.json"), JSON.stringify(resumen, null, 1));
console.log(`\nCopia de la base guardada en ${salida}`);
