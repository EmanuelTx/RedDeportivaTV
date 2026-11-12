-- =====================================================================
-- RedDeportivaTV · Comprobación de la migración 2 (NO deja cambios)
-- ---------------------------------------------------------------------
-- Prueba con un administrador real (o uno temporal), un visitante y un
-- usuario sin permisos:
--   A. estructura, columnas y permisos
--   B. categorías propias de cada campeonato
--   C. jornadas (Libre y Senior separadas, campeonatos sin jornadas)
--   D. tipos de cobertura y duplicados
--   E. estados de fotos y video, privacidad y originales
--   F. fechas reales, búsqueda (con RLS), filtros y archivo
--   G. dirección permanente, propagación de cambios y datos existentes
-- Al final DESHACE TODO (rollback). Todas las filas deben decir ok = true.
-- (Simula con SQL los permisos que comprueba la Storage API.)
-- =====================================================================

begin;

create temp table resultados (n serial, prueba text, esperado text, obtenido text, ok boolean);
create temp table ctx (admin_id uuid, nota text);

create function pg_temp.probar(p_prueba text, p_esperado text, p_obtenido text)
returns void language sql as $$
  insert into resultados (prueba, esperado, obtenido, ok)
  values (p_prueba, p_esperado, coalesce(p_obtenido, '(nada)'),
          case when p_esperado = 'bloqueado' then coalesce(p_obtenido like 'bloqueado%', false)
               else coalesce(p_obtenido = p_esperado, false) end);
$$;

create function pg_temp.como(p_rol text, p_claims text, p_sql text)
returns text language plpgsql as $$
declare v text; n bigint;
begin
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', p_claims, true);
  execute format('set local role %I', p_rol);
  begin
    execute p_sql;
    get diagnostics n = row_count;
    v := case when n = 0 then 'bloqueado (0 filas)' else 'permitido (' || n || ' filas)' end;
  exception when others then
    v := 'bloqueado (' || sqlstate || ': ' || left(sqlerrm, 80) || ')';
  end;
  reset role;
  return v;
end;
$$;

create function pg_temp.leer(p_rol text, p_claims text, p_sql text)
returns text language plpgsql as $$
declare v text;
begin
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', p_claims, true);
  execute format('set local role %I', p_rol);
  begin
    execute p_sql into v;
  exception when others then
    v := 'error (' || sqlstate || ': ' || left(sqlerrm, 80) || ')';
  end;
  reset role;
  return v;
end;
$$;

create function pg_temp.anon() returns text language sql as $$ select '{"role":"anon"}' $$;
create function pg_temp.usuario() returns text language sql as $$
  select '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}' $$;
create function pg_temp.admin() returns text language sql as $$
  select json_build_object('sub', (select admin_id from ctx limit 1), 'role', 'authenticated')::text $$;

-- Identificadores de prueba
--   C1 Área 4 · C2 Otro campeonato (sin jornadas)
--   K1 Libre (C1) · K2 Senior (C1) · K3 Libre (C2)
--   J1 Fecha 2 Libre · J2 Fecha 2 Senior
--   P1, P2 partidos de J1 · P3 partido de J2 · P4 partido de C2 sin jornada
--   D1 cobertura de P1 · D2 de P3 · G1, G2 generales de J1 · E1 evento 2024

-- =====================================================================
-- A) Estructura y permisos
-- =====================================================================
insert into resultados (prueba, esperado, obtenido, ok)
select 'RLS activado en jornadas', 'true', relrowsecurity::text, relrowsecurity
from pg_class where oid = 'public.jornadas'::regclass;

insert into resultados (prueba, esperado, obtenido, ok)
select 'Visitante PUEDE leer las columnas públicas de coberturas', '9 de 9',
       count(*) filter (where has_column_privilege('anon', 'public.albumes', c, 'SELECT')) || ' de 9',
       bool_and(has_column_privilege('anon', 'public.albumes', c, 'SELECT'))
from unnest(array['tipo','jornada_id','actividad_en','fotos_disponibles','video_publico','portada_publica','busqueda',
                  'fotos_estado_publico','video_estado_publico']) c;

insert into resultados (prueba, esperado, obtenido, ok)
select 'Visitante NO puede leer columnas internas o privadas', '(ninguna)',
       coalesce(string_agg(t || '.' || c, ', ') filter (where has_column_privilege('anon', 'public.' || t, c, 'SELECT')), '(ninguna)'),
       not bool_or(has_column_privilege('anon', 'public.' || t, c, 'SELECT'))
from (values ('albumes','visible'),('albumes','estado'),('albumes','estado_fotos'),('albumes','estado_video'),
             ('albumes','youtube_id'),('albumes','portada_path'),('albumes','creado_por'),
             ('fotos','original_path'),('fotos','original_bytes')) x(t, c);

insert into resultados (prueba, esperado, obtenido, ok)
select 'Visitante: sin permisos de escritura en jornadas', '(ninguno)',
       coalesce(string_agg(p, ', ') filter (where has_table_privilege('anon', 'public.jornadas', p)), '(ninguno)'),
       not bool_or(has_table_privilege('anon', 'public.jornadas', p))
from unnest(array['INSERT','UPDATE','DELETE','TRUNCATE']) p;

