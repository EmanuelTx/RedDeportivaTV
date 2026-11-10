-- =====================================================================
-- RedDeportivaTV · Registrar a los 2 administradores
-- ---------------------------------------------------------------------
-- PLANTILLA: NO guardes este archivo con correos reales en el
-- repositorio (es público). Copiá el contenido al editor SQL de
-- Supabase, reemplazá los correos ahí y ejecutalo.
--
-- Antes: crear los 2 usuarios en Supabase → Authentication → Users →
-- "Add user" (o "Send invitation").
-- =====================================================================

insert into public.administradores (user_id, nombre)
select id, 'Administrador 1' from auth.users where email = 'CORREO_ADMIN_1@ejemplo.com'
union all
select id, 'Administrador 2' from auth.users where email = 'CORREO_ADMIN_2@ejemplo.com';

-- Comprobar: deben aparecer 2 filas
select a.nombre, u.email, a.creado_en
from public.administradores a join auth.users u on u.id = a.user_id;
