/* =========================================================
   Panel RedDeportivaTV · COBERTURAS
   Una cobertura = fotos + video de YouTube + datos del partido, la
   jornada, el campeonato o el evento. La editan los dos administradores:
   - fotos y video tienen estados independientes;
   - al guardar se envían solo los campos cambiados y se comprueba que
     nadie los haya modificado mientras tanto (sin pisarse).
   Los archivos se mueven solo con la Storage API (js/admin/fotos-publicacion.js).
   ========================================================= */
import * as F from "../../js/admin/fotos-publicacion.js";
import { app, recargarCatalogos, opcCampeonatos, opcCategorias, nombreCampeonato, nombreCategoria, nombreJornada,
  partidoPorId, jornadaPorId, etiquetaPartido, etiquetasJornadas, nombreJornadaClaro } from "./estado.js";
import { h, vaciar, aviso, confirmar, dialogo, campo, opciones, boton, conBoton, slugify, fechaCorta, fechaHora, errorAmigable } from "./ui.js";
import { prepararFoto } from "./imagenes.js";
import { abrirVistaPrevia } from "./vista-previa.js";
import { abrirCompartir } from "./compartir.js";

export const TIPOS = {
  partido: "Partido",
  jornada: "General de jornada",
  campeonato: "General de campeonato o categoría",
  evento: "Evento deportivo",
  pendiente: "Pendiente de clasificar"
};
// "no_aplica": la cobertura no tendrá fotos / video; la web no los anuncia.
const EST_FOTOS = { pendiente: "Pendientes", preparacion: "En preparación", disponible: "Disponibles", no_aplica: "No tendrá fotos" };
const EST_VIDEO = { pendiente: "Pendiente", edicion: "En edición", disponible: "Disponible", no_aplica: "No tendrá video" };
const POR_PAGINA = 30;

export async function vista(main, params) {
  await recargarCatalogos();
  if (params[0]) return editor(main, params[0] === "nueva" ? null : params[0]);
  return lista(main);
}

/* ---------- YouTube ---------- */

export function idYoutube(texto) {
  const t = String(texto || "").trim();
  const valido = (id) => (/^[A-Za-z0-9_-]{11}$/.test(id || "") ? id : null);
  if (valido(t)) return t;
  try {
    const u = new URL(t);
    const host = u.hostname.replace(/^(www|m|music)\./, "");
    if (host === "youtu.be") return valido(u.pathname.slice(1).split("/")[0]);
    if (host === "youtube.com" || host === "youtube-nocookie.com") {
      if (u.searchParams.get("v")) return valido(u.searchParams.get("v"));
      const m = u.pathname.match(/^\/(?:live|shorts|embed|v)\/([A-Za-z0-9_-]{11})/);
      if (m) return m[1];
    }
  } catch (_) { /* no es una URL */ }
  return null;
}

/* ---------- Espacio de almacenamiento ---------- */

function megas(bytes) {
  return bytes >= 1024 * 1024 * 1024 ? (bytes / 1024 / 1024 / 1024).toFixed(2) + " GB" : Math.round(bytes / 1024 / 1024) + " MB";
}

export async function medidorEspacio() {
  const caja = h("div", { class: "espacio" }, "Calculando espacio usado…");
  try {
    const uso = await F.usoAlmacenamiento(app.sb);
    const pct = Math.min(100, Math.round(uso.proporcion * 100));
    const orig = uso.porBucket[F.BUCKET_ORIGINALES];
    vaciar(caja,
      h("div", { class: "espacio__barra", role: "progressbar", "aria-valuenow": pct, "aria-valuemin": 0, "aria-valuemax": 100 },
        h("span", { class: "espacio__lleno" + (pct >= 80 ? " espacio__lleno--alto" : "") })),
      h("p", { class: "espacio__texto" },
        "Fotos: " + megas(uso.total) + " de 1 GB (" + pct + " %)" +
        (orig ? " · Originales: " + megas(orig.bytes) : "") +
        (pct >= 80 ? " · Queda poco espacio: conviene no guardar originales." : "")));
    caja.querySelector(".espacio__lleno").style.width = pct + "%";
    caja.dataset.proporcion = String(uso.proporcion);
  } catch (e) {
    vaciar(caja, h("p", { class: "nota" }, "No se pudo calcular el espacio: " + errorAmigable(e)));
  }
  return caja;
}

/* =================== LISTA =================== */