insert into resultados (prueba, esperado, obtenido, ok)
select 'Funciones de búsqueda: el visitante solo puede usar buscar y archivo', 'archivo_coberturas, buscar_coberturas',
       coalesce(string_agg(proname, ', ' order by proname) filter (where has_function_privilege('anon', oid, 'EXECUTE')), '(ninguna)'),
       coalesce(string_agg(proname, ', ' order by proname) filter (where has_function_privilege('anon', oid, 'EXECUTE')), '') = 'archivo_coberturas, buscar_coberturas'
from pg_proc where pronamespace = 'public'::regnamespace
  and proname in ('buscar_coberturas','archivo_coberturas','posibles_duplicados','uso_almacenamiento');

insert into resultados (prueba, esperado, obtenido, ok)
select 'Búsquedas con permisos del usuario (SECURITY INVOKER)', 'archivo_coberturas, buscar_coberturas, posibles_duplicados',
       string_agg(proname, ', ' order by proname),
       string_agg(proname, ', ' order by proname) = 'archivo_coberturas, buscar_coberturas, posibles_duplicados'
from pg_proc where pronamespace = 'public'::regnamespace and not prosecdef
  and proname in ('buscar_coberturas','archivo_coberturas','posibles_duplicados','uso_almacenamiento');

insert into resultados (prueba, esperado, obtenido, ok)
select 'Bucket fotos-originales: PRIVADO, hasta 50 MB', 'false / 52428800',
       public::text || ' / ' || file_size_limit, not public and file_size_limit = 52428800
from storage.buckets where id = 'fotos-originales';

-- Datos HEREDADOS: los álbumes creados ANTES de aplicar la migración (según
-- private.migraciones) y que nadie editó después siguen como estaban.
-- Las coberturas creadas después, o las heredadas que un administrador ya
-- clasificó desde el panel, no cuentan: así la prueba vale siempre, no solo
-- justo después de migrar.
insert into resultados (prueba, esperado, obtenido, ok)
select 'Registro de la migración (para distinguir lo heredado de lo nuevo)', '1', count(*)::text, count(*) = 1
from private.migraciones where nombre = '20261111000100_coberturas';

insert into resultados (prueba, esperado, obtenido, ok)
select 'Datos heredados sin editar: "pendiente", y si estaban publicados: visibles, fotos disponibles, sin video prometido',
       '0 con problemas',
       count(*) filter (where a.tipo <> 'pendiente'
                          or (a.estado = 'publicada' and (not a.visible or a.estado_fotos <> 'disponible' or a.estado_video <> 'no_aplica')))
         || ' con problemas',
       count(*) filter (where a.tipo <> 'pendiente'
                          or (a.estado = 'publicada' and (not a.visible or a.estado_fotos <> 'disponible' or a.estado_video <> 'no_aplica'))) = 0
from public.albumes a, private.migraciones m
where m.nombre = '20261111000100_coberturas'
  and a.creado_en < m.aplicada_en and a.actualizado_en <= m.aplicada_en;

insert into resultados (prueba, esperado, obtenido, ok)
select 'Datos heredados publicados: conservan sus fotos registradas', '0 sin fotos',
       count(*) filter (where a.estado = 'publicada' and not exists (select 1 from public.fotos f where f.album_id = a.id)) || ' sin fotos',
       count(*) filter (where a.estado = 'publicada' and not exists (select 1 from public.fotos f where f.album_id = a.id)) = 0
from public.albumes a, private.migraciones m
where m.nombre = '20261111000100_coberturas' and a.creado_en < m.aplicada_en;

-- =====================================================================
-- Datos de prueba y administrador
-- =====================================================================
do $$
declare v uuid;
begin
  select user_id into v from public.administradores order by creado_en limit 1;
  if v is not null then
    insert into ctx values (v, 'administrador real');
  else
    begin
      insert into auth.users (id, aud, role, email)
        values ('00000000-0000-0000-0000-00000000ad01', 'authenticated', 'authenticated', 'admin-prueba-1@prueba.invalid');
      insert into public.administradores (user_id, nombre) values ('00000000-0000-0000-0000-00000000ad01', 'Admin de prueba');
      insert into ctx values ('00000000-0000-0000-0000-00000000ad01', 'administrador de prueba temporal');
    exception when others then
      insert into ctx values (null, 'no se pudo crear: ' || left(sqlerrm, 80));
    end;
  end if;
end;
$$;
select pg_temp.probar('Administrador para las pruebas', 'disponible',
  (select case when admin_id is null then nota else 'disponible' end from ctx));

insert into public.campeonatos (id, nombre, slug, temporada) values
  ('00000000-0000-0000-0000-0000000000c1', 'Prueba Área 4', 'prueba-cob-area-4', '2026'),
  ('00000000-0000-0000-0000-0000000000c2', 'Prueba Otro Torneo', 'prueba-cob-otro', '2026');

