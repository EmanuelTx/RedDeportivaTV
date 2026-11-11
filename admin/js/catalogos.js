/* =========================================================
   Panel RedDeportivaTV · campeonatos, categorías, jornadas y partidos
   - Cada campeonato tiene SUS categorías.
   - Las jornadas son opcionales y pertenecen a un campeonato (y
     categoría, si corresponde). Se pueden crear desde el partido.
   - Los partidos de una jornada se ordenan con ↑ ↓.
   ========================================================= */
import { app, recargarCatalogos, opcCampeonatos, opcCategorias, nombreCampeonato, nombreCategoria,
  nombreJornada, etiquetaPartido, jornadaPorId, campeonatoPorId, categoriaPorId, slugJornada } from "./estado.js";
import { h, vaciar, aviso, dialogo, confirmar, campo, opciones, boton, conBoton, slugify, fechaCorta, errorAmigable } from "./ui.js";

const SLUG_AYUDA = "Se completa sola. Es parte de la dirección en la web: solo minúsculas, números y guiones.";
const NUEVA = "__nueva__";

const DEF = {
  campeonatos: {
    titulo: "Campeonatos", singular: "campeonato", nuevo: "Nuevo campeonato", este: "este campeonato",
    campos: [
      { n: "nombre", l: "Nombre", t: "text", req: true, max: 120, ph: "Área 4" },
      { n: "slug", l: "Dirección en la web", t: "slug", de: "nombre", ayuda: SLUG_AYUDA },
      { n: "temporada", l: "Temporada", t: "text", max: 20, ph: "2026" },
      { n: "descripcion", l: "Descripción", t: "textarea", max: 500 },
      { n: "orden", l: "Orden en listas", t: "number", def: 0, min: -999, max: 999 },
      { n: "visible", l: "Visible en la web", t: "checkbox", def: true }
    ],
    columnas: [
      ["Nombre", (r) => r.nombre],
      ["Temporada", (r) => r.temporada || ""],
      ["Categorías", (r) => app.cat.categorias.filter((k) => k.campeonato_id === r.id).map((k) => k.nombre).join(", ") || "—"],
      ["Visible", (r) => (r.visible ? "Sí" : "No")]
    ],
    accionesFila: (r) => [h("a", { class: "btn btn--sec", href: "#/categorias/" + r.id }, "Categorías"), h("a", { class: "btn btn--sec", href: "#/jornadas/" + r.id }, "Jornadas")]
  },
  categorias: {
    titulo: "Categorías", singular: "categoría", nuevo: "Nueva categoría", este: "esta categoría",
    filtroCampeonato: true,
    campos: [
      { n: "campeonato_id", l: "Campeonato", t: "select", req: true, opciones: opcCampeonatos },
      { n: "nombre", l: "Nombre", t: "text", req: true, max: 80, ph: "Libre, Senior, C-2005…" },
      { n: "slug", l: "Dirección en la web", t: "slug", de: "nombre", ayuda: SLUG_AYUDA },
      { n: "orden", l: "Orden en listas", t: "number", def: 0, min: -999, max: 999 },
      { n: "visible", l: "Visible en la web", t: "checkbox", def: true }
    ],
    columnas: [
      ["Campeonato", (r) => nombreCampeonato(r.campeonato_id)],
      ["Categoría", (r) => r.nombre],
      ["Visible", (r) => (r.visible ? "Sí" : "No")]
    ]
  },
  jornadas: {
    titulo: "Jornadas", singular: "jornada", nuevo: "Nueva jornada", este: "esta jornada",
    filtroCampeonato: true,
    campos: [
      { n: "campeonato_id", l: "Campeonato", t: "select", req: true, opciones: opcCampeonatos },
      { n: "categoria_id", l: "Categoría (si corresponde)", t: "select", opciones: () => [] },
      { n: "nombre", l: "Nombre", t: "text", req: true, max: 60, ph: "Fecha 2" },
      { n: "slug", l: "Dirección en la web", t: "slug-jornada", ayuda: "Se arma con campeonato, categoría y nombre. Cambiarla rompe los enlaces ya compartidos." },
      { n: "fecha", l: "Fecha (opcional)", t: "date" },
      { n: "orden", l: "Orden", t: "number", def: 0, min: -999, max: 999 },
      { n: "visible", l: "Visible en la web", t: "checkbox", def: true }
    ],
    columnas: [
      ["Campeonato", (r) => nombreCampeonato(r.campeonato_id)],
      ["Categoría", (r) => nombreCategoria(r.categoria_id) || "—"],
      ["Jornada", (r) => r.nombre],
      ["Fecha", (r) => fechaCorta(r.fecha)],
      ["Partidos", (r) => String(app.cat.partidos.filter((p) => p.jornada_id === r.id).length)]
    ],
    accionesFila: (r) => [h("a", { class: "btn btn--sec", href: "#/partidos/" + r.campeonato_id + "/" + r.id }, "Partidos")]
  },
  partidos: {
    titulo: "Partidos", singular: "partido", nuevo: "Nuevo partido", este: "este partido",
    filtroCampeonato: true, filtroJornada: true,
    campos: [
      { n: "campeonato_id", l: "Campeonato", t: "select", req: true, opciones: opcCampeonatos },
      { n: "categoria_id", l: "Categoría (si corresponde)", t: "select", opciones: () => [] },
      { n: "jornada_id", l: "Jornada (si corresponde)", t: "select", opciones: () => [] },
      { n: "equipo_local", l: "Equipo local", t: "text", req: true, max: 80 },
      { n: "equipo_visitante", l: "Equipo visitante", t: "text", req: true, max: 80 },
      { n: "fecha", l: "Día del partido", t: "date" },
      { n: "hora", l: "Hora", t: "time" },
      { n: "lugar", l: "Cancha / lugar", t: "text", max: 120 },
      { n: "fase", l: "Instancia (opcional)", t: "text", max: 60, ph: "Final, Semifinal, Cuartos…" },
      { n: "orden", l: "Orden en la jornada", t: "number", def: 0, min: -999, max: 999 },
      { n: "goles_local", l: "Goles local", t: "number", min: 0, max: 99 },
      { n: "goles_visitante", l: "Goles visitante", t: "number", min: 0, max: 99 },
      { n: "visible", l: "Visible en la web", t: "checkbox", def: true }
    ],
    columnas: [
      ["Día", (r) => fechaCorta(r.fecha)],
      ["Partido", (r) => etiquetaPartido(Object.assign({}, r, { fecha: null }))],
      ["Campeonato", (r) => [nombreCampeonato(r.campeonato_id), nombreCategoria(r.categoria_id)].filter(Boolean).join(" · ")],
      ["Jornada", (r) => nombreJornada(r.jornada_id) || "—"],
      ["Instancia", (r) => r.fase || ""]
    ]
  }
};

