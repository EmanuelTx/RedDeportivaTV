/* =========================================================
   Plantillas HTML generadas en el servidor (Cloudflare Pages Functions).
   Incluyen título, descripción y Open Graph completos para que Facebook
   y WhatsApp muestren la vista previa (sus robots no ejecutan JS).
   Usan la cabecera, el pie y los estilos de la web principal.
   Todo dato se escapa con esc(): nunca se inserta HTML del contenido.
   ========================================================= */

import { etiquetasJornadas } from "./datos.js";

const SITIO = "RedDeportivaTV";
const IMAGEN_POR_DEFECTO = "/assets/img/fotos/futbol-duelo-1600.jpg";
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const TIPOS = { partido: "Partido", jornada: "Jornada", campeonato: "Campeonato", evento: "Evento", pendiente: "Cobertura" };

export function esc(valor) {
  return String(valor == null ? "" : valor)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function absoluta(url, origen) {
  try {
    const u = new URL(url || IMAGEN_POR_DEFECTO, origen);
    return u.protocol === "https:" || u.protocol === "http:" ? u.href : new URL(IMAGEN_POR_DEFECTO, origen).href;
  } catch (e) {
    return new URL(IMAGEN_POR_DEFECTO, origen).href;
  }
}

function recortar(texto, max) {
  const t = String(texto || "").replace(/\s+/g, " ").trim();
  return t.length > max ? t.slice(0, max - 1).trimEnd() + "…" : t;
}

export function fechaLegible(fecha) {
  if (!fecha) return "";
  const d = new Date(String(fecha).slice(0, 10) + "T00:00:00Z");
  if (isNaN(d)) return "";
  return d.getUTCDate() + " de " + MESES[d.getUTCMonth()] + " de " + d.getUTCFullYear();
}

function fechaCorta(fecha) {
  if (!fecha) return "";
  const d = new Date(String(fecha).slice(0, 10) + "T00:00:00Z");
  if (isNaN(d)) return "";
  return d.getUTCDate() + " " + MESES[d.getUTCMonth()].slice(0, 3) + " " + d.getUTCFullYear();
}

function parrafos(texto) {
  return String(texto || "")
    .split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean)
    .map((p) => "<p>" + esc(p).replace(/\n/g, "<br>") + "</p>").join("\n");
}

function esPrueba(ctx, item) {
  return Boolean(item && item.prueba) || new URL(ctx.request.url).hostname.endsWith(".pages.dev");
}

const ICONO_FAVICON =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='8' fill='%23e30613'/%3E%3Ctext x='32' y='45' font-family='Arial Black,Arial' font-weight='900' font-size='34' fill='%23fff' text-anchor='middle'%3ETV%3C/text%3E%3C/svg%3E";

function documento({ ctx, titulo, descripcion, imagen, imagenAlt, tipo, cuerpo, noindex, estado, canonica, extraJs = [] }) {
  const url = new URL(ctx.request.url);
  const origen = url.origin;
  const canon = canonica || origen + url.pathname;
  const tituloCompleto = titulo ? titulo + " | " + SITIO : SITIO;
  const desc = recortar(descripcion, 200);
  const img = absoluta(imagen, origen);

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(tituloCompleto)}</title>
  <meta name="description" content="${esc(desc)}">
  <meta name="theme-color" content="#0a0a0a">
  ${noindex ? '<meta name="robots" content="noindex, nofollow">' : ""}
  <link rel="canonical" href="${esc(canon)}">

  <meta property="og:site_name" content="${SITIO}">
  <meta property="og:locale" content="es_PY">
  <meta property="og:type" content="${esc(tipo)}">
  <meta property="og:title" content="${esc(titulo || SITIO)}">
  <meta property="og:description" content="${esc(desc)}">
  <meta property="og:url" content="${esc(canon)}">
  <meta property="og:image" content="${esc(img)}">
  <meta property="og:image:alt" content="${esc(imagenAlt || titulo || SITIO)}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${esc(titulo || SITIO)}">
  <meta name="twitter:description" content="${esc(desc)}">
  <meta name="twitter:image" content="${esc(img)}">

  <link rel="icon" href="${ICONO_FAVICON}">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700;800&family=Barlow:wght@400;500;600&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/css/styles.css">
  <link rel="stylesheet" href="/css/publicacion.css">
  <link rel="stylesheet" href="/css/coberturas.css">
