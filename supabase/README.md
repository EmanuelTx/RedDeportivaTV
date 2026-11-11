# Base de datos de RedDeportivaTV (Supabase)

| Carpeta | Contenido | ¿Modifica la base? |
|---|---|---|
| `migrations/` | Cambios de estructura, en orden. Se aplican una sola vez. | **Sí** |
| `verificaciones/` | Pruebas de seguridad. Terminan con `rollback`. | No |
| `administradores/` | Plantilla para registrar a los 2 administradores (sin correos reales). | Sí (una vez) |
| `revertir/` | Deshacer una migración (borra datos). Solo emergencias. | **Sí** |

## Reglas

- Este repositorio es **público**: nunca guardar acá contraseñas, la clave `service_role`, cadenas de conexión ni correos reales.
- Toda migración se ejecuta dentro de `begin; … commit;`: si algo falla, no se aplica nada.
- Antes de aplicar una migración sobre datos reales: hacer una copia de seguridad (ver `docs/RESPALDOS.md`).

## Modelo de datos (migración 1)

```
campeonatos ─┬─< partidos >─┬─ categorias
             │              │
             ├─< noticias >─┤        (estado: borrador | publicada)
             └─< albumes  >─┘
                   └─< fotos         (rutas de archivos, ver abajo)

transmisiones (manuales: enlace de YouTube, EN VIVO sí/no, hora de fin)
administradores (máximo 2, enlazados a usuarios de Supabase Auth)
```

## Migración 2: coberturas

```
campeonatos ─┬─< categorias  (cada una pertenece a SU campeonato)
             ├─< jornadas    (campeonato + categoría opcional; opcionales)
             └─< partidos    (jornada opcional, orden manual)
albumes = COBERTURAS (tipo: partido | jornada | campeonato | evento | pendiente)
   └─< fotos  (versión web + miniatura; original opcional y privado)
```

**Cobertura = fila de `albumes`.** Tiene fotos, video de YouTube y su organización. No hay otra tabla de coberturas.

| Columna | Para qué |
|---|---|
| `tipo` | `partido` (máximo 1 por partido) · `jornada` (puede haber varias por jornada) · `campeonato` · `evento` · `pendiente` (contenido anterior sin clasificar) |
| `partido_id` / `jornada_id` / `campeonato_id`, `categoria_id` | Según el tipo. Los datos se copian solos desde el partido o la jornada. |
| `fecha` | **Fecha real** del partido o evento. La usan el buscador y el archivo. Es distinta de `publicado_en` (primera publicación) y de `creado_en` (alta del registro). |
| `visible` | Interruptor "Visible en la web" |
| `estado_fotos` | `pendiente` · `preparacion` · `disponible` |
| `estado_video`, `youtube_id` | `pendiente` · `edicion` · `disponible`, más el ID de 11 caracteres |
| `estado` | Mecanismo interno que mueve los archivos entre buckets (`publicada` = fotos publicadas) |
| `actividad_en` | Última novedad pública. Ordena la lista "recientes". |
| `busqueda` | Texto sin tildes que mantiene la base: título, campeonato, categoría, jornada, equipos, instancia y fecha en varias formas |
| `fotos_disponibles`, `video_publico`, `portada_publica` | Columnas calculadas que lee el visitante. Nunca revelan nada privado. |

**Reglas de la base:**
- **Categorías:** cada una es de su campeonato y no puede usarse con otro.
- **Jornadas:** no se duplican por mayúsculas o tildes. "Fecha 2 · Libre" y "Fecha 2 · Senior" son jornadas distintas.
- **Partidos:** un partido de una jornada toma el campeonato y la categoría de su jornada.
- **Fotos públicas:** solo van al bucket público si la cobertura es visible y está "disponible".
- **Cobertura visible:** tiene que tener su fecha real, salvo las de tipo `pendiente`.
- **Dirección (slug):** queda fija desde la primera publicación.

**Funciones:**
- `buscar_coberturas(...)` y `archivo_coberturas()` funcionan con los permisos de quien consulta (RLS): el visitante solo ve lo publicado.
- `posibles_duplicados(...)` es para el panel.
- `uso_almacenamiento()` es solo para administradores.

**Originales:** el bucket privado `fotos-originales` (hasta 50 MB por archivo) es opcional. Desde el panel se elige si guardar el original de cada foto, y el panel muestra el espacio usado.

**Verificaciones:** después de la migración 2 hay que ejecutar las dos, `verificaciones/01_…` y `verificaciones/02_comprobar_coberturas.sql`.

