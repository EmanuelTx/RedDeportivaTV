/* =========================================================
   Panel RedDeportivaTV · utilidades de interfaz
   Todo el texto se inserta con textContent (nunca innerHTML con datos).
   ========================================================= */

/* Crea un elemento: h("button", { class: "btn", onclick: fn }, "Texto") */
export function h(etiqueta, atributos = {}, ...hijos) {
  const el = document.createElement(etiqueta);
  for (const [clave, valor] of Object.entries(atributos || {})) {
    if (valor == null || valor === false) continue;
    if (clave === "class") el.className = valor;
    else if (clave === "text") el.textContent = valor;
    else if (clave.startsWith("on") && typeof valor === "function") el.addEventListener(clave.slice(2), valor);
    else if (clave === "dataset") Object.assign(el.dataset, valor);
    else if (clave in el && typeof valor !== "string") el[clave] = valor;
    else el.setAttribute(clave, valor === true ? "" : String(valor));
  }
  agregar(el, hijos);
  return el;
}

function agregar(el, hijos) {
  for (const hijo of hijos.flat(Infinity)) {
    if (hijo == null || hijo === false) continue;
    el.appendChild(hijo instanceof Node ? hijo : document.createTextNode(String(hijo)));
  }
}

export function vaciar(el, ...hijos) {
  el.replaceChildren();
  agregar(el, hijos);
  return el;
}

/* ---------- Avisos ---------- */

export function aviso(mensaje, tipo = "ok") {
  const zona = document.getElementById("avisos");
  const el = h("div", { class: "aviso aviso--" + tipo, role: tipo === "error" ? "alert" : "status" }, mensaje);
  zona.appendChild(el);
  setTimeout(() => el.classList.add("aviso--fuera"), tipo === "error" ? 7000 : 3500);
  setTimeout(() => el.remove(), tipo === "error" ? 7600 : 4100);
}

/* ---------- Diálogos ---------- */

export function dialogo(titulo, contenido, { ancho = false } = {}) {
  const cerrarBtn = h("button", { class: "dlg__cerrar", type: "button", "aria-label": "Cerrar" }, "×");
  const dlg = h("dialog", { class: "dlg" + (ancho ? " dlg--ancho" : "") },
    h("div", { class: "dlg__cabeza" }, h("h2", { text: titulo }), cerrarBtn),
    h("div", { class: "dlg__cuerpo" }, contenido)
  );
  cerrarBtn.addEventListener("click", () => dlg.close());
  dlg.addEventListener("close", () => dlg.remove());
  document.body.appendChild(dlg);
  dlg.showModal();
  return dlg;
}

export function confirmar(mensaje, { aceptar = "Aceptar", peligro = false } = {}) {
  return new Promise((resolver) => {
    let resultado = false;
    const si = h("button", { class: "btn " + (peligro ? "btn--peligro" : "btn--primary"), type: "button" }, aceptar);
    const no = h("button", { class: "btn btn--sec", type: "button" }, "Cancelar");
    const dlg = dialogo("Confirmar", [h("p", { text: mensaje }), h("div", { class: "acciones" }, no, si)]);
    si.addEventListener("click", () => { resultado = true; dlg.close(); });
    no.addEventListener("click", () => dlg.close());
    dlg.addEventListener("close", () => resolver(resultado));
    no.focus();
  });
}

/* ---------- Formularios ---------- */

export function campo(etiqueta, control, ayuda) {
  return h("label", { class: "campo" },
    h("span", { class: "campo__etiqueta" }, etiqueta),
    control,
    ayuda ? h("small", { class: "campo__ayuda" }, ayuda) : null
  );
}

export function opciones(select, lista, { vacio = "—", valor = "" } = {}) {
  vaciar(select, vacio === null ? null : h("option", { value: "" }, vacio),
    lista.map((o) => h("option", { value: o.valor }, o.texto)));
  select.value = valor || "";
  return select;
}

export function boton(texto, onclick, clase = "btn--sec", extra = {}) {
  return h("button", Object.assign({ class: "btn " + clase, type: "button", onclick }, extra), texto);
}

/* Ejecuta una acción mostrando "ocupado" en el botón y avisando errores. */
export async function conBoton(btn, accion, textoOcupado) {
  const original = btn.textContent;
  btn.disabled = true;
  if (textoOcupado) btn.textContent = textoOcupado;
  try {
    return await accion();
  } catch (e) {
    aviso(errorAmigable(e), "error");
    console.error(e);
    return undefined;
  } finally {
    btn.disabled = false;
    btn.textContent = original;
  }
}

/* ---------- Textos ---------- */

export function slugify(texto) {
  return String(texto || "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120)
    .replace(/-+$/g, "");
}

export function fechaCorta(valor) {
  if (!valor) return "";
  const d = /^\d{4}-\d{2}-\d{2}$/.test(valor) ? new Date(valor + "T00:00:00") : new Date(valor);
  if (isNaN(d)) return "";
  return d.toLocaleDateString("es", { day: "numeric", month: "short", year: "numeric" });
}

export function fechaHora(valor) {
  if (!valor) return "";
  const d = new Date(valor);
  return isNaN(d) ? "" : d.toLocaleString("es", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

/* datetime-local ↔ ISO */
export function aLocal(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, "0");
  return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) + "T" + p(d.getHours()) + ":" + p(d.getMinutes());
}
export function aISO(local) {
  return local ? new Date(local).toISOString() : null;
}

export const ESTADOS = {
  borrador: "Borrador",
  publicando: "Publicando…",
  publicada: "Publicada",
  despublicando: "Despublicando…"
};

export function etiquetaEstado(estado) {
  return h("span", { class: "estado estado--" + estado }, ESTADOS[estado] || estado);
}

export function errorAmigable(e) {
  const err = (e && e.causa) || e || {};
  const codigo = err.code || "";
  const msg = String((e && e.message) || err.message || e || "");
  if (codigo === "23505" || /duplicate key/.test(msg)) return "Ya existe otro registro con esa dirección (slug) o nombre. Cambialo y probá de nuevo.";
  if (codigo === "23503" || /foreign key/.test(msg)) return "No se puede borrar: está en uso por partidos, noticias o álbumes.";
  if (codigo === "23514" || /check constraint/.test(msg)) return "Algún dato no es válido (largo, formato o valores). Revisá el formulario.";
  if (codigo === "42501" || /row-level security|permission denied/.test(msg)) return "No tenés permiso para esta acción. Volvé a iniciar sesión.";
  if (/Failed to fetch|NetworkError|Fallo de red|Load failed/.test(msg)) return "Sin conexión. Revisá internet y probá de nuevo.";
  if (/JWT|session|token/i.test(msg)) return "La sesión venció. Volvé a iniciar sesión.";
  return msg || "Ocurrió un error inesperado.";
}
