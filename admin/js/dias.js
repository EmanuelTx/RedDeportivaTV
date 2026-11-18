/* =========================================================
   Panel RedDeportivaTV · COBERTURAS DEL DÍA
   Un campeonato en una fecha real = una cobertura del día. Se crea sola
   cuando se guarda la primera cobertura de un partido de ese día.
   - Mamá: carga las fotos de cada partido como siempre (Coberturas); acá
     ve el avance del día y puede crear de una vez las coberturas de todos
     los partidos que todavía no tienen.
   - Papá: agrega UNA vez el video resumen general del día (enlace de
     YouTube). Aparece solo en la sección Videos y en la página del día.
   ========================================================= */
import { app, recargarCatalogos, opcCampeonatos, nombreCampeonato, nombreCategoria, nombreJornadaClaro,
  campeonatoPorId, categoriaPorId, jornadaPorId, partidoPorId, etiquetaPartido } from "./estado.js";
import { h, vaciar, aviso, dialogo, campo, opciones, boton, conBoton, slugify, fechaCorta, errorAmigable } from "./ui.js";
import { idYoutube } from "./coberturas.js";

const EST_VIDEO = { pendiente: "Todavía no", edicion: "En edición", disponible: "Disponible", no_aplica: "No habrá video" };
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const SEMANA = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

/* Fecha sin hora (AAAA-MM-DD) escrita en español, sin correrla de día. */
function fechaLarga(f) {
  const d = new Date(String(f).slice(0, 10) + "T00:00:00Z");
  return isNaN(d) ? "" : SEMANA[d.getUTCDay()] + " " + d.getUTCDate() + " de " + MESES[d.getUTCMonth()] + " de " + d.getUTCFullYear();
}

const publicaAlgo = (a) => a.visible && (a.estado === "publicada" || a.estado_video === "disponible");

/* =================== LISTA =================== */

export async function vista(main, params) {
  await recargarCatalogos();
  if (params && params[0]) return detalle(main, params[0]);

  const { data: dias, error } = await app.sb.from("dias_cobertura")
    .select("id,campeonato_id,fecha,slug,estado_video,youtube_id").order("fecha", { ascending: false }).limit(80);
  if (error) throw error;
  let miembros = [];
  if (dias.length) {
    const r = await app.sb.from("albumes").select("campeonato_id,fecha,tipo,visible,estado,estado_fotos,estado_video")
      .in("tipo", ["partido", "jornada"]).in("fecha", [...new Set(dias.map((d) => d.fecha))]).limit(2000);
    if (r.error) throw r.error;
    miembros = r.data;
  }

  const filas = dias.map((d) => {
    const m = miembros.filter((a) => a.campeonato_id === d.campeonato_id && a.fecha === d.fecha);
    const partidos = m.filter((a) => a.tipo === "partido");
    const conFotos = partidos.filter((a) => a.estado === "publicada").length;
    const sinCobertura = app.cat.partidos.filter((p) => p.campeonato_id === d.campeonato_id && p.fecha === d.fecha
      && !partidos.some((a) => a.partido_id === p.id)).length;
    const seVe = d.estado_video === "disponible" || m.some(publicaAlgo);
    return h("tr", {},
      h("td", { "data-col": "Día" }, h("a", { class: "enlace-fuerte", href: "#/dias/" + d.id }, nombreCampeonato(d.campeonato_id) || "Campeonato"),
        h("div", { class: "nota" }, fechaLarga(d.fecha))),
      h("td", { "data-col": "Partidos" }, String(partidos.length), sinCobertura ? h("div", { class: "nota" }, sinCobertura + " sin cobertura todavía") : null),
      h("td", { "data-col": "Fotos" }, partidos.length ? conFotos + " de " + partidos.length + " listas" : "—"),
      h("td", { "data-col": "Video del día" }, h("span", { class: "estado estado--v-" + d.estado_video }, "▶ " + EST_VIDEO[d.estado_video])),
      h("td", { "data-col": "En la web" }, seVe ? h("span", { class: "estado estado--publicada" }, "Se ve") : h("span", { class: "estado" }, "Todavía no")),
      h("td", { class: "tabla__acciones" }, h("a", { class: "btn btn--sec", href: "#/dias/" + d.id }, "Abrir")));
  });

  vaciar(main,
    h("div", { class: "cabecera" },
      h("h1", { text: "Coberturas del día" }),
      boton("+ Cobertura de un día", () => nuevoDia(), "btn--primary")),
    h("p", { class: "nota" },
      "Cada campeonato y fecha forma una cobertura del día: en la web se ve como UNA tarjeta con todos sus partidos. " +
      "Se crea sola cuando guardás la primera cobertura de un partido de ese día. " +
      "Acá se carga el video resumen general (uno por día) y se ve el avance de las fotos."),
    h("div", { class: "tabla-envoltura" },
      h("table", { class: "tabla" },
        h("thead", {}, h("tr", {}, ["Día", "Partidos", "Fotos", "Video del día", "En la web", ""].map((t) => h("th", { text: t })))),
        h("tbody", {}, filas.length ? filas : h("tr", {}, h("td", { colspan: 6, class: "vacio" },
          "Todavía no hay coberturas del día. Se crean solas al guardar la cobertura de un partido, o con «+ Cobertura de un día»."))))));
}