</head>
<body>
  <a class="skip-link" href="#contenido">Saltar al contenido</a>

  <header class="header is-scrolled" id="header">
    <div class="container header__inner">
      <a href="/" class="header__logo" aria-label="RedDeportivaTV, ir al inicio">
        <img src="/assets/img/logo/logo-reddeportivatv.jpg" alt="RedDeportivaTV" width="834" height="375">
      </a>
      <button class="nav-toggle" id="navToggle" aria-expanded="false" aria-controls="nav" aria-label="Abrir menú">
        <span></span><span></span><span></span>
      </button>
      <nav class="nav" id="nav" aria-label="Navegación principal">
        <ul class="nav__list">
          <li><a href="/coberturas">Coberturas</a></li>
          <li><a href="/#videos">Videos</a></li>
          <li><a href="/#nosotros">Nosotros</a></li>
          <li><a href="/#servicios">Servicios</a></li>
          <li><a href="/#contacto" class="nav__cta">Contratar</a></li>
        </ul>
      </nav>
    </div>
  </header>

  <main id="contenido" class="pub">
${cuerpo}
  </main>

  <footer class="footer">
    <div class="container footer__inner">
      <img src="/assets/img/logo/logo-reddeportivatv.jpg" alt="RedDeportivaTV" width="834" height="375" class="footer__logo" loading="lazy">
      <p class="footer__text">Fotografía deportiva · Resúmenes · Transmisiones en vivo</p>
      <div class="footer__social" id="footerSocial"></div>
      <p class="footer__copy">© <span id="year">${new Date().getUTCFullYear()}</span> RedDeportivaTV. Todos los derechos reservados.</p>
    </div>
  </footer>

  <dialog class="lightbox" id="lightbox" aria-label="Foto ampliada">
    <button class="lightbox__close" id="lightboxClose" aria-label="Cerrar">&times;</button>
    <img id="lightboxImg" alt="">
    <p class="lightbox__caption" id="lightboxCaption"></p>
  </dialog>

  <script src="/js/data.js"></script>
  <script src="/js/main.js"></script>
  <script src="/js/publicacion.js"></script>
  <script src="/js/coberturas.js"></script>