/* ---------- Formulario genérico ---------- */

function control(c, valor) {
  const comun = { name: c.n, id: "f-" + c.n };
  if (c.t === "textarea") return h("textarea", Object.assign({ rows: 3, maxlength: c.max }, comun), valor || "");
  if (c.t === "checkbox") return h("input", Object.assign({ type: "checkbox", checked: valor == null ? c.def : Boolean(valor) }, comun));
  if (c.t === "select") return opciones(h("select", Object.assign({ required: c.req }, comun)), c.opciones(), { vacio: c.req ? "Elegí…" : "—", valor });
  const tipo = { text: "text", slug: "text", "slug-jornada": "text", number: "number", date: "date", time: "time" }[c.t];
  const el = h("input", Object.assign({ type: tipo, maxlength: c.max && c.t !== "number" ? c.max : null, min: c.t === "number" ? c.min : null, max: c.t === "number" ? c.max : null, required: c.req, placeholder: c.ph }, comun));
  el.value = valor == null ? (c.def != null ? c.def : "") : c.t === "time" ? String(valor).slice(0, 5) : valor;
  if (c.t === "slug" || c.t === "slug-jornada") el.pattern = "[a-z0-9]+(-[a-z0-9]+)*";
  return el;
}

function leerFormulario(form, campos) {
  const datos = {};
  for (const c of campos) {
    const el = form.elements[c.n];
    if (c.t === "checkbox") datos[c.n] = el.checked;
    else if (c.t === "number") datos[c.n] = el.value === "" ? (c.def != null ? c.def : null) : Number(el.value);
    else datos[c.n] = el.value.trim() === "" ? null : el.value.trim();
  }
  return datos;
}

