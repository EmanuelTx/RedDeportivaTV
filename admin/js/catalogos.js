/* =========================================================
   Panel RedDeportivaTV · campeonatos, categorías y partidos
   ========================================================= */
import { app, recargarCatalogos, opcCampeonatos, opcCategorias, nombreCampeonato, nombreCategoria, etiquetaPartido } from "./estado.js";
import { h, vaciar, aviso, dialogo, confirmar, campo, opciones, boton, conBoton, slugify, fechaCorta } from "./ui.js";

const SLUG_AYUDA = "Se completa sola a partir del nombre. Solo minúsculas, números y guiones.";

const DEF = {
  campeonatos: {
    titulo: "Campeonatos",
    singular: "campeonato", nuevo: "Nuevo campeonato", este: "este campeonato",
    campos: [
      { n: "nombre", l: "Nombre", t: "text", req: true, max: 120, ph: "Futsal Paranaense" },
      { n: "slug", l: "Dirección (slug)", t: "slug", de: "nombre", ayuda: SLUG_AYUDA },
      { n: "temporada", l: "Temporada", t: "text", max: 20, ph: "2026" },
      { n: "descripcion", l: "Descripción", t: "textarea", max: 500 },
      { n: "orden", l: "Orden en listas", t: "number", def: 0, min: -999, max: 999 },
      { n: "visible", l: "Visible en la web", t: "checkbox", def: true }
    ],
    columnas: [
      ["Nombre", (r) => r.nombre],
      ["Temporada", (r) => r.temporada || ""],
      ["Visible", (r) => (r.visible ? "Sí" : "No")]
    ]
  },
  categorias: {
    titulo: "Categorías",
    singular: "categoría", nuevo: "Nueva categoría", este: "esta categoría",
    campos: [
      { n: "nombre", l: "Nombre", t: "text", req: true, max: 80, ph: "Sub 17, Primera, Femenino…" },
      { n: "slug", l: "Dirección (slug)", t: "slug", de: "nombre", ayuda: SLUG_AYUDA },
      { n: "orden", l: "Orden en listas", t: "number", def: 0, min: -999, max: 999 },
      { n: "visible", l: "Visible en la web", t: "checkbox", def: true }
    ],
    columnas: [
      ["Nombre", (r) => r.nombre],
      ["Visible", (r) => (r.visible ? "Sí" : "No")]
    ]
  },
  partidos: {
    titulo: "Partidos y fechas",
    singular: "partido", nuevo: "Nuevo partido", este: "este partido",
    campos: [
      { n: "campeonato_id", l: "Campeonato", t: "select", req: true, opciones: opcCampeonatos },
      { n: "categoria_id", l: "Categoría", t: "select", opciones: opcCategorias },
      { n: "fase", l: "Fecha / fase", t: "text", max: 60, ph: "Fecha 3, Cuartos de final…" },
      { n: "equipo_local", l: "Equipo local", t: "text", req: true, max: 80 },
      { n: "equipo_visitante", l: "Equipo visitante", t: "text", req: true, max: 80 },
      { n: "fecha", l: "Día", t: "date" },
      { n: "hora", l: "Hora", t: "time" },
      { n: "lugar", l: "Cancha / lugar", t: "text", max: 120 },
      { n: "goles_local", l: "Goles local", t: "number", min: 0, max: 99 },
      { n: "goles_visitante", l: "Goles visitante", t: "number", min: 0, max: 99 },
      { n: "visible", l: "Visible en la web", t: "checkbox", def: true }
    ],
    columnas: [
      ["Día", (r) => fechaCorta(r.fecha)],
      ["Partido", (r) => etiquetaPartido(Object.assign({}, r, { fecha: null }))],
      ["Campeonato", (r) => nombreCampeonato(r.campeonato_id)],
      ["Categoría", (r) => nombreCategoria(r.categoria_id)],
      ["Fase", (r) => r.fase || ""]
    ]
  }
};

/* ---------- Formulario genérico ---------- */

