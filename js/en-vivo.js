/* =========================================================
   Aviso "EN VIVO" en la web (versión Cloudflare).
   Si hay una transmisión activa en el panel, muestra una franja roja
   arriba con el enlace a YouTube. Si no hay, no muestra nada y la web
   queda exactamente igual (con los últimos videos).
   ========================================================= */
(function () {
  if (location.protocol === "file:") return;

  function pintar(t) {
    var barra = document.createElement("a");
    barra.className = "envivo";
    barra.href = t.url;
    barra.target = "_blank";
    barra.rel = "noopener";
    var punto = document.createElement("span");
    punto.className = "envivo__punto";
    punto.setAttribute("aria-hidden", "true");
    var etiqueta = document.createElement("strong");
    etiqueta.textContent = "EN VIVO";
    var titulo = document.createElement("span");
    titulo.className = "envivo__titulo";
    titulo.textContent = t.titulo;
    var ver = document.createElement("span");
    ver.className = "envivo__ver";
    ver.textContent = "Ver ahora →";
    barra.append(punto, etiqueta, titulo, ver);
    document.body.classList.add("hay-envivo");
    document.body.prepend(barra);
  }

  fetch("/api/en-vivo")
    .then(function (r) { return r.ok ? r.json() : { en_vivo: [] }; })
    .then(function (d) { if (d.en_vivo && d.en_vivo[0]) pintar(d.en_vivo[0]); })
    .catch(function () { /* sin aviso */ });
})();