## Fotos: dos buckets

| Bucket | ¿Se abre por URL? | Qué contiene |
|---|---|---|
| `fotos-borradores` | **No** (privado) | Todo lo que se sube. Fotos de borradores. |
| `fotos-publicas` | Sí | Solo fotos de noticias/álbumes **publicados**. |

Rutas (iguales en ambos): `albumes/<id del álbum>/<archivo>` y `noticias/<id de la noticia>/<archivo>`.

Los archivos se suben, mueven y borran **solo con la Storage API** (`supabase.storage`), nunca escribiendo `storage.objects` con SQL. El código está en [`js/admin/fotos-publicacion.js`](../js/admin/fotos-publicacion.js).

### Estados y flujo

```
borrador ──► publicando ──► publicada ──► despublicando ──► borrador
             (oculta)       (visible)     (oculta)
```

| Acción | Pasos |
|---|---|
| Publicar | 1. estado `publicando` · 2. `move(ruta, ruta, { destinationBucket: "fotos-publicas" })` por cada archivo · 3. estado `publicada` |
| Despublicar | 1. estado `despublicando` (se oculta al instante) · 2. `move(..., { destinationBucket: "fotos-borradores" })` · 3. estado `borrador` |
| Si la red falla | Queda en `publicando` o `despublicando`, **oculta** para los visitantes. `completar()` repite los pasos que falten. |

La base de datos garantiza que:

- un archivo solo puede entrar a `fotos-publicas` si su publicación está `publicando` o `publicada`;
- no se puede marcar `publicada` si quedan archivos en `fotos-borradores`;
- no se puede volver a `borrador` ni borrar si quedan archivos en `fotos-publicas`.

`move()` entre buckets necesita, según la Storage API, permiso de lectura y de actualización sobre el archivo de origen. La API prueba la actualización con el bucket y el nombre nuevos, y las políticas UPDATE de cada bucket la autorizan solo en los casos de arriba.

### Caché

Las fotos públicas se suben con `cacheControl: 600`. Al despublicar, el servidor deja de entregarlas en el momento, pero una copia en la caché del CDN o del navegador puede seguir viéndose **hasta unos 10 minutos**. En el plan Free no existe Smart CDN, que invalida la caché sola. Si alguna vez se publica una foto por error, la medida inmediata es despublicar y esperar ese tiempo.

## Pruebas

| Prueba | Qué verifica | Qué NO verifica |
|---|---|---|
| `verificaciones/01_comprobar_seguridad.sql` | Reglas RLS, permisos, estados y límite de admins. | Archivos reales, URLs públicas, caché, red. |
| `pruebas/almacenamiento.html` (en `localhost`) | Fotos reales con la Storage API: subida privada, acceso del visitante, publicar, despublicar, caché y cortes de red simulados. | — |

**Las dos son obligatorias.** La prueba SQL no reemplaza a la de fotos reales. La de fotos reales se ejecuta cuando estén registrados los administradores, antes de usar el panel con contenido real.

## Quién puede hacer qué

| Acción | Visitante | Usuario con sesión no admin | Administrador |
|---|---|---|---|
| Ver noticias y álbumes publicados | ✅ | ✅ | ✅ |
| Ver borradores | ❌ | ❌ | ✅ |
| Ver la transmisión EN VIVO vigente | ✅ | ✅ | ✅ (y todas) |
| Crear / editar / borrar contenido | ❌ | ❌ | ✅ |
| Abrir una foto de un borrador por su URL | ❌ | ❌ | ✅ (con sesión) |
| Subir / borrar fotos | ❌ | ❌ | ✅ |
| Poner en el bucket público una foto de un borrador | ❌ | ❌ | ❌ |
| Ver quién creó cada publicación | ❌ | ✅* | ✅ |
| Ver / cambiar administradores | ❌ | ❌ | Solo su fila / ❌ (solo por SQL) |

\* Los registros públicos están desactivados, así que en la práctica no existen usuarios no admin.

## Cómo aplicar la migración 1 (editor SQL de Supabase)

1. Supabase → proyecto **RedDeportivaTV** → **SQL Editor** → **New query**.
2. Pegar el contenido completo de `migrations/20261110000100_esquema_inicial.sql` → **Run**.
3. Debe decir *Success. No rows returned*. Si muestra un error, no se aplicó nada: copiá el mensaje.
4. Nueva consulta → pegar `verificaciones/01_comprobar_seguridad.sql` → **Run**. Todas las filas deben decir `ok = true`.
