/* =========================================================
   Panel RedDeportivaTV · compartir una publicación
   Sin APIs de publicación automática: abre los diálogos oficiales de
   Facebook y WhatsApp, el menú "Compartir" del celular, y copia textos.
   ========================================================= */
import * as F from "../../js/admin/fotos-publicacion.js";
import { h, dialogo, aviso, boton, conBoton } from "./ui.js";

async function copiar(texto, mensaje) {
  try {
    await navigator.clipboard.writeText(texto);
    aviso(mensaje);
  } catch (_) {
    aviso("No se pudo copiar automáticamente. Mantené apretado el texto para copiarlo.", "error");
  }
}

export function abrirCompartir(sb, tipo, reg) {
  const url = location.origin + "/" + tipo + "/" + reg.slug;
  const titulo = reg.titulo;
  const texto = titulo + (reg.descripcion ? "\n" + reg.descripcion : "");
  const portada = reg.portada_path ? F.urlPublica(sb, reg.portada_path) : null;
  const textoInstagram = [titulo, reg.descripcion, "Más fotos y la nota completa: " + url, "#RedDeportivaTV #futsal #futbol"].filter(Boolean).join("\n\n");

  const abrir = (direccion) => window.open(direccion, "_blank", "noopener,noreferrer,width=640,height=640");

  const botones = [
    boton("Facebook", () => abrir("https://www.facebook.com/sharer/sharer.php?u=" + encodeURIComponent(url)), "btn--facebook"),
    boton("WhatsApp", () => abrir("https://wa.me/?text=" + encodeURIComponent(texto + "\n" + url)), "btn--whatsapp-mini"),
    navigator.share ? boton("Más opciones del celular…", async (ev) => {
      await conBoton(ev.target, async () => {
        const datos = { title: titulo, text: texto, url };
        // En celulares compatibles, comparte también la foto de portada.
        if (portada && navigator.canShare) {
          try {
            const r = await fetch(portada);
            const blob = await r.blob();
            const archivo = new File([blob], reg.slug + ".jpg", { type: blob.type || "image/jpeg" });
            if (navigator.canShare({ files: [archivo] })) datos.files = [archivo];
          } catch (_) { /* sin foto: se comparte solo el enlace */ }
        }
        try { await navigator.share(datos); } catch (e) { if (e.name !== "AbortError") throw e; }
      });
    }) : null,
    boton("Copiar enlace", () => copiar(url, "Enlace copiado.")),
    boton("Copiar texto para Instagram", () => copiar(textoInstagram, "Texto copiado. En Instagram pegalo como descripción del posteo.")),
    portada ? boton("Descargar portada", async (ev) => {
      await conBoton(ev.target, async () => {
        const r = await fetch(portada);
        if (!r.ok) throw new Error("No se pudo descargar la portada.");
        const enlace = h("a", { href: URL.createObjectURL(await r.blob()), download: reg.slug + ".jpg" });
        document.body.appendChild(enlace);
        enlace.click();
        enlace.remove();
      });
    }) : null
  ];

  dialogo("Compartir", [
    h("p", { class: "nota" }, "Facebook y WhatsApp muestran la foto, el título y el resumen automáticamente. Si cambiaste algo hace poco, la vista previa de Facebook puede tardar en actualizarse."),
    h("div", { class: "compartir__url" }, h("input", { type: "text", readonly: true, value: url, "aria-label": "Enlace", onfocus: (ev) => ev.target.select() })),
    h("div", { class: "compartir__botones" }, botones),
    h("p", { class: "nota" }, "Instagram no permite publicar enlaces desde la web: descargá la portada, subila desde la app y pegá el texto copiado.")
  ]);
}
