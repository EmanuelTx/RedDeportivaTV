/* =========================================================
   Portada (versión Cloudflare): últimas noticias, últimas coberturas
   (una tarjeta por campeonato y día) y videos desde la base de datos.
   Si no hay conexión o todavía no hay nada, queda el contenido de
   siempre (galería y videos de js/data.js) y la sección de noticias
   permanece oculta.
   ========================================================= */
(function () {
  "use strict";
  if (location.protocol === "file:" || !window.fetch) return;

  function escalonar(destino, clase) {
    Array.prototype.forEach.call(destino.children, function (t, i) {
      t.classList.add(clase);
      t.style.setProperty("--n", String(i));
    });
  }

  /* Últimas coberturas */
  var galeria = document.getElementById("galleryGrid");
  if (galeria) {
    fetch("/api/coberturas?limite=9").then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
      if (!d || !d.cantidad) return; // sin coberturas: queda el contenido de siempre
      galeria.className = "tarjetas";
      galeria.innerHTML = d.html;    // HTML generado y escapado en el servidor
      escalonar(galeria, "tarjeta--nueva");
    }).catch(function () { /* queda el contenido de siempre */ });
  }

  /* Últimas noticias: la sección solo aparece si hay noticias publicadas */
  var noticias = document.getElementById("noticiasGrid");
  var seccionNoticias = document.getElementById("ultimas-noticias");
  if (noticias && seccionNoticias) {
    fetch("/api/noticias?limite=3").then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
      if (!d || !d.cantidad) return;
      noticias.setAttribute("data-cantidad", String(d.cantidad));
      noticias.innerHTML = d.html;
      escalonar(noticias, "noticia--nueva");
      seccionNoticias.hidden = false;
    }).catch(function () { /* sin sección */ });
  }

  /* Videos: el resumen de cada día y los videos de partidos, sin repetir;
     se completan con los videos fijos de js/data.js (ver main.js). */
  fetch("/api/videos?limite=4").then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
    if (d && d.videos && d.videos.length && window.RDTVPortada) window.RDTVPortada.videos(d.videos);
  }).catch(function () { /* quedan los videos de siempre */ });
})();