/* Crear un día a mano (por ejemplo, para empezar a cargar los partidos antes del primer partido) */
function nuevoDia() {
  const campeonato = opciones(h("select", { required: true }), opcCampeonatos(), { vacio: "Elegí el campeonato…" });
  const fecha = h("input", { type: "date", required: true });
  const crear = h("button", { class: "btn btn--primary", type: "submit" }, "Crear y abrir");
  const form = h("form", { class: "form" },
    campo("Campeonato *", campeonato),
    campo("Fecha real de los partidos *", fecha, "Es la fecha en que se jugaron (no la de hoy, si cargás partidos antiguos)."),
    h("div", { class: "acciones" }, boton("Cancelar", () => dlg.close()), crear));
  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    if (!form.reportValidity()) return;
    await conBoton(crear, async () => {
      const c = campeonatoPorId(campeonato.value);
      const slug = c.slug + "-" + fecha.value;
      let { data, error } = await app.sb.from("dias_cobertura").select("id").eq("campeonato_id", c.id).eq("fecha", fecha.value).maybeSingle();
      if (error) throw error;
      if (!data) {
        ({ data, error } = await app.sb.from("dias_cobertura").insert({ campeonato_id: c.id, fecha: fecha.value, slug }).select("id").single());
        if (error) throw error;
        aviso("Día creado.");
      }
      dlg.close();
      location.hash = "#/dias/" + data.id;
    }, "Creando…");
  });
  const dlg = dialogo("Cobertura de un día", form);
  campeonato.focus();
}

/* =================== DETALLE DE UN DÍA =================== */

