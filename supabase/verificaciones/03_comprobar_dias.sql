-- =====================================================================
-- RedDeportivaTV · Comprobación de la migración 3: cobertura del día
-- ---------------------------------------------------------------------
-- Prueba con un administrador real (o uno temporal), un visitante y un
-- usuario sin permisos:
--   A. estructura y permisos
--   B. el día se crea, se mueve y se borra solo
--   C. video resumen general del día (estados y privacidad)
--   D. catálogo agrupado por día, búsqueda, filtros y orden
--   E. sección Videos sin duplicados
--   F. archivo por año y mes
-- Al final DESHACE TODO (rollback). Todas las filas deben decir ok = true.
-- Usa datos propios (prefijo prueba-dia-); no depende de lo que ya haya.
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

-- Publica las fotos de una cobertura por el camino real de permisos
-- (la Storage API comprueba lo mismo que estas instrucciones):
-- subir al privado → disponible/publicando → mover al público → publicada.
create function pg_temp.publicar_fotos(p_id uuid) returns text language plpgsql as $$
declare
  ruta text := 'albumes/' || p_id || '/f1.jpg';
  r text;
begin
  r := pg_temp.como('authenticated', pg_temp.admin(), format($q$insert into storage.objects (bucket_id, name) values ('fotos-borradores', %L)$q$, ruta));
  if r not like 'permitido%' then return 'falló subir: ' || r; end if;
  r := pg_temp.como('authenticated', pg_temp.admin(), format($q$insert into public.fotos (album_id, path) values (%L, %L)$q$, p_id, ruta));
  if r not like 'permitido%' then return 'falló registrar: ' || r; end if;
  r := pg_temp.como('authenticated', pg_temp.admin(), format($q$update public.albumes set visible = true, estado_fotos = 'disponible', estado = 'publicando', portada_path = %L where id = %L$q$, ruta, p_id));
  if r not like 'permitido%' then return 'falló publicando: ' || r; end if;
  r := pg_temp.como('authenticated', pg_temp.admin(), format($q$update storage.objects set bucket_id = 'fotos-publicas' where bucket_id = 'fotos-borradores' and name = %L$q$, ruta));
  if r not like 'permitido%' then return 'falló mover: ' || r; end if;
  r := pg_temp.como('authenticated', pg_temp.admin(), format($q$update public.albumes set estado = 'publicada' where id = %L$q$, p_id));
  if r not like 'permitido%' then return 'falló publicada: ' || r; end if;
  return 'permitido (fotos publicadas)';
end;
$$;

-- Identificadores de prueba
--   CA Campeonato A · CB Campeonato B
--   KL Libre (CA) · KS Senior (CA)
--   JL Fecha 5 Libre · JS Fecha 5 Senior (17/11/2026)
--   P1..P3 Libre · P4, P5 Senior · P6 (CA, 16/11) · P7 (CB, 17/11) · P8 (CA, 17/11, borrador)
--   D1..D8 coberturas de P1..P8 · E1 evento 2024 · S1 sin fecha

-- =====================================================================
-- A) Estructura y permisos
-- =====================================================================
insert into resultados (prueba, esperado, obtenido, ok)
select 'RLS activado en dias_cobertura', 'true', relrowsecurity::text, relrowsecurity
from pg_class where oid = 'public.dias_cobertura'::regclass;

insert into resultados (prueba, esperado, obtenido, ok)
select 'Visitante PUEDE leer las columnas públicas del día', '8 de 8',
       count(*) filter (where has_column_privilege('anon', 'public.dias_cobertura', c, 'SELECT')) || ' de 8',
       bool_and(has_column_privilege('anon', 'public.dias_cobertura', c, 'SELECT'))
from unnest(array['id','campeonato_id','fecha','slug','descripcion','video_en','video_publico','video_estado_publico']) c;

insert into resultados (prueba, esperado, obtenido, ok)
select 'Visitante NO puede leer el enlace del video ni el estado interno', '(ninguna)',
       coalesce(string_agg(c, ', ') filter (where has_column_privilege('anon', 'public.dias_cobertura', c, 'SELECT')), '(ninguna)'),
       not bool_or(has_column_privilege('anon', 'public.dias_cobertura', c, 'SELECT'))
from unnest(array['youtube_id','estado_video','creado_en','actualizado_en']) c;

