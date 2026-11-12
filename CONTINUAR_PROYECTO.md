# Continuar RedDeportivaTV en otra computadora

Fecha de este resumen: 12/11/2026.

Este documento **no contiene contraseñas, claves secretas ni datos personales**. Las credenciales se consultan siempre en el panel de cada servicio, nunca en archivos del proyecto.

---

## ⚠️ Antes de empezar: 5 advertencias

1. **No hagas `git push` de la rama `cloudflare-prueba` todavía.** Cloudflare Pages publica esa rama sola en https://reddeportivatv.pages.dev. Los commits locales (`30ce1a0`, `bc24c24` y el siguiente) necesitan la **migración 2**, que todavía no está aplicada en la base real. Si se publica antes, las páginas nuevas fallan.
2. **No ejecutes SQL en el proyecto de producción** `reddeportivatv` (identificador `mopsakafycvolxxgatga`). Cualquier prueba se hace en el proyecto de pruebas `reddeportivatv-pruebas`.
   - Antes de ejecutar cualquier SQL, confirmá el **nombre** y el **identificador** del proyecto, arriba a la izquierda en Supabase.
3. **No toques `main`.** Es la web oficial en GitHub Pages: https://emanueltx.github.io/RedDeportivaTV/
4. **No cambies las variables de Cloudflare** (`SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`). Apuntan a producción y así deben quedar.
5. **Nunca pegues en el código, el chat ni GitHub** la clave `sb_secret_…` o `service_role`, la contraseña de la base ni las contraseñas de los administradores. El repositorio es **público**.

---

## 1. Qué construimos

**RedDeportivaTV** es la web de un emprendimiento familiar de cobertura deportiva: fotografía, resúmenes en video y transmisiones de futsal y fútbol.

| Parte | Estado |
|---|---|
| **Web estática original** (inicio, videos, galería, campeonatos, servicios, redes, WhatsApp) | Publicada en GitHub Pages desde `main` |
| **Versión de prueba en Cloudflare Pages** (misma web y además páginas dinámicas) | https://reddeportivatv.pages.dev, rama `cloudflare-prueba` |
| **Base de datos Supabase** (Free): campeonatos, categorías, partidos, noticias, álbumes, fotos, transmisiones y 2 administradores | Migración 1 aplicada en producción |
| **Panel `/admin`**: inicio de sesión, noticias, álbumes con fotos (reducción, portada, orden), campeonatos, categorías, partidos, EN VIVO, compartir, vista previa | Publicado en la versión de prueba (versión 1) |
| **Fotos seguras**: bucket privado `fotos-borradores` y bucket público `fotos-publicas`, que se mueven con la Storage API; recuperación de publicaciones cortadas | Probado con fotos reales |
| **Coberturas v2**: categorías por campeonato, jornadas, tipos de cobertura, fotos y video independientes, buscador, archivo, originales | Commits locales sin push. **Probado en el proyecto de pruebas el 12/11/2026** (ver sección 5). Falta aplicarlo en producción. |

---

## 2. Arquitectura y tecnologías

- **Frontend:** HTML, CSS y JavaScript sin frameworks. La web lee `js/data.js` y lo dibuja con `js/main.js`. Colores negro, rojo y blanco; tipografías Barlow y Barlow Condensed.
- **Cloudflare Pages Functions** (`functions/`), páginas generadas en el servidor con vista previa para Facebook y WhatsApp:
  - `/noticias/<slug>`
  - en el commit local, además: `/coberturas`, `/coberturas/<slug>`, `/coberturas/archivo`, `/jornadas/<slug>`, `/campeonatos/<campeonato>[/<categoria>]`, y `/albumes/<slug>`, que redirige a `/coberturas/<slug>`;
  - APIs: `/api/config` (URL y clave pública), `/api/en-vivo`, `/api/coberturas`, `/api/opciones`, `/api/youtube`.
- **Supabase**, plan Free, región São Paulo:
  - PostgreSQL con **RLS en todas las tablas** y permisos de API explícitos ("Automatically expose new tables" está desactivado).
  - **Auth** con correo y contraseña, y el registro público desactivado.
  - Máximo 2 administradores, en la tabla `administradores`, y se cargan solo por SQL.
  - **Storage:** `fotos-borradores` (privado), `fotos-publicas` (público) y, con la migración 2, `fotos-originales` (privado).
  - ⚠ En este proyecto el esquema por defecto de la Data API es `graphql_public`. El código pide `public` explícitamente con `Accept-Profile` y `Content-Profile`.
- **Panel:** `admin/` con módulos JS y `supabase-js@2.49.4` desde jsDelivr. La lógica de publicación de fotos está en `js/admin/fotos-publicacion.js`.
- **YouTube:** solo se guarda el ID del video. Usa el reproductor `youtube-nocookie`, que se carga al tocar play, y siempre ofrece "Ver en YouTube".
- **Costos:** todo en planes gratuitos.
  - El límite a vigilar es **1 GB de fotos** en Supabase. El panel v2 muestra el espacio usado.
  - Pasar a un plan pago solo con autorización.

---

## 3. Estado de las migraciones de Supabase

