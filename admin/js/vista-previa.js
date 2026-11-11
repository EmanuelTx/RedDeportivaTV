/* =========================================================
   Panel RedDeportivaTV · vista previa
   Muestra cómo se verá la publicación en la web (con los mismos estilos)
   y cómo se verá la tarjeta al compartir en Facebook / WhatsApp.
   Usa lo que está escrito en el formulario, aunque no esté guardado.
   ========================================================= */
import { h, dialogo, fechaCorta } from "./ui.js";

function esc(v) {
  return String(v == null ? "" : v)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function parrafos(texto) {
  return String(texto || "").split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean)
    .map((p) => "<p>" + esc(p).replace(/\n/g, "<br>") + "</p>").join("\n");
}

function recortar(texto, max) {
  const t = String(texto || "").replace(/\s+/g, " ").trim();
  return t.length > max ? t.slice(0, max - 1).trimEnd() + "…" : t;
}

function documento(p) {
  const esAlbum = p.tipo === "albumes";
  const meta = [fechaCorta(p.fecha), p.campeonato, p.categoria, p.partido].filter(Boolean).map(esc).join(" · ");
  const cabecera = `
      <p class="eyebrow">${esAlbum ? "Cobertura" + (p.fotos.length ? " · " + p.fotos.length + (p.fotos.length === 1 ? " foto" : " fotos") : "") : "Noticia"}</p>
      <h1 class="pub__titulo">${esc(p.titulo || "(Sin título)")}</h1>
      ${meta ? `<p class="pub__meta">${meta}</p>` : ""}
      ${p.descripcion ? `<p class="pub__bajada">${esc(p.descripcion)}</p>` : ""}`;
  const video = p.video
    ? `<section class="cob-video"><div class="cob-video__marco"><img class="cob-video__miniatura" src="https://i.ytimg.com/vi/${esc(p.video)}/hqdefault.jpg" alt=""></div>
        <p class="cob-video__alternativa">Video resumen · <a href="https://www.youtube.com/watch?v=${esc(p.video)}">Ver en YouTube ↗</a></p></section>`
    : `<section class="cob-aviso"><p class="cob-aviso__titulo">Video resumen en edición</p><p>Próximamente disponible.</p></section>`;
  const cuerpo = esAlbum
    ? `<section class="container pub__articulo pub__articulo--ancho">${cabecera}
        ${video}
        ${p.avisoFotos || !p.fotos.length
          ? `<section class="cob-aviso"><p class="cob-aviso__titulo">Fotografías próximamente disponibles</p><p>Estamos preparando las fotos de esta cobertura.</p></section>`
          : `<div class="gallery__grid pub__galeria">${p.fotos.map((f, i) => `
          <figure class="gallery__item${i === 0 ? " gallery__item--wide" : ""}">
            <img src="${esc(i === 0 ? f.src : f.mini || f.src)}" alt="${esc(f.alt || p.titulo)}">
            ${f.descripcion ? `<figcaption class="gallery__caption">${esc(f.descripcion)}</figcaption>` : ""}
          </figure>`).join("")}
        </div>`}</section>`
    : `<article class="container pub__articulo">${cabecera}
        ${p.portada ? `<figure class="pub__portada"><img src="${esc(p.portada)}" alt="${esc(p.portada_alt || p.titulo)}"></figure>` : ""}
        <div class="pub__contenido">${parrafos(p.contenido) || "<p><em>(Sin contenido)</em></p>"}</div>
      </article>`;
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">
<base href="${esc(location.origin)}/">
<link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700;800&family=Barlow:wght@400;500;600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/css/styles.css"><link rel="stylesheet" href="/css/publicacion.css"><link rel="stylesheet" href="/css/coberturas.css">
</head><body><main class="pub">${cuerpo}</main></body></html>`;
}

export function abrirVistaPrevia(p) {
  const marco = h("iframe", { class: "previa__marco", title: "Vista previa de la página", sandbox: "allow-same-origin" });
  marco.srcdoc = documento(p);

  const desc = recortar(p.descripcion || p.contenido || (p.tipo === "albumes" ? "Álbum de fotos de RedDeportivaTV" : ""), 200);
  const tarjeta = h("div", { class: "tarjeta-og" },
    p.portada ? h("img", { src: p.portada, alt: "" }) : h("div", { class: "tarjeta-og__sin" }, "Sin imagen: se usará la foto general de RedDeportivaTV"),
    h("div", { class: "tarjeta-og__texto" },
      h("small", { text: location.host.toUpperCase() }),
      h("strong", { text: p.titulo || "(Sin título)" }),
      h("span", { text: desc })));

  const anchos = [["Celular", "390px"], ["Computadora", "100%"]].map(([t, w]) =>
    h("button", { type: "button", class: "btn btn--mini", onclick: () => { marco.style.width = w; } }, t));

  dialogo("Vista previa", [
    h("p", { class: "nota" }, "Así se va a ver cuando la publiques. Todavía no es visible para nadie más."),
    h("div", { class: "previa__anchos" }, anchos),
    h("div", { class: "previa__envoltura" }, marco),
    h("h3", { text: "Al compartir en Facebook o WhatsApp" }),
    tarjeta
  ], { ancho: true });
}