insert into resultados (prueba, esperado, obtenido, ok)
select 'Visitante: sin permisos de escritura en dias_cobertura', '(ninguno)',
       coalesce(string_agg(p, ', ') filter (where has_table_privilege('anon', 'public.dias_cobertura', p)), '(ninguno)'),
       not bool_or(has_table_privilege('anon', 'public.dias_cobertura', p))
from unnest(array['INSERT','UPDATE','DELETE','TRUNCATE']) p;

insert into resultados (prueba, esperado, obtenido, ok)
select 'Usuarios con sesión: sin TRUNCATE ni REFERENCIAS en dias_cobertura', '(ninguno)',
       coalesce(string_agg(p, ', ') filter (where has_table_privilege('authenticated', 'public.dias_cobertura', p)), '(ninguno)'),
       not bool_or(has_table_privilege('authenticated', 'public.dias_cobertura', p))
from unnest(array['TRUNCATE','REFERENCES','TRIGGER']) p;

insert into resultados (prueba, esperado, obtenido, ok)
select 'El visitante puede usar buscar_entradas y videos_publicos (y no las del panel)', 'buscar_entradas, videos_publicos',
       coalesce(string_agg(proname, ', ' order by proname) filter (where has_function_privilege('anon', oid, 'EXECUTE')), '(ninguna)'),
       coalesce(string_agg(proname, ', ' order by proname) filter (where has_function_privilege('anon', oid, 'EXECUTE')), '') = 'buscar_entradas, videos_publicos'
from pg_proc where pronamespace = 'public'::regnamespace
  and proname in ('buscar_entradas', 'videos_publicos', 'posibles_duplicados', 'uso_almacenamiento');

insert into resultados (prueba, esperado, obtenido, ok)
select 'Funciones nuevas con permisos del usuario (SECURITY INVOKER)', 'buscar_entradas, videos_publicos',
       string_agg(proname, ', ' order by proname),
       string_agg(proname, ', ' order by proname) = 'buscar_entradas, videos_publicos'
from pg_proc where pronamespace = 'public'::regnamespace and not prosecdef
  and proname in ('buscar_entradas', 'videos_publicos');

insert into resultados (prueba, esperado, obtenido, ok)
select 'Registro de la migración 3', '1', count(*)::text, count(*) = 1
from private.migraciones where nombre = '20261117000100_dias_cobertura';

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
  ('00000000-0000-0000-0000-0000000000c1', 'Prueba Día A', 'prueba-dia-a', '2026'),
  ('00000000-0000-0000-0000-0000000000c2', 'Prueba Día B', 'prueba-dia-b', '2026');
insert into public.categorias (id, campeonato_id, nombre, slug, orden) values
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000c1', 'Libre', 'libre', 1),
  ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000c1', 'Senior', 'senior', 2);
insert into public.jornadas (id, campeonato_id, categoria_id, nombre, slug, fecha) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000e1', 'Fecha 5', 'prueba-dia-a-libre-fecha-5', '2026-11-17'),
  ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000e2', 'Fecha 5', 'prueba-dia-a-senior-fecha-5', '2026-11-17');
insert into public.partidos (id, campeonato_id, categoria_id, jornada_id, equipo_local, equipo_visitante, orden, fecha) values
  ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000a1', 'Zeta FC', 'Beta', 1, null),
  ('00000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000a1', 'Gamma', 'Delta', 2, null),
  ('00000000-0000-0000-0000-0000000000f3', '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000a1', 'Omega', 'Sigma', 3, null),
  ('00000000-0000-0000-0000-0000000000f4', '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000a2', 'Senior Uno', 'Senior Dos', 1, null),
  ('00000000-0000-0000-0000-0000000000f5', '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000a2', 'Senior Tres', 'Senior Cuatro', 2, null),
  ('00000000-0000-0000-0000-0000000000f6', '00000000-0000-0000-0000-0000000000c1', null, null, 'Ayer A', 'Ayer B', 0, '2026-11-16'),
  ('00000000-0000-0000-0000-0000000000f7', '00000000-0000-0000-0000-0000000000c2', null, null, 'Otro A', 'Otro B', 0, '2026-11-17'),
  ('00000000-0000-0000-0000-0000000000f8', '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000a1', 'Borrador A', 'Borrador B', 4, null);