async function lista(main) {
  const q = h("input", { type: "search", placeholder: "Buscar por equipo, campeonato, fecha… (ej. Área 4 Fecha 2)", "aria-label": "Buscar coberturas" });
  const fCamp = opciones(h("select", { "aria-label": "Campeonato" }), opcCampeonatos(), { vacio: "Todos los campeonatos" });
  const fCat = h("select", { "aria-label": "Categoría", disabled: true });
  const fJor = h("select", { "aria-label": "Jornada", disabled: true });
  const fTipo = opciones(h("select", { "aria-label": "Tipo" }), Object.entries(TIPOS).map(([v, t]) => ({ valor: v, texto: t })), { vacio: "Todos los tipos" });
  const fAnio = opciones(h("select", { "aria-label": "Año" }),
    Array.from({ length: 16 }, (_, i) => new Date().getFullYear() - i).map((a) => ({ valor: String(a), texto: String(a) })), { vacio: "Todos los años" });
  opciones(fCat, [], { vacio: "Todas las categorías" });
  opciones(fJor, [], { vacio: "Todas las jornadas" });

  const cuerpo = h("tbody");
  const pie = h("div", { class: "ver-mas-panel" });
  const cuenta = h("p", { class: "nota" });
  let offset = 0;
  let ultima = 0;

  fCamp.addEventListener("change", () => {
    opciones(fCat, opcCategorias(fCamp.value), { vacio: "Todas las categorías" });
    fCat.disabled = !fCamp.value;
    pintarJornadas();
    cargar(true);
  });
  const pintarJornadas = () => {
    const lista = app.cat.jornadas.filter((j) => j.campeonato_id === fCamp.value && (!fCat.value || j.categoria_id === fCat.value));
    const nombres = etiquetasJornadas(lista);
    const js = lista.map((j, i) => ({ valor: j.id, texto: nombres[i] }));
    opciones(fJor, js, { vacio: "Todas las jornadas" });
    fJor.disabled = !fCamp.value;
  };
  fCat.addEventListener("change", () => { pintarJornadas(); cargar(true); });
  [fJor, fTipo, fAnio].forEach((s) => s.addEventListener("change", () => cargar(true)));
  let espera;
  q.addEventListener("input", () => { clearTimeout(espera); espera = setTimeout(() => cargar(true), 300); });

  async function cargar(reiniciar) {
    const turno = ++ultima;
    if (reiniciar) { offset = 0; vaciar(cuerpo, h("tr", {}, h("td", { colspan: 7, class: "vacio" }, "Buscando…"))); }
    const anio = fAnio.value;
    const { data, error } = await app.sb.rpc("buscar_coberturas", {
      p_texto: q.value.trim() || null,
      p_campeonato: fCamp.value || null,
      p_categoria: fCat.value || null,
      p_jornada: fJor.value || null,
      p_tipo: fTipo.value || null,
      p_desde: anio ? anio + "-01-01" : null,
      p_hasta: anio ? anio + "-12-31" : null,
      p_orden: anio ? "fecha" : "reciente",
      p_limite: POR_PAGINA,
      p_offset: offset
    });
    if (turno !== ultima) return; // llegó una búsqueda más nueva
    if (error) { aviso(errorAmigable(error), "error"); return; }
    const ids = data.map((r) => r.id);
    let detalles = {};
    if (ids.length) {
      const d = await app.sb.from("albumes").select("id,estado,visible,estado_fotos,estado_video,fotos(count)").in("id", ids);
      if (d.error) { aviso(errorAmigable(d.error), "error"); return; }
      detalles = Object.fromEntries(d.data.map((x) => [x.id, x]));
    }
    if (reiniciar) vaciar(cuerpo);
    const total = data[0] ? Number(data[0].total) : 0;
    cuenta.textContent = total === 1 ? "1 cobertura" : total + " coberturas";
    if (!data.length && reiniciar) {
      cuerpo.appendChild(h("tr", {}, h("td", { colspan: 7, class: "vacio" }, "No hay coberturas con esa búsqueda. Probá con menos palabras o quitá filtros.")));
    }
    for (const r of data) {
      const d = detalles[r.id] || {};
      const pend = ["publicando", "despublicando"].includes(d.estado);
      cuerpo.appendChild(h("tr", { class: pend || r.tipo === "pendiente" ? "fila--alerta" : "" },
        h("td", { "data-col": "Cobertura" }, h("a", { class: "enlace-fuerte", href: "#/coberturas/" + r.id }, r.titulo),
          h("div", { class: "nota" }, TIPOS[r.tipo] || r.tipo)),
        h("td", { "data-col": "Organización" }, [nombreCampeonato(r.campeonato_id), nombreCategoria(r.categoria_id), nombreJornada(r.jornada_id)].filter(Boolean).join(" · ") || "—"),
        h("td", { "data-col": "Fecha real" }, fechaCorta(r.fecha) || "—"),
        h("td", { "data-col": "Fotos" }, h("span", { class: "estado estado--f-" + d.estado_fotos }, "📷 " + (EST_FOTOS[d.estado_fotos] || "")),
          h("div", { class: "nota" }, String(d.fotos && d.fotos[0] ? d.fotos[0].count : 0) + " fotos")),
        h("td", { "data-col": "Video" }, h("span", { class: "estado estado--v-" + d.estado_video }, "▶ " + (EST_VIDEO[d.estado_video] || ""))),
        h("td", { "data-col": "En la web" }, pend ? h("span", { class: "estado estado--publicando" }, "A medias")
          : d.visible && (r.fotos_disponibles || r.video_publico) ? h("span", { class: "estado estado--publicada" }, "Visible")
          : h("span", { class: "estado" }, d.visible ? "Visible (sin contenido aún)" : "Oculta")),
        h("td", { class: "tabla__acciones" }, h("a", { class: "btn btn--sec", href: "#/coberturas/" + r.id }, "Editar"))));
    }
    offset += data.length;
    vaciar(pie, offset < total ? boton("Ver más", (ev) => conBoton(ev.target, () => cargar(false)), "btn--sec") : null);
  }

  const pendientes = await app.sb.from("albumes").select("id", { count: "exact", head: true }).eq("tipo", "pendiente");

  vaciar(main,
    h("div", { class: "cabecera" },
      h("h1", { text: "Coberturas" }),
      h("a", { class: "btn btn--primary", href: "#/coberturas/nueva" }, "+ Nueva cobertura")),
    await medidorEspacio(),
    pendientes.count ? h("p", { class: "alerta alerta--suave" },
      "Hay " + pendientes.count + " cobertura(s) pendientes de clasificar (contenido anterior). ",
      boton("Ver pendientes", () => { fTipo.value = "pendiente"; cargar(true); }, "btn--sec btn--mini")) : null,
    h("div", { class: "buscador-panel" }, q),
    h("div", { class: "filtros" }, fCamp, fCat, fJor, fTipo, fAnio,
      boton("Limpiar", () => { q.value = ""; fCamp.value = ""; fTipo.value = ""; fAnio.value = ""; opciones(fCat, [], { vacio: "Todas las categorías" }); fCat.disabled = true; opciones(fJor, [], { vacio: "Todas las jornadas" }); fJor.disabled = true; cargar(true); }, "btn--sec")),
    cuenta,
    h("div", { class: "tabla-envoltura" },
      h("table", { class: "tabla" },
        h("thead", {}, h("tr", {}, ["Cobertura", "Organización", "Fecha real", "Fotos", "Video", "En la web", ""].map((t) => h("th", { text: t })))),
        cuerpo)),
    pie);
  q.focus();
  await cargar(true);
}