function abrirFormulario(tipo, registro, alGuardar, inicial = {}) {
  const def = DEF[tipo];
  const form = h("form", { class: "form" });
  const ctl = {};
  for (const c of def.campos) {
    const valor = registro ? registro[c.n] : inicial[c.n] != null ? inicial[c.n] : null;
    ctl[c.n] = control(c, valor);
    form.appendChild(c.t === "checkbox"
      ? h("label", { class: "campo campo--check" }, ctl[c.n], h("span", { text: c.l }))
      : campo(c.l + (c.req ? " *" : ""), ctl[c.n], c.ayuda));
  }

  /* --- Dependencias: campeonato → categoría → jornada --- */
  const nuevaJornada = h("input", { type: "text", maxlength: 60, placeholder: "Nombre de la jornada nueva, ej. Fecha 3" });
  const campoNuevaJornada = campo("Nueva jornada", nuevaJornada, "Se crea al guardar el partido.");
  if (ctl.jornada_id) {
    campoNuevaJornada.hidden = true;
    ctl.jornada_id.closest(".campo").after(campoNuevaJornada);
  }

  function pintarCategorias(valor) {
    if (!ctl.categoria_id) return;
    opciones(ctl.categoria_id, opcCategorias(ctl.campeonato_id.value), { vacio: "— Sin categoría —", valor });
    ctl.categoria_id.disabled = !ctl.campeonato_id.value;
  }
  function pintarJornadas(valor) {
    if (!ctl.jornada_id) return;
    const camp = ctl.campeonato_id.value;
    const lista = app.cat.jornadas
      .filter((j) => j.campeonato_id === camp && (!ctl.categoria_id.value || j.categoria_id === ctl.categoria_id.value))
      .map((j) => ({ valor: j.id, texto: j.nombre + (j.categoria_id ? " · " + nombreCategoria(j.categoria_id) : "") + (j.fecha ? " · " + fechaCorta(j.fecha) : "") }));
    if (camp) lista.push({ valor: NUEVA, texto: "+ Nueva jornada…" });
    opciones(ctl.jornada_id, lista, { vacio: "— Sin jornada —", valor });
    ctl.jornada_id.disabled = !camp;
    campoNuevaJornada.hidden = ctl.jornada_id.value !== NUEVA;
  }
  if (ctl.campeonato_id && ctl.categoria_id) {
    pintarCategorias(registro ? registro.categoria_id : inicial.categoria_id);
    pintarJornadas(registro ? registro.jornada_id : inicial.jornada_id);
    ctl.campeonato_id.addEventListener("change", () => { pintarCategorias(""); pintarJornadas(""); actualizarSlugJornada(); });
    ctl.categoria_id.addEventListener("change", () => { pintarJornadas(ctl.jornada_id ? ctl.jornada_id.value : ""); actualizarSlugJornada(); });
  }
  if (ctl.jornada_id) {
    ctl.jornada_id.addEventListener("change", () => {
      campoNuevaJornada.hidden = ctl.jornada_id.value !== NUEVA;
      const j = jornadaPorId(ctl.jornada_id.value);
      // La categoría del partido es la de su jornada (Libre y Senior no se mezclan).
      if (j) {
        ctl.categoria_id.value = j.categoria_id || "";
        if (ctl.fecha && !ctl.fecha.value && j.fecha) ctl.fecha.value = j.fecha;
      }
      if (ctl.jornada_id.value === NUEVA) nuevaJornada.focus();
    });
  }

  /* --- Direcciones automáticas --- */
  const slugCampo = def.campos.find((c) => c.t === "slug");
  if (slugCampo) {
    let manual = Boolean(registro && registro.slug);
    ctl[slugCampo.n].addEventListener("input", () => (manual = true));
    ctl[slugCampo.de].addEventListener("input", () => { if (!manual) ctl[slugCampo.n].value = slugify(ctl[slugCampo.de].value); });
  }
  let slugJornadaManual = Boolean(registro && registro.slug);
  function actualizarSlugJornada() {
    if (!ctl.slug || def.campos.find((c) => c.n === "slug").t !== "slug-jornada" || slugJornadaManual) return;
    ctl.slug.value = slugJornada(slugify, ctl.campeonato_id.value, ctl.categoria_id.value, ctl.nombre.value);
  }
  if (tipo === "jornadas") {
    ctl.slug.addEventListener("input", () => (slugJornadaManual = true));
    ctl.nombre.addEventListener("input", actualizarSlugJornada);
  }

  const guardar = h("button", { class: "btn btn--primary", type: "submit" }, "Guardar");
  const acciones = h("div", { class: "acciones" });
  if (registro) {
    acciones.appendChild(boton("Borrar", async (ev) => {
      if (!(await confirmar("¿Borrar " + def.este + "? No se puede deshacer.", { aceptar: "Borrar", peligro: true }))) return;
      await conBoton(ev.target, async () => {
        const { error } = await app.sb.from(tipo).delete().eq("id", registro.id);
        if (error) throw error;
        aviso("Borrado.");
        dlg.close();
        await alGuardar();
      });
    }, "btn--peligro"));
  }
  acciones.append(boton("Cancelar", () => dlg.close()), guardar);
  form.appendChild(acciones);

  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    if (!form.reportValidity()) return;
    await conBoton(guardar, async () => {
      const datos = leerFormulario(form, def.campos);
      for (const c of def.campos) if (c.t === "slug" && !datos[c.n]) datos[c.n] = slugify(datos[c.de]);
      if (tipo === "jornadas") {
        if (!datos.slug) datos.slug = slugJornada(slugify, datos.campeonato_id, datos.categoria_id, datos.nombre);
        if (registro && registro.slug !== datos.slug &&
            !(await confirmar("Cambiar la dirección de la jornada rompe los enlaces ya compartidos. ¿Seguir?", { aceptar: "Cambiar", peligro: true }))) return;
      }
      if (tipo === "partidos" && datos.jornada_id === NUEVA) {
        const nombre = nuevaJornada.value.trim();
        if (!nombre) throw new Error("Escribí el nombre de la jornada nueva.");
        const r = await app.sb.from("jornadas").insert({
          campeonato_id: datos.campeonato_id, categoria_id: datos.categoria_id, nombre,
          slug: slugJornada(slugify, datos.campeonato_id, datos.categoria_id, nombre), fecha: datos.fecha
        }).select("id").single();
        if (r.error) throw r.error;
        datos.jornada_id = r.data.id;
      }
      const consulta = registro
        ? app.sb.from(tipo).update(datos).eq("id", registro.id)
        : app.sb.from(tipo).insert(datos);
      const { error } = await consulta.select("id").single();
      if (error) throw error;
      aviso(registro ? "Cambios guardados." : "Creado.");
      dlg.close();
      await alGuardar();
    }, "Guardando…");
  });

  const dlg = dialogo(registro ? "Editar " + def.singular : def.nuevo, form);
  const primero = form.querySelector("input:not([type=hidden]), select, textarea");
  if (primero) primero.focus();
}