-- =====================================================================
-- B) El día se crea, se mueve y se borra solo
-- =====================================================================
select pg_temp.probar('Antes de cubrir: no hay días de prueba', '0',
  (select count(*)::text from public.dias_cobertura where slug like 'prueba-dia-%'));
-- Punto de partida del archivo (lo que ya hubiera en la base), para medir solo lo agregado
create temp table base_archivo as select anio, mes, cantidad from public.archivo_coberturas();

select pg_temp.probar('Admin: crea las coberturas de los 5 partidos del 17/11', 'permitido (5 filas)',
  pg_temp.como('authenticated', pg_temp.admin(), $q$insert into public.albumes (id, slug, titulo, tipo, partido_id) values
    ('00000000-0000-0000-0000-0000000000d1', 'prueba-dia-d1', 'Zeta FC vs. Beta', 'partido', '00000000-0000-0000-0000-0000000000f1'),
    ('00000000-0000-0000-0000-0000000000d2', 'prueba-dia-d2', 'Gamma vs. Delta', 'partido', '00000000-0000-0000-0000-0000000000f2'),
    ('00000000-0000-0000-0000-0000000000d3', 'prueba-dia-d3', 'Omega vs. Sigma', 'partido', '00000000-0000-0000-0000-0000000000f3'),
    ('00000000-0000-0000-0000-0000000000d4', 'prueba-dia-d4', 'Senior Uno vs. Senior Dos', 'partido', '00000000-0000-0000-0000-0000000000f4'),
    ('00000000-0000-0000-0000-0000000000d5', 'prueba-dia-d5', 'Senior Tres vs. Senior Cuatro', 'partido', '00000000-0000-0000-0000-0000000000f5')$q$));
select pg_temp.probar('El día se creó SOLO (uno para los 5 partidos de A el 17/11)', '1 día / prueba-dia-a-2026-11-17',
  (select count(*) || ' día / ' || max(slug) from public.dias_cobertura where campeonato_id = '00000000-0000-0000-0000-0000000000c1' and fecha = '2026-11-17'));
select pg_temp.probar('Admin: coberturas del partido de ayer (16/11), del campeonato B (17/11) y un borrador', 'permitido (3 filas)',
  pg_temp.como('authenticated', pg_temp.admin(), $q$insert into public.albumes (id, slug, titulo, tipo, partido_id) values
    ('00000000-0000-0000-0000-0000000000d6', 'prueba-dia-d6', 'Ayer A vs. Ayer B', 'partido', '00000000-0000-0000-0000-0000000000f6'),
    ('00000000-0000-0000-0000-0000000000d7', 'prueba-dia-d7', 'Otro A vs. Otro B', 'partido', '00000000-0000-0000-0000-0000000000f7'),
    ('00000000-0000-0000-0000-0000000000d8', 'prueba-dia-d8', 'Borrador A vs. Borrador B', 'partido', '00000000-0000-0000-0000-0000000000f8')$q$));
select pg_temp.probar('Se crearon solos los días de A del 16/11 y de B del 17/11 (distinto campeonato = distinto día)',
  'prueba-dia-a-2026-11-16,prueba-dia-a-2026-11-17,prueba-dia-b-2026-11-17',
  (select string_agg(slug, ',' order by slug) from public.dias_cobertura where slug like 'prueba-dia-%'));
select pg_temp.probar('Admin: evento de 2024 (sin campeonato)', 'permitido (1 filas)',
  pg_temp.como('authenticated', pg_temp.admin(), $q$insert into public.albumes (id, slug, titulo, tipo, fecha) values ('00000000-0000-0000-0000-0000000000b9', 'prueba-dia-evento', 'Encuentro especial', 'evento', '2024-09-15')$q$));
select pg_temp.probar('Admin: publicación anterior sin clasificar (sin fecha)', 'permitido (1 filas)',
  pg_temp.como('authenticated', pg_temp.admin(), $q$insert into public.albumes (id, slug, titulo) values ('00000000-0000-0000-0000-0000000000b8', 'prueba-dia-sin-fecha', 'Álbum anterior')$q$));
select pg_temp.probar('Un evento y una publicación sin fecha NO crean día (siguen siendo 3)', '3',
  (select count(*)::text from public.dias_cobertura where slug like 'prueba-dia-%'));
