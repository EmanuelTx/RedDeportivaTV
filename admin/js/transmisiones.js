/* =========================================================
   Panel RedDeportivaTV · transmisiones EN VIVO (manuales)
   Se pega el enlace de YouTube y se prende o apaga a mano.
   La web muestra solo la que está EN VIVO y no venció.
   ========================================================= */
import { app, recargarCatalogos, opcPartidos } from "./estado.js";
import { h, vaciar, aviso, dialogo, confirmar, campo, opciones, boton, conBoton, aLocal, aISO, fechaHora } from "./ui.js";

const YOUTUBE_RE = /^https:\/\/(www\.|m\.)?(youtube\.com|youtu\.be)\//;

function vigente(t) {
  return t.en_vivo && (!t.termina_en || new Date(t.termina_en) > new Date());
}

function etiqueta(t) {
  if (vigente(t)) return h("span", { class: "estado estado--vivo" }, "● EN VIVO");
  if (t.en_vivo) return h("span", { class: "estado estado--vencida" }, "Venció");
  return h("span", { class: "estado estado--borrador" }, "Apagada");
}

async function prender(t, apagarOtras) {
  if (apagarOtras) {
    const r = await app.sb.from("transmisiones").update({ en_vivo: false }).eq("en_vivo", true).neq("id", t.id);
    if (r.error) throw r.error;
  }
  const cambios = { en_vivo: true };
  if (t.termina_en && new Date(t.termina_en) <= new Date()) cambios.termina_en = null; // si venció, se reactiva sin hora de fin
  const { error } = await app.sb.from("transmisiones").update(cambios).eq("id", t.id);
  if (error) throw error;
}

async function apagar(t) {
  const { error } = await app.sb.from("transmisiones").update({ en_vivo: false }).eq("id", t.id);
  if (error) throw error;
}

function formulario(registro, alGuardar) {
  const titulo = h("input", { type: "text", required: true, maxlength: 160, placeholder: "Final Sub 17 · Futsal Paranaense" });
  const url = h("input", { type: "url", required: true, maxlength: 300, placeholder: "https://www.youtube.com/live/…" });
  const partido = opciones(h("select"), opcPartidos(), { vacio: "— Sin partido —" });
  const termina = h("input", { type: "datetime-local" });
  const vivo = h("input", { type: "checkbox" });
  const otras = h("input", { type: "checkbox", checked: true });
  if (registro) {
    titulo.value = registro.titulo;
    url.value = registro.youtube_url;
    partido.value = registro.partido_id || "";
    termina.value = aLocal(registro.termina_en);
    vivo.checked = registro.en_vivo;
  }
  const guardar = h("button", { class: "btn btn--primary", type: "submit" }, "Guardar");
  const form = h("form", { class: "form" },
    campo("Título *", titulo),
    campo("Enlace de YouTube *", url, "Copiá el enlace del directo desde YouTube (Compartir → Copiar)."),
    campo("Partido", partido),
    campo("Termina (opcional)", termina, "Pasada esta hora, el aviso desaparece solo de la web."),
    h("label", { class: "campo campo--check" }, vivo, h("span", { text: "Mostrar EN VIVO en la web" })),
    h("label", { class: "campo campo--check" }, otras, h("span", { text: "Apagar las demás transmisiones al prender esta" })),
    h("div", { class: "acciones" }, boton("Cancelar", () => dlg.close()), guardar));

  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    if (!form.reportValidity()) return;
    if (!YOUTUBE_RE.test(url.value.trim())) {
      aviso("El enlace tiene que ser de YouTube (https://www.youtube.com/… o https://youtu.be/…).", "error");
      return;
    }
    await conBoton(guardar, async () => {
      const datos = {
        titulo: titulo.value.trim(),
        youtube_url: url.value.trim(),
        partido_id: partido.value || null,
        termina_en: aISO(termina.value),
        en_vivo: false
      };
      const consulta = registro
        ? app.sb.from("transmisiones").update(datos).eq("id", registro.id)
        : app.sb.from("transmisiones").insert(datos);
      const { data, error } = await consulta.select("*").single();
      if (error) throw error;
      if (vivo.checked) await prender(data, otras.checked);
      aviso("Transmisión guardada" + (vivo.checked ? " y EN VIVO." : "."));
      dlg.close();
      await alGuardar();
    }, "Guardando…");
  });
  const dlg = dialogo(registro ? "Editar transmisión" : "Nueva transmisión", form);
  titulo.focus();
}

export async function vista(main) {
  await recargarCatalogos();
  const { data, error } = await app.sb.from("transmisiones").select("*").order("en_vivo", { ascending: false }).order("actualizado_en", { ascending: false });
  if (error) throw error;
  const refrescar = () => vista(main);

  const filas = data.map((t) => h("tr", {},
    h("td", { "data-col": "Estado" }, etiqueta(t)),
    h("td", { "data-col": "Título" }, t.titulo),
    h("td", { "data-col": "Enlace" }, h("a", { href: t.youtube_url, target: "_blank", rel: "noopener" }, "Abrir en YouTube")),
    h("td", { "data-col": "Termina" }, t.termina_en ? fechaHora(t.termina_en) : "—"),
    h("td", { class: "tabla__acciones" },
      vigente(t)
        ? boton("Apagar", (ev) => conBoton(ev.target, async () => { await apagar(t); aviso("Transmisión apagada."); await refrescar(); }), "btn--sec")
        : boton("Prender EN VIVO", (ev) => conBoton(ev.target, async () => { await prender(t, true); aviso("¡EN VIVO en la web!"); await refrescar(); }), "btn--vivo"),
      boton("Editar", () => formulario(t, refrescar)),
      boton("Borrar", async (ev) => {
        if (!(await confirmar("¿Borrar la transmisión «" + t.titulo + "»?", { aceptar: "Borrar", peligro: true }))) return;
        await conBoton(ev.target, async () => {
          const r = await app.sb.from("transmisiones").delete().eq("id", t.id);
          if (r.error) throw r.error;
          aviso("Borrada.");
          await refrescar();
        });
      }, "btn--peligro"))));

  vaciar(main,
    h("div", { class: "cabecera" },
      h("h1", { text: "Transmisiones EN VIVO" }),
      boton("+ Nueva transmisión", () => formulario(null, refrescar), "btn--primary")),
    h("p", { class: "nota" }, "Cuando una transmisión está EN VIVO, la web muestra un aviso rojo arriba con el enlace. Si no hay ninguna, se ven los últimos videos como siempre. El aviso puede tardar hasta 1 minuto en aparecer o desaparecer."),
    h("div", { class: "tabla-envoltura" },
      h("table", { class: "tabla" },
        h("thead", {}, h("tr", {}, ["Estado", "Título", "Enlace", "Termina", ""].map((t) => h("th", { text: t })))),
        h("tbody", {}, filas.length ? filas : h("tr", {}, h("td", { colspan: 5, class: "vacio" }, "Todavía no hay transmisiones."))))));
}
