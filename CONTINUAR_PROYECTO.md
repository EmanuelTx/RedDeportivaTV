# Continuar RedDeportivaTV (estado definitivo)

Fecha de este resumen: 19/11/2026.

Este documento **no contiene contraseñas, claves secretas ni datos personales**. Las credenciales se consultan siempre en el panel de cada servicio o en el Administrador de credenciales de Windows, nunca en archivos del proyecto. En la web publicada este archivo **no es accesible** (responde 404); solo se ve en el repositorio.

---

## Estado actual de un vistazo

- **Web y panel nuevos publicados** en https://reddeportivatv.pages.dev (rama `cloudflare-prueba`): noticias en la portada y en `/noticias`, coberturas agrupadas por día (`/dias/<campeonato>-<AAAA-MM-DD>`), video resumen del día, panel «Coberturas del día», nuevo diseño de EN VIVO.
- **Migraciones 1, 2 y 3 aplicadas en producción** y verificadas (ver sección 3). La cobertura real «Sport Caaguazú vs San Luis» (28 fotos), la noticia `area-4-semifinal`, los campeonatos, el partido, la transmisión, los 2 administradores y todos los enlaces están intactos.
- **`main`** (web oficial en GitHub Pages) no se tocó: sigue en `574d08f`.
- **Respaldo completo previo a la migración 3:** `respaldos/2026-11-19_antes_migracion_3/` (solo en la PC, ignorado por git). Conviene copiarlo a un disco externo o a un almacenamiento propio.
- **Seguridad de archivos:** respaldos, herramientas, migraciones, documentos internos y datos de prueba **no son públicos** (404 en Cloudflare); el historial de GitHub se revisó y no contiene credenciales.

## ⚠️ Reglas que siguen vigentes

1. **No modificar producción ni hacer `git push` sin autorización explícita** de la persona responsable en esa conversación.
2. **No tocar `main`.** Es la web oficial: https://emanueltx.github.io/RedDeportivaTV/
3. Las pruebas con escritura se hacen **solo** en el proyecto de pruebas `reddeportivatv-pruebas` (sección 0). Las herramientas para producción son de lectura, salvo la aplicación de una migración aprobada (anexo al final).
4. **No cambiar las variables de Cloudflare** (`SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`): apuntan a producción.
5. **Nunca pegar** en el código, el chat ni GitHub la clave `sb_secret_…`/`service_role`, la contraseña de la base ni las de los administradores. El repositorio es **público**. Las contraseñas se escriben solo en los avisos ocultos de las herramientas (nunca como comando).

---

## 0. Entorno de desarrollo autónomo (leer primero)

Todo vive en `pruebas/entorno/` (Cloudflare responde 404 en `/pruebas/*`; `node_modules` y registros están ignorados por git). **No contiene secretos.**