select pg_temp.probar('La publicación anterior sin fecha NO recibe fecha inventada', 'sin fecha',
  (select coalesce(fecha::text, 'sin fecha') from public.albumes where id = '00000000-0000-0000-0000-0000000000b8'));

-- Si corrigen la fecha de un partido, su cobertura cambia de día sola
select pg_temp.probar('Admin: corrige la fecha del partido 5 al 18/11', 'permitido (1 filas)',
  pg_temp.como('authenticated', pg_temp.admin(), $q$update public.partidos set fecha = '2026-11-18', jornada_id = null, categoria_id = '00000000-0000-0000-0000-0000000000e2' where id = '00000000-0000-0000-0000-0000000000f5'$q$));
select pg_temp.probar('La cobertura se mudó al día 18 (se creó) y el 17 conserva 4 partidos', 'día 18: 1 / día 17: 4 partidos',
  (select 'día 18: ' || (select count(*) from public.dias_cobertura where campeonato_id = '00000000-0000-0000-0000-0000000000c1' and fecha = '2026-11-18')
       || ' / día 17: ' || (select count(*) from public.albumes where campeonato_id = '00000000-0000-0000-0000-0000000000c1' and fecha = '2026-11-17' and tipo = 'partido' and id <> '00000000-0000-0000-0000-0000000000d8') || ' partidos'));
select pg_temp.probar('Admin: devuelve el partido 5 al día 17', 'permitido (1 filas)',
  pg_temp.como('authenticated', pg_temp.admin(), $q$update public.partidos set fecha = '2026-11-17', jornada_id = '00000000-0000-0000-0000-0000000000a2' where id = '00000000-0000-0000-0000-0000000000f5'$q$));
select pg_temp.probar('El día 18 quedó vacío y sin video: se borró solo', '0',
  (select count(*)::text from public.dias_cobertura where campeonato_id = '00000000-0000-0000-0000-0000000000c1' and fecha = '2026-11-18'));
select pg_temp.probar('Los 5 partidos volvieron al mismo día 17', '5',
  (select count(*)::text from public.albumes where campeonato_id = '00000000-0000-0000-0000-0000000000c1' and fecha = '2026-11-17' and tipo = 'partido' and id <> '00000000-0000-0000-0000-0000000000d8'));

-- =====================================================================
-- C) Video resumen general del día
-- =====================================================================
select pg_temp.probar('Admin: marca el video del día 17 "en edición" (sin enlace)', 'permitido (1 filas)',
  pg_temp.como('authenticated', pg_temp.admin(), $q$update public.dias_cobertura set estado_video = 'edicion' where slug = 'prueba-dia-a-2026-11-17'$q$));
select pg_temp.probar('NO acepta "disponible" sin enlace de YouTube', 'bloqueado',
  pg_temp.como('authenticated', pg_temp.admin(), $q$update public.dias_cobertura set estado_video = 'disponible' where slug = 'prueba-dia-a-2026-11-17'$q$));
select pg_temp.probar('NO acepta estados inventados', 'bloqueado',
  pg_temp.como('authenticated', pg_temp.admin(), $q$update public.dias_cobertura set estado_video = 'pronto' where slug = 'prueba-dia-a-2026-11-17'$q$));
select pg_temp.probar('NO acepta un enlace que no es un ID de YouTube', 'bloqueado',
  pg_temp.como('authenticated', pg_temp.admin(), $q$update public.dias_cobertura set youtube_id = 'https://youtu.be/x' where slug = 'prueba-dia-a-2026-11-17'$q$));
select pg_temp.probar('NO se puede cambiar la dirección permanente del día', 'bloqueado',
  pg_temp.como('authenticated', pg_temp.admin(), $q$update public.dias_cobertura set slug = 'otra' where slug = 'prueba-dia-a-2026-11-17'$q$));
select pg_temp.probar('NO se puede mover un día a otra fecha', 'bloqueado',
  pg_temp.como('authenticated', pg_temp.admin(), $q$update public.dias_cobertura set fecha = '2026-12-01' where slug = 'prueba-dia-a-2026-11-17'$q$));
select pg_temp.probar('Visitante: NO puede crear días', 'bloqueado',
  pg_temp.como('anon', pg_temp.anon(), $q$insert into public.dias_cobertura (campeonato_id, fecha, slug) values ('00000000-0000-0000-0000-0000000000c1', '2026-12-01', 'prueba-dia-x')$q$));