function control(c, valor) {
  const comun = { name: c.n, id: "f-" + c.n };
  if (c.t === "textarea") return h("textarea", Object.assign({ rows: 3, maxlength: c.max }, comun), valor || "");
  if (c.t === "checkbox") return h("input", Object.assign({ type: "checkbox", checked: valor == null ? c.def : Boolean(valor) }, comun));
  if (c.t === "select") return opciones(h("select", Object.assign({ required: c.req }, comun)), c.opciones(), { vacio: c.req ? "Elegí…" : "—", valor });
  const tipo = { text: "text", slug: "text", number: "number", date: "date", time: "time" }[c.t];
  const el = h("input", Object.assign({ type: tipo, maxlength: c.max && c.t !== "number" ? c.max : null, min: c.t === "number" ? c.min : null, max: c.t === "number" ? c.max : null, required: c.req, placeholder: c.ph }, comun));
  el.value = valor == null ? (c.def != null ? c.def : "") : c.t === "time" ? String(valor).slice(0, 5) : valor;
  if (c.t === "slug") el.pattern = "[a-z0-9]+(-[a-z0-9]+)*";
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
  for (const c of campos) if (c.t === "slug" && !datos[c.n]) datos[c.n] = slugify(datos[c.de]);
  return datos;
}

function abrirFormulario(tipo, registro, alGuardar) {
  const def = DEF[tipo];
  const form = h("form", { class: "form", novalidate: false });
  const controles = {};
  for (const c of def.campos) {
    controles[c.n] = control(c, registro ? registro[c.n] : null);
    form.appendChild(c.t === "checkbox"
      ? h("label", { class: "campo campo--check" }, controles[c.n], h("span", { text: c.l }))
      : campo(c.l + (c.req ? " *" : ""), controles[c.n], c.ayuda));
  }
  // Slug automático mientras no se edite a mano
  const slugCampo = def.campos.find((c) => c.t === "slug");
  if (slugCampo) {
    let manual = Boolean(registro && registro.slug);
    controles[slugCampo.n].addEventListener("input", () => (manual = true));
    controles[slugCampo.de].addEventListener("input", () => {
      if (!manual) controles[slugCampo.n].value = slugify(controles[slugCampo.de].value);
    });
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
  const primero = form.querySelector("input, select, textarea");
  if (primero) primero.focus();
}

/* ---------- Vista de lista ---------- */

export async function vista(main, tipo) {
  const def = DEF[tipo];
  await recargarCatalogos();
  const lista = app.cat[tipo];

  const buscar = h("input", { type: "search", placeholder: "Buscar…", "aria-label": "Buscar" });
  const filtroCamp = tipo === "partidos"
    ? opciones(h("select", { "aria-label": "Filtrar por campeonato" }), opcCampeonatos(), { vacio: "Todos los campeonatos" })
    : null;
  const cuerpo = h("tbody");
  const tabla = h("table", { class: "tabla" },
    h("thead", {}, h("tr", {}, def.columnas.map(([t]) => h("th", { text: t })), h("th", {}))),
    cuerpo);

  const refrescar = async () => vista(main, tipo);

  function pintar() {
    const q = buscar.value.trim().toLowerCase();
    const camp = filtroCamp ? filtroCamp.value : "";
    const filas = lista.filter((r) =>
      (!camp || r.campeonato_id === camp) &&
      (!q || def.columnas.some(([, f]) => String(f(r)).toLowerCase().includes(q))));
    vaciar(cuerpo, filas.length
      ? filas.map((r) => h("tr", {},
          def.columnas.map(([t, f]) => h("td", { "data-col": t }, f(r))),
          h("td", { class: "tabla__acciones" }, boton("Editar", () => abrirFormulario(tipo, r, refrescar)))))
      : h("tr", {}, h("td", { colspan: def.columnas.length + 1, class: "vacio" },
          lista.length ? "No hay resultados con ese filtro." : "Todavía no hay " + def.titulo.toLowerCase() + ".")));
  }
  buscar.addEventListener("input", pintar);
  if (filtroCamp) filtroCamp.addEventListener("change", pintar);

  const puedeCrear = tipo !== "partidos" || app.cat.campeonatos.length > 0;
  vaciar(main,
    h("div", { class: "cabecera" },
      h("h1", { text: def.titulo }),
      boton("+ " + def.nuevo, () => abrirFormulario(tipo, null, refrescar), "btn--primary", { disabled: !puedeCrear })),
    !puedeCrear ? h("p", { class: "nota" }, "Primero creá al menos un campeonato.") : null,
    h("div", { class: "filtros" }, buscar, filtroCamp),
    h("div", { class: "tabla-envoltura" }, tabla));
  pintar();
}