${extraJs.map((s) => `  <script src="${esc(s)}"></script>`).join("\n")}
</body>
</html>`;

  const cabeceras = {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": estado === 200 ? "public, max-age=60" : "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin"
  };
  if (noindex) cabeceras["X-Robots-Tag"] = "noindex, nofollow";
  return new Response(html, { status: estado, headers: cabeceras });
}

/* ---------- Piezas reutilizables ---------- */

function migas(pasos) {
  return `<nav class="migas" aria-label="Ubicación"><ol>${pasos.map((p, i) =>
    i === pasos.length - 1
      ? `<li aria-current="page">${esc(p.texto)}</li>`
      : `<li><a href="${esc(p.url)}">${esc(p.texto)}</a></li>`).join("")}</ol></nav>`;
}

function rutaCampeonato(c) { return "/campeonatos/" + c.slug; }
function rutaCategoria(c, k) { return "/campeonatos/" + c.slug + "/" + k.slug; }
function rutaJornada(j) { return "/jornadas/" + j.slug; }

/* Textos por estado público. Lo que "no_aplica" no se menciona: la web
   nunca promete contenido que no va a existir. */
const AVISO_FOTOS = {
  preparacion: { corto: "Fotos en preparación", titulo: "Estamos preparando las fotografías", texto: "Van a estar disponibles en esta misma página." },
  pendiente: { corto: "Fotos próximamente", titulo: "Fotografías próximamente", texto: "Las fotos de esta cobertura todavía no están cargadas." }
};
const AVISO_VIDEO = {
  edicion: { corto: "Video en edición", titulo: "Estamos preparando el video resumen", texto: "Va a estar disponible en esta misma página." },
  pendiente: { corto: "Video próximamente", titulo: "Video resumen próximamente", texto: "Todavía no hay video resumen de esta cobertura." }
};

function indicadores(t) {
  const partes = [];
  if (t.fotos) partes.push('<span class="ind ind--fotos">Fotos</span>');
  if (t.video) partes.push('<span class="ind ind--video">Video</span>');
  const af = !t.fotos && AVISO_FOTOS[t.estadoFotos];
  const av = !t.video && AVISO_VIDEO[t.estadoVideo];
  if (af) partes.push('<span class="ind ind--prep">' + af.corto + "</span>");
  if (av) partes.push('<span class="ind ind--prep">' + av.corto + "</span>");
  return partes.length ? `<div class="ind-lista">${partes.join("")}</div>` : "";
}

function avisoContenido(a, id) {
  return a ? `<section class="cob-aviso"${id ? ` id="${id}"` : ""}><p class="cob-aviso__titulo">${esc(a.titulo)}</p><p>${esc(a.texto)}</p></section>` : "";
}

export function tarjeta(t, { cargaInmediata = false } = {}) {
  const meta = [t.campeonato, t.categoria, t.jornada].filter(Boolean).map(esc).join(" · ");
  return `
      <article class="tarjeta">
        <a class="tarjeta__enlace" href="/coberturas/${esc(t.slug)}">
          <div class="tarjeta__media${t.video && !t.fotos ? " tarjeta__media--video" : ""}">
            ${t.imagen
              ? `<img src="${esc(t.imagen)}" data-alternativa="${esc(t.imagenAlternativa || "")}" alt="" loading="${cargaInmediata ? "eager" : "lazy"}" decoding="async">`
              : `<span class="tarjeta__sin-imagen" aria-hidden="true">TV</span>`}
          </div>
          <div class="tarjeta__cuerpo">
            ${t.fecha ? `<p class="tarjeta__fecha"><time datetime="${esc(t.fecha)}">${esc(fechaCorta(t.fecha))}</time>${t.tipo && t.tipo !== "partido" ? ` · ${esc(TIPOS[t.tipo] || "")}` : ""}</p>` : ""}
            <h3 class="tarjeta__titulo">${esc(t.titulo)}</h3>
            ${meta ? `<p class="tarjeta__meta">${meta}</p>` : ""}
            ${indicadores(t)}
          </div>
        </a>
      </article>`;
}

export function tarjetaVideo(t) {
  return `
      <article class="tarjeta tarjeta--video">
        <a class="tarjeta__enlace" href="/coberturas/${esc(t.slug)}#video">
          <div class="tarjeta__media tarjeta__media--video">
            <img src="https://i.ytimg.com/vi/${esc(t.video)}/mqdefault.jpg" alt="" loading="lazy" decoding="async">
          </div>
          <div class="tarjeta__cuerpo">
            <h3 class="tarjeta__titulo">${esc(t.titulo)}</h3>
            <p class="tarjeta__meta">${[t.campeonato, fechaCorta(t.fecha)].filter(Boolean).map(esc).join(" · ")}</p>
          </div>
        </a>
      </article>`;
}

function marcador(p) {
  if (!p) return "";
  const goles = p.goles_local != null && p.goles_visitante != null;
  return `<div class="marcador" aria-label="Resultado">
        <span class="marcador__equipo">${esc(p.equipo_local)}</span>
        <span class="marcador__resultado">${goles ? esc(p.goles_local) + " – " + esc(p.goles_visitante) : "vs"}</span>
        <span class="marcador__equipo">${esc(p.equipo_visitante)}</span>
      </div>`;
}

function botonesCompartir(titulo) {
  return `<div class="compartir" data-compartir data-titulo="${esc(titulo)}">
        <span class="compartir__titulo">Compartir</span>
        <a class="compartir__btn compartir__btn--fb" data-red="facebook" href="#" target="_blank" rel="noopener">Facebook</a>
        <a class="compartir__btn compartir__btn--wa" data-red="whatsapp" href="#" target="_blank" rel="noopener">WhatsApp</a>
        <button class="compartir__btn" type="button" data-red="nativo" hidden>Más opciones…</button>
        <button class="compartir__btn" type="button" data-red="copiar">Copiar enlace</button>
      </div>`;
}

/* ---------- Página de una cobertura ---------- */

export function paginaCobertura(ctx, c) {
  const pasos = [{ texto: "Inicio", url: "/" }, { texto: "Coberturas", url: "/coberturas" }];
  if (c.campeonato) pasos.push({ texto: c.campeonato.nombre, url: rutaCampeonato(c.campeonato) });
  if (c.campeonato && c.categoria) pasos.push({ texto: c.categoria.nombre, url: rutaCategoria(c.campeonato, c.categoria) });
  if (c.jornada) pasos.push({ texto: c.jornada.nombre, url: rutaJornada(c.jornada) });
  pasos.push({ texto: c.titulo });

  const p = c.partido;
  const meta = [fechaLegible(c.fecha), c.campeonato && c.campeonato.nombre, c.categoria && c.categoria.nombre,
    c.jornada && c.jornada.nombre, p && p.fase, p && p.lugar].filter(Boolean).map(esc).join(" · ");

  const video = c.video
    ? `<section class="cob-video" id="video" aria-label="Video resumen">
        <div class="cob-video__marco" data-youtube="${esc(c.video)}" data-titulo="${esc(c.titulo)}">
          <img src="https://i.ytimg.com/vi/${esc(c.video)}/hqdefault.jpg" alt="" class="cob-video__miniatura" loading="eager">
          <button class="cob-video__play" type="button" aria-label="Reproducir el video resumen">
            <svg viewBox="0 0 68 48" width="68" height="48" aria-hidden="true"><path fill="#e30613" d="M66.5 7.7a8.5 8.5 0 0 0-6-6C55.2.4 34 .4 34 .4s-21.2 0-26.5 1.3a8.5 8.5 0 0 0-6 6A89 89 0 0 0 .2 24a89 89 0 0 0 1.3 16.3 8.5 8.5 0 0 0 6 6C12.8 47.6 34 47.6 34 47.6s21.2 0 26.5-1.3a8.5 8.5 0 0 0 6-6A89 89 0 0 0 67.8 24a89 89 0 0 0-1.3-16.3Z"/><path fill="#fff" d="m27 34 18-10-18-10z"/></svg>
          </button>
        </div>
        <p class="cob-video__alternativa">¿No se reproduce? <a href="https://www.youtube.com/watch?v=${esc(c.video)}" target="_blank" rel="noopener">Ver en YouTube ↗</a></p>
      </section>`
    : avisoContenido(AVISO_VIDEO[c.estadoVideo], "video");

  const galeria = c.fotosDisponibles && c.fotos.length
    ? `<section class="cob-galeria" aria-label="Fotografías">
        <h2 class="cob-subtitulo">Fotografías <span>(${c.fotos.length})</span></h2>
        <div class="gallery__grid pub__galeria" id="albumGrid">${c.fotos.map((f, i) => `
          <figure class="gallery__item${i === 0 ? " gallery__item--wide" : ""}">
            <button class="gallery__btn" type="button" data-src="${esc(f.src)}" data-caption="${esc(f.descripcion || "")}" aria-label="Ampliar foto ${i + 1}: ${esc(f.alt || c.titulo)}">
              <img src="${esc(i === 0 ? f.src : f.mini || f.src)}" alt="${esc(f.alt || c.titulo)}" loading="${i < 3 ? "eager" : "lazy"}" decoding="async"${f.ancho && f.alto ? ` width="${esc(f.ancho)}" height="${esc(f.alto)}"` : ""}>
            </button>
            ${f.descripcion ? `<figcaption class="gallery__caption">${esc(f.descripcion)}</figcaption>` : ""}
          </figure>`).join("")}
        </div>
      </section>`
    : avisoContenido(AVISO_FOTOS[c.estadoFotos], "fotos");

  const cuerpo = `
    <article class="container pub__articulo pub__articulo--ancho cob">
      ${migas(pasos)}
      <p class="eyebrow">${esc(TIPOS[c.tipo] || "Cobertura")}</p>
      <h1 class="pub__titulo">${esc(c.titulo)}</h1>
      ${meta ? `<p class="pub__meta">${meta}</p>` : ""}
      ${c.tipo === "partido" ? marcador(p) : ""}
      ${c.descripcion ? `<p class="pub__bajada">${esc(c.descripcion)}</p>` : ""}
      ${botonesCompartir(c.titulo)}
      ${video}
      ${galeria}
      ${c.jornada ? `<p class="cob-volver"><a class="link-arrow" href="${esc(rutaJornada(c.jornada))}">Ver todos los partidos de ${esc(c.jornada.nombre)}</a></p>` : ""}
    </article>`;

  return documento({
    ctx, titulo: c.titulo,
    descripcion: c.descripcion || [TIPOS[c.tipo], c.campeonato && c.campeonato.nombre, c.categoria && c.categoria.nombre, c.jornada && c.jornada.nombre, fechaLegible(c.fecha)].filter(Boolean).join(" · "),
    imagen: c.portada, imagenAlt: c.portada_alt, tipo: "article", cuerpo,
    noindex: esPrueba(ctx, c), estado: 200, extraJs: ["/js/cobertura.js"]
  });
}

/* ---------- Catálogo /coberturas ---------- */

function opcion(valor, texto, actual) {
  return `<option value="${esc(valor)}"${String(valor) === String(actual) ? " selected" : ""}>${esc(texto)}</option>`;
}

export function formularioBusqueda(f, cat, { compacto = false } = {}) {
  const camp = cat.campeonatos.find((c) => c.slug === f.campeonato);
  const categorias = camp ? cat.categorias.filter((k) => k.campeonato_id === camp.id) : [];
  const categ = categorias.find((k) => k.slug === f.categoria);
  const jornadas = camp ? cat.jornadas.filter((j) => j.campeonato_id === camp.id && (!categ || j.categoria_id === categ.id)) : [];
  const nombresJornadas = etiquetasJornadas(jornadas, cat);
  const anioActual = new Date().getUTCFullYear();
  const anios = [];
  for (let a = anioActual; a >= anioActual - 15; a--) anios.push(a);

  return `
      <form class="buscador${compacto ? " buscador--compacto" : ""}" action="/coberturas" method="get" role="search">
        ${f.orden && f.orden !== "fecha" ? `<input type="hidden" name="orden" value="${esc(f.orden)}">` : ""}
        <label class="buscador__etiqueta" for="q">Buscá tus fotos y videos</label>
        <div class="buscador__fila">
          <input class="buscador__campo" id="q" name="q" type="search" value="${esc(f.q)}" placeholder="Equipo, campeonato, categoría, fecha…" autocomplete="off" enterkeyhint="search">
          <button class="btn btn--primary buscador__boton" type="submit">Buscar</button>
        </div>
        <p class="buscador__ejemplos">Ej.: <a href="/coberturas?q=Área+4+Fecha+2">Área 4 Fecha 2</a> · <a href="/coberturas?q=septiembre+2024">septiembre 2024</a> · <a href="/coberturas?q=final">Final</a></p>
        <details class="filtros"${f.activos > (f.q ? 1 : 0) ? " open" : ""}>
          <summary class="filtros__boton">Filtros${f.activos - (f.q ? 1 : 0) > 0 ? ` <span class="filtros__cuenta">${f.activos - (f.q ? 1 : 0)}</span>` : ""}</summary>
          <div class="filtros__panel">
            <label>Campeonato
              <select name="campeonato" data-filtro="campeonato">${opcion("", "Todos", f.campeonato)}${cat.campeonatos.map((c) => opcion(c.slug, c.nombre + (c.temporada ? " " + c.temporada : ""), f.campeonato)).join("")}</select>
            </label>
            <label>Categoría
              <select name="categoria" data-filtro="categoria"${categorias.length ? "" : " disabled"}>${opcion("", categorias.length ? "Todas" : "Elegí un campeonato", f.categoria)}${categorias.map((k) => opcion(k.slug, k.nombre, f.categoria)).join("")}</select>
            </label>
            <label>Jornada
              <select name="jornada" data-filtro="jornada"${jornadas.length ? "" : " disabled"}>${opcion("", jornadas.length ? "Todas" : "Elegí un campeonato", f.jornada)}${jornadas.map((j, i) => opcion(j.slug, nombresJornadas[i], f.jornada)).join("")}</select>
            </label>
            <label>Tipo
              <select name="tipo">${opcion("", "Todos", f.tipo)}${opcion("partido", "Partidos", f.tipo)}${opcion("jornada", "Jornadas (general)", f.tipo)}${opcion("campeonato", "Campeonatos (general)", f.tipo)}${opcion("evento", "Eventos", f.tipo)}</select>
            </label>
            <label>Año
              <select name="anio">${opcion("", "Todos", f.anio)}${anios.map((a) => opcion(a, a, f.anio)).join("")}</select>
            </label>
            <label>Mes
              <select name="mes">${opcion("", "Todos", f.mes)}${MESES.map((m, i) => opcion(i + 1, m[0].toUpperCase() + m.slice(1), f.mes)).join("")}</select>
            </label>
            <label>Desde <input type="date" name="desde" value="${esc(f.desde)}"></label>
            <label>Hasta <input type="date" name="hasta" value="${esc(f.hasta)}"></label>
            <div class="filtros__acciones">
              <button class="btn btn--primary" type="submit">Aplicar</button>
              <a class="btn btn--ghost" href="/coberturas">Limpiar todo</a>
            </div>
          </div>
        </details>
      </form>`;
}

function chipsArchivo(arch) {
  const anios = [...new Set(arch.map((a) => a.anio))];
  if (!anios.length) return "";
  return `<nav class="archivo-chips" aria-label="Archivo por año"><span>Archivo:</span>${anios.map((a) =>
    `<a href="/coberturas?anio=${a}">${a}</a>`).join("")}<a href="/coberturas/archivo">Ver todo →</a></nav>`;
}

export function paginaCatalogo(ctx, { f, cat, resultado, arch, origenUrl }) {
  const hayBusqueda = f.activos > 0;
  const mostrados = resultado.items.length;
  const quedan = resultado.total > mostrados;
  const siguiente = new URL(origenUrl);
  siguiente.searchParams.set("pagina", String(f.pagina + 1));

  // Orden: por fecha real del partido o evento, o lo agregado últimamente
  // (así se encuentran coberturas antiguas que se subieron hace poco).
  const urlOrden = (orden) => {
    const u = new URL(origenUrl);
    u.searchParams.delete("pagina");
    if (orden === "fecha") u.searchParams.delete("orden"); else u.searchParams.set("orden", orden);
    return u.pathname + u.search;
  };
  const selectorOrden = `<nav class="orden-chips" aria-label="Ordenar coberturas"><span>Ordenar:</span>${[
    ["fecha", "Fecha del partido o evento"], ["reciente", "Agregadas recientemente"]].map(([v, t]) =>
    `<a href="${esc(urlOrden(v))}"${f.orden === v ? ' aria-current="true"' : ""}>${t}</a>`).join("")}</nav>`;

  const encabezado = hayBusqueda
    ? `<p class="resultados__cuenta">${resultado.total === 1 ? "1 cobertura" : esc(resultado.total) + " coberturas"}${f.q ? ` para «${esc(f.q)}»` : ""}</p>`
    : `<h2 class="cob-subtitulo">${f.orden === "reciente" ? "Agregadas recientemente" : "Últimas coberturas"}</h2>`;

  const vacio = `
      <div class="sin-resultados">
        <p class="sin-resultados__titulo">No encontramos coberturas${f.q ? ` para «${esc(f.q)}»` : " con esos filtros"}.</p>
        <ul>
          <li>Revisá cómo está escrito o probá con menos palabras (por ejemplo, solo el equipo).</li>
          <li>Quitá algún filtro: <a href="/coberturas${f.q ? "?q=" + encodeURIComponent(f.q) : ""}">buscar sin filtros</a>.</li>
          <li>Explorá el <a href="/coberturas/archivo">archivo por año y mes</a>, las <a href="/coberturas">últimas coberturas</a> o las <a href="/coberturas?orden=reciente">agregadas recientemente</a>.</li>
        </ul>
      </div>`;

  const cuerpo = `
    <section class="container pub__articulo pub__articulo--ancho catalogo">
      ${migas([{ texto: "Inicio", url: "/" }, { texto: "Coberturas" }])}
      <h1 class="pub__titulo">Coberturas</h1>
      <p class="pub__bajada">Fotos y videos de todos los partidos y eventos que cubrimos, recientes y del archivo.</p>
      ${formularioBusqueda(f, cat)}
      ${chipsArchivo(arch)}
      <div class="resultados" aria-live="polite">
        ${encabezado}
        ${selectorOrden}
        ${mostrados ? `<div class="tarjetas" id="tarjetas">${resultado.items.map((t, i) => tarjeta(t, { cargaInmediata: i < 3 })).join("")}</div>` : vacio}
        ${quedan ? `<p class="ver-mas"><a class="btn btn--ghost" id="verMas" href="${esc(siguiente.pathname + siguiente.search)}" data-pagina="${f.pagina}">Ver más</a></p>` : ""}
      </div>
    </section>`;

  return documento({
    ctx, titulo: f.q ? "Buscar: " + f.q : "Coberturas",
    descripcion: "Buscá fotos y videos de partidos de futsal y fútbol por equipo, campeonato, categoría, jornada o fecha.",
    tipo: "website", cuerpo, noindex: hayBusqueda || esPrueba(ctx), estado: 200,
    canonica: new URL(ctx.request.url).origin + "/coberturas"
  });
}

/* ---------- Archivo por año y mes ---------- */

export function paginaArchivo(ctx, arch) {
  const porAnio = {};
  for (const a of arch) (porAnio[a.anio] = porAnio[a.anio] || []).push(a);
  const anios = Object.keys(porAnio).sort((a, b) => b - a);
  const cuerpo = `
    <section class="container pub__articulo pub__articulo--ancho">
      ${migas([{ texto: "Inicio", url: "/" }, { texto: "Coberturas", url: "/coberturas" }, { texto: "Archivo" }])}
      <h1 class="pub__titulo">Archivo de coberturas</h1>
      <p class="pub__bajada">Elegí el año y el mes del partido. También podés <a href="/coberturas">buscar directamente</a>.</p>
      ${anios.length ? anios.map((a) => `
      <section class="archivo-anio">
        <h2 class="cob-subtitulo"><a href="/coberturas?anio=${a}">${a}</a> <span>(${porAnio[a].reduce((s, m) => s + Number(m.cantidad), 0)})</span></h2>
        <ul class="archivo-meses">${porAnio[a].map((m) => `<li><a href="/coberturas?anio=${a}&amp;mes=${m.mes}">${esc(MESES[m.mes - 1][0].toUpperCase() + MESES[m.mes - 1].slice(1))} <span>${esc(m.cantidad)}</span></a></li>`).join("")}</ul>
      </section>`).join("") : `<p class="pub__vacio">Todavía no hay coberturas publicadas.</p>`}
    </section>`;
  return documento({ ctx, titulo: "Archivo de coberturas", descripcion: "Coberturas deportivas por año y mes.", tipo: "website", cuerpo, noindex: esPrueba(ctx), estado: 200 });
}

/* ---------- Jornada ---------- */

export function paginaJornada(ctx, d) {
  const { jornada, campeonato, categoria, partidos, generales } = d;
  const pasos = [{ texto: "Inicio", url: "/" }, { texto: "Coberturas", url: "/coberturas" }];
  if (campeonato) pasos.push({ texto: campeonato.nombre, url: rutaCampeonato(campeonato) });
  if (campeonato && categoria) pasos.push({ texto: categoria.nombre, url: rutaCategoria(campeonato, categoria) });
  pasos.push({ texto: jornada.nombre });
  const titulo = [campeonato && campeonato.nombre, categoria && categoria.nombre, jornada.nombre].filter(Boolean).join(" · ");
  const portada = (generales.find((g) => g.imagen) || (partidos.find((p) => p.cobertura && p.cobertura.imagen) || {}).cobertura || {}).imagenAlternativa;

  const lista = partidos.length ? `
      <ol class="partidos">${partidos.map((p, i) => {
        const c = p.cobertura;
        const goles = p.goles_local != null && p.goles_visitante != null;
        const datos = [p.fecha && fechaCorta(p.fecha), p.hora && String(p.hora).slice(0, 5), p.lugar, p.fase].filter(Boolean).map(esc).join(" · ");
        const contenido = `
            <span class="partido__numero">Partido ${i + 1}</span>
            <span class="partido__equipos">${esc(p.equipo_local)} <strong>${goles ? esc(p.goles_local) + " – " + esc(p.goles_visitante) : "vs"}</strong> ${esc(p.equipo_visitante)}</span>
            ${datos ? `<span class="partido__datos">${datos}</span>` : ""}
            ${c ? indicadores(c) : '<span class="ind ind--prep">Cobertura próximamente</span>'}`;
        return c
          ? `<li class="partido"><a class="partido__enlace" href="/coberturas/${esc(c.slug)}">${c.imagen ? `<img src="${esc(c.imagen)}" data-alternativa="${esc(c.imagenAlternativa || "")}" alt="" loading="lazy" class="partido__img">` : ""}<span class="partido__texto">${contenido}</span></a></li>`
          : `<li class="partido partido--sin"><span class="partido__texto">${contenido}</span></li>`;
      }).join("")}
      </ol>` : `<p class="pub__vacio">Todavía no hay partidos cargados en esta jornada.</p>`;

  const cuerpo = `
    <section class="container pub__articulo pub__articulo--ancho">
      ${migas(pasos)}
      <p class="eyebrow">Jornada</p>
      <h1 class="pub__titulo">${esc(titulo)}</h1>
      ${jornada.fecha ? `<p class="pub__meta">${esc(fechaLegible(jornada.fecha))}</p>` : ""}
      ${botonesCompartir(titulo)}
      ${generales.length ? `<h2 class="cob-subtitulo">Cobertura general</h2><div class="tarjetas">${generales.map((t) => tarjeta(t)).join("")}</div>` : ""}
      <h2 class="cob-subtitulo">Partidos</h2>
      ${lista}
    </section>`;
  return documento({
    ctx, titulo, descripcion: "Fotos y videos de " + titulo + (jornada.fecha ? " (" + fechaLegible(jornada.fecha) + ")" : ""),
    imagen: portada, tipo: "website", cuerpo, noindex: esPrueba(ctx), estado: 200
  });
}

/* ---------- Campeonato / categoría ---------- */

export function paginaCampeonato(ctx, d) {
  const { campeonato, categoria, categorias, jornadas, recientes } = d;
  const pasos = [{ texto: "Inicio", url: "/" }, { texto: "Coberturas", url: "/coberturas" }];
  pasos.push(categoria ? { texto: campeonato.nombre, url: rutaCampeonato(campeonato) } : { texto: campeonato.nombre });
  if (categoria) pasos.push({ texto: categoria.nombre });
  const titulo = campeonato.nombre + (categoria ? " · " + categoria.nombre : "");
  const filtro = "/coberturas?campeonato=" + encodeURIComponent(campeonato.slug) + (categoria ? "&categoria=" + encodeURIComponent(categoria.slug) : "");

  const bloquesJornadas = (() => {
    if (!jornadas.length) return "";
    const grupos = {};
    for (const j of jornadas) (grupos[j.categoria_id || ""] = grupos[j.categoria_id || ""] || []).push(j);
    return `<h2 class="cob-subtitulo">Jornadas</h2>` + Object.entries(grupos).map(([catId, js]) => {
      const k = categorias.find((x) => x.id === catId);
      return `<div class="jornadas-grupo">${!categoria && k ? `<h3>${esc(k.nombre)}</h3>` : ""}<ul class="chips">${js.map((j) =>
        `<li><a href="${esc(rutaJornada(j))}">${esc(j.nombre)}${j.fecha ? ` <span>${esc(fechaCorta(j.fecha))}</span>` : ""}</a></li>`).join("")}</ul></div>`;
    }).join("");
  })();

  const cuerpo = `
    <section class="container pub__articulo pub__articulo--ancho">
      ${migas(pasos)}
      <p class="eyebrow">${categoria ? "Categoría" : "Campeonato"}</p>
      <h1 class="pub__titulo">${esc(titulo)}</h1>
      ${campeonato.temporada ? `<p class="pub__meta">Temporada ${esc(campeonato.temporada)}</p>` : ""}
      ${!categoria && campeonato.descripcion ? `<p class="pub__bajada">${esc(campeonato.descripcion)}</p>` : ""}
      ${!categoria && categorias.length ? `<h2 class="cob-subtitulo">Categorías</h2><ul class="chips">${categorias.map((k) => `<li><a href="${esc(rutaCategoria(campeonato, k))}">${esc(k.nombre)}</a></li>`).join("")}</ul>` : ""}
      ${bloquesJornadas}
      <h2 class="cob-subtitulo">Últimas coberturas</h2>
      ${recientes.items.length ? `<div class="tarjetas">${recientes.items.map((t) => tarjeta(t)).join("")}</div>` : `<p class="pub__vacio">Todavía no hay coberturas publicadas.</p>`}
      ${recientes.total > recientes.items.length ? `<p class="ver-mas"><a class="btn btn--ghost" href="${esc(filtro)}">Ver las ${esc(recientes.total)} coberturas</a></p>` : ""}
    </section>`;
  return documento({ ctx, titulo, descripcion: "Fotos y videos de " + titulo + " en RedDeportivaTV.", tipo: "website", cuerpo, noindex: esPrueba(ctx), estado: 200 });
}

/* ---------- Noticias ---------- */

function avisoPrueba(item) {
  return item && item.prueba
    ? '<p class="pub__aviso" role="note">Contenido de prueba: esta página sirve para comprobar la nueva dirección y la vista previa al compartir.</p>'
    : "";
}

export function paginaNoticia(ctx, n) {
  const meta = [fechaLegible(n.fecha), n.campeonato, n.categoria, n.partido].filter(Boolean).map(esc).join(" · ");
  const cuerpo = `
    <article class="container pub__articulo">
      ${migas([{ texto: "Inicio", url: "/" }, { texto: n.titulo }])}
      ${avisoPrueba(n)}
      <p class="eyebrow">Noticia</p>
      <h1 class="pub__titulo">${esc(n.titulo)}</h1>
      ${meta ? `<p class="pub__meta">${meta}</p>` : ""}
      ${n.descripcion ? `<p class="pub__bajada">${esc(n.descripcion)}</p>` : ""}
      ${n.portada ? `<figure class="pub__portada"><img src="${esc(n.portada)}" alt="${esc(n.portada_alt || n.titulo)}"></figure>` : ""}
      <div class="pub__contenido">
