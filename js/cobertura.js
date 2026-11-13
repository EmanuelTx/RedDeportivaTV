/* =========================================================
   Video resumen de una cobertura: reproductor oficial de YouTube
   (youtube-nocookie) que se carga recién al tocar "play".
   La miniatura queda visible con un indicador de carga hasta que el
   reproductor está listo, y entonces aparece con un fundido.
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
    if (boton.disabled) return;
    boton.disabled = true;
    var iframe = document.createElement("iframe");
    iframe.src = "https://www.youtube-nocookie.com/embed/" + id + "?autoplay=1&rel=0";
    iframe.title = "Video resumen: " + (marco.getAttribute("data-titulo") || "");
    iframe.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
    iframe.allowFullscreen = true;
    iframe.referrerPolicy = "strict-origin-when-cross-origin";
    marco.classList.add("is-cargando");
    var listo = function () {
      if (marco.classList.contains("is-listo")) return;
      marco.classList.remove("is-cargando");
      marco.classList.add("is-listo");
      setTimeout(function () {
        Array.prototype.forEach.call(marco.querySelectorAll(":scope > :not(iframe)"), function (n) { n.remove(); });
      }, 500);
    };
    iframe.addEventListener("load", listo);
    setTimeout(listo, 5000); // por si el navegador no avisa la carga
    marco.appendChild(iframe);
  });
})();
