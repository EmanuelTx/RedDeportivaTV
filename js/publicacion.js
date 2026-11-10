/* Visor de fotos para las páginas de álbumes (/albumes/...). */
(function () {
  "use strict";
  var grid = document.getElementById("albumGrid");
  var dlg = document.getElementById("lightbox");
  if (!grid || !dlg || typeof dlg.showModal !== "function") return;

  var img = document.getElementById("lightboxImg");
  var cap = document.getElementById("lightboxCaption");

  grid.addEventListener("click", function (e) {
    var btn = e.target.closest(".gallery__btn");
    if (!btn) return;
    var miniatura = btn.querySelector("img");
    img.src = btn.getAttribute("data-src");
    img.alt = miniatura ? miniatura.alt : "";
    cap.textContent = btn.getAttribute("data-caption") || "";
    dlg.showModal();
  });
  document.getElementById("lightboxClose").addEventListener("click", function () { dlg.close(); });
  dlg.addEventListener("click", function (e) { if (e.target === dlg) dlg.close(); });
})();
