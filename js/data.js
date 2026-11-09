/* =========================================================
   RedDeportivaTV — DATOS EDITABLES
   ---------------------------------------------------------
   Este es el único archivo que hace falta tocar para
   actualizar videos, fotos, campeonatos, redes y WhatsApp.
   Respetá las comas y las comillas de cada bloque.
   ========================================================= */

window.RDTV = {

  /* ---------- WhatsApp ----------
     numero: código de país + número, solo dígitos, sin "+" ni espacios.
     Ejemplo Paraguay: "595981123456"
     Si queda vacío (""), el botón lleva a Instagram mientras tanto. */
  whatsapp: {
    numero: "595973151976",
    mensaje: "Hola RedDeportivaTV, quiero consultar por la cobertura de un torneo/partido."
  },

  /* ---------- Cobertura destacada actual ---------- */
  coberturaDestacada: {
    titulo: "Futsal Paranaense",
    texto: "Seguimos de cerca a Paranaense en las eliminatorias de fútbol de salón: resúmenes, goles y fotos de cada fecha.",
    imagen: "assets/img/fotos/futsal-festejo-1600.jpg",
    imagenAlt: "Jugadores de futsal festejando un gol",
    botonTexto: "Ver cobertura",
    enlace: "https://www.youtube.com/watch?v=sip-y08xetM"
  },

  /* ---------- Videos de YouTube ----------
     Para agregar uno: copiá un bloque { ... }, pegalo al principio
     de la lista y cambiá "id" (lo que va después de "watch?v=")
     y el título. "inicio" es opcional (segundos donde empieza).
     Los primeros 4 se muestran en la página. */
  videos: [
    {
      id: "I9SoVE1jExw",
      titulo: "Primero de Mayo vs Remansito",
      categoria: "Futsal Paranaense 2026",
      inicio: 2
    },
    {
      id: "sip-y08xetM",
      titulo: "Paranaense vs Franco · Eliminatorias, fecha 3",
      categoria: "Fútbol de salón"
    },
    {
      id: "lVc9dBb24S4",
      titulo: "Atres FC vs Raimundi/Game Over · Final vuelta",
      categoria: "Campeonato Futsal Santa Rita 2026",
      inicio: 600
    },
    {
      id: "G1Z5RQHLd1k",
      titulo: "Programa Red Deportiva TV #2",
      categoria: "Programa"
    }
  ],
  videosVisibles: 4,

  /* ---------- Galería de fotos ----------
     Guardá las fotos en assets/img/fotos/ y agregalas acá.
     "grande": true hace que la foto ocupe más espacio.
     "mini" es opcional: versión más liviana para celulares. */
  galeria: [
    {
      src: "assets/img/fotos/futbol-duelo-1600.jpg",
      mini: "assets/img/fotos/futbol-duelo-800.jpg",
      alt: "Dos jugadores disputando la pelota, uno con camiseta negra y otro con camiseta a rayas rojas y blancas",
      descripcion: "Area 1",
      grande: true
    },
    {
      src: "assets/img/fotos/futsal-arquero-1600.jpg",
      mini: "assets/img/fotos/futsal-arquero-800.jpg",
      alt: "Arquero de futsal con camiseta azul número 20 controlando la pelota",
      descripcion: "Futsal Paranaense"
    },
    {
      src: "assets/img/fotos/futbol-festejo-gol-1600.jpg",
      mini: "assets/img/fotos/futbol-festejo-gol-800.jpg",
      alt: "Jugador con camiseta a rayas rojas y blancas señalando a la cámara tras un gol",
      descripcion: "Area 1"
    },
    {
      src: "assets/img/fotos/futbol-nino-7-1600.jpg",
      mini: "assets/img/fotos/futbol-nino-7-800.jpg",
      alt: "Niño jugador con camiseta azul número 7 sonriendo y señalando a la cámara",
      descripcion: "Caacupemi"
    },
    {
      src: "assets/img/fotos/futsal-festejo-1600.jpg",
      mini: "assets/img/fotos/futsal-festejo-800.jpg",
      alt: "Jugador de futsal festejando con sus compañeros",
      descripcion: "Futsal Paranaense"
    }
  ],
  /* Si hay menos fotos que este número, se completa con
     tarjetas "Próximamente más coberturas". */
  galeriaMinima: 6,

  /* ---------- Campeonatos / coberturas ----------
     estado: "en-curso" (etiqueta roja) o cualquier otro texto.
     demo: true muestra la aclaración "Tarjeta demostrativa". */
  campeonatos: [
    {
      titulo: "Futsal Paranaense",
      texto: "Nuestra cobertura actual: resúmenes de partidos, goles y fotos fecha a fecha.",
      estado: "en-curso",
      etiqueta: "Cobertura actual",
      imagen: "assets/img/fotos/futsal-arquero-800.jpg",
      enlace: "https://www.youtube.com/watch?v=sip-y08xetM",
      enlaceTexto: "Ver cobertura",
      principal: true
    },
    {
      titulo: "Campeonato Nacional de Fútbol de Salón",
      texto: "Partidos del campeonato nacional disponibles en nuestro canal.",
      etiqueta: "Caaguazú 2026",
      enlace: "https://www.youtube.com/watch?v=idU6KLFcmrM",
      enlaceTexto: "Ver partido"
    },
    {
      titulo: "Futsal Santa Rita 2026",
      texto: "Cobertura de la final del campeonato de futsal de Santa Rita.",
      etiqueta: "Final",
      enlace: "https://www.youtube.com/watch?v=lVc9dBb24S4&t=600s",
      enlaceTexto: "Ver final"
    },
    {
      titulo: "Area 1",
      texto: "Fotos y cobertura de los partidos de Area 1.",
      etiqueta: "Fútbol",
      enlace: "https://www.facebook.com/profile.php?id=61596329971481",
      enlaceTexto: "Ver fotos"
    },
    {
      titulo: "Area 4",
      texto: "Lo mejor de cada fecha en pocos minutos: goles, atajadas y jugadas clave.",
      etiqueta: "Resúmenes",
      enlace: "https://www.youtube.com/@reddeportivatvcde6044",
      enlaceTexto: "Ir al canal"
    }
  ],

  /* ---------- Redes sociales ---------- */
  redes: [
    { red: "youtube",   nombre: "YouTube",   usuario: "@reddeportivatvcde6044", url: "https://www.youtube.com/@reddeportivatvcde6044" },
    { red: "instagram", nombre: "Instagram", usuario: "@reddeportivacde",       url: "https://www.instagram.com/reddeportivacde/" },
    { red: "facebook",  nombre: "Facebook",  usuario: "RedDeportivaTV",         url: "https://www.facebook.com/profile.php?id=61596329971481" },
    { red: "tiktok",    nombre: "TikTok",    usuario: "@alcidesbritez5",        url: "https://www.tiktok.com/@alcidesbritez5" }
  ]
};
