# Migración de prueba a Cloudflare Pages

Estado: **versión de prueba**. La web oficial sigue en GitHub Pages (`https://emanueltx.github.io/RedDeportivaTV/`) y no se toca hasta que se apruebe el cambio.

## Cómo está organizado

| Rama | Dónde se publica | Para qué |
|---|---|---|
| `main` | GitHub Pages (oficial) | La web que ya funciona. No se modifica durante la prueba. |
| `cloudflare-prueba` | Cloudflare Pages (`*.pages.dev`) | Versión de prueba con las rutas nuevas. |

## Qué agrega la versión de prueba

| Archivo | Para qué |
|---|---|
| `functions/noticias/[slug].js` | Página de cada noticia: `/noticias/<nombre>` |
| `functions/albumes/[slug].js` | Página de cada álbum: `/albumes/<nombre>` |
| `functions/_lib/plantilla.js` | Arma el HTML en el servidor, con título, descripción y Open Graph |
| `functions/_lib/datos.js` | Lee de Supabase si está configurado; si no, de `datos-prueba/` |
| `datos-prueba/*.json` | Una noticia, un borrador y un álbum de prueba (marcados como prueba) |
| `css/publicacion.css`, `js/publicacion.js` | Estilos y visor de fotos de esas páginas |
| `_headers` | Cabeceras de seguridad; la dirección `*.pages.dev` no se indexa en buscadores |

`index.html`, `css/styles.css`, `js/data.js` y `js/main.js` **no cambiaron**.

## Por qué las vistas previas funcionan

Facebook y WhatsApp no ejecutan JavaScript: leen solo el HTML que devuelve el servidor. Por eso las páginas de noticias y álbumes se arman **en Cloudflare antes de enviarse**, con estas etiquetas ya incluidas:
`<title>`, `description`, `og:title`, `og:description`, `og:image` (URL completa), `og:url`, `og:type` y `twitter:card`.

## Configuración en Cloudflare Pages

- Framework preset: **None**
- Build command: *(vacío)*
- Build output directory: `/`
- Rama de producción: **`cloudflare-prueba`** (durante la prueba)
- Variables de entorno (Settings → Variables and Secrets, entornos Production y Preview):
  - `SUPABASE_URL` = `https://<proyecto>.supabase.co`
  - `SUPABASE_PUBLISHABLE_KEY` = la clave `sb_publishable_...`, que es pública.
  - Las claves secretas (`sb_secret_...` o `service_role`) **nunca** se cargan en Cloudflare ni en el repositorio. Si se cargan por error, las funciones las rechazan.
  - Después de cambiar variables, hay que volver a desplegar (Deployments → Retry deployment) para que se apliquen.

## Pruebas a realizar en la dirección nueva

- [ ] Portada idéntica: diseño, fotos, videos, galería, WhatsApp, menú en celular
- [ ] `/noticias/publicacion-de-prueba` responde 200 con Open Graph
- [ ] `/noticias/borrador-de-prueba` responde 404 (los borradores no se ven)
- [ ] `/albumes/album-de-prueba` muestra las fotos y abre el visor
- [ ] Una dirección inexistente responde 404 con el diseño de la web
- [ ] Vista previa real: Facebook Sharing Debugger y enviar el enlace por WhatsApp
- [ ] Revisión desde el celular

## Decisión pendiente (requiere aprobación)

Cuando la prueba esté aprobada: usar la dirección de Cloudflare como oficial y redirigir la de GitHub Pages, o mantener ambas. No se hace sin autorización.