select pg_temp.probar('Visitante: NO puede editar el video de un día', 'bloqueado',
  pg_temp.como('anon', pg_temp.anon(), $q$update public.dias_cobertura set estado_video = 'disponible', youtube_id = 'aaaaaaaaaaa'$q$));
select pg_temp.probar('Usuario con sesión que no es admin: NO puede crear ni editar días', 'bloqueado',
  pg_temp.como('authenticated', pg_temp.usuario(), $q$update public.dias_cobertura set estado_video = 'no_aplica' where slug = 'prueba-dia-a-2026-11-17'$q$));
select pg_temp.probar('Visitante: NO puede borrar días', 'bloqueado',
  pg_temp.como('anon', pg_temp.anon(), $q$delete from public.dias_cobertura$q$));

select pg_temp.probar('Visitante: un día sin nada público NO existe para él', '0',
  pg_temp.leer('anon', pg_temp.anon(), $q$select count(*)::text from public.dias_cobertura where slug like 'prueba-dia-%'$q$));
select pg_temp.probar('Administrador: ve todos los días de prueba', '3',
  pg_temp.leer('authenticated', pg_temp.admin(), $q$select count(*)::text from public.dias_cobertura where slug like 'prueba-dia-%'$q$));

-- Fotos publicadas de los partidos de A el 17/11, el del 16/11 y el borrador sin publicar
select pg_temp.probar('Mamá: publica las fotos del partido 1', 'permitido (fotos publicadas)', pg_temp.publicar_fotos('00000000-0000-0000-0000-0000000000d1'));
select pg_temp.probar('Mamá: publica las fotos del partido 2', 'permitido (fotos publicadas)', pg_temp.publicar_fotos('00000000-0000-0000-0000-0000000000d2'));
select pg_temp.probar('Mamá: publica las fotos del partido 3', 'permitido (fotos publicadas)', pg_temp.publicar_fotos('00000000-0000-0000-0000-0000000000d3'));
select pg_temp.probar('Mamá: publica las fotos del partido 4', 'permitido (fotos publicadas)', pg_temp.publicar_fotos('00000000-0000-0000-0000-0000000000d4'));
select pg_temp.probar('Mamá: publica las fotos del partido 5', 'permitido (fotos publicadas)', pg_temp.publicar_fotos('00000000-0000-0000-0000-0000000000d5'));
select pg_temp.probar('Mamá: publica las fotos del partido del 16/11', 'permitido (fotos publicadas)', pg_temp.publicar_fotos('00000000-0000-0000-0000-0000000000d6'));
select pg_temp.probar('Cobertura de otro campeonato, visible solo con su video propio', 'permitido (1 filas)',
  pg_temp.como('authenticated', pg_temp.admin(), $q$update public.albumes set visible = true, estado_video = 'disponible', youtube_id = 'bbbbbbbbbbb' where id = '00000000-0000-0000-0000-0000000000d7'$q$));
select pg_temp.probar('Evento de 2024 visible con su video', 'permitido (1 filas)',
  pg_temp.como('authenticated', pg_temp.admin(), $q$update public.albumes set visible = true, estado_video = 'disponible', youtube_id = 'ccccccccccc' where id = '00000000-0000-0000-0000-0000000000b9'$q$));
select pg_temp.probar('Publicación anterior sin fecha, visible con su video', 'permitido (1 filas)',
  pg_temp.como('authenticated', pg_temp.admin(), $q$update public.albumes set visible = true, estado_video = 'disponible', youtube_id = 'ffffffffff1' where id = '00000000-0000-0000-0000-0000000000b8'$q$));
-- (dentro de una transacción now() es siempre el mismo: se separan a mano las "novedades")
update public.albumes set actividad_en = now() + interval '2 minutes' where id = '00000000-0000-0000-0000-0000000000b9';

select pg_temp.probar('Visitante: ve el día 17 (con fotos) y NO ve el youtube_id', 'prueba-dia-a-2026-11-17 / edicion / video=(sin)',
  pg_temp.leer('anon', pg_temp.anon(), $q$select slug || ' / ' || video_estado_publico || ' / video=' || coalesce(video_publico, '(sin)') from public.dias_cobertura where slug = 'prueba-dia-a-2026-11-17'$q$));