Están en `supabase/migrations/`.

| Migración | Producción (`reddeportivatv`) | Proyecto de pruebas |
|---|---|---|
| `20261110000100_esquema_inicial.sql` (migración 1) | ✅ Aplicada. Verificación 1 con **86/86 ok**. | ✅ Aplicada |
| `20261111000100_coberturas.sql` (migración 2, **versión local con las correcciones del 12/11**) | ❌ **No aplicar todavía** (esperando aprobación del informe) | ✅ Versión final aplicada en entorno limpio. Verificación 1: 87/87; verificación 2: 97/97 (también con coberturas nuevas cargadas) |

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

## 4. Qué está local y qué está publicado

| Dónde | Contenido |
|---|---|
| `origin/main` (`574d08f`) | Web oficial, GitHub Pages. **No tocar.** |
| `origin/cloudflare-prueba` (`806a59e`) | Lo que está online en reddeportivatv.pages.dev: panel v1, álbumes, noticias, EN VIVO, migración 1. También incluye un **borrador viejo** de la migración 2 que el commit local reemplaza. |
| **Commit local `30ce1a0`** (sin push) | Coberturas v2 completas: migración 2 reescrita, verificaciones 01 y 02, reversión, web nueva y panel nuevo |
| **Commits locales `bc24c24` y siguiente** (sin push) | Estados públicos de fotos y video, «no tendrá», orden por fecha real o agregadas recientemente, nombres de jornadas sin ambigüedad, verificaciones con RESUMEN, correcciones de las pruebas y archivos de prueba |
| Solo local, ignorado por git | `respaldos/`, `imagenes/`, `.claude/` |

> **Para no perder el trabajo local al cambiar de PC:** copiá la carpeta **completa** del proyecto, incluida la carpeta oculta `.git`, con un pendrive o Google Drive. Así viajan el commit local, los cambios sin commit y el respaldo. **No uses `git clone`:** el commit local no está en GitHub.
>
> Otra opción, sin hacer push: en la PC actual ejecutá `git bundle create reddeportivatv.bundle --all` y copiá ese archivo **junto con** `respaldos/`, `pruebas/almacenamiento.js` y `supabase/pruebas/`.

---

## 5. Pruebas en el proyecto de pruebas

> **Resultado (12/11/2026): todos los pasos de esta lista están hechos.**
> - Verificaciones (versión final, entorno limpio): 87/87 y 97/97.
> - Storage con fotos reales: 42/42.
> - Panel: los 3 casos más coberturas de jornada, de campeonato y de evento.
> - Páginas públicas generadas con el código nuevo contra la base de pruebas.
>
> Los 3 problemas del primer informe (textos de video «en edición», «Fecha 2» repetida, prueba 8) quedaron corregidos y probados el 12/11/2026. Sin problemas abiertos de código; falta aplicar en producción.

Pasos que se siguieron:
1. Crear el proyecto (Free, São Paulo, Data API activada, "Automatically expose new tables" desactivado, RLS automático) y un usuario administrador de prueba con un **correo inventado**, por ejemplo `admin-prueba@reddeportivatv.test`.
2. Confirmar que es el proyecto de pruebas: el nombre, un identificador **distinto** de `mopsakafycvolxxgatga`, y que esté vacío.
3. Aplicar la migración 1 y después `supabase/pruebas/01_datos_equivalentes.sql`.
4. Registrar al administrador de prueba con la plantilla `supabase/administradores/registrar_administradores.PLANTILLA.sql`, escribiendo el correo **solo en el editor SQL**.
5. Aplicar la **migración 2** del commit local.
6. Ejecutar las verificaciones `01_…` y `02_…`: todas deben dar `ok = true`.
7. Hacer la prueba real de Storage con `pruebas/almacenamiento.html` en `localhost`, con el administrador de prueba: subida privada, originales, publicar, despublicar, caché y cortes de red.
8. Probar el panel local contra el proyecto de pruebas:
   - los 3 casos: solo fotos, solo video, y las dos cosas;
   - coberturas de partido, de jornada general, de campeonato o categoría, y de evento;
   - jornadas Libre y Senior separadas;
   - un campeonato sin jornadas.
9. Generar las páginas públicas (catálogo, búsqueda, archivo, jornada, cobertura, portada) con el código nuevo **contra la base de pruebas**.

**Ya probado sin base de datos:**
- los 25 módulos cargan sin errores;
- las páginas se generan bien con datos simulados en los 3 casos;
- en celular no hay desbordes hacia los costados;
- los 9 formatos de enlaces de YouTube se reconocen;
- los filtros inválidos se ignoran.

---

## 6. Próximos pasos, en orden

1. Hacer las pruebas de la sección 5 en el proyecto de pruebas y armar un **informe de resultados**.
2. Con el informe aprobado: hacer un **nuevo respaldo** de producción y aplicar la migración 2 en producción. Se ejecuta la migración primero y después las dos verificaciones.
3. Recién después: **push** de `cloudflare-prueba`, para que Cloudflare publique la web y el panel nuevos.
4. Clasificar desde el panel el álbum «Fecha 2 Area 4» y el partido Alemania vs. Argentina: asignarles jornada y categoría si corresponde.
5. Más adelante, siempre con autorización:
   - dominio definitivo;
   - pasar la web oficial a Cloudflare o redirigir la de GitHub Pages;
   - respaldos automáticos semanales (`docs/RESPALDOS.md`);
   - aviso diario de que todo funciona;
   - plan de almacenamiento si se acerca a 1 GB.