/* =================== EDITOR =================== */

async function cargar(id) {
  const { data, error } = await app.sb.from("albumes").select("*").eq("id", id).single();
  if (error) throw error;
  return data;
}

async function cargarFotos(id) {
  const { data, error } = await app.sb.from("fotos").select("*").eq("album_id", id).order("orden").order("creado_en");
  if (error) throw error;
  return data;
}

/* Guarda solo los campos cambiados y solo si nadie los cambió mientras tanto. */
async function actualizarSinPisar(original, cambios) {
  let consulta = app.sb.from("albumes").update(cambios).eq("id", original.id);
  for (const campo of Object.keys(cambios)) {
    const v = original[campo];
    consulta = v === null || v === undefined ? consulta.is(campo, null) : consulta.eq(campo, v);
  }
  const { data, error } = await consulta.select("*");
  if (error) throw error;
  if (data.length) return data[0];
  const actual = await cargar(original.id);
  const pisados = Object.keys(cambios).filter((c) => JSON.stringify(actual[c]) !== JSON.stringify(original[c]));
  const e = new Error("Otro administrador cambió " + (pisados.length ? "«" + pisados.join("», «") + "»" : "esta cobertura") +
    " mientras editabas. Recargá para ver su versión; tus cambios no se guardaron para no pisar los suyos.");
  e.conflicto = true;
  throw e;
}

