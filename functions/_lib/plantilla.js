/* =========================================================
   Plantilla HTML de noticias y álbumes, generada en el servidor.
   Incluye título, descripción y metadatos Open Graph completos,
   para que Facebook y WhatsApp muestren la vista previa correcta
   (sus robots no ejecutan JavaScript).
   Usa los mismos estilos, cabecera y pie de la web principal.
   ========================================================= */

const SITIO = "RedDeportivaTV";
const IMAGEN_POR_DEFECTO = "/assets/img/fotos/futbol-duelo-1600.jpg";

export function esc(valor) {
  return String(valor == null ? "" : valor)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/* Convierte rutas relativas en URL absolutas (requisito de Open Graph).
   Solo acepta http(s); cualquier otra cosa vuelve a la imagen por defecto. */
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

function fechaLegible(fecha) {
  if (!fecha) return "";
  const d = new Date(String(fecha).slice(0, 10) + "T00:00:00Z");
  if (isNaN(d)) return "";
  return d.toLocaleDateString("es", { timeZone: "UTC", day: "numeric", month: "long", year: "numeric" });
}

/* Texto plano → párrafos HTML (todo escapado: no se acepta HTML del contenido). */
function parrafos(texto) {
  return String(texto || "")
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => "<p>" + esc(p).replace(/\n/g, "<br>") + "</p>")
    .join("\n");
}

function esPrueba(ctx, item) {
  return Boolean(item && item.prueba) || new URL(ctx.request.url).hostname.endsWith(".pages.dev");
}

const ICONO_FAVICON =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='8' fill='%23e30613'/%3E%3Ctext x='32' y='45' font-family='Arial Black,Arial' font-weight='900' font-size='34' fill='%23fff' text-anchor='middle'%3ETV%3C/text%3E%3C/svg%3E";

function documento({ ctx, titulo, descripcion, imagen, imagenAlt, tipo, cuerpo, noindex, estado }) {
  const url = new URL(ctx.request.url);
  const origen = url.origin;
  const canonica = origen + url.pathname;
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
  <link rel="canonical" href="${esc(canonica)}">

  <meta property="og:site_name" content="${SITIO}">
  <meta property="og:locale" content="es_PY">
  <meta property="og:type" content="${esc(tipo)}">
  <meta property="og:title" content="${esc(titulo || SITIO)}">
  <meta property="og:description" content="${esc(desc)}">
  <meta property="og:url" content="${esc(canonica)}">
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
          <li><a href="/#nosotros">Nosotros</a></li>
          <li><a href="/#videos">Videos</a></li>
          <li><a href="/#galeria">Galería</a></li>
          <li><a href="/#campeonatos">Coberturas</a></li>
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

function avisoPrueba(item) {
  return item && item.prueba
    ? '<p class="pub__aviso" role="note">Contenido de prueba: esta página sirve para comprobar la nueva dirección y la vista previa al compartir.</p>'
    : "";
}

function encabezado(item, etiqueta) {
  const meta = [fechaLegible(item.fecha), item.campeonato, item.categoria, item.partido].filter(Boolean).map(esc).join(" · ");
  return `
      <a class="pub__volver" href="/">← Volver al inicio</a>
      ${avisoPrueba(item)}
      <p class="eyebrow">${esc(etiqueta)}</p>
      <h1 class="pub__titulo">${esc(item.titulo)}</h1>
      ${meta ? `<p class="pub__meta">${meta}</p>` : ""}
      ${item.descripcion ? `<p class="pub__bajada">${esc(item.descripcion)}</p>` : ""}`;
}

export function paginaNoticia(ctx, n) {
  const cuerpo = `
    <article class="container pub__articulo">
      ${encabezado(n, "Noticia")}
      ${n.portada ? `<figure class="pub__portada"><img src="${esc(n.portada)}" alt="${esc(n.portada_alt || n.titulo)}" width="1600" height="1142"></figure>` : ""}
      <div class="pub__contenido">
${parrafos(n.contenido)}
      </div>
    </article>`;
  return documento({
    ctx, titulo: n.titulo, descripcion: n.descripcion || n.contenido, imagen: n.portada,
    imagenAlt: n.portada_alt, tipo: "article", cuerpo, noindex: esPrueba(ctx, n), estado: 200
  });
}

export function paginaAlbum(ctx, a) {
  const fotos = Array.isArray(a.fotos) ? a.fotos : [];
  const grilla = fotos.length
    ? fotos.map((f, i) => `
        <figure class="gallery__item${i === 0 ? " gallery__item--wide" : ""}" style="margin:0">
          <button class="gallery__btn" type="button" data-src="${esc(f.src)}" data-caption="${esc(f.descripcion || "")}" aria-label="Ampliar foto: ${esc(f.alt || a.titulo)}">
            <img src="${esc(i === 0 ? f.src : f.mini || f.src)}" alt="${esc(f.alt || a.titulo)}" loading="${i < 3 ? "eager" : "lazy"}">
          </button>
          ${f.descripcion ? `<figcaption class="gallery__caption">${esc(f.descripcion)}</figcaption>` : ""}
        </figure>`).join("")
    : '<p class="pub__vacio">Este álbum todavía no tiene fotos.</p>';

  const cuerpo = `
    <section class="container pub__articulo pub__articulo--ancho">
      ${encabezado(a, "Álbum · " + fotos.length + (fotos.length === 1 ? " foto" : " fotos"))}
      <div class="gallery__grid pub__galeria" id="albumGrid">${grilla}
      </div>
    </section>`;
  return documento({
    ctx, titulo: a.titulo, descripcion: a.descripcion || "Álbum de fotos de " + SITIO,
    imagen: a.portada || (fotos[0] && fotos[0].src), imagenAlt: a.portada_alt,
    tipo: "website", cuerpo, noindex: esPrueba(ctx, a), estado: 200
  });
}

export function paginaNoEncontrada(ctx) {
  const cuerpo = `
    <section class="container pub__articulo pub__estado">
      <p class="eyebrow">Error 404</p>
      <h1 class="pub__titulo">No encontramos esta publicación</h1>
      <p class="pub__bajada">Puede que se haya movido o que todavía no esté publicada.</p>
      <a class="btn btn--primary" href="/">Ir al inicio</a>
    </section>`;
  return documento({ ctx, titulo: "Publicación no encontrada", descripcion: "", tipo: "website", cuerpo, noindex: true, estado: 404 });
}

export function paginaError(ctx) {
  const cuerpo = `
    <section class="container pub__articulo pub__estado">
      <p class="eyebrow">Momento</p>
      <h1 class="pub__titulo">No pudimos cargar la publicación</h1>
      <p class="pub__bajada">Probá de nuevo en unos minutos. El resto de la página funciona con normalidad.</p>
      <a class="btn btn--primary" href="/">Ir al inicio</a>
    </section>`;
  return documento({ ctx, titulo: "Publicación no disponible", descripcion: "", tipo: "website", cuerpo, noindex: true, estado: 503 });
}