async function detalle(main, id) {
  const { data: dia, error } = await app.sb.from("dias_cobertura").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!dia) {
    vaciar(main, h("a", { class: "volver", href: "#/dias" }, "← Coberturas del día"), h("p", { class: "vacio" }, "Ese día ya no existe (se borra solo cuando queda sin partidos ni video)."));
    return;
  }
  const { data: coberturas, error: e2 } = await app.sb.from("albumes")
    .select("id,slug,titulo,tipo,visible,estado,estado_fotos,estado_video,partido_id,categoria_id,jornada_id,fotos(count)")
    .eq("campeonato_id", dia.campeonato_id).eq("fecha", dia.fecha).in("tipo", ["partido", "jornada"]).limit(300);
  if (e2) throw e2;

  const nombre = nombreCampeonato(dia.campeonato_id) || "Campeonato";
  const partidosDelDia = app.cat.partidos.filter((p) => p.campeonato_id === dia.campeonato_id && p.fecha === dia.fecha);
  const sinCobertura = partidosDelDia.filter((p) => !coberturas.some((a) => a.partido_id === p.id));
  const seVe = dia.estado_video === "disponible" || coberturas.some(publicaAlgo);
  const conFotos = coberturas.filter((a) => a.tipo === "partido" && a.estado === "publicada").length;
  const recargar = () => vista(main, [id]);

  /* ---- Video resumen general (papá) ---- */
  const estVideo = opciones(h("select"), Object.entries(EST_VIDEO).map(([v, t]) => ({ valor: v, texto: t })), { vacio: null, valor: dia.estado_video });
  const enlace = h("input", { type: "url", maxlength: 300, placeholder: "https://www.youtube.com/watch?v=… o https://youtu.be/…" });
  const descripcion = h("textarea", { rows: 2, maxlength: 300, placeholder: "Opcional. Un texto corto para la página del día." });
  const miniatura = h("div", { class: "video-vista" });
  const nota = h("p", { class: "nota" });
  enlace.value = dia.youtube_id ? "https://www.youtube.com/watch?v=" + dia.youtube_id : "";
  descripcion.value = dia.descripcion || "";

  function pintarVideo() {
    const idv = idYoutube(enlace.value);
    vaciar(miniatura);
    if (!enlace.value.trim()) { nota.textContent = "Pegá el enlace cuando el resumen esté en YouTube (puede ser «no listado»)."; return; }
    if (!idv) { nota.textContent = "⚠ No parece un enlace de YouTube válido."; return; }
    miniatura.appendChild(h("img", { src: "https://i.ytimg.com/vi/" + idv + "/mqdefault.jpg", alt: "Miniatura del video", loading: "lazy" }));
    nota.textContent = "ID " + idv + ".";
  }
  enlace.addEventListener("input", () => {
    // Al pegar un enlace válido, el video pasa a «Disponible» (se puede cambiar)
    if (idYoutube(enlace.value) && ["pendiente", "edicion"].includes(estVideo.value)) estVideo.value = "disponible";
    pintarVideo();
  });
  pintarVideo();

  const guardarVideo = boton("Guardar video del día", (ev) => conBoton(ev.target, async () => {
    const idv = idYoutube(enlace.value);
    if (enlace.value.trim() && !idv) throw new Error("El enlace de YouTube no es válido.");
    if (estVideo.value === "disponible" && !idv) throw new Error("Para marcar el video «Disponible», pegá su enlace de YouTube.");
    const cambios = { estado_video: estVideo.value, youtube_id: idv, descripcion: descripcion.value.trim() || null };
    const { error: e } = await app.sb.from("dias_cobertura").update(cambios).eq("id", dia.id);
    if (e) throw e;
    aviso(estVideo.value === "disponible" ? "Guardado. El video ya se ve en la web (sección Videos y página del día)." : "Guardado.");
    await recargar();
  }, "Guardando…"), "btn--primary");

  /* ---- Partidos con cobertura, por categoría → jornada → orden ---- */
  const filaCobertura = (a) => {
    const p = a.partido_id ? partidoPorId(a.partido_id) : null;
    const cant = a.fotos && a.fotos[0] ? a.fotos[0].count : 0;
    return h("tr", {},
      h("td", { "data-col": "Categoría" }, nombreCategoria(a.categoria_id) || "—"),
      h("td", { "data-col": "Jornada" }, nombreJornadaClaro(a.jornada_id) || "—"),
      h("td", { "data-col": "Partido" }, h("a", { class: "enlace-fuerte", href: "#/coberturas/" + a.id }, p ? etiquetaPartido(Object.assign({}, p, { fecha: null })) : a.titulo)),
      h("td", { "data-col": "Fotos" }, h("span", { class: "estado estado--f-" + a.estado_fotos }, "📷 " + ({ pendiente: "Pendientes", preparacion: "En preparación", disponible: "Disponibles", no_aplica: "No tendrá" }[a.estado_fotos] || "")), h("div", { class: "nota" }, cant + " fotos")),
      h("td", { "data-col": "En la web" }, publicaAlgo(a) ? h("span", { class: "estado estado--publicada" }, "Se ve") : h("span", { class: "estado" }, a.visible ? "Visible (sin fotos aún)" : "Oculta")),
      h("td", { class: "tabla__acciones" }, h("a", { class: "btn btn--sec", href: "#/coberturas/" + a.id }, "Editar")));
  };
  const orden = (a, b) => {
    const pa = a.partido_id ? partidoPorId(a.partido_id) : null, pb = b.partido_id ? partidoPorId(b.partido_id) : null;
    const ca = categoriaPorId(a.categoria_id), cb = categoriaPorId(b.categoria_id);
    const ja = jornadaPorId(a.jornada_id), jb = jornadaPorId(b.jornada_id);
    return ((ca ? ca.orden : 1e9) - (cb ? cb.orden : 1e9)) || (nombreCategoria(a.categoria_id) || "~").localeCompare(nombreCategoria(b.categoria_id) || "~", "es")
      || ((ja ? ja.orden : 1e9) - (jb ? jb.orden : 1e9)) || ((pa ? pa.orden : 0) - (pb ? pb.orden : 0));
  };
  const delPartido = coberturas.filter((a) => a.tipo === "partido").sort(orden);
  const generales = coberturas.filter((a) => a.tipo === "jornada").sort(orden);

  /* ---- Partidos sin cobertura (mamá): crearlas todas de una vez ---- */
  const crearTodas = async (ev) => {
    await conBoton(ev.target, async () => {
      const filas = sinCobertura.map((p) => {
        const titulo = p.equipo_local + " vs. " + p.equipo_visitante;
        return {
          tipo: "partido", partido_id: p.id, titulo, estado: "borrador", visible: false,
          estado_fotos: "pendiente", estado_video: "no_aplica",     // el video es general del día
          slug: slugify([nombreCampeonato(p.campeonato_id), nombreCategoria(p.categoria_id), titulo, p.fecha].filter(Boolean).join(" "))
        };
      });
      const { error: e } = await app.sb.from("albumes").insert(filas);
      if (e) throw e;
      aviso("Listo: se crearon " + filas.length + " coberturas. Ahora subí las fotos de cada partido y marcalas «Disponibles».");
      await recargar();
    }, "Creando…");
  };

  vaciar(main,
    h("a", { class: "volver", href: "#/dias" }, "← Coberturas del día"),
    h("div", { class: "cabecera" },
      h("h1", { text: nombre + " · " + fechaLarga(dia.fecha) }),
      h("span", { class: "estado " + (seVe ? "estado--publicada" : "") }, seVe ? "Se ve en la web" : "Todavía no se ve"),
      seVe ? h("a", { class: "btn btn--sec", href: "/dias/" + dia.slug, target: "_blank", rel: "noopener" }, "Ver en la web ↗") : null),

    h("section", { class: "bloque" },
      h("h2", { text: "🎬 Video resumen del día" }),
      h("p", { class: "nota" }, "Un solo video para todos los partidos. Se puede agregar más tarde: las fotos ya publicadas siguen igual. " +
        "Cuando esté «Disponible» aparece solo en la sección Videos de la portada y en la página de este día."),
      h("div", { class: "form form--ancho" },
        campo("Estado del video", estVideo),
        campo("Enlace de YouTube", enlace),
        miniatura, nota,
        campo("Texto de la página del día (opcional)", descripcion),
        h("div", { class: "acciones" }, guardarVideo))),

    h("section", { class: "bloque" },
      h("h2", { text: "📷 Partidos del día (" + delPartido.length + ")" }),
      h("p", { class: "nota" }, delPartido.length
        ? conFotos + " de " + delPartido.length + " con fotos publicadas. En la web se ordenan por categoría, jornada y orden del partido."
        : "Todavía no hay coberturas de partidos en este día."),
      delPartido.length ? h("div", { class: "tabla-envoltura" },
        h("table", { class: "tabla" },
          h("thead", {}, h("tr", {}, ["Categoría", "Jornada", "Partido", "Fotos", "En la web", ""].map((t) => h("th", { text: t })))),
          h("tbody", {}, delPartido.map(filaCobertura)))) : null),

    sinCobertura.length ? h("section", { class: "bloque" },
      h("h2", { text: "Partidos de este día sin cobertura (" + sinCobertura.length + ")" }),
      h("ul", { class: "nota" }, sinCobertura.map((p) => h("li", {}, etiquetaPartido(Object.assign({}, p, { fecha: null })) + (p.categoria_id ? " · " + nombreCategoria(p.categoria_id) : "")))),
      h("p", { class: "nota" }, "Se crean ocultas y sin fotos. Después subís las fotos de cada partido desde su cobertura."),
      boton("Crear las " + sinCobertura.length + " coberturas", crearTodas, "btn--primary")) : null,

    h("p", { class: "nota" }, "¿Falta un partido? Cargalo en ", h("a", { href: "#/partidos" }, "Partidos"), " con la fecha de este día y volvé acá."),

    generales.length ? h("section", { class: "bloque" },
      h("h2", { text: "Coberturas generales del día (" + generales.length + ")" }),
      h("div", { class: "tabla-envoltura" }, h("table", { class: "tabla" }, h("tbody", {}, generales.map(filaCobertura))))) : null);
}