async function editor(main, id) {
  let reg = id ? await cargar(id) : {
    tipo: "partido", estado: "borrador", visible: false, estado_fotos: "pendiente", estado_video: "pendiente"
  };
  let original = Object.assign({}, reg);
  let fotos = id ? await cargarFotos(id) : [];
  const conCobertura = new Set(((await app.sb.from("albumes").select("partido_id").not("partido_id", "is", null)).data || [])
    .filter((x) => x.partido_id !== reg.partido_id).map((x) => x.partido_id));

  /* ---- Controles ---- */
  const tipo = opciones(h("select", { required: true }),
    Object.entries(TIPOS).filter(([v]) => v !== "pendiente" || reg.tipo === "pendiente").map(([v, t]) => ({ valor: v, texto: t })),
    { vacio: null, valor: reg.tipo });
  const campeonato = h("select");
  const categoria = h("select");
  const jornada = h("select");
  const partido = h("select");
  const titulo = h("input", { type: "text", required: true, maxlength: 160 });
  const slug = h("input", { type: "text", maxlength: 120, pattern: "[a-z0-9]+(-[a-z0-9]+)*" });
  const descripcion = h("textarea", { rows: 2, maxlength: 300, placeholder: "Opcional. Se ve al compartir en Facebook y WhatsApp." });
  const fecha = h("input", { type: "date" });
  const notaFecha = h("small", { class: "campo__ayuda" });
  const visible = h("input", { type: "checkbox", checked: Boolean(reg.visible) });
  const estFotos = opciones(h("select"), Object.entries(EST_FOTOS).map(([v, t]) => ({ valor: v, texto: t })), { vacio: null, valor: reg.estado_fotos });
  const estVideo = opciones(h("select"), Object.entries(EST_VIDEO).map(([v, t]) => ({ valor: v, texto: t })), { vacio: null, valor: reg.estado_video });
  const videoUrl = h("input", { type: "url", maxlength: 300, placeholder: "https://www.youtube.com/watch?v=… o https://youtu.be/…" });
  const videoVista = h("div", { class: "video-vista" });
  const videoNota = h("p", { class: "nota" });

  titulo.value = reg.titulo || "";
  slug.value = reg.slug || "";
  descripcion.value = reg.descripcion || "";
  fecha.value = reg.fecha || "";
  videoUrl.value = reg.youtube_id ? "https://www.youtube.com/watch?v=" + reg.youtube_id : "";

  const slugFijo = Boolean(reg.publicado_en);
  slug.readOnly = slugFijo;
  let slugManual = Boolean(reg.slug);
  let tituloManual = Boolean(reg.titulo);
  slug.addEventListener("input", () => (slugManual = true));
  titulo.addEventListener("input", () => { tituloManual = true; if (!slugManual && !slugFijo) slug.value = slugify(titulo.value); });

  /* ---- Selectores dependientes ---- */
  function pintarCategorias(valor) {
    opciones(categoria, opcCategorias(campeonato.value), { vacio: "— Sin categoría —", valor });
    categoria.disabled = !campeonato.value || tipo.value === "partido" || tipo.value === "jornada" && false;
  }
  function pintarJornadas(valor) {
    const lista = app.cat.jornadas.filter((j) => j.campeonato_id === campeonato.value && (!categoria.value || j.categoria_id === categoria.value));
    const nombres = etiquetasJornadas(lista);
    const js = lista.map((j, i) => ({ valor: j.id, texto: nombres[i] + (j.fecha ? " · " + fechaCorta(j.fecha) : "") }));
    opciones(jornada, js, { vacio: tipo.value === "jornada" ? "Elegí la jornada…" : "— Todas —", valor });
    jornada.disabled = !campeonato.value;
  }
  function pintarPartidos(valor) {
    const ps = app.cat.partidos.filter((p) => (!campeonato.value || p.campeonato_id === campeonato.value)
      && (!categoria.value || p.categoria_id === categoria.value) && (!jornada.value || p.jornada_id === jornada.value))
      .sort((a, b) => (a.jornada_id === b.jornada_id ? a.orden - b.orden : 0))
      .map((p) => ({ valor: p.id, texto: etiquetaPartido(p) + (p.jornada_id ? " · " + nombreJornadaClaro(p.jornada_id) : "") + (conCobertura.has(p.id) ? " (ya tiene cobertura)" : "") }));
    opciones(partido, ps, { vacio: "Elegí el partido…", valor });
  }

  // Valores iniciales desde lo guardado
  const pIni = partidoPorId(reg.partido_id);
  const jIni = jornadaPorId(reg.jornada_id);
  opciones(campeonato, opcCampeonatos(), { vacio: "— Sin campeonato —", valor: reg.campeonato_id || (pIni && pIni.campeonato_id) || (jIni && jIni.campeonato_id) });
  pintarCategorias(reg.categoria_id || (pIni && pIni.categoria_id) || (jIni && jIni.categoria_id));
  pintarJornadas(reg.tipo === "jornada" || reg.tipo === "partido" ? reg.jornada_id : "");
  pintarPartidos(reg.partido_id);

  campeonato.addEventListener("change", () => { pintarCategorias(""); pintarJornadas(""); pintarPartidos(""); });
  categoria.addEventListener("change", () => { pintarJornadas(""); pintarPartidos(""); });
  jornada.addEventListener("change", () => {
    pintarPartidos("");
    const j = jornadaPorId(jornada.value);
    if (tipo.value === "jornada" && j) {
      if (j.categoria_id) categoria.value = j.categoria_id;
      if (!fecha.value && j.fecha) fecha.value = j.fecha;
      if (!tituloManual) { titulo.value = j.nombre + " · "; }
    }
  });
  partido.addEventListener("change", () => {
    const p = partidoPorId(partido.value);
    if (!p) return;
    if (conCobertura.has(p.id)) aviso("Ese partido ya tiene una cobertura: abrila desde la lista para editarla.", "error");
    if (!tituloManual || !titulo.value) {
      titulo.value = p.equipo_local + " vs. " + p.equipo_visitante;
      if (!slugManual && !slugFijo) slug.value = slugify([nombreCampeonato(p.campeonato_id), nombreCategoria(p.categoria_id), titulo.value, p.fecha].filter(Boolean).join(" "));
    }
    actualizarFecha();
  });

  /* ---- Campos según el tipo ---- */
  const filaCamp = campo("Campeonato", campeonato);
  const filaCat = campo("Categoría", categoria);
  const filaJor = campo("Jornada", jornada);
  const filaPartido = campo("Partido *", partido, "Los datos del partido (fecha, equipos, resultado) se editan en «Partidos».");
  const filaFecha = campo("Fecha real del partido o evento", fecha, null);
  filaFecha.appendChild(notaFecha);

  function actualizarFecha() {
    const p = partidoPorId(partido.value);
    if (tipo.value === "partido") {
      fecha.readOnly = Boolean(p && p.fecha);
      fecha.value = p && p.fecha ? p.fecha : fecha.value;
      notaFecha.textContent = p && p.fecha ? "Se toma del partido. Para corregirla, editá el partido." : "El partido no tiene fecha: cargala acá o en el partido.";
    } else {
      fecha.readOnly = false;
      notaFecha.textContent = "Es la fecha que usan el buscador y el archivo (no la de publicación).";
    }
  }
  function aplicarTipo() {
    const t = tipo.value;
    filaPartido.hidden = t !== "partido";
    filaJor.hidden = !(t === "partido" || t === "jornada");
    filaJor.querySelector(".campo__etiqueta").textContent = t === "jornada" ? "Jornada *" : "Jornada (para filtrar los partidos)";
    filaCat.hidden = t === "pendiente";
    filaCamp.querySelector(".campo__etiqueta").textContent = t === "campeonato" ? "Campeonato *" : "Campeonato";
    categoria.disabled = !campeonato.value || t === "partido";
    pintarJornadas(jornada.value);
    actualizarFecha();
  }
  tipo.addEventListener("change", aplicarTipo);

  /* ---- Video ---- */
  async function pintarVideo(comprobar) {
    const vid = idYoutube(videoUrl.value);
    vaciar(videoVista);
    if (!videoUrl.value.trim()) { videoNota.textContent = "Pegá el enlace cuando el resumen esté en YouTube (puede ser «no listado»)."; return; }
    if (!vid) { videoNota.textContent = "⚠ No parece un enlace de YouTube válido."; return; }
    videoVista.appendChild(h("img", { src: "https://i.ytimg.com/vi/" + vid + "/mqdefault.jpg", alt: "Miniatura del video", loading: "lazy" }));
    videoNota.textContent = "ID " + vid + ".";
    if (!comprobar) return;
    try {
      const r = await fetch("/api/youtube?id=" + encodeURIComponent(vid));
      const d = await r.json();
      videoNota.textContent = d.existe === true
        ? (d.restringido ? "⚠ El video existe pero YouTube podría no dejarlo ver dentro de la web. Igual se ofrecerá «Ver en YouTube»." : "✓ Video encontrado: «" + (d.titulo || "") + "».")
        : d.existe === false ? "⚠ YouTube no encuentra el video (¿es privado o el enlace está mal?)." : "No se pudo comprobar ahora; se puede guardar igual.";
    } catch (_) {
      videoNota.textContent = "No se pudo comprobar ahora; se puede guardar igual.";
    }
  }
  videoUrl.addEventListener("change", () => pintarVideo(true));

  /* ---- Lectura del formulario ---- */
  function datosFormulario() {
    const t = tipo.value;
    const d = {
      tipo: t,
      titulo: titulo.value.trim(),
      slug: slug.value.trim() || slugify(titulo.value),
      descripcion: descripcion.value.trim() || null,
      visible: visible.checked,
      estado_fotos: estFotos.value,
      estado_video: estVideo.value,
      youtube_id: idYoutube(videoUrl.value),
      partido_id: t === "partido" ? partido.value || null : null,
      jornada_id: t === "jornada" ? jornada.value || null : null,
      campeonato_id: campeonato.value || null,
      categoria_id: categoria.value || null,
      fecha: fecha.value || null
    };
    if (t === "partido") {
      // campeonato, categoría, jornada y fecha los copia la base desde el partido
      const p = partidoPorId(d.partido_id);
      if (p) { d.campeonato_id = p.campeonato_id; d.categoria_id = p.categoria_id; d.jornada_id = p.jornada_id; if (p.fecha) d.fecha = p.fecha; }
    }
    if (t === "jornada") {
      const j = jornadaPorId(d.jornada_id);
      if (j) { d.campeonato_id = j.campeonato_id; d.categoria_id = j.categoria_id; }
    }
    return d;
  }

  function validar(d) {
    if (!form.reportValidity()) return "Completá los campos obligatorios.";
    if (d.tipo === "partido" && !d.partido_id) return "Elegí el partido.";
    if (d.tipo === "partido" && conCobertura.has(d.partido_id)) return "Ese partido ya tiene una cobertura. Abrila desde la lista.";
    if (d.tipo === "jornada" && !d.jornada_id) return "Elegí la jornada.";
    if (d.tipo === "campeonato" && !d.campeonato_id) return "Elegí el campeonato.";
    if (videoUrl.value.trim() && !d.youtube_id) return "El enlace de YouTube no es válido.";
    if (d.estado_video === "disponible" && !d.youtube_id) return "Para marcar el video «Disponible», pegá su enlace de YouTube.";
    if (d.visible && d.tipo !== "pendiente" && !d.fecha) return "Para mostrarla en la web, cargá la fecha real del partido o evento (sirve para el buscador y el archivo).";
    return null;
  }

  async function avisarDuplicados(d) {
    const { data, error } = await app.sb.rpc("posibles_duplicados", {
      p_excluir: reg.id || null, p_tipo: d.tipo, p_partido: d.partido_id, p_jornada: d.jornada_id,
      p_campeonato: d.campeonato_id, p_fecha: d.fecha, p_titulo: d.titulo
    });
    if (error || !data || !data.length) return true;
    return new Promise((resolver) => {
      let ok = false;
      const seguir = h("button", { class: "btn btn--primary", type: "button" }, "Crear igual");
      const dlg = dialogo("¿Puede ser un duplicado?", [
        h("p", {}, "Ya existen coberturas parecidas:"),
        h("ul", { class: "lista-duplicados" }, data.map((x) => h("li", {},
          h("a", { href: "#/coberturas/" + x.id, onclick: () => dlg.close() }, x.titulo), " · " + x.motivo))),
        h("p", { class: "nota" }, "Si es otra cobertura distinta (por ejemplo, inauguración y premiación), creala igual."),
        h("div", { class: "acciones" }, boton("Cancelar", () => dlg.close()), seguir)]);
      seguir.addEventListener("click", () => { ok = true; dlg.close(); });
      dlg.addEventListener("close", () => resolver(ok));
    });
  }

  /* ---- Guardar (y mover fotos si cambió su visibilidad) ---- */
  const lineaProgreso = h("p", { class: "progreso", "aria-live": "polite" });
  const progreso = (texto) => (hechos, total) => { lineaProgreso.textContent = total ? texto + " " + hechos + " de " + total + " archivos…" : texto + "…"; };

  async function guardar() {
    if (["publicando", "despublicando"].includes(reg.estado)) throw new Error("Primero completá la publicación que quedó a medias (botón amarillo de arriba).");
    const d = datosFormulario();
    const problema = validar(d);
    if (problema) throw new Error(problema);

    if (!reg.id) {
      if (!(await avisarDuplicados(d))) return false;
      const { data, error } = await app.sb.from("albumes").insert(Object.assign({}, d, { visible: false })).select("*").single();
      if (error) throw error;
      reg = data;
      original = Object.assign({}, reg);
      if (d.visible) reg = await actualizarSinPisar(original, { visible: true });
    } else {
      const fotosPublicasDespues = d.visible && d.estado_fotos === "disponible";
      // 1) Si las fotos dejan de ser públicas: retirarlas primero (flujo seguro)
      if (reg.estado === "publicada" && !fotosPublicasDespues) {
        await F.despublicar(app.sb, "albumes", reg.id, { alProgresar: progreso("Retirando fotos públicas: moviendo") });
        reg = await cargar(reg.id);
        original = Object.assign({}, original, { estado: reg.estado });
      }
      // 2) Guardar solo lo cambiado, sin pisar a la otra persona
      const cambios = {};
      for (const [k, v] of Object.entries(d)) if (JSON.stringify(v) !== JSON.stringify(original[k] === undefined ? null : original[k])) cambios[k] = v;
      if (Object.keys(cambios).length) reg = await actualizarSinPisar(original, cambios);
    }
    // 3) Si las fotos tienen que ser públicas y todavía no lo son: publicarlas
    if (reg.visible && reg.estado_fotos === "disponible" && reg.estado !== "publicada") {
      await F.publicar(app.sb, "albumes", reg.id, { alProgresar: progreso("Publicando fotos: moviendo") });
      reg = await cargar(reg.id);
    }
    original = Object.assign({}, reg);
    lineaProgreso.textContent = "";
    return true;
  }

  async function accionGuardar(ev) {
    await conBoton(ev.target, async () => {
      const nuevo = !reg.id;
      try {
        if (!(await guardar())) return;
      } catch (e) {
        if (e.conflicto) {
          if (await confirmar(e.message, { aceptar: "Recargar ahora" })) await editor(main, reg.id);
          return;
        }
        throw e;
      }
      aviso("Guardado." + (reg.visible && (reg.estado === "publicada" || reg.estado_video === "disponible") ? " Ya se ve en la web." : ""));
      if (nuevo) location.replace("#/coberturas/" + reg.id);
      else await editor(main, reg.id);
    }, "Guardando…");
  }

  async function accionCompletar(ev) {
    await conBoton(ev.target, async () => {
      await F.completar(app.sb, "albumes", reg.id, { alProgresar: progreso("Completando: moviendo") });
      aviso("Listo.");
      await editor(main, reg.id);
    }, "Completando…");
  }

  async function accionBorrar(ev) {
    if (!(await confirmar("¿Borrar la cobertura «" + reg.titulo + "» con todas sus fotos" + (fotos.some((f) => f.original_path) ? " y originales" : "") + "? No se puede deshacer.", { aceptar: "Borrar definitivamente", peligro: true }))) return;
    await conBoton(ev.target, async () => {
      await F.borrarPublicacion(app.sb, "albumes", reg.id, { alProgresar: progreso("Borrando") });
      aviso("Cobertura borrada.");
      location.hash = "#/coberturas";
    }, "Borrando…");
  }

  async function datosVistaPrevia() {
    const d = datosFormulario();
    const urls = await F.urlsParaVer(app.sb, [reg.portada_path, ...fotos.map((f) => f.path), ...fotos.map((f) => f.mini_path)]);
    const p = partidoPorId(d.partido_id);
    const fotosVista = d.estado_fotos === "disponible" ? fotos.map((f) => ({ src: urls[f.path], mini: urls[f.mini_path] || urls[f.path], alt: f.alt, descripcion: f.descripcion })) : [];
    return {
      tipo: "albumes", titulo: d.titulo, descripcion: d.descripcion, fecha: d.fecha,
      campeonato: nombreCampeonato(d.campeonato_id), categoria: nombreCategoria(d.categoria_id),
      partido: p ? etiquetaPartido(Object.assign({}, p, { fecha: null })) : nombreJornada(d.jornada_id),
      portada: (fotosVista.length && (urls[reg.portada_path] || fotosVista[0].src)) || (d.youtube_id ? "https://i.ytimg.com/vi/" + d.youtube_id + "/hqdefault.jpg" : null),
      portada_alt: reg.portada_alt, fotos: fotosVista,
      video: d.estado_video === "disponible" ? d.youtube_id : null,
      avisoFotos: d.estado_fotos !== "disponible",
      // Mismos estados públicos que calcula la base (ver migración 2)
      estadoFotos: d.estado_fotos === "disponible" && fotosVista.length ? "disponible"
        : d.estado_fotos === "disponible" ? "preparacion" : d.estado_fotos,
      estadoVideo: d.estado_video === "disponible" && d.youtube_id ? "disponible"
        : d.estado_video === "disponible" ? "edicion" : d.estado_video
    };
  }

  /* ---- Pantalla ---- */
  const form = h("form", { class: "form form--ancho", onsubmit: (ev) => ev.preventDefault() });
  form.append(
    campo("Tipo de cobertura", tipo),
    h("div", { class: "form__fila" }, filaCamp, filaCat, filaJor),
    filaPartido,
    campo("Título *", titulo),
    campo("Dirección en la web", slug, slugFijo
      ? "Fija desde la primera publicación: así no se rompen los enlaces compartidos."
      : location.origin + "/coberturas/…"),
    campo("Descripción", descripcion),
    filaFecha);

  const bloqueEstado = h("section", { class: "bloque" },
    h("h2", { text: "Publicación" }),
    h("label", { class: "campo campo--check" }, visible, h("span", { text: "Visible en la web" })),
    h("p", { class: "nota" }, "Se muestra cuando las fotos o el video están «Disponibles». Cada uno puede completarse por separado."),
    h("div", { class: "form__fila" },
      campo("📷 Fotos", estFotos, "Pendientes → En preparación → Disponibles. «No tendrá fotos»: la web no las anuncia."),
      campo("▶ Video", estVideo, "Pendiente → En edición → Disponible. «No tendrá video»: la web no lo anuncia.")),
    campo("Enlace del video resumen (YouTube)", videoUrl), videoVista, videoNota);

  const fechas = reg.id ? h("p", { class: "nota fechas-registro" },
    "Creada: " + fechaHora(reg.creado_en) +
    (reg.publicado_en ? " · Publicada por primera vez: " + fechaHora(reg.publicado_en) : " · Nunca publicada") +
    (reg.actividad_en ? " · Última novedad pública: " + fechaHora(reg.actividad_en) : "")) : null;

  const pendiente = ["publicando", "despublicando"].includes(reg.estado);
  const publica = reg.visible && (reg.estado === "publicada" || reg.estado_video === "disponible");
  const barra = h("div", { class: "barra-acciones" },
    boton("Guardar", accionGuardar, "btn--primary"),
    boton("Vista previa", (ev) => conBoton(ev.target, async () => abrirVistaPrevia(await datosVistaPrevia()))),
    publica ? boton("Compartir", () => abrirCompartir(app.sb, "coberturas", Object.assign({}, reg, { portada_path: reg.estado === "publicada" ? reg.portada_path : null }))) : null,
    publica ? h("a", { class: "btn btn--sec", href: "/coberturas/" + reg.slug, target: "_blank", rel: "noopener" }, "Ver en la web ↗") : null,
    reg.id ? boton("Borrar", accionBorrar, "btn--peligro btn--derecha") : null);

  vaciar(main,
    h("a", { class: "volver", href: "#/coberturas" }, "← Coberturas"),
    h("div", { class: "cabecera" },
      h("h1", { text: reg.id ? reg.titulo : "Nueva cobertura" }),
      reg.id ? h("span", { class: "estado " + (publica ? "estado--publicada" : "") }, publica ? "Se ve en la web" : "No se ve en la web") : null),
    reg.tipo === "pendiente" ? h("div", { class: "alerta alerta--suave" },
      "Contenido anterior sin clasificar. Elegí su tipo (partido, jornada, campeonato o evento) y completá la fecha real. Mientras tanto se conserva tal como estaba.") : null,
    pendiente ? h("div", { class: "alerta", role: "alert" },
      h("strong", { text: "Un movimiento de fotos quedó a medias." }), " Probablemente se cortó internet. Las fotos no se muestran mientras tanto. ",
      boton("Completar ahora", accionCompletar, "btn--primary")) : null,
    barra, lineaProgreso, fechas,
    h("section", { class: "bloque" }, form),
    bloqueEstado,
    reg.id ? seccionFotos() : h("section", { class: "bloque" }, h("h2", { text: "Fotos" }), h("p", { class: "nota" }, "Guardá la cobertura para empezar a subir fotos.")));
  aplicarTipo();
  pintarVideo(false);
  if (!reg.id) tipo.focus();

  /* =================== FOTOS =================== */
  function seccionFotos() {
    const contenedor = h("section", { class: "bloque" }, h("h2", { text: "Fotos (" + fotos.length + ")" }));
    const entrada = h("input", { type: "file", accept: "image/jpeg,image/png,image/webp", multiple: true, class: "oculto", id: "subirFotos" });
    const conservar = h("input", { type: "checkbox", checked: true });
    const zona = h("label", { class: "zona-subida", for: "subirFotos" },
      h("strong", { text: "Tocá para elegir fotos" }), " o arrastralas acá",
      h("small", { text: "JPG, PNG o WebP hasta 50 MB. Se crea una versión web en alta calidad y una miniatura." }));
    const grilla = h("div", { class: "fotos" });
    const progresoFotos = h("p", { class: "progreso", "aria-live": "polite" });
    contenedor.append(
      h("label", { class: "campo campo--check" }, conservar, h("span", { text: "Guardar también el archivo original (privado, ocupa más espacio)" })),
      entrada, zona, progresoFotos, grilla);

    // Si el espacio está por encima del 70 %, sugerir no guardar originales
    F.usoAlmacenamiento(app.sb).then((u) => {
      if (u.proporcion >= 0.7) {
        conservar.checked = false;
        conservar.parentElement.appendChild(h("small", { class: "campo__ayuda" }, " (desactivado: queda poco espacio en el plan gratuito)"));
      }
    }).catch(() => {});

    async function subir(archivos) {
      const lista = [...archivos];
      if (!lista.length) return;
      let orden = fotos.reduce((m, f) => Math.max(m, f.orden), 0);
      const errores = [];
      zona.classList.add("zona-subida--ocupada");
      for (let i = 0; i < lista.length; i++) {
        progresoFotos.textContent = "Subiendo " + (i + 1) + " de " + lista.length + "…";
        try {
          const foto = await prepararFoto(lista[i], { conservarOriginal: conservar.checked });
          orden += 10;
          const nueva = await F.subirFotoAlbum(app.sb, reg.id, foto, { orden });
          fotos.push(nueva);
          if (!reg.portada_path) {
            const { data } = await app.sb.from("albumes").update({ portada_path: nueva.path }).eq("id", reg.id).select("*").single();
            if (data) { reg = data; original.portada_path = data.portada_path; }
          }
        } catch (e) {
          errores.push(lista[i].name + ": " + errorAmigable(e));
        }
      }
      zona.classList.remove("zona-subida--ocupada");
      progresoFotos.textContent = errores.length
        ? "Se subieron " + (lista.length - errores.length) + " de " + lista.length + ". Fallaron: " + errores.join(" · ")
        : "Se subieron " + lista.length + " foto(s)." + (estFotos.value !== "disponible" ? " Cuando estén listas, marcá «Fotos: Disponibles» y guardá." : "");
      if (errores.length) aviso("Algunas fotos no se subieron. Mirá el detalle debajo del recuadro.", "error");
      entrada.value = "";
      if (estFotos.value === "pendiente" || estFotos.value === "no_aplica") estFotos.value = "preparacion";
      contenedor.querySelector("h2").textContent = "Fotos (" + fotos.length + ")";
      await pintar();
    }

    entrada.addEventListener("change", () => subir(entrada.files));
    zona.addEventListener("dragover", (ev) => { ev.preventDefault(); zona.classList.add("zona-subida--encima"); });
    zona.addEventListener("dragleave", () => zona.classList.remove("zona-subida--encima"));
    zona.addEventListener("drop", (ev) => { ev.preventDefault(); zona.classList.remove("zona-subida--encima"); subir(ev.dataTransfer.files); });

    async function actualizarFoto(foto, cambios) {
      const { data, error } = await app.sb.from("fotos").update(cambios).eq("id", foto.id).select("*").single();
      if (error) throw error;
      Object.assign(foto, data);
    }
    async function mover(indice, delta) {
      const otro = indice + delta;
      if (otro < 0 || otro >= fotos.length) return;
      [fotos[indice], fotos[otro]] = [fotos[otro], fotos[indice]];
      const cambios = [];
      fotos.forEach((f, i) => { const nuevo = (i + 1) * 10; if (f.orden !== nuevo) cambios.push([f, nuevo]); });
      await Promise.all(cambios.map(([f, o]) => actualizarFoto(f, { orden: o })));
      await pintar();
    }
    async function hacerPortada(foto) {
      const { data, error } = await app.sb.from("albumes").update({ portada_path: foto.path, portada_alt: foto.alt || null }).eq("id", reg.id).select("*").single();
      if (error) throw error;
      reg = data;
      original.portada_path = data.portada_path;
      original.portada_alt = data.portada_alt;
      aviso("Portada actualizada.");
      await pintar();
    }
    async function quitar(foto) {
      if (!(await confirmar("¿Borrar esta foto" + (foto.original_path ? " y su original" : "") + "?", { aceptar: "Borrar", peligro: true }))) return;
      if (reg.portada_path === foto.path) {
        const otra = fotos.find((f) => f.id !== foto.id);
        const { data, error } = await app.sb.from("albumes").update({ portada_path: otra ? otra.path : null, portada_alt: otra ? otra.alt : null }).eq("id", reg.id).select("*").single();
        if (error) throw error;
        reg = data;
        original.portada_path = data.portada_path;
      }
      await F.borrarFoto(app.sb, foto);
      fotos = fotos.filter((f) => f.id !== foto.id);
      aviso("Foto borrada.");
      await pintar();
    }
    async function bajarOriginal(foto) {
      const url = await F.enlaceOriginal(app.sb, foto);
      if (url) window.open(url, "_blank", "noopener");
    }

    async function pintar() {
      const urls = await F.urlsParaVer(app.sb, fotos.map((f) => f.mini_path || f.path));
      vaciar(grilla, fotos.length ? fotos.map((f, i) => {
        const esPortada = reg.portada_path === f.path;
        const alt = h("input", { type: "text", maxlength: 200, placeholder: "Qué se ve (para personas ciegas)", "aria-label": "Texto alternativo" });
        const leyenda = h("input", { type: "text", maxlength: 200, placeholder: "Leyenda (opcional)", "aria-label": "Leyenda" });
        alt.value = f.alt || "";
        leyenda.value = f.descripcion || "";
        alt.addEventListener("change", () => actualizarFoto(f, { alt: alt.value.trim() || null }).catch((e) => aviso(errorAmigable(e), "error")));
        leyenda.addEventListener("change", () => actualizarFoto(f, { descripcion: leyenda.value.trim() || null }).catch((e) => aviso(errorAmigable(e), "error")));
        return h("figure", { class: "foto" + (esPortada ? " foto--portada" : "") },
          h("img", { src: urls[f.mini_path || f.path], alt: f.alt || "", loading: "lazy" }),
          esPortada ? h("span", { class: "foto__sello" }, "Portada") : null,
          h("figcaption", {}, alt, leyenda,
            h("div", { class: "foto__acciones" },
              boton("◀", (ev) => conBoton(ev.target, () => mover(i, -1)), "btn--mini", { "aria-label": "Mover antes", disabled: i === 0 }),
              boton("▶", (ev) => conBoton(ev.target, () => mover(i, 1)), "btn--mini", { "aria-label": "Mover después", disabled: i === fotos.length - 1 }),
              esPortada ? null : boton("Portada", (ev) => conBoton(ev.target, () => hacerPortada(f)), "btn--mini"),
              f.original_path ? boton("Original ↓", (ev) => conBoton(ev.target, () => bajarOriginal(f)), "btn--mini") : null,
              boton("Borrar", (ev) => conBoton(ev.target, () => quitar(f)), "btn--mini btn--peligro"))));
      }) : h("p", { class: "nota" }, "Todavía no hay fotos."));
    }
    pintar().catch((e) => aviso(errorAmigable(e), "error"));
    return contenedor;
  }
}
