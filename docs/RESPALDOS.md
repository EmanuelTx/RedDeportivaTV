# Estrategia de respaldo y pausa de Supabase

Datos verificados en la documentación oficial de Supabase (noviembre de 2026):

- **Plan gratuito:** 500 MB de base de datos, 1 GB de archivos, 5 GB de descarga y 5 GB de descarga en caché por mes, archivos de hasta 50 MB, 2 proyectos activos. **No incluye copias de seguridad automáticas.** — https://supabase.com/pricing
- **Pausa:** los proyectos gratuitos con poca actividad durante 7 días se pausan. Se pueden reactivar desde el panel ("Resume project"). La guía oficial indica que se pueden restaurar hasta 1 año después de pausados (páginas más antiguas mencionan 90 días; hay que confirmar la fecha en el panel). Los planes pagos no se pausan. — https://supabase.com/docs/guides/platform/free-project-pausing

## 1. La pausa es un problema aparte de los respaldos

Una copia de seguridad **no garantiza** que el proyecto no se pause. Supabase no detalla qué actividad cuenta, así que no se usa ningún respaldo como forma de mantenerlo activo.

Medidas:

1. **La web nunca depende de Supabase para funcionar.** La portada, las fotos actuales, los videos y WhatsApp son archivos fijos. Si Supabase está pausado, solo las noticias y los álbumes muestran "No pudimos cargar la publicación" (error 503), sin romper el resto.
2. **Aviso automático.** Una tarea diaria de GitHub Actions consulta si Supabase responde. Si falla, GitHub envía un correo de "workflow failed" y alguien entra al panel de Supabase y toca **Resume project** (tarda pocos minutos).
3. **Uso real.** Cuando tus padres publiquen regularmente, eso es actividad real del proyecto.
4. **Si las pausas molestan:** la única solución garantizada es el plan Pro (US$ 25/mes). Solo con autorización.

## 2. Respaldo de la base de datos (textos y datos)

| Qué | Cómo | Frecuencia | Dónde |
|---|---|---|---|
| Copia completa (`pg_dump`) | GitHub Actions con la cadena de conexión guardada como **secreto** de GitHub | Semanal + antes de cada cambio grande | Repositorio **privado** `RedDeportivaTV-respaldos` |
| Exportación legible (JSON por tabla) | La misma tarea | Semanal | Mismo repositorio privado |
| Conservación | Se guardan las últimas 12 semanas y 1 copia por mes | — | — |

Las claves solo existen como secretos de GitHub Actions: nunca en el código, nunca en la web pública.

## 3. Respaldo de las fotografías

Las fotos ocupan mucho más que los textos, así que tienen su propio plan:

1. **Originales (respaldo principal):** las fotos originales quedan en la cámara o PC de quien las saca. El panel sube copias optimizadas (~300 KB), no los originales.
2. **Copia automática del almacenamiento:** una tarea semanal copia los archivos nuevos del almacenamiento de Supabase a un destino gratuito. Opciones, a decidir en la etapa 1:
   - **Google Drive** (15 GB gratis) mediante `rclone`. No requiere tarjeta.
   - **Cloudflare R2** (10 GB gratis). Puede pedir registrar una tarjeta aunque no cobre.
   - **Descarga mensual** a la PC o a un disco externo con un script.
3. **Cómo se recupera:** la base de datos guarda la ruta de cada foto. Para restaurar se vuelven a subir los archivos con las mismas rutas.

## 4. Prueba de restauración

Cada 3 meses se restaura la última copia en un proyecto de prueba (o en la PC) para comprobar que los respaldos realmente sirven. Un respaldo que nunca se probó no es confiable.

## 5. Qué hacer si se pausa el proyecto

1. Entrar a https://supabase.com/dashboard con la cuenta de administración.
2. Elegir el proyecto RedDeportivaTV y tocar **Resume project**.
3. Esperar unos minutos y abrir una noticia en la web para comprobar que funciona.
