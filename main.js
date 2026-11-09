/* =========================================================
   RedDeportivaTV — Lógica de la página
   Arma videos, galería, campeonatos y redes a partir de
   js/data.js. Normalmente no hace falta editar este archivo.
   ========================================================= */
(function () {
  "use strict";

  document.documentElement.classList.add("js");

  var data = window.RDTV || {};
  var $ = function (sel) { return document.querySelector(sel); };

  /* Escapa texto para insertarlo de forma segura en HTML */
  function esc(str) {
    return String(str == null ? "" : str)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  /* ---------- Íconos de redes ---------- */
  var ICONS = {
    youtube: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M23 7.2a3 3 0 0 0-2.1-2.1C19 4.6 12 4.6 12 4.6s-7 0-8.9.5A3 3 0 0 0 1 7.2 31 31 0 0 0 .5 12a31 31 0 0 0 .5 4.8 3 3 0 0 0 2.1 2.1c1.9.5 8.9.5 8.9.5s7 0 8.9-.5a3 3 0 0 0 2.1-2.1 31 31 0 0 0 .5-4.8 31 31 0 0 0-.5-4.8ZM9.8 15.1V8.9l5.4 3.1-5.4 3.1Z"/></svg>',
    instagram: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.2c3.2 0 3.6 0 4.8.1 3.3.1 4.8 1.7 4.9 4.9.1 1.3.1 1.6.1 4.8s0 3.6-.1 4.8c-.1 3.2-1.7 4.8-4.9 4.9-1.3.1-1.6.1-4.8.1s-3.6 0-4.8-.1c-3.3-.1-4.8-1.7-4.9-4.9C2.2 15.6 2.2 15.2 2.2 12s0-3.6.1-4.8C2.4 3.9 3.9 2.4 7.2 2.3 8.4 2.2 8.8 2.2 12 2.2Zm0 4.6a5.2 5.2 0 1 0 0 10.4 5.2 5.2 0 0 0 0-10.4Zm0 8.6a3.4 3.4 0 1 1 0-6.8 3.4 3.4 0 0 1 0 6.8Zm5.4-9.9a1.2 1.2 0 1 0 0 2.4 1.2 1.2 0 0 0 0-2.4Z"/></svg>',
    facebook: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M24 12a12 12 0 1 0-13.9 11.9v-8.4h-3V12h3V9.4c0-3 1.8-4.7 4.5-4.7 1.3 0 2.7.2 2.7.2v2.9h-1.5c-1.5 0-2 .9-2 1.9V12h3.4l-.5 3.5h-2.9v8.4A12 12 0 0 0 24 12Z"/></svg>',
    tiktok: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19.6 6.7a4.8 4.8 0 0 1-3.8-4.2V2h-3.4v13.7a2.9 2.9 0 1 1-2-2.7V9.5a6.3 6.3 0 1 0 5.4 6.2V8.8a8.2 8.2 0 0 0 4.8 1.5V6.9a4.9 4.9 0 0 1-1-.2Z"/></svg>'
  };
  var PLAY = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M8 5v14l11-7z"/></svg>';

  /* ---------- Cobertura destacada ---------- */
  function renderDestacada() {
    var d = data.coberturaDestacada;
    var card = $("#featuredCard");
    if (!d || !card) return;
    var img = card.querySelector(".featured__media img");
    if (d.imagen) { img.src = d.imagen; img.alt = d.imagenAlt || d.titulo; }
    card.querySelector(".featured__title").textContent = d.titulo;
    card.querySelector(".featured__text").textContent = d.texto;
    var btn = card.querySelector(".btn");
    btn.textContent = d.botonTexto || "Ver cobertura";
    if (d.enlace) btn.href = d.enlace;
  }

  /* ---------- Videos (carga liviana: el reproductor se carga al hacer clic) ---------- */
  var esArchivoLocal = location.protocol === "file:";

  function renderVideos() {
    var grid = $("#videosGrid");
    if (!grid || !data.videos) return;
    var lista = data.videos.slice(0, data.videosVisibles || 4);

    grid.innerHTML = lista.map(function (v, i) {
      var url = "https://www.youtube.com/watch?v=" + encodeURIComponent(v.id) + (v.inicio ? "&t=" + v.inicio + "s" : "");
      var thumb = "https://i.ytimg.com/vi/" + encodeURIComponent(v.id) + "/hqdefault.jpg";
      /* Abierta como archivo local, YouTube no permite reproducir embebido: se abre en YouTube. */
      var play = esArchivoLocal
        ? '<a class="video__play" href="' + url + '" target="_blank" rel="noopener" aria-label="Ver en YouTube: ' + esc(v.titulo) + '"><span class="video__play-icon">' + PLAY + '</span></a>'
        : '<button class="video__play" type="button" data-index="' + i + '" aria-label="Reproducir: ' + esc(v.titulo) + '"><span class="video__play-icon">' + PLAY + '</span></button>';
      return (
        '<article class="video reveal">' +
          '<div class="video__frame">' +
            '<img src="' + thumb + '" alt="" loading="lazy" width="480" height="360">' + play +
          '</div>' +
          '<div class="video__body">' +
            '<p class="video__cat">' + esc(v.categoria) + '</p>' +
            '<h3 class="video__title"><a href="' + url + '" target="_blank" rel="noopener" style="text-decoration:none">' + esc(v.titulo) + '</a></h3>' +
          '</div>' +
        '</article>'
      );
    }).join("");

    grid.addEventListener("click", function (e) {
      var btn = e.target.closest("button.video__play");
      if (!btn) return;
      var v = lista[+btn.dataset.index];
      var src = "https://www.youtube-nocookie.com/embed/" + encodeURIComponent(v.id) +
        "?autoplay=1&rel=0" + (v.inicio ? "&start=" + v.inicio : "");
      var iframe = document.createElement("iframe");
      iframe.src = src;
      iframe.title = v.titulo;
      iframe.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
      iframe.allowFullscreen = true;
      iframe.referrerPolicy = "strict-origin-when-cross-origin";
      btn.parentNode.replaceChildren(iframe);
    });
  }

  /* ---------- Galería ---------- */
  function renderGaleria() {
    var grid = $("#galleryGrid");
    if (!grid) return;
    var fotos = data.galeria || [];
    var minimo = Math.max(data.galeriaMinima || 0, fotos.length);

    var html = fotos.map(function (f, i) {
      var srcset = f.mini ? ' srcset="' + f.mini + ' 800w, ' + f.src + ' 1600w" sizes="(max-width: 720px) 100vw, 66vw"' : "";
      return (
        '<figure class="gallery__item' + (f.grande ? " gallery__item--wide" : "") + ' reveal" style="margin:0">' +
          '<button class="gallery__btn" type="button" data-index="' + i + '" aria-label="Ampliar foto: ' + esc(f.alt) + '">' +
            '<img src="' + (f.mini || f.src) + '"' + srcset + ' alt="' + esc(f.alt) + '" loading="lazy">' +
          '</button>' +
          (f.descripcion ? '<figcaption class="gallery__caption">' + esc(f.descripcion) + '</figcaption>' : "") +
        '</figure>'
      );
    });

    for (var p = fotos.length; p < minimo; p++) {
      html.push(
        '<div class="gallery__item gallery__item--soon reveal">' +
          '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h3l2-3h6l2 3h3a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1Z"/><circle cx="12" cy="13" r="4"/></svg>' +
          '<strong>Próximamente</strong><span>Más coberturas en camino</span>' +
        '</div>'
      );
    }
    grid.innerHTML = html.join("");

    /* En celular (2 columnas) evita que quede una tarjeta suelta al final */
    var celdasMovil = fotos.reduce(function (n, f) { return n + (f.grande ? 2 : 1); }, 0) + (minimo - fotos.length);
    var ultima = grid.lastElementChild;
    if (celdasMovil % 2 === 1 && ultima && ultima.classList.contains("gallery__item--soon")) {
      ultima.classList.add("hide-sm");
    }

    /* Visor */
    var dlg = $("#lightbox");
    if (!dlg || typeof dlg.showModal !== "function") return;
    grid.addEventListener("click", function (e) {
      var btn = e.target.closest(".gallery__btn");
      if (!btn) return;
      var f = fotos[+btn.dataset.index];
      $("#lightboxImg").src = f.src;
      $("#lightboxImg").alt = f.alt;
      $("#lightboxCaption").textContent = f.descripcion || "";
      dlg.showModal();
    });
    $("#lightboxClose").addEventListener("click", function () { dlg.close(); });
    dlg.addEventListener("click", function (e) { if (e.target === dlg) dlg.close(); });
  }

  /* ---------- Campeonatos ---------- */
  function renderCampeonatos() {
    var grid = $("#champsGrid");
    if (!grid || !data.campeonatos) return;
    grid.innerHTML = data.campeonatos.map(function (c) {
      var enVivo = c.estado === "en-curso";
      return (
        '<article class="champ' + (c.principal ? " champ--main" : "") + ' reveal">' +
          (c.imagen ? '<div class="champ__bg" aria-hidden="true"><img src="' + c.imagen + '" alt="" loading="lazy"></div>' : "") +
          '<span class="champ__status' + (enVivo ? " champ__status--live" : "") + '">' + esc(c.etiqueta || "") + '</span>' +
          '<h3>' + esc(c.titulo) + '</h3>' +
          '<p>' + esc(c.texto) + '</p>' +
          (c.enlace ? '<a class="link-arrow champ__link" href="' + esc(c.enlace) + '" target="_blank" rel="noopener">' + esc(c.enlaceTexto || "Ver más") + '</a>' : "") +
          (c.demo ? '<p class="champ__demo">Tarjeta demostrativa</p>' : "") +
        '</article>'
      );
    }).join("");
  }

  /* ---------- Redes ---------- */
  function renderRedes() {
    var redes = data.redes || [];
    var grid = $("#socialGrid");
    if (grid) {
      grid.innerHTML = redes.map(function (r) {
        return (
          '<a class="social-card reveal" href="' + esc(r.url) + '" target="_blank" rel="noopener">' +
            (ICONS[r.red] || "") +
            '<span class="social-card__name">' + esc(r.nombre) + '</span>' +
            '<span class="social-card__user">' + esc(r.usuario) + '</span>' +
          '</a>'
        );
      }).join("");
    }
    var foot = $("#footerSocial");
    if (foot) {
      foot.innerHTML = redes.map(function (r) {
        return '<a href="' + esc(r.url) + '" target="_blank" rel="noopener" aria-label="' + esc(r.nombre) + '">' + (ICONS[r.red] || "") + '</a>';
      }).join("");
    }
  }

  /* ---------- WhatsApp ---------- */
  function setupWhatsapp() {
    var btn = $("#whatsappBtn");
    if (!btn) return;
    var w = data.whatsapp || {};
    var numero = String(w.numero || "").replace(/\D/g, "");
    if (numero) {
      btn.href = "https://wa.me/" + numero + "?text=" + encodeURIComponent(w.mensaje || "");
    } else {
      /* Sin número cargado: enviar a Instagram para no dejar un botón roto */
      var ig = (data.redes || []).filter(function (r) { return r.red === "instagram"; })[0];
      btn.href = ig ? ig.url : "#redes";
      $("#whatsappLabel").textContent = "Escribinos por Instagram";
      btn.classList.replace("btn--whatsapp", "btn--instagram");
      btn.querySelector("svg").outerHTML = ICONS.instagram.replace("<svg", '<svg width="22" height="22" fill="currentColor"');
    }
  }

  /* ---------- Menú móvil ---------- */
  function setupMenu() {
    var toggle = $("#navToggle"), nav = $("#nav");
    if (!toggle || !nav) return;
    function set(open) {
      toggle.setAttribute("aria-expanded", String(open));
      toggle.setAttribute("aria-label", open ? "Cerrar menú" : "Abrir menú");
      nav.classList.toggle("is-open", open);
    }
    toggle.addEventListener("click", function () { set(toggle.getAttribute("aria-expanded") !== "true"); });
    nav.addEventListener("click", function (e) { if (e.target.closest("a")) set(false); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") set(false); });
  }

  /* ---------- Cabecera al hacer scroll ---------- */
  function setupHeader() {
    var header = $("#header");
    if (!header) return;
    var onScroll = function () { header.classList.toggle("is-scrolled", window.scrollY > 20); };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  }

  /* ---------- Aparición suave al hacer scroll ---------- */
  function setupReveal() {
    var items = document.querySelectorAll(".reveal");
    if (!("IntersectionObserver" in window)) {
      items.forEach(function (el) { el.classList.add("is-visible"); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add("is-visible"); io.unobserve(en.target); }
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
    items.forEach(function (el) { io.observe(el); });
  }

  /* ---------- Inicio ---------- */
  renderDestacada();
  renderVideos();
  renderGaleria();
  renderCampeonatos();
  renderRedes();
  setupWhatsapp();
  setupMenu();
  setupHeader();
  setupReveal();
  var y = $("#year");
  if (y) y.textContent = new Date().getFullYear();
})();