**Qué hay (instalado en el PC del usuario, sin permisos de administrador):**
- Node.js LTS portable en `%LOCALAPPDATA%\RedDeportivaTV-dev\node` (no está en el PATH: anteponerlo en cada comando, p. ej. `export PATH="$LOCALAPPDATA/RedDeportivaTV-dev/node:$PATH"` en Bash). Si falta, descargar el zip oficial de nodejs.org, verificar SHA-256 y descomprimir ahí.
- Dependencias: `cd pruebas/entorno && npm install` (`pg`, `playwright-core`). El navegador es el **Microsoft Edge** ya instalado (`channel: "msedge"`), no se descarga nada.
- Secretos en el **Administrador de credenciales de Windows** (cifrados por Windows, solo ese usuario/equipo): `RDTV-pruebas-db` (contraseña de la base de PRUEBAS) y `RDTV-pruebas-admin` (usuario `robot-pruebas@reddeportivatv.test` y su clave aleatoria). Se leen con `proyecto.mjs → leerSecreto()`; jamás se escriben en archivos.
- La sesión del navegador (`storageState`) se guarda en `%LOCALAPPDATA%\RedDeportivaTV-dev\privado\`, fuera del repositorio.

**Comandos (todos desde `pruebas/entorno/`):**
| Qué | Comando |
|---|---|
| Arrancar el sitio local (archivos + Functions reales contra PRUEBAS, puerto 8140) | `node servidor-local.mjs` (en segundo plano) |
| Comprobar todo el entorno (base, servidor, login del panel, bloqueo de producción) | `node comprobar-entorno.mjs` |
| SQL en la base de pruebas | `node ejecutar-sql.mjs --sql "select 1"` o `--archivo ruta.sql` |
| Recrear/restablecer el administrador robot | `node crear-admin-pruebas.mjs` |
| Navegador automatizado | importar `abrir()` e `iniciarSesionAdmin()` de `navegador.mjs` (`movil: true` para celular) |
| Cargar la **simulación** (día de 10 partidos, 24 fotos reales, video resumen, 4 noticias, EN VIVO) | `node simular-dia.mjs` (repetible; datos `sim-…` solo en pruebas) |
| Revisar páginas públicas / panel «Coberturas del día» (PC y celular, capturas en `%LOCALAPPDATA%\RedDeportivaTV-dev\capturas`) | `node revisar-publico.mjs [movil]` · `node revisar-panel.mjs` · `node captura.mjs <ruta> <nombre> [movil] [selector]` (en Git Bash usar `export MSYS_NO_PATHCONV=1`) |
| **Producción, solo lectura:** iniciar sesión una vez (la persona, en la ventana de Edge) → respaldo → ensayos | `node iniciar-sesion-produccion.mjs` · `node respaldar-produccion.mjs [etiqueta]` · `node probar-restauracion.mjs <carpeta>` · `node ensayo-datos-reales.mjs <carpeta>` (`produccion.mjs` solo deja pasar GET; el navegador bloquea escrituras). Plan completo: `docs/PLAN_MIGRACION_3_PRODUCCION.md` |
| Compatibilidad web publicada ↔ base migrada | exportar el commit publicado a una carpeta y servirlo con `RDTV_RAIZ=<carpeta> node servidor-local.mjs 8151`; luego `node compat-panel-viejo.mjs` |
| Probar «primero fotos, después video» y «borrar el último partido» | `node probar-flujo-dia.mjs` |
| Guardar de nuevo la contraseña de la base de pruebas (único paso manual, si se pierde) | `powershell -NoProfile -ExecutionPolicy Bypass -File .\configurar-credenciales.ps1`, luego pegar la contraseña **solo cuando pida «Contraseña:»** (reset en Supabase → proyecto de pruebas → Project Settings → Database) |

**Protecciones (no desactivar):**
1. `ejecutar-sql.mjs` solo conecta como `postgres.czblgqmcahjnbxbcgwke` al pooler de pruebas, rechaza cualquier SQL que mencione la referencia de producción y, **tras conectar, verifica la identidad real de la base** con la tabla `private.entorno_pruebas` (si la marca no coincide, aborta).
2. `navegador.mjs` cancela toda petición a producción o a cualquier otro `*.supabase.co` que no sea el de pruebas.
3. `pruebas/entorno/hooks/pre-commit` (activado con `git config core.hooksPath pruebas/entorno/hooks`, hay que repetirlo en un clon nuevo) bloquea commits con claves, tokens, URLs con contraseña o archivos privados.
4. `.claude/settings.local.json` (ignorado por git) pide confirmación para cualquier comando que mencione la referencia de producción o haga `git push`.
5. Reglas de siempre: nada de push ni cambios en producción sin autorización; `main` no se toca.

**Supabase CLI:** se evaluó y **no se instala**: exige un token de cuenta que alcanza también producción. La conexión directa por contraseña de base, exclusiva del proyecto de pruebas, es más segura y suficiente.

---

## 1. Qué es el proyecto

**RedDeportivaTV** es la web de un emprendimiento familiar de cobertura deportiva: fotografía, resúmenes en video y transmisiones de futsal y fútbol.

| Parte | Estado |
|---|---|
| **Web estática original** (inicio, videos, galería, campeonatos, servicios, redes, WhatsApp) | Publicada en GitHub Pages desde `main` (no se toca) |
| **Web nueva en Cloudflare Pages** (misma web + páginas dinámicas) | **Publicada** en https://reddeportivatv.pages.dev, rama `cloudflare-prueba` |
| **Base de datos Supabase** (Free, São Paulo) | Migraciones 1, 2 y 3 aplicadas |
| **Panel `/admin`** | Publicado: coberturas, coberturas del día, noticias, EN VIVO, campeonatos, categorías, jornadas, partidos, mi cuenta |
| **Fotos seguras** | Buckets `fotos-borradores` y `fotos-originales` (privados) y `fotos-publicas` (público); se mueven con la Storage API |

---

## 2. Arquitectura y tecnologías

- **Frontend:** HTML, CSS y JavaScript sin frameworks. `js/data.js` + `js/main.js` dibujan la portada. Colores negro, rojo y blanco; tipografías Barlow y Barlow Condensed. Transición entre páginas solo en computadoras (`css/visual.css`); un script mínimo en el `<head>` evita el aviso «Transition was aborted» sin tocar la animación.
- **Cloudflare Pages Functions** (`functions/`), páginas generadas en el servidor con vista previa para Facebook y WhatsApp: `/noticias`, `/noticias/<slug>`, `/coberturas`, `/coberturas/<slug>`, `/coberturas/archivo`, `/dias/<slug>`, `/jornadas/<slug>`, `/campeonatos/…`, `/albumes/<slug>` (redirige) y las APIs `/api/config`, `/api/en-vivo`, `/api/coberturas`, `/api/noticias`, `/api/videos`, `/api/opciones`, `/api/youtube`.
- **Archivos internos bloqueados** (responden 404 con una Function): `/docs`, `/pruebas`, `/supabase`, `/datos-prueba`, `/CONTINUAR_PROYECTO.md`, `/README.md`, `/.gitignore`, `/.nojekyll`. Las Functions siguen leyendo `datos-prueba/` internamente (`ASSETS.fetch`). **Al agregar una carpeta o archivo interno nuevo en la raíz, agregar su bloqueo en `functions/`**. Las herramientas del entorno (incluido el control de commits) viven en `pruebas/entorno/`, que ya está bloqueado.
- **Supabase** (plan Free): PostgreSQL con **RLS en todas las tablas** y permisos de API explícitos; Auth con correo y contraseña (registro público desactivado); máximo 2 administradores (tabla `administradores`, cargados por SQL). ⚠ El esquema por defecto de la Data API es `graphql_public`: el código pide `public` con `Accept-Profile` y `Content-Profile`.
- **Panel:** `admin/` con módulos JS y `supabase-js@2.49.4` desde jsDelivr; la publicación de fotos está en `js/admin/fotos-publicacion.js`.
- **YouTube:** solo se guarda el ID. Reproductor `youtube-nocookie` que se carga al tocar ▶; siempre ofrece «Ver en YouTube». El EN VIVO nunca se reproduce solo.
- **Costos:** todo en planes gratuitos. El límite a vigilar es **1 GB de fotos** en Supabase (el panel muestra el espacio usado). Pasar a un plan pago solo con autorización.

---

## 3. Estado de las migraciones de Supabase

Están en `supabase/migrations/`.

| Migración | Producción (`reddeportivatv`) | Proyecto de pruebas |
|---|---|---|
| `20261110000100_esquema_inicial.sql` (migración 1) | ✅ Aplicada. Verificación 1 con **86/86 ok**. | ✅ Aplicada |
| `20261111000100_coberturas.sql` (migración 2, **versión local con las correcciones del 12/11**) | ✅ **Aplicada el 12/11/2026 20:55 UTC** (huella `b06aed3332e8b4f1`). Datos y 12 archivos idénticos al respaldo; verificación 1: 87/87; verificación 2: 97/97 | ✅ Versión final aplicada en entorno limpio. Verificación 1: 87/87; verificación 2: 97/97 (también con coberturas nuevas cargadas) |
| `20261117000100_dias_cobertura.sql` (migración 3: coberturas por día, video resumen del día) | ✅ **Aplicada el 19/11/2026** (huella `1183bcad2f93a81a`, una sola transacción) tras respaldo completo. Verificaciones en producción: 01: 89/89, 02: 97/97, 03: 82/82 (todas con rollback; conteos sin cambios). Todas las tablas existentes idénticas al respaldo. Reversión disponible: `supabase/revertir/20261117000100_revertir_dias_cobertura.sql` | ✅ Aplicada el 17/11/2026. Verificaciones 01: 90/90, 02: 98/98, 03: 78/78 (esta última con migraciones 1+2+3) |

**Migración 3 (resumen):** tabla `dias_cobertura` (un registro por campeonato + fecha real, creado y borrado solo por triggers), video resumen del día (`estado_video`, `youtube_id`, privados para visitantes hasta estar «Disponible»), funciones `buscar_entradas`, `videos_publicos`, `archivo_coberturas` actualizada. No modifica ni borra datos existentes.

**Otros archivos:**
- **Verificaciones**, que terminan con `rollback` y no dejan cambios: `supabase/verificaciones/01_comprobar_seguridad.sql` y `02_comprobar_coberturas.sql`.
- **Reversiones:** `supabase/revertir/`.
- **Datos de prueba:** `supabase/pruebas/01_datos_equivalentes.sql` reproduce la base original solo en el proyecto de pruebas, y se detiene sola si la base ya tiene datos.
- **Respaldo de producción:** `respaldos/2026-11-11_antes_migracion_2.json`. Es un archivo local que no se sube a GitHub; contiene datos y esquema, pero no correos ni contraseñas.

**Datos reales en producción** (al 11/11/2026):
- 2 administradores;
- campeonatos "Area 4" y "Area 1";
- partido Alemania 1-2 Argentina (Fecha 2);
- 1 transmisión apagada;
- álbum publicado **«Fecha 2 Area 4»** con 6 fotos. Con la migración 2 queda como **"pendiente de clasificar"** y se conserva tal cual. **No reasignarlo automáticamente.**

---

## 4. Qué está publicado y qué es solo local

| Dónde | Contenido |
|---|---|
| `origin/main` (`574d08f`) | Web oficial, GitHub Pages. **No tocar.** |
| `origin/cloudflare-prueba` | Todo lo anterior, publicado en reddeportivatv.pages.dev, incluidos el bloqueo de archivos internos y la corrección del aviso de ViewTransition (ver `git log origin/cloudflare-prueba`). |
| Solo local, ignorado por git | `respaldos/`, `imagenes/`, `.claude/`, y fuera de la carpeta del proyecto: Node, secretos y sesiones en `%LOCALAPPDATA%\RedDeportivaTV-dev` y el Administrador de credenciales de Windows |

> Para trabajar desde otra PC alcanza con `git clone` (todo lo publicado está en GitHub). Lo que **no** viaja y hay que rehacer: Node portable, `npm install` en `pruebas/entorno`, el control de commits (`git config core.hooksPath pruebas/entorno/hooks`), las contraseñas en el Administrador de credenciales y los respaldos de `respaldos/` (copiarlos aparte).

---

## 5. Historial de pruebas (resumen)

- **12/11/2026:** migración 2 probada en el proyecto de pruebas y aplicada en producción con respaldo previo verificado.
- **17–19/11/2026:** migración 3 aplicada primero en pruebas (verificaciones 01, 02 y 03) y después en producción tras un respaldo completo y el ensayo de restauración; verificaciones en producción: 01 89/89, 02 97/97, 03 82/82, todas con rollback. Se simuló un día de 10 partidos con fotos, un video resumen, noticias publicadas y en borrador y una transmisión activa; se probó «primero fotos y después video» y el borrado del último partido de un día con video.
- **19/11/2026:** revisión completa del sitio publicado en PC y celular (noticias, coberturas por día, 28 fotos y visor, video, EN VIVO, buscador, navegación y todas las secciones del panel), sin errores.

---

## 6. Próximos pasos (siempre con autorización)

1. Clasificar desde el panel lo que quede «pendiente de clasificar» y completar jornadas/categorías.
2. Cargar el **video resumen del día** desde «Coberturas del día» cuando esté en YouTube (el día aparece solo al cargar el primer partido).
3. Dominio definitivo; pasar la web oficial a Cloudflare o redirigir la de GitHub Pages.
4. Respaldos automáticos semanales y aviso diario de que todo funciona (`docs/RESPALDOS.md`); copia del respaldo de `respaldos/` a otro lugar.
5. Plan de almacenamiento si se acerca a 1 GB.

---

## 7. Cómo seguir en otra computadora

1. Instalar [Git para Windows](https://git-scm.com/download/win) y, opcionalmente, [GitHub CLI](https://cli.github.com/) (`gh auth login` con la cuenta **EmanuelTx**).
2. `git clone https://github.com/EmanuelTx/RedDeportivaTV.git`, `git checkout cloudflare-prueba`.
3. Identidad de commits (correo anónimo de GitHub): `git config user.email "EmanuelTx@users.noreply.github.com"`.
4. Seguir la **sección 0** (Node portable, `npm install`, credenciales, control de commits, servidor local).
5. Al pedir ayuda a Claude, indicar que lea este archivo y `supabase/README.md`.

---

## Anexo: acceso a producción (herramientas, 19/11/2026)
- La contraseña de la base de producción está en el Administrador de credenciales (`RDTV-produccion-db`), guardada con `configurar-credenciales-produccion.ps1`. **Nunca** se escribe en archivos ni en el chat.
- `node produccion-sql.mjs --leer "<sql>"` (sesión SOLO LECTURA), `--verificar <supabase/verificaciones/xx.sql>` (debe terminar en rollback) y `--aplicar-migracion <archivo>` (solo si su huella figura en `migraciones-aprobadas.json`). Verifica la identidad real de la base (usuario del proyecto + cobertura real + registro de migraciones).
- `node respaldo-completo-db.mjs <carpeta>` copia la base completa (incluye cuentas de acceso: sensible, solo en `respaldos/`, ignorado por git).
- `node revisar-contra-produccion.mjs` comprueba web publicada, web nueva (servidor en modo `RDTV_MODO=produccion-lectura`, puerto 8152) y paneles contra producción sin escribir.
- Para cualquier operación que escriba en producción hace falta autorización explícita de la persona responsable en esa conversación.
