// Prueba de extremo a extremo (en PRUEBAS) de dos situaciones reales:
//  A) una cobertura diaria se publica primero con fotos y DESPUÉS recibe el video resumen (desde el panel);
//  B) se elimina el último partido de un día que ya tiene video resumen publicado.
//   node probar-flujo-dia.mjs
import { conectar, ejecutar } from "./ejecutar-sql.mjs";
import { abrir, iniciarSesionAdmin, BASE } from "./navegador.mjs";
import { borrarCoberturas } from "./panel-acciones.mjs";

const FECHA = "2026-12-05";
let fallos = 0;
const rep = (ok, t, extra = "") => { if (!ok) fallos++; console.log((ok ? "  OK  " : "FALLA ") + t + (extra ? "  → " + extra : "")); };
const texto = async (ruta) => { const r = await fetch(BASE + ruta); return { estado: r.status, t: (await r.text()).replace(/<script[\s\S]*?<\/script>/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ") }; };

// ---- limpiar restos de una ejecución anterior ----
const c = await conectar();
const camp = (await c.query("select id from campeonatos where slug='area-4'")).rows[0].id;
const cat = (await c.query("select id from categorias where campeonato_id=$1 and slug='libre'", [camp])).rows[0].id;
async function limpiar() {
  await borrarCoberturas("flujo-");
  await c.query("delete from partidos where fecha=$1 and equipo_local like 'Flujo %'", [FECHA]);
  await c.query("delete from jornadas where slug like 'flujo-%'");
  await c.query("delete from dias_cobertura where fecha=$1 and campeonato_id=$2", [FECHA, camp]);
}
await limpiar();

// ---- un partido con su cobertura (como lo cargaría mamá) ----
const jor = (await c.query("insert into jornadas (campeonato_id,categoria_id,nombre,slug,fecha,orden) values ($1,$2,'Fecha 6','flujo-area-4-libre-fecha-6',$3,6) returning id", [camp, cat, FECHA])).rows[0].id;
async function partido(n, local, visita) {
  const p = (await c.query("insert into partidos (campeonato_id,categoria_id,jornada_id,equipo_local,equipo_visitante,fecha,orden,visible,goles_local,goles_visitante) values ($1,$2,$3,$4,$5,$6,$7,true,1,0) returning id", [camp, cat, jor, local, visita, FECHA, n])).rows[0].id;
  return (await c.query("insert into albumes (slug,titulo,fecha,tipo,campeonato_id,categoria_id,jornada_id,partido_id,visible,estado,estado_fotos,estado_video) values ($1,$2,$3,'partido',$4,$5,$6,$7,true,'borrador','preparacion','no_aplica') returning id,slug", [`flujo-${n}-${local.toLowerCase().replace(/\W+/g, "-")}`, `${local} vs. ${visita}`, FECHA, camp, cat, jor, p])).rows[0];
}
const a1 = await partido(1, "Flujo Uno", "Flujo Dos");
const diaSlug = "area-4-" + FECHA;
rep((await c.query("select 1 from dias_cobertura where slug=$1", [diaSlug])).rowCount === 1, "El día se crea solo al cargar el primer partido");

const nav = await abrir({ conSesion: true });
try {
  const pag = await nav.contexto.newPage();
  const errores = [];
  pag.on("pageerror", (e) => errores.push(e.message));
  await iniciarSesionAdmin(pag, nav.contexto);

  // ---- A1) subir y publicar fotos (código del panel) ----
  await pag.evaluate(async ({ id }) => {
    const { app } = await import("/admin/js/estado.js");
    const F = await import("/js/admin/fotos-publicacion.js");
    const { prepararFoto } = await import("/admin/js/imagenes.js");
    const b = await (await fetch("/assets/img/fotos/futbol-duelo-1600.jpg")).blob();
    const prep = await prepararFoto(new File([b], "f.jpg", { type: "image/jpeg" }), { conservarOriginal: false });
    const foto = await F.subirFotoAlbum(app.sb, id, prep, { orden: 1 });
    await app.sb.from("albumes").update({ estado_fotos: "disponible", portada_path: foto.path }).eq("id", id);
    await F.publicar(app.sb, "albumes", id);
  }, { id: a1.id });

  let d = await texto("/dias/" + diaSlug);
  rep(d.estado === 200 && /Flujo Uno/.test(d.t), "Con solo fotos: la página del día ya está publicada", `estado ${d.estado}`);
  rep(!/Video resumen del d[ií]a/i.test(d.t) || /próximamente|pronto|todavía|preparaci/i.test(d.t), "Sin video: no se muestra un reproductor vacío");
  let cat1 = await texto("/coberturas");
  rep(/5 dic 2026/.test(cat1.t), "El catálogo ya muestra la tarjeta del día");
  let v1 = await (await fetch(BASE + "/api/videos?limite=20")).json();
  rep(!v1.videos.some((v) => v.ruta === "/dias/" + diaSlug), "Todavía NO aparece en la sección Videos");

  // ---- A2) papá agrega el video resumen DESPUÉS, desde el panel ----
  await pag.goto(BASE + "/admin/#/dias");
  await pag.waitForSelector("h1:has-text('Coberturas del día')");
  await pag.waitForTimeout(1200);
  const fila = pag.locator("tr", { hasText: /dic/i }).locator("a[href^='#/dias/']").first();
  const hayFila = (await fila.count()) > 0;
  rep(hayFila, "El día aparece en «Coberturas del día» del panel");
  if (hayFila) {
    await fila.click();
    await pag.waitForSelector("h1:has-text('2026')");
    await pag.waitForTimeout(800);
    const campoLink = pag.locator("input[type='url'], input[placeholder*='youtube' i], input[name*='youtube' i]").first();
    await campoLink.fill("https://youtu.be/dQw4w9WgXcQ");
    await pag.waitForTimeout(500);
    const estado = await pag.locator("select").first().inputValue();
    rep(estado === "disponible", "Al pegar el enlace, el estado pasa solo a «Disponible»", "estado=" + estado);
    await pag.getByRole("button", { name: /Guardar video del d[ií]a/i }).click();
    await pag.waitForTimeout(1800);
  }
  d = await texto("/dias/" + diaSlug);
  const crudo = await (await fetch(BASE + "/dias/" + diaSlug)).text();
  rep(crudo.includes("dQw4w9WgXcQ"), "Después del video: la página del día lo muestra");
  v1 = await (await fetch(BASE + "/api/videos?limite=20")).json();
  rep(v1.videos.some((v) => v.id === "dQw4w9WgXcQ" && v.ruta === "/dias/" + diaSlug), "Aparece solo en la sección Videos (enlaza al día)");
  rep(v1.videos.filter((v) => v.id === "dQw4w9WgXcQ").length === 1, "Sin duplicados en Videos");
  cat1 = await texto("/coberturas");
  rep(/Video resumen/i.test(cat1.t), "El catálogo marca «Video resumen»");
  const crudoPartido = await (await fetch(BASE + "/coberturas/" + a1.slug)).text();
  rep(crudoPartido.includes("dQw4w9WgXcQ"), "La página del partido también ofrece el video del día");
  rep((await c.query("select count(*)::int n from fotos where album_id=$1", [a1.id])).rows[0].n === 1, "Las fotos ya publicadas siguen intactas");

  // ---- B) eliminar el último partido con el video publicado ----
  await pag.evaluate(async ({ id }) => { const { app } = await import("/admin/js/estado.js"); const F = await import("/js/admin/fotos-publicacion.js"); await F.borrarPublicacion(app.sb, "albumes", id); }, { id: a1.id }); // igual que «Eliminar» en el panel
  let dia = (await c.query("select slug, video_publico from dias_cobertura where slug=$1", [diaSlug])).rows[0];
  rep(!!dia && dia.video_publico === "dQw4w9WgXcQ", "Sin partidos: el día SE CONSERVA porque tiene video publicado");
  d = await texto("/dias/" + diaSlug);
  rep(d.estado === 200 && !/van a estar disponibles pronto/.test(d.t), "La página del día sigue respondiendo (el enlace no se rompe)", `estado ${d.estado}`);
  console.log("      texto: " + d.t.replace(/^.*?Cobertura del d[ií]a/, "Cobertura del día").slice(0, 260));
  v1 = await (await fetch(BASE + "/api/videos?limite=20")).json();
  rep(v1.videos.some((v) => v.id === "dQw4w9WgXcQ"), "El video sigue en la sección Videos");
  await c.query("update dias_cobertura set estado_video='pendiente', youtube_id=null where slug=$1", [diaSlug]);
  dia = (await c.query("select slug from dias_cobertura where slug=$1", [diaSlug])).rows[0];
  rep(!dia, "Al quitar el video de un día sin partidos, el día vacío se borra solo");
  d = await texto("/dias/" + diaSlug);
  console.log("      página del día vacío y sin video: estado " + d.estado);
  rep(errores.length === 0, "Panel sin errores de consola", errores[0] || "");
} finally {
  await nav.cerrar();
}
await limpiar();
await c.end();
console.log(fallos ? `\n${fallos} problema(s).` : "\nFlujo completo en orden.");
