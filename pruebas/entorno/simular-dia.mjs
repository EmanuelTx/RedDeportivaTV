// Simula una cobertura diaria COMPLETA en el proyecto de PRUEBAS:
//   10 partidos del 17/11/2026 en 5 categorías, fotos reales subidas con el mismo código del panel,
//   un video resumen del día, noticias publicadas y en borrador y una transmisión EN VIVO activa.
// Es repetible: borra lo que creó una ejecución anterior (todo lleva el prefijo "sim-" en la dirección).
//   node simular-dia.mjs
import { ejecutar, conectar } from "./ejecutar-sql.mjs";
import { abrir, iniciarSesionAdmin, BASE } from "./navegador.mjs";
import { borrarCoberturas } from "./panel-acciones.mjs";

const FECHA = "2026-11-17";
const CATEGORIAS = [
  ["Sub-12", "sub-12", [["Tigres", "Halcones", 3, 1], ["Delfines", "Pumas", 0, 0]]],
  ["Sub-14", "sub-14", [["Águilas", "Leones", 2, 2], ["Cóndores", "Jaguares", 1, 4]]],
  ["Sub-16", "sub-16", [["Rayo", "Relámpago", 5, 3], ["Titanes", "Gladiadores", 2, 0]]],
  ["Libre", "libre", [["Los Amigos", "Barrio Norte", 1, 1], ["Unión", "Deportivo Sur", 2, 3]]],
  ["Senior", "senior", [["Veteranos", "Leyendas", 4, 2], ["Clásicos", "Maestros", 1, 0]]]
];
const FOTOS = ["futbol-duelo-1600.jpg", "futbol-festejo-gol-1600.jpg", "futbol-nino-7-1600.jpg"];
const SIN_FOTOS = new Set([5, 9]); // partidos (0-9) cuyas fotos aún no se publicaron
const VIDEO_PROPIO = 3;            // partido con video propio, además del resumen del día

const slugify = (t) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

// ---------- 1. Limpiar una simulación anterior ----------
await borrarCoberturas("sim-"); // despublica y borra archivos como el panel
const c = await conectar();
const camp = (await c.query("select id from campeonatos where slug='area-4'")).rows[0].id;
await c.query("begin");
const viejos = (await c.query("select id from albumes where slug like 'sim-%'")).rows.map((r) => r.id);
if (viejos.length) {
  await c.query("delete from fotos where album_id = any($1)", [viejos]);
  await c.query("delete from albumes where id = any($1)", [viejos]);
}
await c.query("delete from partidos where equipo_local = any($1) and fecha = $2", [CATEGORIAS.flatMap((k) => k[2].map((p) => p[0])), FECHA]);
await c.query("delete from noticias where slug like 'sim-%'");
await c.query("delete from dias_cobertura where fecha=$1 and campeonato_id=$2", [FECHA, camp]);

// ---------- 2. Categorías, jornadas, partidos y coberturas ----------
let n = 0; const albumes = [];
for (const [nombre, slug, partidos] of CATEGORIAS) {
  let cat = (await c.query("select id from categorias where campeonato_id=$1 and slug=$2", [camp, slug])).rows[0]?.id;
  if (!cat) cat = (await c.query("insert into categorias (campeonato_id,nombre,slug,orden) values ($1,$2,$3,10) returning id", [camp, nombre, slug])).rows[0].id;
  let jor = (await c.query("select id from jornadas where categoria_id=$1 and fecha=$2", [cat, FECHA])).rows[0]?.id;
  if (!jor) jor = (await c.query("insert into jornadas (campeonato_id,categoria_id,nombre,slug,fecha,orden) values ($1,$2,'Fecha 4',$3,$4,4) returning id", [camp, cat, `area-4-${slug}-fecha-4`, FECHA])).rows[0].id;
  let orden = 0;
  for (const [local, visita, gl, gv] of partidos) {
    orden++;
    const hora = `${String(8 + Math.floor(n / 2)).padStart(2, "0")}:${orden === 1 ? "00" : "45"}`;
    const p = (await c.query("insert into partidos (campeonato_id,categoria_id,jornada_id,equipo_local,equipo_visitante,fecha,hora,lugar,goles_local,goles_visitante,orden,visible) values ($1,$2,$3,$4,$5,$6,$7,'Club Social Área 4',$8,$9,$10,true) returning id", [camp, cat, jor, local, visita, FECHA, hora, gl, gv, orden])).rows[0].id;
    const slugAlbum = `sim-area-4-${slug}-${slugify(local)}-vs-${slugify(visita)}-${FECHA}`;
    const conVideo = n === VIDEO_PROPIO;
    const a = (await c.query(`insert into albumes (slug,titulo,fecha,tipo,campeonato_id,categoria_id,jornada_id,partido_id,visible,estado,estado_fotos,estado_video,youtube_id)
      values ($1,$2,$3,'partido',$4,$5,$6,$7,true,'borrador',$8,$9,$10) returning id`,
      [slugAlbum, `${local} vs. ${visita}`, FECHA, camp, cat, jor, p, SIN_FOTOS.has(n) ? "pendiente" : "preparacion", conVideo ? "disponible" : "no_aplica", conVideo ? "iCsUq6GlX0Y" : null])).rows[0].id;
    albumes.push({ id: a, n, titulo: `${local} vs. ${visita}` });
    n++;
  }
}