/* ---------- Ordenar partidos de una jornada ---------- */

async function moverPartido(lista, indice, delta) {
  const otro = indice + delta;
  if (otro < 0 || otro >= lista.length) return;
  const orden = lista.slice();
  [orden[indice], orden[otro]] = [orden[otro], orden[indice]];
  const cambios = orden.map((p, i) => [p, i + 1]).filter(([p, n]) => p.orden !== n);
  for (const [p, n] of cambios) {
    const { error } = await app.sb.from("partidos").update({ orden: n }).eq("id", p.id);
    if (error) throw error;
  }
}

/* ---------- Vista de lista ---------- */

export async function vista(main, tipo, params = []) {
  const def = DEF[tipo];
  await recargarCatalogos();
  const lista = app.cat[tipo];
  const campInicial = params[0] && campeonatoPorId(params[0]) ? params[0] : "";
  const jornadaInicial = params[1] && jornadaPorId(params[1]) ? params[1] : "";

  const buscar = h("input", { type: "search", placeholder: "Buscar…", "aria-label": "Buscar" });
  const fCamp = def.filtroCampeonato ? opciones(h("select", { "aria-label": "Campeonato" }), opcCampeonatos(), { vacio: "Todos los campeonatos", valor: campInicial }) : null;
  const fJor = def.filtroJornada ? h("select", { "aria-label": "Jornada" }) : null;
  const pintarFiltroJornada = (valor) => {
    if (!fJor) return;
    const js = app.cat.jornadas.filter((j) => !fCamp.value || j.campeonato_id === fCamp.value)
      .map((j) => ({ valor: j.id, texto: (fCamp.value ? "" : nombreCampeonato(j.campeonato_id) + " · ") + j.nombre + (j.categoria_id ? " · " + nombreCategoria(j.categoria_id) : "") }));
    opciones(fJor, js, { vacio: "Todas las jornadas", valor });
  };
  pintarFiltroJornada(jornadaInicial);

  const cuerpo = h("tbody");
  const nota = h("p", { class: "nota" });
  const refrescar = async () => vista(main, tipo, [fCamp ? fCamp.value : "", fJor ? fJor.value : ""]);

  function pintar() {
    const q = buscar.value.trim().toLowerCase();
    const camp = fCamp ? fCamp.value : "";
    const jor = fJor ? fJor.value : "";
    let filas = lista.filter((r) =>
      (!camp || r.campeonato_id === camp || r.id === camp && tipo === "campeonatos") &&
      (!jor || r.jornada_id === jor) &&
      (!q || def.columnas.some(([, f]) => String(f(r)).toLowerCase().includes(q))));
    const ordenable = tipo === "partidos" && jor && !q;
    if (ordenable) filas = filas.slice().sort((a, b) => a.orden - b.orden || String(a.fecha).localeCompare(String(b.fecha)));
    nota.textContent = ordenable ? "Usá ↑ ↓ para ordenar los partidos como se verán en la página de la jornada."
      : tipo === "partidos" ? "Elegí una jornada para ordenar sus partidos." : "";
    vaciar(cuerpo, filas.length
      ? filas.map((r, i) => h("tr", {},
          def.columnas.map(([t, f]) => h("td", { "data-col": t }, f(r))),
          h("td", { class: "tabla__acciones" },
            ordenable ? [
              boton("↑", (ev) => conBoton(ev.target, async () => { await moverPartido(filas, i, -1); await refrescar(); }), "btn--sec btn--mini", { "aria-label": "Subir", disabled: i === 0 }),
              boton("↓", (ev) => conBoton(ev.target, async () => { await moverPartido(filas, i, 1); await refrescar(); }), "btn--sec btn--mini", { "aria-label": "Bajar", disabled: i === filas.length - 1 })
            ] : null,
            def.accionesFila ? def.accionesFila(r) : null,
            boton("Editar", () => abrirFormulario(tipo, r, refrescar)))))
      : h("tr", {}, h("td", { colspan: def.columnas.length + 1, class: "vacio" },
          lista.length ? "No hay resultados con ese filtro." : "Todavía no hay " + def.titulo.toLowerCase() + ".")));
  }
  buscar.addEventListener("input", pintar);
  if (fCamp) fCamp.addEventListener("change", () => { pintarFiltroJornada(""); pintar(); });
  if (fJor) fJor.addEventListener("change", pintar);

  const necesitaCampeonato = tipo !== "campeonatos";
  const puedeCrear = !necesitaCampeonato || app.cat.campeonatos.length > 0;
  const nuevo = () => {
    const j = fJor && jornadaPorId(fJor.value);
    abrirFormulario(tipo, null, refrescar, {
      campeonato_id: fCamp ? fCamp.value : "",
      categoria_id: j ? j.categoria_id : "",
      jornada_id: j ? j.id : "",
      orden: j ? app.cat.partidos.filter((p) => p.jornada_id === j.id).length + 1 : null,
      fecha: j ? j.fecha : null
    });
  };
  vaciar(main,
    h("div", { class: "cabecera" },
      h("h1", { text: def.titulo }),
      boton("+ " + def.nuevo, nuevo, "btn--primary", { disabled: !puedeCrear })),
    !puedeCrear ? h("p", { class: "nota" }, "Primero creá al menos un campeonato.") : null,
    h("div", { class: "filtros" }, buscar, fCamp, fJor),
    nota,
    h("div", { class: "tabla-envoltura" },
      h("table", { class: "tabla" },
        h("thead", {}, h("tr", {}, def.columnas.map(([t]) => h("th", { text: t })), h("th", {}))),
        cuerpo)));
  pintar();
}

export { errorAmigable, categoriaPorId };