---

## 7. Cómo seguir en otra computadora

1. **Instalar:**
   - [Git para Windows](https://git-scm.com/download/win);
   - opcionalmente [GitHub CLI](https://cli.github.com/), y después `gh auth login` con la cuenta **EmanuelTx**.
2. **Copiar la carpeta completa** del proyecto, con `.git` (ver sección 4), a `Documentos\WEB REDDEPORTIVA`.
3. **Comprobar el estado:**
   ```bash
   git status -sb
   ```
   Tiene que mostrar `cloudflare-prueba … [ahead N]` y los commits locales en `git log --oneline -3`.
4. **Configurar la identidad de los commits** (correo anónimo de GitHub):
   ```bash
   git config user.email "EmanuelTx@users.noreply.github.com"
   ```
5. **Ver la web en local:** abrir `index.html` con doble clic muestra la web estática. Las páginas `/coberturas`, `/jornadas` y similares necesitan Cloudflare: en local se prueban con un servidor y datos de prueba (ver el anexo).
6. **Iniciar sesión en Supabase** (supabase.com) y en Cloudflare (dash.cloudflare.com) desde el navegador. Las contraseñas no se guardan en el proyecto.
7. **Al pedir ayuda a Claude**, indicá que lea este archivo y `supabase/README.md`.

---

## Anexo: servidor local para pruebas

Sirve los archivos del proyecto en `http://localhost:8140`. Para que el panel local use el **proyecto de pruebas**, guardá **fuera** de la carpeta del proyecto un archivo `config-pruebas.json` con este formato. Ambos valores son públicos y se copian del panel del proyecto **de pruebas**, en Project Settings → API Keys:

```json
{ "configurado": true, "supabaseUrl": "https://<id-del-proyecto-de-pruebas>.supabase.co", "supabaseKey": "sb_publishable_..." }
```

⚠ Nunca pongas acá la clave `sb_secret_…`, ni los datos del proyecto de producción.

Guardá el script como `servidor-pruebas.ps1`, **fuera del repositorio**:

```powershell
param([string]$Root, [int]$Port = 8140, [string]$Config)
$types = @{ '.html'='text/html; charset=utf-8'; '.css'='text/css; charset=utf-8'; '.js'='application/javascript; charset=utf-8'; '.json'='application/json; charset=utf-8'; '.sql'='text/plain; charset=utf-8'; '.jpg'='image/jpeg'; '.png'='image/png'; '.svg'='image/svg+xml' }
$l = New-Object System.Net.HttpListener
$l.Prefixes.Add("http://localhost:$Port/")
$l.Start()
while ($l.IsListening) {
  $ctx = $l.GetContext(); $res = $ctx.Response
  if ($ctx.Request.Headers['Origin'] -eq 'https://supabase.com') {
    $res.AddHeader('Access-Control-Allow-Origin', 'https://supabase.com')
    $res.AddHeader('Access-Control-Allow-Private-Network', 'true')
  }
  if ($ctx.Request.HttpMethod -eq 'OPTIONS') { $res.StatusCode = 204; $res.Close(); continue }
  $path = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath.TrimStart('/'))
  if ($path -eq 'api/config') { $b = [IO.File]::ReadAllBytes($Config); $res.ContentType = 'application/json'; $res.OutputStream.Write($b, 0, $b.Length); $res.Close(); continue }
  if ($path -eq '' -or $path.EndsWith('/')) { $path += 'index.html' }
  $file = [IO.Path]::GetFullPath([IO.Path]::Combine($Root, $path))
  if ($file.StartsWith([IO.Path]::GetFullPath($Root)) -and (Test-Path -LiteralPath $file -PathType Leaf)) {
    $b = [IO.File]::ReadAllBytes($file); $ext = [IO.Path]::GetExtension($file).ToLower()
    $res.ContentType = $(if ($types[$ext]) { $types[$ext] } else { 'application/octet-stream' })
    $res.AddHeader('Cache-Control', 'no-store'); $res.OutputStream.Write($b, 0, $b.Length)
  } else { $res.StatusCode = 404 }
  $res.Close()
}
```

Se inicia así, cambiando las rutas por las tuyas:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "C:\ruta\servidor-pruebas.ps1" -Root "C:\Users\<usuario>\Documents\WEB REDDEPORTIVA" -Port 8140 -Config "C:\ruta\config-pruebas.json"
```

Con el servidor andando:
- **Panel local:** http://localhost:8140/admin/
- **Prueba de fotos reales:** http://localhost:8140/pruebas/almacenamiento.html

Las páginas públicas nuevas (Functions) se prueban ejecutándolas en el navegador contra la base de pruebas; ver las notas de la sesión anterior.
