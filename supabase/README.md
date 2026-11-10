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
                   └─< fotos         (rutas dentro del bucket "fotos")

transmisiones (manuales: enlace de YouTube, EN VIVO sí/no, hora de fin)
administradores (máximo 2, enlazados a usuarios de Supabase Auth)
```

## Quién puede hacer qué

| Acción | Visitante | Usuario con sesión no admin | Administrador |
|---|---|---|---|
| Ver noticias y álbumes publicados | ✅ | ✅ | ✅ |
| Ver borradores | ❌ | ❌ | ✅ |
| Ver la transmisión EN VIVO vigente | ✅ | ✅ | ✅ (y todas) |
| Crear / editar / borrar contenido | ❌ | ❌ | ✅ |
| Subir / borrar fotos | ❌ | ❌ | ✅ |
| Ver quién creó cada publicación | ❌ | ✅* | ✅ |
| Ver / cambiar administradores | ❌ | ❌ | Solo su fila / ❌ (solo por SQL) |

\* Los registros públicos están desactivados, así que en la práctica no existen usuarios no admin.

## Cómo aplicar la migración 1 (editor SQL de Supabase)

1. Supabase → proyecto **RedDeportivaTV** → **SQL Editor** → **New query**.
2. Pegar el contenido completo de `migrations/20261110000100_esquema_inicial.sql` → **Run**.
3. Debe decir *Success. No rows returned*. Si muestra un error, no se aplicó nada: copiá el mensaje.
4. Nueva consulta → pegar `verificaciones/01_comprobar_seguridad.sql` → **Run**. Todas las filas deben decir `ok = true`.
