/* =========================================================
   Coberturas (páginas públicas): miniaturas de respaldo, filtros que
   dependen del contexto, "Ver más" y botones de compartir.
   Todo funciona igual sin JavaScript (formularios y enlaces normales);
   este archivo solo mejora la experiencia.
   ========================================================= */
(function () {
  "use strict";

  /* ---- Si una miniatura no existe, usar la imagen alternativa ---- */
  document.addEventListener("error", function (e) {
    var img = e.target;
    if (img.tagName !== "IMG") return;
    var alt = img.getAttribute("data-alternativa");
    if (alt && img.src !== alt) { img.removeAttribute("data-alternativa"); img.src = alt; }
  }, true);

  /* ---- Filtros: abiertos en computadora, botón en celular ---- */
  var filtros = document.querySelector(".filtros");
  if (filtros && window.matchMedia("(min-width: 900px)").matches) filtros.open = true;

  /* ---- Campeonato → categorías → jornadas ---- */
  var selCamp = document.querySelector('[data-filtro="campeonato"]');
  var selCat = document.querySelector('[data-filtro="categoria"]');
  var selJor = document.querySelector('[data-filtro="jornada"]');

  function llenar(select, lista, vacio, sinDatos) {
    while (select.options.length) select.remove(0);
    select.add(new Option(lista.length ? vacio : sinDatos, ""));
    lista.forEach(function (o) { select.add(new Option(o.nombre, o.slug)); });
    select.disabled = !lista.length;
  }

  function actualizarOpciones(cambio) {
    var camp = selCamp.value;
    if (!camp) {
      llenar(selCat, [], "Todas", "Elegí un campeonato");
      llenar(selJor, [], "Todas", "Elegí un campeonato");
      return;
    }
    var url = "/api/opciones?campeonato=" + encodeURIComponent(camp) +
      (cambio === "categoria" && selCat.value ? "&categoria=" + encodeURIComponent(selCat.value) : "");
    fetch(url).then(function (r) { return r.json(); }).then(function (d) {
      if (cambio === "campeonato") llenar(selCat, d.categorias, "Todas", "Sin categorías");
      llenar(selJor, d.jornadas, "Todas", "Sin jornadas");
    }).catch(function () { /* los filtros siguen funcionando al enviar */ });
  }

  if (selCamp && selCat && selJor) {
    selCamp.addEventListener("change", function () { actualizarOpciones("campeonato"); });
    selCat.addEventListener("change", function () { actualizarOpciones("categoria"); });
  }

  /* ---- "Ver más": agrega tarjetas sin recargar y recuerda la página ---- */
  var verMas = document.getElementById("verMas");
  var tarjetas = document.getElementById("tarjetas");
  if (verMas && tarjetas && window.fetch) {
    verMas.addEventListener("click", function (e) {
      e.preventDefault();
      var pagina = parseInt(verMas.getAttribute("data-pagina"), 10) + 1;
      var params = new URLSearchParams(location.search);
      params.set("pagina", String(pagina));
      verMas.textContent = "Cargando…";
      verMas.setAttribute("aria-busy", "true");
      // Tarjetas "esqueleto" mientras llegan las nuevas
      var esqueleto = '<article class="tarjeta tarjeta--esqueleto" aria-hidden="true"><div class="tarjeta__media"></div>' +
        '<div class="tarjeta__cuerpo"><span class="esqueleto__linea esqueleto__linea--corta"></span>' +
        '<span class="esqueleto__linea esqueleto__linea--larga"></span><span class="esqueleto__linea"></span></div></article>';
      tarjetas.insertAdjacentHTML("beforeend", esqueleto + esqueleto + esqueleto);
      fetch("/api/coberturas?" + params.toString()).then(function (r) { return r.json(); }).then(function (d) {
        tarjetas.querySelectorAll(".tarjeta--esqueleto").forEach(function (s) { s.remove(); });
        var antes = tarjetas.children.length;
        tarjetas.insertAdjacentHTML("beforeend", d.html || "");
        Array.prototype.slice.call(tarjetas.children, antes).forEach(function (t, i) {
          t.classList.add("tarjeta--nueva");
          t.style.setProperty("--n", String(i));
        });
        verMas.removeAttribute("aria-busy");
        // La URL guarda la página: al volver desde una cobertura se muestra lo mismo.
        history.replaceState(null, "", "?" + params.toString());
        if (d.hayMas) {
          verMas.setAttribute("data-pagina", String(pagina));
          verMas.textContent = "Ver más";
        } else {
          verMas.parentNode.remove();
        }
      }).catch(function () { location.href = verMas.href; });
    });
  }

  /* ---- Compartir ---- */
  document.querySelectorAll("[data-compartir]").forEach(function (caja) {
    var url = location.origin + location.pathname;
    var titulo = caja.getAttribute("data-titulo") || document.title;
    var fb = caja.querySelector('[data-red="facebook"]');
    var wa = caja.querySelector('[data-red="whatsapp"]');
    var nativo = caja.querySelector('[data-red="nativo"]');
    var copiar = caja.querySelector('[data-red="copiar"]');
    if (fb) fb.href = "https://www.facebook.com/sharer/sharer.php?u=" + encodeURIComponent(url);
    if (wa) wa.href = "https://wa.me/?text=" + encodeURIComponent(titulo + "\n" + url);
    if (nativo && navigator.share) {
      nativo.hidden = false;
      nativo.addEventListener("click", function () {
        navigator.share({ title: titulo, url: url }).catch(function () {});
      });
    }
    if (copiar) {
      copiar.addEventListener("click", function () {
        var listo = function () { copiar.textContent = "¡Copiado!"; setTimeout(function () { copiar.textContent = "Copiar enlace"; }, 2000); };
        if (navigator.clipboard) navigator.clipboard.writeText(url).then(listo, function () { prompt("Copiá el enlace:", url); });
        else prompt("Copiá el enlace:", url);
      });
    }
  });
})();