// ---------- 3. Video resumen del día ----------
await c.query("update dias_cobertura set estado_video='disponible', youtube_id='M7lc1UVf-VE', descripcion='Resumen de toda la jornada del martes en Área 4.' where fecha=$1 and campeonato_id=$2", [FECHA, camp]);
const dia = (await c.query("select slug from dias_cobertura where fecha=$1 and campeonato_id=$2", [FECHA, camp])).rows[0];

// ---------- 4. Noticias ----------
const noticias = [
  ["sim-gran-jornada-en-area-4", "Gran jornada de fútbol en Área 4", "Diez partidos en cinco categorías llenaron de fiesta la cancha.", "Más de 200 personas acompañaron a los equipos durante todo el día. Hubo goles, buen juego y mucho entusiasmo en todas las categorías.", "publicada", "now() - interval '2 hours'"],
  ["sim-resumen-sub-14", "Sub-14: un empate vibrante y una goleada", "Águilas y Leones igualaron 2 a 2; Jaguares goleó a Cóndores.", "Los chicos de la Sub-14 regalaron una mañana inolvidable.", "publicada", "now() - interval '1 day'"],
  ["sim-nueva-fecha-libre", "La categoría Libre se define el próximo domingo", "Unión y Deportivo Sur se preparan para el cierre.", "El próximo domingo se juega la fecha decisiva.", "publicada", "now() - interval '3 days'"],
  ["sim-borrador-premiacion", "Premiación del torneo (borrador)", "Esta noticia todavía no debe verse.", "Texto de trabajo, sin publicar.", "borrador", "null"]
];
for (const [slug, titulo, desc, cont, estado, fecha] of noticias) {
  await c.query(`insert into noticias (slug,titulo,descripcion,contenido,estado,publicado_en,campeonato_id) values ($1,$2,$3,$4,$5,${fecha},$6)`, [slug, titulo, desc, cont, estado, camp]);
}

// ---------- 5. Transmisión EN VIVO ----------
await c.query("update transmisiones set titulo='Área 4 · Cancha principal EN VIVO', youtube_url='https://www.youtube.com/watch?v=iCsUq6GlX0Y', en_vivo=true, termina_en=now() + interval '8 hours'");
await c.query("commit");
await c.end();
console.log(`Datos creados: ${albumes.length} partidos, día ${dia.slug}, 4 noticias, EN VIVO activo.`);

// ---------- 6. Fotos reales, subidas y publicadas con el código del panel ----------
const nav = await abrir({ conSesion: true });
try {
  const pagina = await nav.contexto.newPage();
  pagina.on("pageerror", (e) => console.log("pageerror:", e.message));
  await iniciarSesionAdmin(pagina, nav.contexto);
  const lista = albumes.filter((a) => !SIN_FOTOS.has(a.n));
  const resultado = await pagina.evaluate(async ({ lista, FOTOS }) => {
    const { app } = await import("/admin/js/estado.js");
    const F = await import("/js/admin/fotos-publicacion.js");
    const { prepararFoto } = await import("/admin/js/imagenes.js");
    const archivos = [];
    for (const nombre of FOTOS) {
      const b = await (await fetch("/assets/img/fotos/" + nombre)).blob();
      archivos.push(new File([b], nombre, { type: "image/jpeg" }));
    }
    const salida = [];
    for (const a of lista) {
      let orden = 0;
      for (const f of archivos) {
        const prep = await prepararFoto(f, { conservarOriginal: true });
        await F.subirFotoAlbum(app.sb, a.id, prep, { orden: ++orden, alt: a.titulo });
      }
      const { error } = await app.sb.from("albumes").update({ estado_fotos: "disponible" }).eq("id", a.id);
      if (error) throw new Error(a.titulo + ": " + error.message);
      await F.publicar(app.sb, "albumes", a.id);
      salida.push(a.titulo);
    }
    return salida;
  }, { lista, FOTOS });
  console.log("Fotos subidas y publicadas en:", resultado.length, "coberturas");
} finally { await nav.cerrar(); }
const r = await ejecutar(`select a.estado, a.estado_fotos, count(*) n, sum((select count(*) from fotos f where f.album_id=a.id)) fotos from albumes a where slug like 'sim-%' group by 1,2`);
console.table(r.rows);
// El panel marca la primera foto subida como portada (admin/js/coberturas.js); se imita aquí.
await ejecutar("update albumes a set portada_path = (select f.path from fotos f where f.album_id = a.id order by f.orden, f.creado_en limit 1) where a.slug like 'sim-%' and a.portada_path is null and exists (select 1 from fotos f where f.album_id = a.id)");
