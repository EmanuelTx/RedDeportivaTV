/* =========================================================
   EN VIVO en la web (versión Cloudflare).
   Si hay una transmisión activa en el panel, muestra un panel grande
   debajo del menú: miniatura de YouTube, etiqueta EN VIVO, título y un
   botón para verla. NO reproduce nada solo: el botón abre YouTube.
   Si no hay ninguna, no muestra nada y la web queda exactamente igual.
   ========================================================= */
(function () {
  "use strict";
  if (location.protocol === "file:") return;
  var cabecera = document.getElementById("header");
  if (!cabecera) return;

  var PLAY = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>';

  function el(tag, clase, texto) {
    var e = document.createElement(tag);
    if (clase) e.className = clase;
    if (texto != null) e.textContent = texto;
    return e;
  }

  function pintar(t) {
    var panel = el("section", "envivo");
    panel.setAttribute("aria-labelledby", "envivoTitulo");

    var dentro = el("div", "container envivo__inner");

    /* Miniatura (enlace a YouTube) */
    var media = el("a", "envivo__media");
    media.href = t.url; media.target = "_blank"; media.rel = "noopener";
    media.setAttribute("aria-label", "Ver la transmisión en vivo en YouTube: " + t.titulo);
    if (t.id && /^[A-Za-z0-9_-]{11}$/.test(t.id)) {
      var img = el("img");
      img.alt = ""; img.width = 480; img.height = 360; img.decoding = "async"; img.fetchPriority = "high";
      img.src = "https://i.ytimg.com/vi/" + t.id + "/hqdefault.jpg";
      media.appendChild(img);
      // Mejor calidad si existe (maxres no está en todos los videos)
      var grande = new Image();
      grande.onload = function () { if (grande.naturalWidth > 600) img.src = grande.src; };
      grande.src = "https://i.ytimg.com/vi/" + t.id + "/maxresdefault.jpg";
    } else {
      media.appendChild(el("span", "envivo__sinfoto", "TV"));
    }
    var bug = el("span", "envivo__bug");
    bug.appendChild(el("span", "envivo__punto"));
    bug.appendChild(document.createTextNode("En vivo"));
    bug.firstChild.setAttribute("aria-hidden", "true");
    media.appendChild(bug);
    var play = el("span", "envivo__play");
    play.setAttribute("aria-hidden", "true");
    play.innerHTML = PLAY;
    media.appendChild(play);

    /* Texto y botón */
    var info = el("div", "envivo__info");
    info.appendChild(el("p", "envivo__etiqueta", "Transmisión en directo"));
    var titulo = el("h2", "envivo__titulo", t.titulo);
    titulo.id = "envivoTitulo";
    info.appendChild(titulo);
    info.appendChild(el("p", "envivo__texto", "Seguí el partido en vivo por YouTube. Se abre en una pestaña nueva."));
    var boton = el("a", "envivo__boton");
    boton.href = t.url; boton.target = "_blank"; boton.rel = "noopener";
    boton.innerHTML = PLAY;
    boton.appendChild(document.createTextNode("Ver transmisión en vivo"));
    info.appendChild(boton);

    dentro.appendChild(media);
    dentro.appendChild(info);
    panel.appendChild(dentro);
    document.body.classList.add("hay-envivo");
    cabecera.after(panel);
  }

  fetch("/api/en-vivo")
    .then(function (r) { return r.ok ? r.json() : { en_vivo: [] }; })
    .then(function (d) { if (d.en_vivo && d.en_vivo[0]) pintar(d.en_vivo[0]); })
    .catch(function () { /* sin panel */ });
})();