${parrafos(n.contenido)}
      </div>
      ${botonesCompartir(n.titulo)}
    </article>`;
  return documento({
    ctx, titulo: n.titulo, descripcion: n.descripcion || n.contenido, imagen: n.portada,
    imagenAlt: n.portada_alt, tipo: "article", cuerpo, noindex: esPrueba(ctx, n), estado: 200, extraJs: ["/js/cobertura.js"]
  });
}

/* ---------- Errores ---------- */

export function paginaNoEncontrada(ctx) {
  const cuerpo = `
    <section class="container pub__articulo pub__estado">
      <p class="eyebrow">Error 404</p>
      <h1 class="pub__titulo">No encontramos esta publicación</h1>
      <p class="pub__bajada">Puede que se haya movido o que todavía no esté publicada.</p>
      ${formularioBusqueda({ q: "", campeonato: "", categoria: "", jornada: "", tipo: "", anio: "", mes: "", desde: "", hasta: "", activos: 0 }, { campeonatos: [], categorias: [], jornadas: [] }, { compacto: true })}
      <a class="btn btn--primary" href="/coberturas">Ver todas las coberturas</a>
    </section>`;
  return documento({ ctx, titulo: "Publicación no encontrada", descripcion: "", tipo: "website", cuerpo, noindex: true, estado: 404 });
}

export function paginaError(ctx) {
  const cuerpo = `
    <section class="container pub__articulo pub__estado">
      <p class="eyebrow">Momento</p>
      <h1 class="pub__titulo">No pudimos cargar esta página</h1>
      <p class="pub__bajada">Probá de nuevo en unos minutos. El resto de la web funciona con normalidad.</p>
      <a class="btn btn--primary" href="/">Ir al inicio</a>
    </section>`;
  return documento({ ctx, titulo: "Página no disponible", descripcion: "", tipo: "website", cuerpo, noindex: true, estado: 503 });
}