-- =====================================================================
-- B) Categorías propias de cada campeonato
-- =====================================================================
select pg_temp.probar('Admin: crea Libre y Senior en Área 4', 'permitido (2 filas)',
  pg_temp.como('authenticated', pg_temp.admin(), $q$insert into public.categorias (id, campeonato_id, nombre, slug) values
    ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000c1', 'Libre', 'libre'),
    ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000c1', 'Senior', 'senior')$q$));
select pg_temp.probar('Otro campeonato puede tener su propia categoría "Libre"', 'permitido (1 filas)',
  pg_temp.como('authenticated', pg_temp.admin(), $q$insert into public.categorias (id, campeonato_id, nombre, slug) values
    ('00000000-0000-0000-0000-0000000000e3', '00000000-0000-0000-0000-0000000000c2', 'Libre', 'libre')$q$));
select pg_temp.probar('NO permite dos categorías iguales en el mismo campeonato', 'bloqueado',
  pg_temp.como('authenticated', pg_temp.admin(), $q$insert into public.categorias (campeonato_id, nombre, slug) values ('00000000-0000-0000-0000-0000000000c1', 'Libre bis', 'libre')$q$));
select pg_temp.probar('NO permite una categoría sin campeonato', 'bloqueado',
  pg_temp.como('authenticated', pg_temp.admin(), $q$insert into public.categorias (nombre, slug) values ('Suelta', 'suelta')$q$));
select pg_temp.probar('NO permite un partido con la categoría de OTRO campeonato', 'bloqueado',
  pg_temp.como('authenticated', pg_temp.admin(), $q$insert into public.partidos (campeonato_id, categoria_id, equipo_local, equipo_visitante) values ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000e1', 'X', 'Y')$q$));
select pg_temp.probar('NO permite una cobertura con la categoría de OTRO campeonato', 'bloqueado',
  pg_temp.como('authenticated', pg_temp.admin(), $q$insert into public.albumes (slug, titulo, tipo, campeonato_id, categoria_id) values ('prueba-cob-mezcla', 'Mezcla', 'campeonato', '00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000e1')$q$));

-- =====================================================================
-- C) Jornadas
-- =====================================================================
select pg_temp.probar('Admin: crea "Fecha 2" en Libre y en Senior (independientes)', 'permitido (2 filas)',
  pg_temp.como('authenticated', pg_temp.admin(), $q$insert into public.jornadas (id, campeonato_id, categoria_id, nombre, slug, fecha) values
    ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000e1', 'Fecha 2', 'prueba-cob-area-4-libre-fecha-2', '2026-11-08'),
    ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000e2', 'Fecha 2', 'prueba-cob-area-4-senior-fecha-2', '2026-11-08')$q$));
select pg_temp.probar('NO permite duplicar una jornada por mayúsculas o tildes ("FECHA 2")', 'bloqueado',
  pg_temp.como('authenticated', pg_temp.admin(), $q$insert into public.jornadas (campeonato_id, categoria_id, nombre, slug) values ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000e1', 'FECHA 2', 'prueba-cob-dup')$q$));
select pg_temp.probar('Visitante: NO puede crear jornadas', 'bloqueado',
  pg_temp.como('anon', pg_temp.anon(), $q$insert into public.jornadas (campeonato_id, nombre, slug) values ('00000000-0000-0000-0000-0000000000c1', 'X', 'prueba-cob-x')$q$));
select pg_temp.probar('Usuario no admin: NO puede crear jornadas', 'bloqueado',
  pg_temp.como('authenticated', pg_temp.usuario(), $q$insert into public.jornadas (campeonato_id, nombre, slug) values ('00000000-0000-0000-0000-0000000000c1', 'X', 'prueba-cob-x')$q$));

select pg_temp.probar('Admin: carga partidos en las jornadas, con orden', 'permitido (3 filas)',
  pg_temp.como('authenticated', pg_temp.admin(), $q$insert into public.partidos (id, campeonato_id, categoria_id, jornada_id, equipo_local, equipo_visitante, orden, fase) values
    ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000e3', '00000000-0000-0000-0000-0000000000a1', 'Alemania', 'Argentina', 2, null),
    ('00000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-0000000000c1', null, '00000000-0000-0000-0000-0000000000a1', 'Brasil', 'Chile', 1, null),
    ('00000000-0000-0000-0000-0000000000f3', '00000000-0000-0000-0000-0000000000c1', null, '00000000-0000-0000-0000-0000000000a2', 'Equipo E', 'Equipo F', 1, 'Final')$q$));
select pg_temp.probar('El partido toma campeonato, categoría y fecha de su jornada', 'Área 4 / Libre / 2026-11-08',
  (select replace(c.nombre, 'Prueba ', '') || ' / ' || k.nombre || ' / ' || p.fecha
   from public.partidos p join public.campeonatos c on c.id = p.campeonato_id join public.categorias k on k.id = p.categoria_id
   where p.id = '00000000-0000-0000-0000-0000000000f1'));
select pg_temp.probar('Libre y Senior no se mezclan (partidos por jornada)', 'Libre: 2 / Senior: 1',
  (select 'Libre: ' || count(*) filter (where jornada_id = '00000000-0000-0000-0000-0000000000a1')
       || ' / Senior: ' || count(*) filter (where jornada_id = '00000000-0000-0000-0000-0000000000a2')
   from public.partidos where id in ('00000000-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-0000000000f2','00000000-0000-0000-0000-0000000000f3')));
select pg_temp.probar('Orden manual de partidos dentro de la jornada', 'Brasil, Alemania',
  (select string_agg(equipo_local, ', ' order by orden) from public.partidos where jornada_id = '00000000-0000-0000-0000-0000000000a1'));
select pg_temp.probar('Campeonato sin jornadas: partido sin jornada', 'permitido (1 filas)',
  pg_temp.como('authenticated', pg_temp.admin(), $q$insert into public.partidos (id, campeonato_id, equipo_local, equipo_visitante, fecha) values ('00000000-0000-0000-0000-0000000000f4', '00000000-0000-0000-0000-0000000000c2', 'Local', 'Visita', '2026-10-01')$q$));

-- =====================================================================
-- D) Tipos de cobertura y duplicados
-- =====================================================================
select pg_temp.probar('Cobertura de partido: se crea', 'permitido (1 filas)',
  pg_temp.como('authenticated', pg_temp.admin(), $q$insert into public.albumes (id, slug, titulo, tipo, partido_id) values ('00000000-0000-0000-0000-0000000000d1', 'prueba-cob-alemania-argentina', 'Alemania vs. Argentina', 'partido', '00000000-0000-0000-0000-0000000000f1')$q$));
select pg_temp.probar('Cobertura de partido: toma campeonato, categoría, jornada y fecha del partido', 'ok / ok / ok / 2026-11-08',
  (select case when campeonato_id = '00000000-0000-0000-0000-0000000000c1' then 'ok' else 'mal' end || ' / '
       || case when categoria_id = '00000000-0000-0000-0000-0000000000e1' then 'ok' else 'mal' end || ' / '
       || case when jornada_id = '00000000-0000-0000-0000-0000000000a1' then 'ok' else 'mal' end || ' / ' || fecha
   from public.albumes where id = '00000000-0000-0000-0000-0000000000d1'));
select pg_temp.probar('NO permite dos coberturas del mismo partido', 'bloqueado',
  pg_temp.como('authenticated', pg_temp.admin(), $q$insert into public.albumes (slug, titulo, tipo, partido_id) values ('prueba-cob-dup', 'Duplicada', 'partido', '00000000-0000-0000-0000-0000000000f1')$q$));
select pg_temp.probar('Cobertura del partido de Senior', 'permitido (1 filas)',
  pg_temp.como('authenticated', pg_temp.admin(), $q$insert into public.albumes (id, slug, titulo, tipo, partido_id) values ('00000000-0000-0000-0000-0000000000d2', 'prueba-cob-e-f', 'Equipo E vs. Equipo F', 'partido', '00000000-0000-0000-0000-0000000000f3')$q$));
select pg_temp.probar('Varias coberturas generales en una jornada (inauguración y premiación)', 'permitido (2 filas)',
  pg_temp.como('authenticated', pg_temp.admin(), $q$insert into public.albumes (id, slug, titulo, tipo, jornada_id) values
    ('00000000-0000-0000-0000-0000000000b1', 'prueba-cob-inauguracion', 'Inauguración Fecha 2', 'jornada', '00000000-0000-0000-0000-0000000000a1'),
    ('00000000-0000-0000-0000-0000000000b2', 'prueba-cob-premiacion', 'Premiación Fecha 2', 'jornada', '00000000-0000-0000-0000-0000000000a1')$q$));
select pg_temp.probar('Detecta un posible duplicado antes de crear otra general', 'sí',
  pg_temp.leer('authenticated', pg_temp.admin(), $q$select case when count(*) > 0 then 'sí' else 'no' end from public.posibles_duplicados(null, 'jornada', null, '00000000-0000-0000-0000-0000000000a1', null, null, 'Inauguracion fecha 2')$q$));
select pg_temp.probar('Cobertura general de jornada: toma campeonato, categoría y fecha', 'ok / 2026-11-08',
  (select case when campeonato_id = '00000000-0000-0000-0000-0000000000c1' and categoria_id = '00000000-0000-0000-0000-0000000000e1' then 'ok' else 'mal' end || ' / ' || fecha
   from public.albumes where id = '00000000-0000-0000-0000-0000000000b1'));
select pg_temp.probar('Evento histórico sin campeonato (fecha real 15/09/2024)', 'permitido (1 filas)',
  pg_temp.como('authenticated', pg_temp.admin(), $q$insert into public.albumes (id, slug, titulo, tipo, fecha) values ('00000000-0000-0000-0000-0000000000b9', 'prueba-cob-encuentro-2024', 'Encuentro especial', 'evento', '2024-09-15')$q$));
select pg_temp.probar('NO acepta cobertura de partido sin partido', 'bloqueado',
  pg_temp.como('authenticated', pg_temp.admin(), $q$insert into public.albumes (slug, titulo, tipo) values ('prueba-cob-x1', 'X', 'partido')$q$));
select pg_temp.probar('NO acepta cobertura general de jornada sin jornada', 'bloqueado',
  pg_temp.como('authenticated', pg_temp.admin(), $q$insert into public.albumes (slug, titulo, tipo, campeonato_id) values ('prueba-cob-x2', 'X', 'jornada', '00000000-0000-0000-0000-0000000000c1')$q$));
select pg_temp.probar('NO acepta cobertura de campeonato sin campeonato', 'bloqueado',
  pg_temp.como('authenticated', pg_temp.admin(), $q$insert into public.albumes (slug, titulo, tipo) values ('prueba-cob-x3', 'X', 'campeonato')$q$));
select pg_temp.probar('NO deja visible una cobertura clasificada sin fecha real', 'bloqueado',
  pg_temp.como('authenticated', pg_temp.admin(), $q$insert into public.albumes (slug, titulo, tipo, visible) values ('prueba-cob-x4', 'X', 'evento', true)$q$));
select pg_temp.probar('Direcciones reservadas ("archivo") rechazadas', 'bloqueado',
  pg_temp.como('authenticated', pg_temp.admin(), $q$insert into public.albumes (slug, titulo) values ('archivo', 'X')$q$));
select pg_temp.probar('Las coberturas nuevas NO cuentan como heredadas', '0',
  (select count(*)::text from public.albumes a, private.migraciones m
   where m.nombre = '20261111000100_coberturas' and a.slug like 'prueba-cob-%' and a.creado_en < m.aplicada_en));

-- =====================================================================
-- E) Estados independientes, privacidad y originales
-- =====================================================================
select pg_temp.probar('Video disponible en la cobertura de Senior', 'permitido (1 filas)',
  pg_temp.como('authenticated', pg_temp.admin(), $q$update public.albumes set visible = true, youtube_id = 'dQw4w9WgXcQ', estado_video = 'disponible' where id = '00000000-0000-0000-0000-0000000000d2'$q$));
select pg_temp.probar('Evento 2024 visible con video', 'permitido (1 filas)',
  pg_temp.como('authenticated', pg_temp.admin(), $q$update public.albumes set visible = true, youtube_id = 'aaaaaaaaaaa', estado_video = 'disponible' where id = '00000000-0000-0000-0000-0000000000b9'$q$));
select pg_temp.probar('Admin: cobertura de Alemania visible, video EN EDICIÓN', 'permitido (1 filas)',
  pg_temp.como('authenticated', pg_temp.admin(), $q$update public.albumes set visible = true, youtube_id = 'bbbbbbbbbbb', estado_video = 'edicion', portada_path = 'albumes/00000000-0000-0000-0000-0000000000d1/f1.jpg' where id = '00000000-0000-0000-0000-0000000000d1'$q$));
select pg_temp.probar('Visitante: NO ve la cobertura sin nada disponible', '0',
  pg_temp.leer('anon', pg_temp.anon(), $q$select count(*)::text from public.albumes where id = '00000000-0000-0000-0000-0000000000d1'$q$));
select pg_temp.probar('Admin: sube foto privada y su original', 'permitido (2 filas)',
  pg_temp.como('authenticated', pg_temp.admin(), $q$insert into storage.objects (bucket_id, name) values ('fotos-borradores', 'albumes/00000000-0000-0000-0000-0000000000d1/f1.jpg'), ('fotos-originales', 'albumes/00000000-0000-0000-0000-0000000000d1/f1-original.jpg')$q$));
select pg_temp.probar('Admin: registra la foto con su original', 'permitido (1 filas)',
  pg_temp.como('authenticated', pg_temp.admin(), $q$insert into public.fotos (album_id, path, original_path, original_bytes) values ('00000000-0000-0000-0000-0000000000d1', 'albumes/00000000-0000-0000-0000-0000000000d1/f1.jpg', 'albumes/00000000-0000-0000-0000-0000000000d1/f1-original.jpg', 9000000)$q$));
select pg_temp.probar('Visitante: NO puede leer originales (ni listarlos)', 'bloqueado',
  pg_temp.como('anon', pg_temp.anon(), $q$select name from storage.objects where bucket_id = 'fotos-originales'$q$));
select pg_temp.probar('Usuario no admin: NO puede subir originales', 'bloqueado',
  pg_temp.como('authenticated', pg_temp.usuario(), $q$insert into storage.objects (bucket_id, name) values ('fotos-originales', 'albumes/00000000-0000-0000-0000-0000000000d1/x.jpg')$q$));
select pg_temp.probar('Admin: NO puede pasar fotos al público si no están "disponibles"', 'bloqueado',
  pg_temp.como('authenticated', pg_temp.admin(), $q$update public.albumes set estado = 'publicando' where id = '00000000-0000-0000-0000-0000000000d1'$q$));
select pg_temp.probar('Admin: fotos disponibles → publicando', 'permitido (1 filas)',
  pg_temp.como('authenticated', pg_temp.admin(), $q$update public.albumes set estado_fotos = 'disponible', estado = 'publicando' where id = '00000000-0000-0000-0000-0000000000d1'$q$));
select pg_temp.probar('Mientras las fotos se mueven, el estado público es "preparacion" (no "disponible")', 'preparacion',
  (select fotos_estado_publico from public.albumes where id = '00000000-0000-0000-0000-0000000000d1'));
select pg_temp.probar('Admin (permiso de move): foto al bucket público', 'permitido (1 filas)',
  pg_temp.como('authenticated', pg_temp.admin(), $q$update storage.objects set bucket_id = 'fotos-publicas' where bucket_id = 'fotos-borradores' and name = 'albumes/00000000-0000-0000-0000-0000000000d1/f1.jpg'$q$));
select pg_temp.probar('Admin: fotos publicadas', 'permitido (1 filas)',
  pg_temp.como('authenticated', pg_temp.admin(), $q$update public.albumes set estado = 'publicada' where id = '00000000-0000-0000-0000-0000000000d1'$q$));
select pg_temp.probar('Visitante: fotos sí, video en edición no, portada sí', '1 / fotos=true / video=(sin) / portada=sí / 1 foto',
  pg_temp.leer('anon', pg_temp.anon(), $q$select count(*) || ' / fotos=' || bool_or(a.fotos_disponibles) || ' / video=' || coalesce(max(a.video_publico), '(sin)') || ' / portada=' || case when max(a.portada_publica) is not null then 'sí' else 'no' end || ' / ' || (select count(*) from public.fotos f where f.album_id = '00000000-0000-0000-0000-0000000000d1') || ' foto' from public.albumes a where a.id = '00000000-0000-0000-0000-0000000000d1'$q$));
-- Estados públicos calculados (lo único que el visitante sabe del avance)
select pg_temp.probar('Visitante: fotos disponibles + video EN EDICIÓN (sin enlace)', 'disponible / edicion / enlace=(sin)',
  pg_temp.leer('anon', pg_temp.anon(), $q$select fotos_estado_publico || ' / ' || video_estado_publico || ' / enlace=' || coalesce(video_publico, '(sin)') from public.albumes where id = '00000000-0000-0000-0000-0000000000d1'$q$));
select pg_temp.probar('Visitante: video disponible + fotos PENDIENTES', 'pendiente / disponible / enlace=dQw4w9WgXcQ',
  pg_temp.leer('anon', pg_temp.anon(), $q$select fotos_estado_publico || ' / ' || video_estado_publico || ' / enlace=' || coalesce(video_publico, '(sin)') from public.albumes where id = '00000000-0000-0000-0000-0000000000d2'$q$));
select pg_temp.probar('Admin: fotos del evento "en preparación"', 'permitido (1 filas)',
  pg_temp.como('authenticated', pg_temp.admin(), $q$update public.albumes set estado_fotos = 'preparacion' where id = '00000000-0000-0000-0000-0000000000b9'$q$));
select pg_temp.probar('Visitante: fotos EN PREPARACIÓN + video disponible', 'preparacion / disponible',
  pg_temp.leer('anon', pg_temp.anon(), $q$select fotos_estado_publico || ' / ' || video_estado_publico from public.albumes where id = '00000000-0000-0000-0000-0000000000b9'$q$));
select pg_temp.probar('Admin: "no tendrá fotos" en la cobertura de Senior', 'permitido (1 filas)',
  pg_temp.como('authenticated', pg_temp.admin(), $q$update public.albumes set estado_fotos = 'no_aplica' where id = '00000000-0000-0000-0000-0000000000d2'$q$));
select pg_temp.probar('Visitante: fotos NO_APLICA (la web no promete fotos)', 'no_aplica / disponible',
  pg_temp.leer('anon', pg_temp.anon(), $q$select fotos_estado_publico || ' / ' || video_estado_publico from public.albumes where id = '00000000-0000-0000-0000-0000000000d2'$q$));
select pg_temp.probar('Borrador recién creado: fotos y video pendientes', 'pendiente / pendiente',
  (select fotos_estado_publico || ' / ' || video_estado_publico from public.albumes where id = '00000000-0000-0000-0000-0000000000b2'));
select pg_temp.probar('Admin: video "no tendrá" en una general y "en edición" (sin enlace) en otra', 'permitido (2 filas)',
  pg_temp.como('authenticated', pg_temp.admin(), $q$update public.albumes set estado_video = case id when '00000000-0000-0000-0000-0000000000b1' then 'no_aplica' else 'edicion' end where id in ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000b2')$q$));
select pg_temp.probar('Estado público del video: no_aplica / edicion', 'no_aplica / edicion',
  (select string_agg(video_estado_publico, ' / ' order by id) from public.albumes where id in ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000b2')));
select pg_temp.probar('NO acepta estados inventados', 'bloqueado',
  pg_temp.como('authenticated', pg_temp.admin(), $q$update public.albumes set estado_video = 'pronto' where id = '00000000-0000-0000-0000-0000000000b2'$q$));
select pg_temp.probar('Visitante: NO lee la ruta del original de una foto publicada', 'bloqueado',
  pg_temp.como('anon', pg_temp.anon(), $q$select original_path from public.fotos$q$));
select pg_temp.probar('NO se puede ocultar con fotos publicadas (hay que retirarlas primero)', 'bloqueado',
  pg_temp.como('authenticated', pg_temp.admin(), $q$update public.albumes set visible = false where id = '00000000-0000-0000-0000-0000000000d1'$q$));
select pg_temp.probar('Panel: espacio usado por bucket (solo admins)', 'con datos',
  pg_temp.leer('authenticated', pg_temp.admin(), $q$select case when sum(archivos) >= 2 then 'con datos' else 'vacío: ' || coalesce(sum(archivos), 0) end from public.uso_almacenamiento()$q$));
select pg_temp.probar('Visitante: NO puede consultar el espacio usado', 'bloqueado',
  pg_temp.como('anon', pg_temp.anon(), $q$select * from public.uso_almacenamiento()$q$));
select pg_temp.probar('Usuario no admin: NO puede consultar el espacio usado', 'bloqueado',
  pg_temp.como('authenticated', pg_temp.usuario(), $q$select * from public.uso_almacenamiento()$q$));

-- =====================================================================
-- F) Fechas reales, búsqueda y archivo
-- =====================================================================
select pg_temp.probar('Fechas distintas: real 2024, publicada hoy', 'real 2024-09-15 / publicada 2026+',
  (select 'real ' || fecha || ' / publicada ' || case when publicado_en >= '2026-01-01' then '2026+' else 'otra' end
   from public.albumes where id = '00000000-0000-0000-0000-0000000000b9'));
select pg_temp.probar('Buscar "septiembre 2024" encuentra el evento subido en 2026', 'prueba-cob-encuentro-2024',
  pg_temp.leer('anon', pg_temp.anon(), $q$select string_agg(slug, ',') from public.buscar_coberturas('septiembre 2024') where slug like 'prueba-cob-%'$q$));
select pg_temp.probar('Buscar "setiembre 2024" (variante) también', 'prueba-cob-encuentro-2024',
  pg_temp.leer('anon', pg_temp.anon(), $q$select string_agg(slug, ',') from public.buscar_coberturas('setiembre 2024') where slug like 'prueba-cob-%'$q$));
select pg_temp.probar('Buscar sin tildes ni mayúsculas: "AREA 4 senior"', 'prueba-cob-e-f',
  pg_temp.leer('anon', pg_temp.anon(), $q$select string_agg(slug, ',' order by slug) from public.buscar_coberturas('AREA 4 senior') where slug like 'prueba-cob-%'$q$));
select pg_temp.probar('Buscar "Área 4 Libre" (con tilde) encuentra Alemania vs. Argentina', 'prueba-cob-alemania-argentina',
  pg_temp.leer('anon', pg_temp.anon(), $q$select string_agg(slug, ',' order by slug) from public.buscar_coberturas('Área 4 Libre') where slug like 'prueba-cob-%'$q$));
select pg_temp.probar('Tolera errores de tipeo: "alemnia"', 'prueba-cob-alemania-argentina',
  pg_temp.leer('anon', pg_temp.anon(), $q$select string_agg(slug, ',') from public.buscar_coberturas('alemnia') where slug like 'prueba-cob-%'$q$));
select pg_temp.probar('Buscar "Final" encuentra la instancia del partido', 'prueba-cob-e-f',
  pg_temp.leer('anon', pg_temp.anon(), $q$select string_agg(slug, ',') from public.buscar_coberturas('final') where slug like 'prueba-cob-%'$q$));
select pg_temp.probar('Visitante: la búsqueda NO muestra borradores', '0',
  pg_temp.leer('anon', pg_temp.anon(), $q$select count(*)::text from public.buscar_coberturas('premiacion') where slug like 'prueba-cob-%'$q$));
select pg_temp.probar('Administrador: la búsqueda SÍ muestra borradores', '1',
  pg_temp.leer('authenticated', pg_temp.admin(), $q$select count(*)::text from public.buscar_coberturas('premiacion') where slug like 'prueba-cob-%'$q$));
select pg_temp.probar('Filtro campeonato + categoría (Área 4 · Senior)', 'prueba-cob-e-f',
  pg_temp.leer('anon', pg_temp.anon(), $q$select string_agg(slug, ',') from public.buscar_coberturas(null, '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000e2')$q$));
select pg_temp.probar('Filtro por rango de fechas (septiembre 2024)', 'prueba-cob-encuentro-2024',
  pg_temp.leer('anon', pg_temp.anon(), $q$select string_agg(slug, ',') from public.buscar_coberturas(null, null, null, null, null, '2024-09-01', '2024-09-30') where slug like 'prueba-cob-%'$q$));
select pg_temp.probar('Filtro por tipo (evento)', 'prueba-cob-encuentro-2024',
  pg_temp.leer('anon', pg_temp.anon(), $q$select string_agg(slug, ',') from public.buscar_coberturas(null, null, null, null, 'evento') where slug like 'prueba-cob-%'$q$));
select pg_temp.probar('La búsqueda nunca devuelve videos en edición', '0',
  pg_temp.leer('anon', pg_temp.anon(), $q$select count(*)::text from public.buscar_coberturas('alemania') where video_publico = 'bbbbbbbbbbb'$q$));
select pg_temp.probar('Paginación desde el servidor: total y límite', 'total 2 / devuelve 1',
  pg_temp.leer('anon', pg_temp.anon(), $q$select 'total ' || max(total) || ' / devuelve ' || count(*) from public.buscar_coberturas(null, '00000000-0000-0000-0000-0000000000c1', null, null, null, null, null, 'reciente', 1, 0)$q$));
select pg_temp.probar('"Área 4 Senior" NO devuelve partidos de Libre', 'sin Libre',
  pg_temp.leer('anon', pg_temp.anon(), $q$select case when count(*) filter (where slug = 'prueba-cob-alemania-argentina') = 0 then 'sin Libre' else 'mezcla' end from public.buscar_coberturas('Área 4 Senior')$q$));
select pg_temp.probar('Archivo: septiembre 2024 aparece', 'sí',
  pg_temp.leer('anon', pg_temp.anon(), $q$select case when count(*) > 0 then 'sí' else 'no' end from public.archivo_coberturas() where anio = 2024 and mes = 9$q$));

-- Orden. Contenido sin fecha confirmada (un álbum anterior sin clasificar)
-- que además es lo último agregado; el evento de 2024 agregado después que
-- los partidos de 2026.
select pg_temp.probar('Contenido sin fecha confirmada, visible con video', 'permitido (1 filas)',
  pg_temp.como('authenticated', pg_temp.admin(), $q$insert into public.albumes (id, slug, titulo, tipo, visible, estado_video, youtube_id) values ('00000000-0000-0000-0000-0000000000b8', 'prueba-cob-sin-fecha', 'Sin fecha confirmada', 'pendiente', true, 'disponible', 'ccccccccccc')$q$));
update public.albumes set actividad_en = now() + interval '1 minute'  where id = '00000000-0000-0000-0000-0000000000b9';
update public.albumes set actividad_en = now() + interval '2 minutes' where id = '00000000-0000-0000-0000-0000000000b8';
select pg_temp.probar('Orden por fecha real (predeterminado): 2026 primero, 2024 después, sin fecha al final',
  'prueba-cob-alemania-argentina,prueba-cob-e-f,prueba-cob-encuentro-2024,prueba-cob-sin-fecha',
  pg_temp.leer('anon', pg_temp.anon(), $q$select string_agg(b.slug, ',' order by b.ordinality) from public.buscar_coberturas(p_limite => 100) with ordinality b where b.slug like 'prueba-cob-%'$q$));
select pg_temp.probar('Orden "agregadas recientemente": encuentra lo antiguo agregado hace poco',
  'prueba-cob-sin-fecha,prueba-cob-encuentro-2024,prueba-cob-alemania-argentina,prueba-cob-e-f',
  pg_temp.leer('anon', pg_temp.anon(), $q$select string_agg(b.slug, ',' order by b.ordinality) from public.buscar_coberturas(p_orden => 'reciente', p_limite => 100) with ordinality b where b.slug like 'prueba-cob-%'$q$));
select pg_temp.probar('Agregadas recientemente + año 2024: el evento antiguo', 'prueba-cob-encuentro-2024',
  pg_temp.leer('anon', pg_temp.anon(), $q$select string_agg(b.slug, ',' order by b.ordinality) from public.buscar_coberturas(p_desde => '2024-01-01', p_hasta => '2024-12-31', p_orden => 'reciente') with ordinality b where b.slug like 'prueba-cob-%'$q$));

-- =====================================================================
-- G) Dirección permanente y propagación de cambios
-- =====================================================================
select pg_temp.probar('NO se puede cambiar la dirección de una cobertura ya publicada', 'bloqueado',
  pg_temp.como('authenticated', pg_temp.admin(), $q$update public.albumes set slug = 'otra-direccion' where id = '00000000-0000-0000-0000-0000000000d2'$q$));
select pg_temp.probar('SÍ se puede cambiar la de un borrador nunca publicado', 'permitido (1 filas)',
  pg_temp.como('authenticated', pg_temp.admin(), $q$update public.albumes set slug = 'prueba-cob-premiacion-final' where id = '00000000-0000-0000-0000-0000000000b2'$q$));
select pg_temp.probar('Admin: renombra la jornada', 'permitido (1 filas)',
  pg_temp.como('authenticated', pg_temp.admin(), $q$update public.jornadas set nombre = 'Fecha Dos' where id = '00000000-0000-0000-0000-0000000000a1'$q$));
select pg_temp.probar('Renombrar la jornada NO cambia su dirección y actualiza la búsqueda', 'dirección igual / búsqueda ok',
  (select case when j.slug = 'prueba-cob-area-4-libre-fecha-2' then 'dirección igual' else 'cambió' end || ' / '
       || case when a.busqueda like '%fecha dos%' then 'búsqueda ok' else 'búsqueda vieja' end
   from public.jornadas j, public.albumes a
   where j.id = '00000000-0000-0000-0000-0000000000a1' and a.id = '00000000-0000-0000-0000-0000000000d1'));
select pg_temp.probar('Admin: corrige la fecha del partido', 'permitido (1 filas)',
  pg_temp.como('authenticated', pg_temp.admin(), $q$update public.partidos set fecha = '2026-11-09' where id = '00000000-0000-0000-0000-0000000000f1'$q$));
select pg_temp.probar('La cobertura toma la fecha corregida', '2026-11-09',
  (select fecha::text from public.albumes where id = '00000000-0000-0000-0000-0000000000d1'));
select pg_temp.probar('Usuario no admin: NO puede cambiar coberturas', 'bloqueado',
  pg_temp.como('authenticated', pg_temp.usuario(), $q$update public.albumes set visible = true, tipo = 'evento' where id = '00000000-0000-0000-0000-0000000000b2'$q$));
select pg_temp.probar('Visitante: NO puede cambiar partidos', 'bloqueado',
  pg_temp.como('anon', pg_temp.anon(), $q$update public.partidos set orden = 9$q$));

-- =====================================================================
-- Primera fila: RESUMEN con el total real; después, las que fallaron.
select n, ok, prueba, esperado, obtenido from (
  select 0 as n, coalesce(bool_and(ok), false) as ok,
         'RESUMEN: ' || count(*) filter (where ok) || ' de ' || count(*) || ' pruebas ok' as prueba,
         count(*)::text as esperado, (count(*) filter (where ok))::text as obtenido
  from resultados
  union all
  select n, ok, prueba, esperado, obtenido from resultados) x
order by (n = 0) desc, ok, n;

rollback;  -- deshace TODO
