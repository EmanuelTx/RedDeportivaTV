/* =========================================================
   Panel RedDeportivaTV · noticias y álbumes
   Lista, editor, fotos, portada, publicar/despublicar,
   vista previa y compartir.
   ========================================================= */
import * as F from "../../js/admin/fotos-publicacion.js";
import { app, recargarCatalogos, opcCampeonatos, opcCategorias, opcPartidos, nombreCampeonato, nombreCategoria, partidoPorId, etiquetaPartido } from "./estado.js";
import { h, vaciar, aviso, confirmar, campo, opciones, boton, conBoton, slugify, fechaCorta, etiquetaEstado, errorAmigable } from "./ui.js";
import { prepararFoto } from "./imagenes.js";
import { abrirVistaPrevia } from "./vista-previa.js";
import { abrirCompartir } from "./compartir.js";

const NOMBRES = {
  noticias: { plural: "Noticias", singular: "noticia", nueva: "Nueva noticia", art: "la" },
  albumes: { plural: "Álbumes", singular: "álbum", nueva: "Nuevo álbum", art: "el" }
};

export async function vista(main, tipo, params) {
  await recargarCatalogos();
  if (params[0]) return editor(main, tipo, params[0] === "nuevo" ? null : params[0]);
  return lista(main, tipo);
}

/* =================== LISTA =================== */

async function lista(main, tipo) {
  const N = NOMBRES[tipo];
  const columnas = "id,slug,titulo,estado,campeonato_id,categoria_id,partido_id,publicado_en,actualizado_en,portada_path" +
    (tipo === "albumes" ? ",fecha,fotos(count)" : "");
  const { data, error } = await app.sb.from(tipo).select(columnas).order("actualizado_en", { ascending: false });
  if (error) throw error;

  const fEstado = opciones(h("select", { "aria-label": "Estado" }),
    [{ valor: "borrador", texto: "Borradores" }, { valor: "publicada", texto: "Publicadas" }, { valor: "pendiente", texto: "A medias" }],
    { vacio: "Todos los estados" });
  const fCamp = opciones(h("select", { "aria-label": "Campeonato" }), opcCampeonatos(), { vacio: "Todos los campeonatos" });
  const fCat = opciones(h("select", { "aria-label": "Categoría" }), opcCategorias(), { vacio: "Todas las categorías" });
  const buscar = h("input", { type: "search", placeholder: "Buscar por título…", "aria-label": "Buscar" });
  const cuerpo = h("tbody");

  function pintar() {
    const q = buscar.value.trim().toLowerCase();
    const filas = data.filter((r) =>
      (!fEstado.value || (fEstado.value === "pendiente" ? ["publicando", "despublicando"].includes(r.estado) : r.estado === fEstado.value)) &&
      (!fCamp.value || r.campeonato_id === fCamp.value) &&
      (!fCat.value || r.categoria_id === fCat.value) &&
      (!q || r.titulo.toLowerCase().includes(q)));
    vaciar(cuerpo, filas.length
      ? filas.map((r) => h("tr", { class: ["publicando", "despublicando"].includes(r.estado) ? "fila--alerta" : "" },
          h("td", { "data-col": "Título" }, h("a", { href: "#/" + tipo + "/" + r.id, class: "enlace-fuerte" }, r.titulo)),
          h("td", { "data-col": "Estado" }, etiquetaEstado(r.estado)),
          h("td", { "data-col": "Campeonato" }, [nombreCampeonato(r.campeonato_id), nombreCategoria(r.categoria_id)].filter(Boolean).join(" · ")),
          h("td", { "data-col": "Fecha" }, fechaCorta(r.fecha || r.publicado_en || r.actualizado_en)),
          tipo === "albumes" ? h("td", { "data-col": "Fotos" }, String(r.fotos && r.fotos[0] ? r.fotos[0].count : 0)) : null,
          h("td", { class: "tabla__acciones" }, h("a", { class: "btn btn--sec", href: "#/" + tipo + "/" + r.id }, "Editar"))))
      : h("tr", {}, h("td", { colspan: 6, class: "vacio" }, data.length ? "No hay resultados con ese filtro." : "Todavía no hay " + N.plural.toLowerCase() + ". Creá " + N.art + " primer" + (tipo === "noticias" ? "a" : "o") + ".")));
  }
  [fEstado, fCamp, fCat].forEach((s) => s.addEventListener("change", pintar));
  buscar.addEventListener("input", pintar);

  vaciar(main,
    h("div", { class: "cabecera" },
      h("h1", { text: N.plural }),
      h("a", { class: "btn btn--primary", href: "#/" + tipo + "/nuevo" }, "+ " + N.nueva)),
    h("div", { class: "filtros" }, buscar, fEstado, fCamp, fCat),
    h("div", { class: "tabla-envoltura" },
      h("table", { class: "tabla" },
        h("thead", {}, h("tr", {}, ["Título", "Estado", "Campeonato", "Fecha", tipo === "albumes" ? "Fotos" : null, ""].filter((t) => t !== null).map((t) => h("th", { text: t })))),
        cuerpo)));
  pintar();
}

