// Respaldo COMPLETO de producción en modo SOLO LECTURA (datos + fotos + manifiesto con huellas SHA-256).
//   node respaldar-produccion.mjs [etiqueta]
// Requiere la sesión guardada por iniciar-sesion-produccion.mjs. No escribe nada en producción:
// toda petición pasa por produccion.pedir(), que solo admite GET.
// Resultado: respaldos/<fecha>_<etiqueta>/ (carpeta ignorada por git; contiene datos reales: no subir a GitHub).
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { pedir, URL_PRODUCCION } from "./produccion.mjs";
import { AQUI } from "./proyecto.mjs";

const etiqueta = process.argv[2] || "antes_migracion_3";
const hoy = new Date().toISOString().slice(0, 10);
const RAIZ = path.resolve(AQUI, "..", "..");
const destino = path.join(RAIZ, "respaldos", `${hoy}_${etiqueta}`);
fs.mkdirSync(path.join(destino, "archivos"), { recursive: true });

const TABLAS = ["campeonatos", "categorias", "jornadas", "partidos", "albumes", "fotos", "noticias", "transmisiones", "administradores"];
const sha = (b) => crypto.createHash("sha256").update(b).digest("hex");

// ---------- 1. Tablas (con paginación) ----------
const datos = {};
for (const t of TABLAS) {
  const filas = [];
  for (let desde = 0; ; desde += 1000) {
    const r = await pedir(`/rest/v1/${t}?select=*&order=id.asc`.replace("order=id.asc", t === "administradores" ? "order=user_id.asc" : "order=id.asc"), { cabeceras: { Range: `${desde}-${desde + 999}`, "Range-Unit": "items" } });
    if (!r.ok && r.status !== 206) throw new Error(`No se pudo leer ${t}: ${r.status} ${(await r.text()).slice(0, 200)}`);
    const lote = await r.json();
    filas.push(...lote);
    if (lote.length < 1000) break;
  }
  datos[t] = filas;
  console.log(`  tabla ${t}: ${filas.length} filas`);
}

// ---------- 2. Archivos de Storage (rutas tomadas de las tablas) ----------
const aDescargar = new Map(); // "bucket/ruta" → {bucket, ruta}
const agregar = (bucket, ruta) => { if (ruta) aDescargar.set(bucket + "/" + ruta, { bucket, ruta }); };
const estadoAlbum = new Map(datos.albumes.map((a) => [a.id, a.estado]));
for (const f of datos.fotos) {
  // Una foto de álbum publicado vive en el bucket público; si no, en borradores. Se prueban ambos.
  for (const ruta of [f.path, f.mini_path]) { agregar("fotos-publicas", ruta); agregar("fotos-borradores", ruta); }
  agregar("fotos-originales", f.original_path);
}
for (const a of datos.albumes) { agregar("fotos-publicas", a.portada_path); agregar("fotos-borradores", a.portada_path); }
for (const n of datos.noticias) { agregar("fotos-publicas", n.portada_path); agregar("fotos-borradores", n.portada_path); }

const manifiesto = { creado: new Date().toISOString(), proyecto: URL_PRODUCCION.replace(/^https:\/\/([^.]+).*/, "$1"), solo_lectura: true, tablas: {}, archivos: [], faltantes_esperados: [], errores: [] };
for (const t of TABLAS) manifiesto.tablas[t] = datos[t].length;
let bytes = 0;
for (const { bucket, ruta } of aDescargar.values()) {
  const r = await pedir(`/storage/v1/object/authenticated/${bucket}/${ruta.split("/").map(encodeURIComponent).join("/")}`);
  if (r.status === 400 || r.status === 404) { manifiesto.faltantes_esperados.push(`${bucket}/${ruta}`); continue; } // el archivo está en el otro bucket
  if (!r.ok) { manifiesto.errores.push(`${bucket}/${ruta}: ${r.status}`); continue; }
  const buf = Buffer.from(await r.arrayBuffer());
  const salida = path.join(destino, "archivos", bucket, ...ruta.split("/"));
  fs.mkdirSync(path.dirname(salida), { recursive: true });
  fs.writeFileSync(salida, buf);
  bytes += buf.length;
  manifiesto.archivos.push({ bucket, ruta, bytes: buf.length, sha256: sha(buf) });
}
manifiesto.total_archivos = manifiesto.archivos.length;
manifiesto.total_bytes = bytes;

// ---------- 3. Comprobaciones de integridad ----------
const problemas = [];
const baja = (b, r) => manifiesto.archivos.some((x) => x.bucket === b && x.ruta === r);
for (const f of datos.fotos) {
  const pub = estadoAlbum.get(f.album_id) === "publicada";
  const b = pub ? "fotos-publicas" : "fotos-borradores";
  if (!baja(b, f.path)) problemas.push(`Falta la foto ${f.path} (${b})`);
  if (f.mini_path && !baja(b, f.mini_path)) problemas.push(`Falta la miniatura ${f.mini_path} (${b})`);
  if (f.original_path && !baja("fotos-originales", f.original_path)) problemas.push(`Falta el original ${f.original_path}`);
}
manifiesto.problemas = problemas;
fs.writeFileSync(path.join(destino, "datos.json"), JSON.stringify(datos, null, 1));
fs.writeFileSync(path.join(destino, "manifiesto.json"), JSON.stringify(manifiesto, null, 1));
fs.writeFileSync(path.join(destino, "LEEME.txt"),
  `Respaldo de PRODUCCION de RedDeportivaTV (${manifiesto.creado}).\nContiene datos reales: no subir a GitHub ni compartir.\n` +
  `datos.json: una lista por tabla. archivos/<bucket>/<ruta>: fotos con la ruta original. manifiesto.json: conteos y SHA-256 de cada archivo.\n` +
  `Restaurar: ver CONTINUAR_PROYECTO.md (probar-restauracion.mjs ensaya la restauración en el proyecto de PRUEBAS).\n` +
  `No incluye cuentas de acceso (auth.users): la migración 3 no las toca.\n`);

console.log(`\nArchivos descargados: ${manifiesto.total_archivos} (${(bytes / 1024 / 1024).toFixed(1)} MB)`);
console.log(`Errores de descarga: ${manifiesto.errores.length}  ·  Problemas de integridad: ${problemas.length}`);
for (const p of [...manifiesto.errores, ...problemas].slice(0, 20)) console.log("  - " + p);
console.log("Carpeta:", destino);
process.exit(manifiesto.errores.length || problemas.length ? 1 : 0);
