# Plan para aplicar la migración 3 en producción (coberturas por día)

Estado (19/11/2026): **migración 3 APLICADA en producción y verificada** (paso 4 y 5 hechos; ver `CONTINUAR_PROYECTO.md`). **Pendiente: push de `cloudflare-prueba` (paso 7), que requiere autorización.** La web publicada sigue funcionando con la base migrada.
Rama de trabajo: `cloudflare-prueba`. `main` (GitHub Pages oficial) no se toca en ningún paso.

## 1. Qué hace la migración 3 (todo es aditivo)
- Crea la tabla `dias_cobertura` (un registro por campeonato + fecha real) con sus políticas RLS y permisos por columna.
- Crea funciones nuevas (`buscar_entradas`, `videos_publicos`, `private.dia_publico`) y triggers que crean/borran el día solos.
- Reemplaza `archivo_coberturas()` por una versión que cuenta días (mismas columnas de salida).
- **No modifica ni borra** filas de `albumes`, `fotos`, `noticias`, `partidos`, `auth.users`, ni archivos de Storage. Rellena (`backfill`) los días de las coberturas que ya existen.
- Es una sola transacción: si algo falla, no queda nada a medias. Está registrada en `private.migraciones`.
- Reversión probada: `supabase/revertir/20261117000100_revertir_dias_cobertura.sql` (quita lo agregado; los datos originales no cambian).

## 2. Compatibilidad (probada en el proyecto de pruebas ya migrado)
| Combinación | Resultado |
|---|---|
| Web **actualmente publicada** (`f36ab2a`) + base migrada | ✅ Todas las páginas y APIs responden 200 (`/`, catálogo, filtros, búsqueda, archivo, cobertura, jornada, campeonato, noticia, `/api/*`; `/albumes/…` → 301). |
| Panel **actualmente publicado** + base migrada | ✅ Todas las secciones cargan sin errores; crear y borrar una cobertura funciona. |
| Web nueva + base migrada | ✅ Verificaciones 01 (90/90), 02 (98/98), 03 (82/82); recorrido completo en PC y celular. |
| Web nueva + base **sin** migrar | ❌ El catálogo falla (usa funciones nuevas). Por eso el orden es: **primero la migración, después el push**. |

## 2b. Respaldo y recuperación (HECHOS el 19/11/2026, solo lectura)
- Respaldo: `respaldos/2026-11-19_antes_migracion_3/` (local, ignorado por git): 3 campeonatos, 1 categoría, 1 jornada, 1 partido, **1 cobertura publicada con 28 fotos**, 1 noticia publicada, 1 transmisión, administradores visibles para la sesión; **85 archivos (19,3 MB: 57 públicos + 28 originales)**, cada uno con su huella SHA-256. 0 errores.
- Ensayo de restauración (`probar-restauracion.mjs`): archivos íntegros, 9 tablas cargadas en un esquema temporal e idénticas fila por fila, sin huérfanos, cada foto con su archivo y miniatura.
- Ensayo de la migración con los datos reales (`ensayo-datos-reales.mjs`, transacción con rollback): el relleno crea el día `torneo-integracion-de-la-plaza-san-isidro-2026-11-13`, la cobertura real queda idéntica, el catálogo la muestra como tarjeta del día, la noticia `area-4-semifinal` sigue publicada.
- Límite honesto: las cuentas de acceso (`auth.users`) no están en este respaldo (la migración 3 no las toca) y `administradores` solo muestra lo que la sesión puede ver. Antes del paso 4 conviene, además, el respaldo del panel de Supabase / `pg_dump` si se dispone de la contraseña de la base.
- La sesión de lectura sigue guardada fuera del repositorio. Si pasan días antes de publicar, repetir el paso 1 (el respaldo debe ser del mismo día).

## 3. Pasos (cada uno se hace solo con autorización)
1. **Respaldo nuevo** (solo lectura): `node respaldar-produccion.mjs` → `respaldos/<fecha>_antes_migracion_3/` (tablas + fotos + manifiesto con SHA-256). ✅ hecho el 19/11.
2. **Ensayo de restauración** en el proyecto de pruebas: `node probar-restauracion.mjs <carpeta>`. ✅ hecho.
3. Antes de migrar: repetir el respaldo si cambió algo (recuento igual al del respaldo).
4. **Aplicar la migración 3** en producción desde el editor SQL de Supabase (con la sesión de la persona): pegar el archivo completo; debe terminar en `COMMIT`. Confirmar la fila en `private.migraciones`.
5. Ejecutar las verificaciones 01, 02 y 03 en producción (terminan en `rollback`, no dejan datos).
6. Comprobar que la web **vieja** sigue bien con la base migrada (página principal, catálogo, la cobertura real existente, panel).
7. `git push origin cloudflare-prueba` → Cloudflare publica solo. Comprobar `pages.dev`: portada, `/noticias`, catálogo, página del día, cobertura real, panel «Coberturas del día».
8. Si algo sale mal: volver a la versión anterior de la web desde Cloudflare (Deployments → «Rollback») y, si hiciera falta, ejecutar el script de reversión. Los datos no se tocan en ninguno de los dos casos.

## 4. Qué se conserva
Cobertura real ya publicada (con sus fotos), partidos, campeonatos, transmisión, administradores y todos los enlaces existentes (`/coberturas/<slug>`, `/albumes/<slug>` → 301, `/noticias/<slug>`, `/jornadas/…`, `/campeonatos/…`). La migración no cambia ningún `slug`.

## 5. Riesgos y mitigaciones
- Error de la migración → transacción única (todo o nada) + reversión probada.
- Pérdida de datos → respaldo previo verificado con huellas + ensayo de restauración.
- Web y base desincronizadas → orden fijo (migración primero) y web vieja compatible con la base nueva.
- Pausa de Supabase Free → ver `docs/RESPALDOS.md`.