select pg_temp.probar('Visitante: NO puede leer youtube_id ni estado_video del día', 'bloqueado',
  pg_temp.como('anon', pg_temp.anon(), $q$select youtube_id, estado_video from public.dias_cobertura$q$));

select pg_temp.probar('Papá: agrega el enlace y marca el video del día "disponible"', 'permitido (1 filas)',
  pg_temp.como('authenticated', pg_temp.admin(), $q$update public.dias_cobertura set estado_video = 'disponible', youtube_id = 'dddddddddd1' where slug = 'prueba-dia-a-2026-11-17'$q$));
select pg_temp.probar('Visitante: ahora ve el video general del día', 'disponible / video=dddddddddd1',
  pg_temp.leer('anon', pg_temp.anon(), $q$select video_estado_publico || ' / video=' || coalesce(video_publico, '(sin)') from public.dias_cobertura where slug = 'prueba-dia-a-2026-11-17'$q$));
select pg_temp.probar('Al estar disponible el video se marca como novedad', 'con fecha',
  (select case when video_en is not null then 'con fecha' else 'sin fecha' end from public.dias_cobertura where slug = 'prueba-dia-a-2026-11-17'));
select pg_temp.probar('Las fotos ya publicadas siguen igual (no se publicó de nuevo)', '5 / 5 publicadas',
  (select count(*) filter (where estado = 'publicada') || ' / 5 publicadas' from public.albumes where id in ('00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000d2','00000000-0000-0000-0000-0000000000d3','00000000-0000-0000-0000-0000000000d4','00000000-0000-0000-0000-0000000000d5')));

-- =====================================================================
-- D) Catálogo agrupado por día
-- =====================================================================
select pg_temp.probar('Catálogo (visitante): campeonato A → 2 entradas, el 17 antes que el 16',
  'prueba-dia-a-2026-11-17,prueba-dia-a-2026-11-16',
  pg_temp.leer('anon', pg_temp.anon(), $q$select string_agg(b.slug, ',' order by b.ordinality) from public.buscar_entradas(p_campeonato => '00000000-0000-0000-0000-0000000000c1') with ordinality b$q$));
select pg_temp.probar('El día 17 resume 5 partidos, 5 con fotos y 2 categorías (el borrador no cuenta)', 'día / 5 partidos / 5 con fotos / 2 categorías',
  pg_temp.leer('anon', pg_temp.anon(), $q$select case when es_dia then 'día' else 'cobertura' end || ' / ' || partidos || ' partidos / ' || con_fotos || ' con fotos / ' || cardinality(categorias) || ' categorías' from public.buscar_entradas(p_campeonato => '00000000-0000-0000-0000-0000000000c1') where slug = 'prueba-dia-a-2026-11-17'$q$));
select pg_temp.probar('El día muestra su video general y una foto representativa', 'video=dddddddddd1 / con portada',
  pg_temp.leer('anon', pg_temp.anon(), $q$select 'video=' || coalesce(video_publico, '(sin)') || ' / ' || case when portada_publica is not null then 'con portada' else 'sin portada' end from public.buscar_entradas(p_campeonato => '00000000-0000-0000-0000-0000000000c1') where slug = 'prueba-dia-a-2026-11-17'$q$));
select pg_temp.probar('Administrador: el catálogo sí cuenta el borrador (6 partidos)', '6 partidos',
  pg_temp.leer('authenticated', pg_temp.admin(), $q$select partidos || ' partidos' from public.buscar_entradas(p_campeonato => '00000000-0000-0000-0000-0000000000c1') where slug = 'prueba-dia-a-2026-11-17'$q$));
select pg_temp.probar('Buscar un equipo ("Zeta") devuelve el DÍA, con 1 partido', '1 entrada: día / 1 partidos',
  pg_temp.leer('anon', pg_temp.anon(), $q$select count(*) || ' entrada: ' || case when bool_and(es_dia) then 'día' else 'cobertura' end || ' / ' || max(partidos) || ' partidos' from public.buscar_entradas('zeta') where slug like 'prueba-dia-%'$q$));
select pg_temp.probar('Buscar con error de tipeo ("zetta") también lo encuentra', 'prueba-dia-a-2026-11-17',
  pg_temp.leer('anon', pg_temp.anon(), $q$select string_agg(slug, ',') from public.buscar_entradas('zetta') where slug like 'prueba-dia-%'$q$));
