# RedDeportivaTV: sitio web (versión 1)

Página de presentación y portafolio de RedDeportivaTV: fotografía deportiva, resúmenes de partidos y transmisiones en vivo de futsal y fútbol de salón.

Hecha con HTML, CSS y JavaScript simples. No usa frameworks, backend ni dependencias.

## Estructura

```
index.html              Estructura de la página y textos fijos (Quiénes somos, Servicios, Contacto)
css/styles.css          Estilos. Los colores están arriba, en :root
js/data.js              ← DATOS EDITABLES: WhatsApp, videos, galería, campeonatos y redes
js/main.js              Lógica (arma las secciones a partir de data.js)
assets/img/logo/        Logo oficial
assets/img/fotos/       Fotos deportivas (versión 1600px y versión liviana de 800px)
assets/img/marca/       Foto de perfil del equipo
```

## Cómo probarla

- **Rápido:** doble clic en `index.html`. Así los videos se abren en YouTube, porque YouTube no permite reproducirlos dentro de un archivo local.
- **Completo (videos dentro de la página):** usá un servidor local. Por ejemplo, la extensión *Live Server* de VS Code, o, si tenés Python instalado, desde esta carpeta:

  ```
  python -m http.server 8000
  ```
  Después abrí http://localhost:8000

## Cómo actualizar contenido

Casi todo se cambia en **`js/data.js`**:

| Quiero… | Qué hacer |
|---|---|
| Activar WhatsApp | Poner el número en `whatsapp.numero` (ej. `"595981123456"`). Mientras esté vacío, el botón lleva a Instagram. |
| Agregar un video | Copiar un bloque de `videos`, pegarlo **al principio** de la lista y cambiar `id` (lo que va después de `watch?v=`) y `titulo`. Se muestran los primeros 4 (`videosVisibles`). |
| Agregar una foto | Guardar la foto en `assets/img/fotos/` y sumar un bloque en `galeria`. Las tarjetas "Próximamente" se van reemplazando solas. |
| Cambiar el torneo destacado | Editar `coberturaDestacada`. |
| Agregar un campeonato | Sumar un bloque en `campeonatos`. Con `estado: "en-curso"` lleva la etiqueta roja; con `demo: true` se marca como demostrativo. |
| Cambiar textos fijos | Editar `index.html` (sección marcada con su comentario). |
| Cambiar colores | Variables `--black` y `--red` al inicio de `css/styles.css`. |

**Consejo para fotos:** usá un ancho de unos 1600 px y JPG de calidad media (menos de 400 KB) para que la página cargue rápido en celulares.

## Publicación

El sitio está publicado con GitHub Pages en **https://emanueltx.github.io/RedDeportivaTV/**
(repositorio: https://github.com/EmanuelTx/RedDeportivaTV).

Para actualizarlo, después de guardar los cambios, desde esta carpeta:

```
git add -A
git commit -m "Describir el cambio"
git push
```

En 1 o 2 minutos el sitio publicado se actualiza solo.

## Pendiente

- Si querés usarla como portafolio, agregá tu crédito en el pie (hay un comentario marcando el lugar).
