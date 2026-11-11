/* =========================================================
   Portada (versión Cloudflare): últimas coberturas y videos resumen
   desde la base de datos. Si no hay conexión o todavía no hay
   coberturas, quedan la galería y los videos de js/data.js.
   ========================================================= */
(function () {
  "use strict";
  if (location.protocol === "file:" || !window.fetch) return;

  function cargar(url, idDestino) {
    var destino = document.getElementById(idDestino);
    if (!destino) return;
    fetch(url).then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
      if (!d || !d.cantidad) return; // sin coberturas: queda el contenido de siempre
      destino.className = "tarjetas";
      destino.innerHTML = d.html;   // HTML generado y escapado en el servidor
    }).catch(function () { /* queda el contenido de siempre */ });
  }

  cargar("/api/coberturas?limite=9", "galleryGrid");
  cargar("/api/coberturas?limite=4&con_video=1&formato=video", "videosGrid");
})();