select pg_temp.probar('Buscar por categoría y campeonato ("Prueba Día A Senior")', 'prueba-dia-a-2026-11-17 / 2 partidos',
  pg_temp.leer('anon', pg_temp.anon(), $q$select string_agg(slug || ' / ' || partidos || ' partidos', ',') from public.buscar_entradas('prueba dia a senior') where slug like 'prueba-dia-%'$q$));
select pg_temp.probar('Buscar por fecha ("17/11/2026") encuentra los días del 17', 'prueba-dia-a-2026-11-17,prueba-dia-b-2026-11-17',
  pg_temp.leer('anon', pg_temp.anon(), $q$select string_agg(slug, ',' order by slug) from public.buscar_entradas('17/11/2026') where slug like 'prueba-dia-%'$q$));
select pg_temp.probar('Filtro por categoría (Senior): el día muestra solo sus 2 partidos', '2 partidos',
  pg_temp.leer('anon', pg_temp.anon(), $q$select partidos || ' partidos' from public.buscar_entradas(p_categoria => '00000000-0000-0000-0000-0000000000e2') where slug = 'prueba-dia-a-2026-11-17'$q$));
select pg_temp.probar('Orden por fecha real: 17, 17, 16, 2024 y SIN fecha al final', '2026-11-17,2026-11-17,2026-11-16,2024-09-15,sin fecha',
  pg_temp.leer('anon', pg_temp.anon(), $q$select string_agg(coalesce(b.fecha::text, 'sin fecha'), ',' order by b.ordinality) from public.buscar_entradas(p_limite => 100) with ordinality b where b.slug like 'prueba-dia-%'$q$));
select pg_temp.probar('Lo anterior sin clasificar sigue como entrada suelta, sin fecha inventada', 'cobertura / sin fecha',
  pg_temp.leer('anon', pg_temp.anon(), $q$select case when es_dia then 'día' else 'cobertura' end || ' / ' || coalesce(fecha::text, 'sin fecha') from public.buscar_entradas('anterior') where slug = 'prueba-dia-sin-fecha'$q$));
select pg_temp.probar('Orden "agregadas recientemente": lo último agregado primero aunque sea antiguo (el evento de 2024)', 'prueba-dia-evento',
  pg_temp.leer('anon', pg_temp.anon(), $q$select b.slug from public.buscar_entradas(p_orden => 'reciente', p_limite => 100) with ordinality b where b.slug like 'prueba-dia-%' order by b.ordinality limit 1$q$));
select pg_temp.probar('Paginación desde el servidor: total y límite (A tiene 2 entradas)', 'total 2 / devuelve 1',
  pg_temp.leer('anon', pg_temp.anon(), $q$select 'total ' || max(total) || ' / devuelve ' || count(*) from public.buscar_entradas(p_campeonato => '00000000-0000-0000-0000-0000000000c1', p_limite => 1)$q$));

-- =====================================================================
-- E) Sección Videos: sin duplicados
-- =====================================================================
-- Videos de prueba: del día A-17 (dddddddddd1), propio del partido de B (bbbbbbbbbbb),
-- del evento (ccccccccccc) y de la publicación sin fecha (ffffffffff1).
select pg_temp.probar('Videos: el del día, el de un partido, el de un evento y el de una publicación anterior (4)', '4',
  pg_temp.leer('anon', pg_temp.anon(), $q$select count(*)::text from public.videos_publicos(24) where slug like 'prueba-dia-%'$q$));
select pg_temp.probar('Videos: el del día aparece como "día"', 'dddddddddd1 / día',
  pg_temp.leer('anon', pg_temp.anon(), $q$select youtube_id || ' / ' || case when es_dia then 'día' else 'partido' end from public.videos_publicos(24) where slug = 'prueba-dia-a-2026-11-17'$q$));
select pg_temp.probar('Admin: un partido repite por error el mismo video del día', 'permitido (1 filas)',
  pg_temp.como('authenticated', pg_temp.admin(), $q$update public.albumes set estado_video = 'disponible', youtube_id = 'dddddddddd1' where id = '00000000-0000-0000-0000-0000000000d1'$q$));
