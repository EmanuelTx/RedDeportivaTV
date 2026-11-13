/* =========================================================
   Visor de fotos (portada y páginas de cobertura).
   - Abre cualquier foto de una galería (.gallery__btn) y permite
     recorrer las demás con flechas, teclado (← → Esc) o deslizando
     el dedo.
   - Precarga la foto anterior y la siguiente.
   - Sin librerías; usa el <dialog id="lightbox"> de la página.
   ========================================================= */
(function () {
  "use strict";
  var dlg = document.getElementById("lightbox");
  if (!dlg || typeof dlg.showModal !== "function") return;

  var reducir = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : { matches: false };
  var FLECHA = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" d="M15 5l-7 7 7 7"/></svg>';
  var CRUZ = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" d="M6 6l12 12M18 6 6 18"/></svg>';

  dlg.className = "lightbox visor";
  dlg.innerHTML =
    '<div class="visor__escenario"><img class="visor__img" id="lightboxImg" alt="" decoding="async" draggable="false"></div>' +
    // Las flechas van en la barra: en celular quedan debajo de la foto;
    // en computadora el CSS las ubica a los costados, fuera de la foto.
    '<div class="visor__barra">' +
      '<button class="visor__btn visor__btn--prev" type="button" aria-label="Foto anterior">' + FLECHA + '</button>' +
      '<p class="visor__contador" aria-live="polite"></p><p class="visor__texto" id="lightboxCaption"></p>' +
      '<button class="visor__btn visor__btn--next" type="button" aria-label="Foto siguiente">' + FLECHA.replace("M15 5l-7 7 7 7", "M9 5l7 7-7 7") + '</button>' +
    '</div>' +
    '<button class="visor__cerrar" id="lightboxClose" type="button" aria-label="Cerrar">' + CRUZ + '</button>';

  var escenario = dlg.querySelector(".visor__escenario");
  var img = dlg.querySelector(".visor__img");
  var prev = dlg.querySelector(".visor__btn--prev");
  var next = dlg.querySelector(".visor__btn--next");
  var contador = dlg.querySelector(".visor__contador");
  var texto = dlg.querySelector(".visor__texto");
  var lista = [];
  var actual = 0;

  function precargar(i) {
    if (i < 0 || i >= lista.length) return;
    var p = new Image();
    p.src = lista[i].src;
  }

  function mostrar(i, efecto) {
    if (i < 0 || i >= lista.length) return;
    actual = i;
    var f = lista[i];
    img.classList.remove("visor__img--der", "visor__img--izq", "visor__img--abre", "visor__img--vuelve", "visor__img--arrastre");
    img.style.transform = "";
    img.style.opacity = "";
    img.src = f.src;
    img.alt = f.alt || "";
    if (efecto && !reducir.matches) { void img.offsetWidth; img.classList.add("visor__img--" + efecto); }
    contador.textContent = (i + 1) + " / " + lista.length;
    contador.hidden = lista.length < 2;
    texto.textContent = f.cap || "";
    prev.disabled = i === 0;
    next.disabled = i === lista.length - 1;
    precargar(i + 1);
    precargar(i - 1);
  }

  function abrir(fotos, i) {
    lista = fotos;
    mostrar(i, "abre");
    dlg.classList.remove("visor--cerrando");
    document.documentElement.classList.add("visor-abierto");
    dlg.showModal();
  }

  function cerrar() {
    if (!dlg.open || dlg.classList.contains("visor--cerrando")) return;
    var fin = function () {
      dlg.classList.remove("visor--cerrando");
      dlg.close();
    };
    if (reducir.matches) { fin(); return; }
    dlg.classList.add("visor--cerrando");
    setTimeout(fin, 170);
  }

  dlg.addEventListener("close", function () { document.documentElement.classList.remove("visor-abierto"); });
  dlg.addEventListener("cancel", function (e) { e.preventDefault(); cerrar(); }); // Esc
  dlg.querySelector(".visor__cerrar").addEventListener("click", cerrar);
  prev.addEventListener("click", function () { mostrar(actual - 1, "izq"); });
  next.addEventListener("click", function () { mostrar(actual + 1, "der"); });
  dlg.addEventListener("keydown", function (e) {
    if (e.key === "ArrowRight") { e.preventDefault(); mostrar(actual + 1, "der"); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); mostrar(actual - 1, "izq"); }
  });
  // Tocar el fondo (fuera de la foto y de los controles) cierra el visor
  dlg.addEventListener("click", function (e) {
    if (e.target === dlg || e.target === escenario || e.target.classList.contains("visor__barra")) cerrar();
  });

  /* ---- Deslizar con el dedo (o arrastrar con el mouse) ----
     Hacia los costados: foto anterior / siguiente. Hacia abajo: cerrar. */
  var inicioX = null, inicioY = 0, dx = 0, dy = 0, arrastrando = false;
  escenario.addEventListener("pointerdown", function (e) {
    if (e.target !== img) return;
    inicioX = e.clientX; inicioY = e.clientY; dx = 0; dy = 0; arrastrando = false;
    try { img.setPointerCapture(e.pointerId); } catch (_) { /* sin captura: igual funciona */ }
  });
  escenario.addEventListener("pointermove", function (e) {
    if (inicioX === null) return;
    dx = e.clientX - inicioX;
    dy = e.clientY - inicioY;
    if (!arrastrando && (Math.abs(dx) > 8 || dy > 8)) {
      arrastrando = Math.abs(dx) > Math.abs(dy) ? (lista.length > 1 ? "lado" : false) : (dy > 0 ? "abajo" : false);
    }
    if (!arrastrando) return;
    img.classList.add("visor__img--arrastre");
    if (arrastrando === "abajo") {
      img.style.transform = "translateY(" + Math.max(dy, 0) + "px) scale(" + (1 - Math.min(dy / 2000, .1)) + ")";
      img.style.opacity = String(1 - Math.min(dy / 400, .5));
      return;
    }
    var borde = (actual === 0 && dx > 0) || (actual === lista.length - 1 && dx < 0);
    img.style.transform = "translateX(" + (borde ? dx / 3 : dx) + "px)";
    img.style.opacity = String(1 - Math.min(Math.abs(dx) / 600, .35));
  });
  function soltar() {
    if (inicioX === null) return;
    var umbral = Math.min(90, window.innerWidth * 0.18);
    inicioX = null;
    if (!arrastrando) return;
    if (arrastrando === "abajo" && dy >= 100) { arrastrando = false; cerrar(); return; }
    if (arrastrando === "lado" && dx <= -umbral && actual < lista.length - 1) mostrar(actual + 1, "der");
    else if (arrastrando === "lado" && dx >= umbral && actual > 0) mostrar(actual - 1, "izq");
    else {
      img.classList.remove("visor__img--arrastre");
      img.classList.add("visor__img--vuelve");
      img.style.transform = "";
      img.style.opacity = "";
    }
    arrastrando = false;
  }
  escenario.addEventListener("pointerup", soltar);
  escenario.addEventListener("pointercancel", soltar);

  /* ---- Abrir desde cualquier galería ---- */
  document.addEventListener("click", function (e) {
    var btn = e.target.closest(".gallery__btn");
    if (!btn) return;
    var grilla = btn.closest(".gallery__grid") || btn.parentNode;
    var botones = Array.prototype.slice.call(grilla.querySelectorAll(".gallery__btn"));
    var fotos = botones.map(function (b) {
      var mini = b.querySelector("img");
      return {
        src: b.getAttribute("data-src") || (mini && (mini.currentSrc || mini.src)),
        alt: mini ? mini.alt : "",
        cap: b.getAttribute("data-caption") || ""
      };
    });
    abrir(fotos, botones.indexOf(btn));
  });

  window.RDTVVisor = { abrir: abrir, cerrar: cerrar };
})();
