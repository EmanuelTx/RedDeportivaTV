// Acceso SQL a PRODUCCIÓN con reglas estrictas (usar solo con autorización de la persona responsable).
//   node produccion-sql.mjs --leer "select 1"                 → solo lectura (transacción READ ONLY)
//   node produccion-sql.mjs --aplicar-migracion <archivo.sql>  → solo si la huella SHA-256 está aprobada
// Reglas:
//  - La contraseña sale del Administrador de credenciales (RDTV-produccion-db); nunca de archivos.
//  - Se comprueba la identidad REAL de la base: usuario del proyecto + la cobertura real conocida + registro de migraciones.
//  - Lectura: la sesión entera es de solo lectura (Postgres rechaza cualquier escritura).
//  - Escritura: únicamente archivos de supabase/migrations/ cuya huella figure en APROBADAS, en UNA transacción,
//    y solo si la migración anterior está aplicada y la nueva no.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { pathToFileURL } from "node:url";
import pg from "pg";
import { AQUI, REF_PRODUCCION, leerSecreto } from "./proyecto.mjs";

const REGIONES = ["aws-1-sa-east-1", "aws-0-sa-east-1", "aws-1-us-east-1", "aws-0-us-east-1", "aws-1-us-east-2", "aws-0-us-east-2", "aws-1-eu-west-1", "aws-0-eu-west-1"];
// Huellas SHA-256 (primeros 16 caracteres) de las migraciones aprobadas para producción.
export const APROBADAS = JSON.parse(fs.readFileSync(path.join(AQUI, "migraciones-aprobadas.json"), "utf8"));
const COBERTURA_REAL = "torneo-integracion-de-la-plaza-san-isidro-libre-sport-caaguazu-vs-san-luis";

export const huella = (texto) => crypto.createHash("sha256").update(texto).digest("hex").slice(0, 16);

export async function conectarProduccion({ escritura = false } = {}) {
  const s = leerSecreto("RDTV-produccion-db");
  if (!s) throw new Error("Falta la contraseña de producción: ejecutá configurar-credenciales-produccion.ps1 (una vez).");
  if (s.usuario !== `postgres.${REF_PRODUCCION}`) throw new Error("Usuario inesperado.");
  let ultimo;
  for (const region of REGIONES) {
    const c = new pg.Client({ host: `${region}.pooler.supabase.com`, port: 5432, user: s.usuario, password: s.clave, database: "postgres",
      ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 10000, application_name: "rdtv-produccion" });
    try {
      await c.connect();
      if (!escritura) await c.query("set session characteristics as transaction read only");
      // Identidad real
      const m = (await c.query("select nombre from private.migraciones")).rows.map((r) => r.nombre);
      const real = (await c.query("select count(*)::int n from public.albumes where slug=$1", [COBERTURA_REAL])).rows[0].n;
      if (!m.includes("20261111000100_coberturas") || real !== 1) throw new Error("BLOQUEADO: la base conectada no parece ser la de producción.");
      c.migraciones = m;
      return c;
    } catch (e) {
      ultimo = e; try { await c.end(); } catch { /* */ }
      if (/BLOQUEADO|password authentication|contraseña/i.test(e.message)) throw e;
    }
  }
  throw new Error("No se pudo conectar a producción: " + (ultimo && ultimo.message));
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const a = process.argv.slice(2);
  try {
    if (a[0] === "--leer") {
      const c = await conectarProduccion();
      try {
        const r = await c.query(a[1]);
        for (const x of Array.isArray(r) ? r : [r]) { if (x.rows && x.rows.length) console.table(x.rows); else console.log(`(${x.command} ${x.rowCount ?? 0})`); }
      } finally { await c.end(); }
    } else if (a[0] === "--aplicar-migracion") {
      const archivo = path.resolve(a[1]);
      if (path.dirname(archivo) !== path.resolve(AQUI, "../../supabase/migrations")) throw new Error("BLOQUEADO: solo archivos de supabase/migrations/.");
      const sql = fs.readFileSync(archivo, "utf8");
      const h = huella(sql);
      if (!APROBADAS.includes(h)) throw new Error(`BLOQUEADO: huella ${h} no aprobada.`);
      const c = await conectarProduccion({ escritura: true });
      try {
        const nombre = path.basename(archivo, ".sql");
        if (c.migraciones.includes(nombre)) throw new Error("La migración ya está aplicada.");
        console.log(`Aplicando ${nombre} (huella ${h}) en UNA transacción…`);
        await c.query(sql); // el archivo trae su propio begin/commit
        const despues = (await c.query("select nombre from private.migraciones order by aplicada_en")).rows.map((r) => r.nombre);
        console.log("Migraciones registradas:", despues.join(", "));
        if (!despues.includes(nombre)) throw new Error("La migración no quedó registrada.");
      } finally { await c.end(); }
    } else if (a[0] === "--verificar") {
      // Verificaciones de seguridad: crean datos de prueba DENTRO de una transacción que termina en ROLLBACK.
      const archivo = path.resolve(a[1]);
      if (path.dirname(archivo) !== path.resolve(AQUI, "../../supabase/verificaciones")) throw new Error("BLOQUEADO: solo archivos de supabase/verificaciones/.");
      const sql = fs.readFileSync(archivo, "utf8");
      const sinComentarios = sql.replace(/--[^\n]*/g, "");
      if (!/\brollback\s*;\s*$/i.test(sinComentarios.trim()) || /\bcommit\b/i.test(sinComentarios)) throw new Error("BLOQUEADO: la verificación no termina en rollback o contiene commit.");
      const c = await conectarProduccion({ escritura: true });
      try {
        const antes = (await c.query("select (select count(*) from public.albumes)::int a, (select count(*) from public.fotos)::int f, (select count(*) from public.partidos)::int p, (select count(*) from public.dias_cobertura)::int d, (select count(*) from auth.users)::int u")).rows[0];
        let r;
        try { r = await c.query(sql); } finally { await c.query("rollback").catch(() => {}); }
        const filas = (Array.isArray(r) ? r.filter((x) => x.rows && x.rows.length && "ok" in x.rows[0]).pop() : r).rows;
        const falla = filas.filter((x) => x.ok === false);
        console.log(`Pruebas: ${filas.length - 1 > 0 ? filas.length : filas.length}  ·  fallidas: ${falla.length}`);
        console.log((filas.find((x) => /RESUMEN/.test(x.prueba || "")) || {}).prueba || "");
        for (const f of falla.slice(0, 20)) console.log("  FALLA: " + f.prueba + " → esperado " + f.esperado + " / obtenido " + f.obtenido);
        const despues = (await c.query("select (select count(*) from public.albumes)::int a, (select count(*) from public.fotos)::int f, (select count(*) from public.partidos)::int p, (select count(*) from public.dias_cobertura)::int d, (select count(*) from auth.users)::int u")).rows[0];
        const igual = JSON.stringify(antes) === JSON.stringify(despues);
        console.log("Conteos antes → después:", JSON.stringify(antes), "→", JSON.stringify(despues), igual ? "(sin cambios: rollback correcto)" : "¡CAMBIARON!");
        if (!igual || falla.length) process.exitCode = 1;
      } finally { await c.end(); }
    } else { console.error("Uso: --leer \"sql\" | --aplicar-migracion archivo.sql"); process.exit(2); }
  } catch (e) { console.error("ERROR:", e.message); process.exit(1); }
}