select pg_temp.probar('Videos: el mismo video NO se repite (siguen 4 y gana el del día)', '4 / 1 vez / día',
  pg_temp.leer('anon', pg_temp.anon(), $q$select count(*) || ' / ' || count(*) filter (where youtube_id = 'dddddddddd1') || ' vez / ' || case when bool_or(es_dia and youtube_id = 'dddddddddd1') then 'día' else 'partido' end from public.videos_publicos(24) where slug like 'prueba-dia-%'$q$));
select pg_temp.probar('Admin: el día de B tiene un video "en edición" (con enlace, todavía no disponible)', 'permitido (1 filas)',
  pg_temp.como('authenticated', pg_temp.admin(), $q$update public.dias_cobertura set estado_video = 'edicion', youtube_id = 'eeeeeeeeee1' where slug = 'prueba-dia-b-2026-11-17'$q$));
select pg_temp.probar('Videos: uno "en edición" NO aparece, ni su enlace (siguen 4)', '4 / sin eeeeeeeeee1',
  pg_temp.leer('anon', pg_temp.anon(), $q$select count(*) || ' / ' || case when bool_or(youtube_id = 'eeeeeeeeee1') then 'FILTRA' else 'sin eeeeeeeeee1' end from public.videos_publicos(24) where slug like 'prueba-dia-%'$q$));
select pg_temp.probar('Videos: orden por fecha real (17, 17, 2024) y la publicación sin fecha al final', '2026-11-17,2026-11-17,2024-09-15,sin fecha',
  pg_temp.leer('anon', pg_temp.anon(), $q$select string_agg(coalesce(b.fecha::text, 'sin fecha'), ',' order by b.ordinality) from public.videos_publicos(24) with ordinality b where b.slug like 'prueba-dia-%'$q$));
select pg_temp.probar('Videos: el límite se respeta', '1',
  pg_temp.leer('anon', pg_temp.anon(), $q$select count(*)::text from public.videos_publicos(1)$q$));

-- =====================================================================
-- F) Archivo por año y mes: cuenta DÍAS
-- =====================================================================
select pg_temp.probar('Archivo: noviembre 2026 suma 3 días (A-17, A-16, B-17), no 8 partidos', '+3',
  (select '+' || ((select coalesce(sum(cantidad), 0) from public.archivo_coberturas() where anio = 2026 and mes = 11)
                - (select coalesce(sum(cantidad), 0) from base_archivo where anio = 2026 and mes = 11))));
select pg_temp.probar('Archivo: septiembre 2024 suma el evento suelto', '+1',
  (select '+' || ((select coalesce(sum(cantidad), 0) from public.archivo_coberturas() where anio = 2024 and mes = 9)
                - (select coalesce(sum(cantidad), 0) from base_archivo where anio = 2024 and mes = 9))));
select pg_temp.probar('Archivo (visitante): septiembre 2024 aparece', 'sí',
  pg_temp.leer('anon', pg_temp.anon(), $q$select case when count(*) > 0 then 'sí' else 'no' end from public.archivo_coberturas() where anio = 2024 and mes = 9$q$));

-- =====================================================================
-- G) El día se ordena solo cuando cambian o se borran coberturas
-- =====================================================================
select pg_temp.probar('Admin: borra la cobertura del único partido de B (su día tiene un video en edición)', 'permitido (1 filas)',
  pg_temp.como('authenticated', pg_temp.admin(), $q$delete from public.albumes where id = '00000000-0000-0000-0000-0000000000d7'$q$));
select pg_temp.probar('El día de B se CONSERVA: tiene video en edición cargado', '1',
  (select count(*)::text from public.dias_cobertura where slug = 'prueba-dia-b-2026-11-17'));
select pg_temp.probar('Admin: mueve el partido del 16/11 al 17/11', 'permitido (1 filas)',
  pg_temp.como('authenticated', pg_temp.admin(), $q$update public.partidos set fecha = '2026-11-17' where id = '00000000-0000-0000-0000-0000000000f6'$q$));
select pg_temp.probar('El día 16 quedó vacío y sin video: se borró solo; el 17 suma ese partido (7 con el borrador)', 'día 16: 0 / día 17: 7 partidos',
  (select 'día 16: ' || (select count(*) from public.dias_cobertura where slug = 'prueba-dia-a-2026-11-16')::text
       || ' / día 17: ' || (select count(*) from public.albumes where campeonato_id = '00000000-0000-0000-0000-0000000000c1' and fecha = '2026-11-17' and tipo = 'partido')::text || ' partidos'));

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
