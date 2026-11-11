/* =========================================================
   Video resumen de una cobertura: reproductor oficial de YouTube
   (youtube-nocookie) que se carga recién al tocar "play".
   Siempre queda visible el enlace "Ver en YouTube" por si el video no
   permite reproducirse dentro de la web.
   ========================================================= */
(function () {
  "use strict";
  var marco = document.querySelector("[data-youtube]");
  if (!marco) return;
  var id = marco.getAttribute("data-youtube");
  if (!/^[A-Za-z0-9_-]{11}$/.test(id)) return;

  // Mejor miniatura si existe (maxres no está en todos los videos)
  var mini = marco.querySelector(".cob-video__miniatura");
  if (mini) {
    var grande = new Image();
    grande.onload = function () { if (grande.naturalWidth > 120) mini.src = grande.src; };
    grande.src = "https://i.ytimg.com/vi/" + id + "/maxresdefault.jpg";
  }

  var boton = marco.querySelector(".cob-video__play");
  if (!boton) return;
  boton.addEventListener("click", function () {
    var iframe = document.createElement("iframe");
    iframe.src = "https://www.youtube-nocookie.com/embed/" + id + "?autoplay=1&rel=0";
    iframe.title = "Video resumen: " + (marco.getAttribute("data-titulo") || "");
    iframe.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
    iframe.allowFullscreen = true;
    iframe.referrerPolicy = "strict-origin-when-cross-origin";
    marco.replaceChildren(iframe);
  });
})();