/* =================== EDITOR =================== */

async function cargar(tipo, id) {
  const { data, error } = await app.sb.from(tipo).select("*").eq("id", id).single();
  if (error) throw error;
  return data;
}

async function cargarFotos(albumId) {
  const { data, error } = await app.sb.from("fotos").select("*").eq("album_id", albumId).order("orden").order("creado_en");
  if (error) throw error;
  return data;
}

async function editor(main, tipo, id) {
  const N = NOMBRES[tipo];
  const esAlbum = tipo === "albumes";
  let reg = id ? await cargar(tipo, id) : { estado: "borrador" };
  let fotos = esAlbum && id ? await cargarFotos(id) : [];
  let archivoPortada = null; // portada nueva elegida (noticias), se sube al guardar

  /* ---- Controles ---- */
  const titulo = h("input", { type: "text", required: true, maxlength: 160, placeholder: esAlbum ? "Final Sub 17 · Futsal Paranaense" : "Título de la noticia" });
  const slug = h("input", { type: "text", maxlength: 120, pattern: "[a-z0-9]+(-[a-z0-9]+)*" });
  const descripcion = h("textarea", { rows: 2, maxlength: 300, placeholder: "Una o dos líneas. Es lo que se ve al compartir en Facebook y WhatsApp." });
  const contenido = esAlbum ? null : h("textarea", { rows: 12, maxlength: 50000, placeholder: "Escribí la noticia. Dejá una línea en blanco entre párrafos." });
  const fecha = esAlbum ? h("input", { type: "date" }) : null;
  const campeonato = h("select");
  const categoria = h("select");
  const partido = h("select");
  const portadaAlt = h("input", { type: "text", maxlength: 200, placeholder: "Qué se ve en la foto (para personas ciegas y buscadores)" });

  titulo.value = reg.titulo || "";
  slug.value = reg.slug || "";
  descripcion.value = reg.descripcion || "";
  if (contenido) contenido.value = reg.contenido || "";
  if (fecha) fecha.value = reg.fecha || "";
  portadaAlt.value = reg.portada_alt || "";
  opciones(campeonato, opcCampeonatos(), { vacio: "— Sin campeonato —", valor: reg.campeonato_id });
  opciones(categoria, opcCategorias(), { vacio: "— Sin categoría —", valor: reg.categoria_id });
  const pintarPartidos = (valor) => opciones(partido, opcPartidos(campeonato.value, categoria.value), { vacio: "— Sin partido —", valor });
  pintarPartidos(reg.partido_id);
  campeonato.addEventListener("change", () => pintarPartidos(partido.value));
  categoria.addEventListener("change", () => pintarPartidos(partido.value));
  partido.addEventListener("change", () => {
    const p = partidoPorId(partido.value);
    if (!p) return;
    if (!campeonato.value) { campeonato.value = p.campeonato_id; }
    if (!categoria.value && p.categoria_id) categoria.value = p.categoria_id;
    if (fecha && !fecha.value && p.fecha) fecha.value = p.fecha;
  });

  // Dirección (slug): automática mientras sea borrador y no se edite a mano.
  let slugManual = Boolean(reg.slug);
  const slugBloqueado = reg.estado !== "borrador";
  slug.readOnly = slugBloqueado;
  slug.addEventListener("input", () => (slugManual = true));
  titulo.addEventListener("input", () => { if (!slugManual && !slugBloqueado) slug.value = slugify(titulo.value); });

  /* ---- Datos del formulario ---- */
  function datosFormulario() {
    const d = {
      titulo: titulo.value.trim(),
      slug: slug.value.trim() || slugify(titulo.value),
      descripcion: descripcion.value.trim() || null,
      campeonato_id: campeonato.value || null,
      categoria_id: categoria.value || null,
      partido_id: partido.value || null,
      portada_alt: portadaAlt.value.trim() || null
    };
    if (contenido) d.contenido = contenido.value.trim() || null;
    if (fecha) d.fecha = fecha.value || null;
    return d;
  }

  async function guardar() {
    if (!form.reportValidity()) throw new Error("Completá los campos obligatorios.");
    const datos = datosFormulario();
    if (!datos.slug) throw new Error("Escribí un título.");
    if (reg.id) {
      const { data, error } = await app.sb.from(tipo).update(datos).eq("id", reg.id).select("*").single();
      if (error) throw error;
      reg = data;
    } else {
      const { data, error } = await app.sb.from(tipo).insert(datos).select("*").single();
      if (error) throw error;
      reg = data;
    }
    if (archivoPortada) {
      const anterior = reg.portada_path;
      const nueva = await F.subirPortada(app.sb, tipo, reg.id, archivoPortada);
      const { data, error } = await app.sb.from(tipo).update({ portada_path: nueva }).eq("id", reg.id).select("*").single();
      if (error) { await F.borrarArchivos(app.sb, [nueva]); throw error; }
      reg = data;
      archivoPortada = null;
      if (anterior && anterior !== nueva) await F.borrarArchivos(app.sb, [anterior]).catch(() => {});
    }
    return reg;
  }

  async function recargarEditor() {
    await editor(main, tipo, reg.id);
  }

  /* ---- Acciones ---- */
  const estadoLinea = h("p", { class: "progreso", "aria-live": "polite" });
  const progreso = (texto) => (hechos, total) => { estadoLinea.textContent = total ? texto + " " + hechos + " de " + total + " archivos…" : texto + "…"; };

  async function accionGuardar(ev) {
    await conBoton(ev.target, async () => {
      const nuevo = !reg.id;
      await guardar();
      aviso("Guardado.");
      if (nuevo) location.replace("#/" + tipo + "/" + reg.id);
      else await recargarEditor();
    }, "Guardando…");
  }

  async function accionPublicar(ev) {
    await conBoton(ev.target, async () => {
      await guardar();
      if (!reg.titulo) throw new Error("Falta el título.");
      if (!esAlbum && !reg.contenido) throw new Error("Escribí el contenido de la noticia antes de publicar.");
      if (esAlbum && !fotos.length) throw new Error("Subí al menos una foto antes de publicar el álbum.");
      if (!(await confirmar("¿Publicar «" + reg.titulo + "»? Va a quedar visible en la web.", { aceptar: "Publicar" }))) return;
      await F.publicar(app.sb, tipo, reg.id, { alProgresar: progreso("Publicando: moviendo") });
      aviso("¡Publicad" + (esAlbum ? "o" : "a") + "! Ya se ve en la web.");
      await recargarEditor();
    }, "Publicando…");
  }

  async function accionDespublicar(ev) {
    if (!(await confirmar("¿Despublicar «" + reg.titulo + "»? Deja de verse en la web enseguida. Las fotos pueden seguir en caché hasta 10 minutos.", { aceptar: "Despublicar", peligro: true }))) return;
    await conBoton(ev.target, async () => {
      await F.despublicar(app.sb, tipo, reg.id, { alProgresar: progreso("Despublicando: moviendo") });
      aviso("Despublicad" + (esAlbum ? "o" : "a") + ". Volvió a borrador.");
      await recargarEditor();
    }, "Despublicando…");
  }

  async function accionCompletar(ev) {
    await conBoton(ev.target, async () => {
      const estado = await F.completar(app.sb, tipo, reg.id, { alProgresar: progreso("Completando: moviendo") });
      aviso("Listo: quedó " + (estado === "publicada" ? "publicada" : "en borrador") + ".");
      await recargarEditor();
    }, "Completando…");
  }

  async function accionRevertir(ev) {
    await conBoton(ev.target, async () => {
      if (reg.estado === "publicando") await F.despublicar(app.sb, tipo, reg.id, { alProgresar: progreso("Cancelando") });
      else await F.publicar(app.sb, tipo, reg.id, { alProgresar: progreso("Cancelando") });
      aviso("Listo.");
      await recargarEditor();
    }, "Cancelando…");
  }

  async function accionBorrar(ev) {
    if (!(await confirmar("¿Borrar " + N.art + " " + N.singular + " «" + reg.titulo + "»" + (esAlbum ? " con todas sus fotos" : "") + "? No se puede deshacer.", { aceptar: "Borrar definitivamente", peligro: true }))) return;
    await conBoton(ev.target, async () => {
      await F.borrarPublicacion(app.sb, tipo, reg.id, { alProgresar: progreso("Borrando") });
      aviso("Borrad" + (esAlbum ? "o" : "a") + ".");
      location.hash = "#/" + tipo;
    }, "Borrando…");
  }

  async function datosVistaPrevia() {
    const d = datosFormulario();
    let portadaUrl = null;
    let fotosVista = [];
    if (archivoPortada) portadaUrl = URL.createObjectURL(archivoPortada);
    const rutas = [reg.portada_path, ...fotos.map((f) => f.path), ...fotos.map((f) => f.mini_path)];
    const urls = await F.urlsParaVer(app.sb, rutas);
    if (!portadaUrl && reg.portada_path) portadaUrl = urls[reg.portada_path];
    fotosVista = fotos.map((f) => ({ src: urls[f.path], mini: urls[f.mini_path] || urls[f.path], alt: f.alt, descripcion: f.descripcion }));
    if (!portadaUrl && fotosVista[0]) portadaUrl = fotosVista[0].src;
    const p = partidoPorId(d.partido_id);
    return {
      tipo, titulo: d.titulo, descripcion: d.descripcion, contenido: d.contenido, slug: d.slug,
      fecha: d.fecha || (p && p.fecha) || reg.publicado_en || new Date().toISOString(),
      campeonato: nombreCampeonato(d.campeonato_id), categoria: nombreCategoria(d.categoria_id),
      partido: p ? etiquetaPartido(Object.assign({}, p, { fecha: null })) : "",
      portada: portadaUrl, portada_alt: d.portada_alt, fotos: fotosVista
    };
  }

  /* ---- Formulario ---- */
  const form = h("form", { class: "form form--ancho", onsubmit: (ev) => ev.preventDefault() });
  form.append(
    campo("Título *", titulo),
    campo("Dirección en la web", slug, slugBloqueado
      ? "No se puede cambiar mientras está publicada: rompería los enlaces ya compartidos."
      : "Se completa sola: " + location.origin + "/" + tipo + "/…"),
    campo("Resumen", descripcion, "Máximo 300 caracteres."),
    contenido ? campo("Contenido *", contenido) : null,
    h("div", { class: "form__fila" },
      fecha ? campo("Fecha", fecha) : null,
      campo("Campeonato", campeonato),
      campo("Categoría", categoria),
      campo("Partido", partido)),
    !app.cat.partidos.length ? h("p", { class: "nota" }, "Tip: cargá partidos en «Partidos y fechas» para vincularlos.") : null
  );

  // Portada de noticias (archivo propio)
  let zonaPortada = null;
  if (!esAlbum) {
    const vistaPortada = h("img", { class: "portada__img", alt: "" });
    const entrada = h("input", { type: "file", accept: "image/jpeg,image/png,image/webp" });
    if (reg.portada_path) F.urlsParaVer(app.sb, [reg.portada_path]).then((u) => { vistaPortada.src = u[reg.portada_path]; });
    entrada.addEventListener("change", async () => {
      const archivo = entrada.files[0];
      if (!archivo) return;
      try {
        const preparada = await prepararFoto(archivo);
        archivoPortada = preparada.archivo;
        vistaPortada.src = URL.createObjectURL(archivoPortada);
        aviso("Portada lista. Se sube al tocar «Guardar».");
      } catch (e) {
        entrada.value = "";
        aviso(errorAmigable(e), "error");
      }
    });
    zonaPortada = h("section", { class: "bloque" },
      h("h2", { text: "Foto de portada" }),
      h("div", { class: "portada" }, vistaPortada,
        h("div", {}, campo("Elegir foto", entrada, "JPG, PNG o WebP. Se reduce y se le quitan los datos de ubicación."), campo("Texto alternativo", portadaAlt))));
  }

  /* ---- Barra de acciones ---- */
  const pendiente = ["publicando", "despublicando"].includes(reg.estado);
  const barra = h("div", { class: "barra-acciones" },
    boton("Guardar", accionGuardar, "btn--primary"),
    boton("Vista previa", async (ev) => conBoton(ev.target, async () => abrirVistaPrevia(await datosVistaPrevia()))),
    reg.id && reg.estado === "borrador" ? boton("Publicar", accionPublicar, "btn--publicar") : null,
    reg.estado === "publicada" ? boton("Compartir", () => abrirCompartir(app.sb, tipo, reg)) : null,
    reg.estado === "publicada" ? h("a", { class: "btn btn--sec", href: "/" + tipo + "/" + reg.slug, target: "_blank", rel: "noopener" }, "Ver en la web ↗") : null,
    reg.estado === "publicada" ? boton("Despublicar", accionDespublicar, "btn--sec") : null,
    reg.id ? boton("Borrar", accionBorrar, "btn--peligro btn--derecha") : null);

  const alerta = pendiente
    ? h("div", { class: "alerta", role: "alert" },
        h("strong", { text: reg.estado === "publicando" ? "La publicación quedó a medias." : "La despublicación quedó a medias." }),
        " Probablemente se cortó internet. Mientras tanto no se muestra en la web. ",
        boton("Completar ahora", accionCompletar, "btn--primary"),
        boton(reg.estado === "publicando" ? "Cancelar y dejar en borrador" : "Cancelar y dejar publicada", accionRevertir))
    : null;

  vaciar(main,
    h("a", { class: "volver", href: "#/" + tipo }, "← " + N.plural),
    h("div", { class: "cabecera" },
      h("h1", { text: reg.id ? reg.titulo : N.nueva }),
      reg.id ? etiquetaEstado(reg.estado) : null),
    alerta,
    barra,
    estadoLinea,
    h("section", { class: "bloque" }, form),
    zonaPortada,
    esAlbum ? seccionFotos() : null);
  titulo.focus();

  /* =================== FOTOS DEL ÁLBUM =================== */
  function seccionFotos() {
    const contenedor = h("section", { class: "bloque" }, h("h2", { text: "Fotos" }));
    if (!reg.id) {
      contenedor.appendChild(h("p", { class: "nota" }, "Guardá el álbum para empezar a subir fotos."));
      return contenedor;
    }
    const entrada = h("input", { type: "file", accept: "image/jpeg,image/png,image/webp", multiple: true, class: "oculto", id: "subirFotos" });
    const zona = h("label", { class: "zona-subida", for: "subirFotos" },
      h("strong", { text: "Tocá para elegir fotos" }), " o arrastralas acá",
      h("small", { text: "JPG, PNG o WebP hasta 40 MB. Se reducen a 2048 px y se les quitan los datos de ubicación." }));
    const grilla = h("div", { class: "fotos" });
    const progresoFotos = h("p", { class: "progreso", "aria-live": "polite" });
    contenedor.append(entrada, zona, progresoFotos, grilla);

    async function subir(archivos) {
      const lista = [...archivos];
      if (!lista.length) return;
      let orden = fotos.reduce((m, f) => Math.max(m, f.orden), 0);
      const errores = [];
      zona.classList.add("zona-subida--ocupada");
      for (let i = 0; i < lista.length; i++) {
        progresoFotos.textContent = "Subiendo " + (i + 1) + " de " + lista.length + "…";
        try {
          const foto = await prepararFoto(lista[i]);
          orden += 10;
          const nueva = await F.subirFotoAlbum(app.sb, reg.id, foto, { orden });
          fotos.push(nueva);
          if (!reg.portada_path) {
            const { data } = await app.sb.from("albumes").update({ portada_path: nueva.path }).eq("id", reg.id).select("*").single();
            if (data) reg = data;
          }
        } catch (e) {
          errores.push(lista[i].name + ": " + errorAmigable(e));
        }
      }
      zona.classList.remove("zona-subida--ocupada");
      progresoFotos.textContent = errores.length
        ? "Se subieron " + (lista.length - errores.length) + " de " + lista.length + ". Fallaron: " + errores.join(" · ")
        : "Se subieron " + lista.length + " foto(s).";
      if (errores.length) aviso("Algunas fotos no se subieron. Mirá el detalle debajo del recuadro.", "error");
      entrada.value = "";
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
      // Renumera y guarda solo las que cambiaron
      const cambios = [];
      fotos.forEach((f, i) => { const nuevo = (i + 1) * 10; if (f.orden !== nuevo) cambios.push([f, nuevo]); });
      await Promise.all(cambios.map(([f, o]) => actualizarFoto(f, { orden: o })));
      await pintar();
    }

    async function hacerPortada(foto) {
      const { data, error } = await app.sb.from("albumes").update({ portada_path: foto.path, portada_alt: foto.alt || null }).eq("id", reg.id).select("*").single();
      if (error) throw error;
      reg = data;
      portadaAlt.value = reg.portada_alt || "";
      aviso("Portada actualizada.");
      await pintar();
    }

    async function quitar(foto) {
      if (!(await confirmar("¿Borrar esta foto del álbum?", { aceptar: "Borrar", peligro: true }))) return;
      if (reg.portada_path === foto.path) {
        const otra = fotos.find((f) => f.id !== foto.id);
        const { data, error } = await app.sb.from("albumes").update({ portada_path: otra ? otra.path : null, portada_alt: otra ? otra.alt : null }).eq("id", reg.id).select("*").single();
        if (error) throw error;
        reg = data;
      }
      await F.borrarFoto(app.sb, foto);
      fotos = fotos.filter((f) => f.id !== foto.id);
      aviso("Foto borrada.");
      await pintar();
    }

    async function pintar() {
      const urls = await F.urlsParaVer(app.sb, fotos.map((f) => f.mini_path || f.path));
      vaciar(grilla, fotos.length ? fotos.map((f, i) => {
        const esPortada = reg.portada_path === f.path;
        const alt = h("input", { type: "text", maxlength: 200, placeholder: "Texto alternativo", "aria-label": "Texto alternativo" });
        const leyenda = h("input", { type: "text", maxlength: 200, placeholder: "Leyenda (opcional)", "aria-label": "Leyenda" });
        alt.value = f.alt || "";
        leyenda.value = f.descripcion || "";
        alt.addEventListener("change", () => actualizarFoto(f, { alt: alt.value.trim() || null })
          .then(async () => {
            if (esPortada) {
              const { data } = await app.sb.from("albumes").update({ portada_alt: f.alt }).eq("id", reg.id).select("*").single();
              if (data) { reg = data; portadaAlt.value = reg.portada_alt || ""; }
            }
          }).catch((e) => aviso(errorAmigable(e), "error")));
        leyenda.addEventListener("change", () => actualizarFoto(f, { descripcion: leyenda.value.trim() || null }).catch((e) => aviso(errorAmigable(e), "error")));
        return h("figure", { class: "foto" + (esPortada ? " foto--portada" : "") },
          h("img", { src: urls[f.mini_path || f.path], alt: f.alt || "", loading: "lazy" }),
          esPortada ? h("span", { class: "foto__sello" }, "Portada") : null,
          h("figcaption", {}, alt, leyenda,
            h("div", { class: "foto__acciones" },
              boton("◀", (ev) => conBoton(ev.target, () => mover(i, -1)), "btn--mini", { "aria-label": "Mover antes", disabled: i === 0 }),
              boton("▶", (ev) => conBoton(ev.target, () => mover(i, 1)), "btn--mini", { "aria-label": "Mover después", disabled: i === fotos.length - 1 }),
              esPortada ? null : boton("Usar de portada", (ev) => conBoton(ev.target, () => hacerPortada(f)), "btn--mini"),
              boton("Borrar", (ev) => conBoton(ev.target, () => quitar(f)), "btn--mini btn--peligro"))));
      }) : h("p", { class: "nota" }, "Todavía no hay fotos."));
    }
    pintar().catch((e) => aviso(errorAmigable(e), "error"));
    return contenedor;
  }
}
