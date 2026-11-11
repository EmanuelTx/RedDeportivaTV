-- =====================================================================
-- RedDeportivaTV · Comprobación de COBERTURAS (NO deja cambios)
-- ---------------------------------------------------------------------
-- Ejecutar DESPUÉS de la migración 2. Prueba con un administrador real
-- (o uno temporal), un visitante y un usuario sin permisos:
--   * coberturas de partido y de jornada, y duplicados;
--   * estados independientes de fotos y video;
--   * privacidad: fotos en preparación, video en edición, portada;
--   * actividad pública, dirección permanente, sincronía con el partido.
-- Al final DESHACE TODO (rollback). Todas las filas deben decir ok = true.
--
-- ⚠ ALCANCE: igual que la verificación 1, simula con SQL lo que la
--   Storage API comprueba; no mueve archivos reales. El flujo real con
--   fotos se prueba desde el panel.
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

-- Abreviaturas (ids de prueba)
--   C1 campeonato · K1 categoría · P1, P2 partidos de la misma jornada
--   D1 cobertura de P1 · D2 cobertura de P2 · J1, J3 coberturas de jornada

-- =====================================================================
-- A) Estructura y columnas visibles para el visitante
-- =====================================================================
insert into resultados (prueba, esperado, obtenido, ok)
select 'Visitante PUEDE leer las columnas públicas nuevas', '5 de 5',
       count(*) filter (where has_column_privilege('anon', 'public.albumes', c, 'SELECT')) || ' de 5',
       bool_and(has_column_privilege('anon', 'public.albumes', c, 'SELECT'))
from unnest(array['jornada', 'actividad_en', 'fotos_disponibles', 'video_publico', 'portada_publica']) c;

insert into resultados (prueba, esperado, obtenido, ok)
select 'Visitante NO puede leer columnas internas', '(ninguna)',
       coalesce(string_agg(c, ', ') filter (where has_column_privilege('anon', 'public.albumes', c, 'SELECT')), '(ninguna)'),
       not bool_or(has_column_privilege('anon', 'public.albumes', c, 'SELECT'))
from unnest(array['visible', 'estado', 'estado_fotos', 'estado_video', 'youtube_id', 'portada_path', 'creado_por']) c;

insert into resultados (prueba, esperado, obtenido, ok)
select 'Funciones nuevas sin EXECUTE para visitantes ni usuarios', '(ninguna)',
       coalesce(string_agg(proname, ', '), '(ninguna)'), count(*) = 0
from pg_proc
where pronamespace = 'private'::regnamespace
  and proname in ('sincronizar_cobertura', 'propagar_partido', 'actividad_cobertura', 'fijar_slug')
  and (has_function_privilege('anon', oid, 'EXECUTE') or has_function_privilege('authenticated', oid, 'EXECUTE'));

-- =====================================================================
-- B) Datos de prueba
-- =====================================================================
insert into public.campeonatos (id, nombre, slug) values ('00000000-0000-0000-0000-0000000000c1', 'Prueba Área 4', 'prueba-cob-area-4');
insert into public.categorias  (id, nombre, slug) values ('00000000-0000-0000-0000-0000000000e1', 'Prueba Principal', 'prueba-cob-principal');
insert into public.partidos (id, campeonato_id, categoria_id, equipo_local, equipo_visitante, fecha, fase) values
  ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000e1', 'Equipo A', 'Equipo B', '2026-11-08', 'Fecha 2'),
  ('00000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000e1', 'Equipo C', 'Equipo D', '2026-11-08', 'Fecha 2');

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

-- =====================================================================
-- C) Tipos de cobertura y duplicados
-- =====================================================================
select pg_temp.probar('Admin: crea una cobertura de partido', 'permitido (1 filas)',
  pg_temp.como('authenticated', pg_temp.admin(), $q$insert into public.albumes (id, slug, titulo, partido_id) values ('00000000-0000-0000-0000-0000000000d1', 'prueba-cob-a-vs-b', 'Equipo A vs. Equipo B', '00000000-0000-0000-0000-0000000000f1')$q$));
select pg_temp.probar('Cobertura de partido: copia campeonato, categoría, fecha y jornada del partido', 'ok / ok / 2026-11-08 / Fecha 2',
  pg_temp.leer('authenticated', pg_temp.admin(), $q$select case when campeonato_id = '00000000-0000-0000-0000-0000000000c1' then 'ok' else 'mal' end || ' / ' || case when categoria_id = '00000000-0000-0000-0000-0000000000e1' then 'ok' else 'mal' end || ' / ' || fecha || ' / ' || jornada from public.albumes where id = '00000000-0000-0000-0000-0000000000d1'$q$));
select pg_temp.probar('NO permite una segunda cobertura del mismo partido', 'bloqueado',
  pg_temp.como('authenticated', pg_temp.admin(), $q$insert into public.albumes (slug, titulo, partido_id) values ('prueba-cob-duplicada', 'Duplicada', '00000000-0000-0000-0000-0000000000f1')$q$));
select pg_temp.probar('SÍ permite cubrir otro partido de la misma jornada', 'permitido (1 filas)',
  pg_temp.como('authenticated', pg_temp.admin(), $q$insert into public.albumes (id, slug, titulo, partido_id) values ('00000000-0000-0000-0000-0000000000d2', 'prueba-cob-c-vs-d', 'Equipo C vs. Equipo D', '00000000-0000-0000-0000-0000000000f2')$q$));
select pg_temp.probar('Admin: crea una cobertura de jornada completa (sin partido)', 'permitido (1 filas)',
  pg_temp.como('authenticated', pg_temp.admin(), $q$insert into public.albumes (id, slug, titulo, campeonato_id, categoria_id, fecha, jornada) values ('00000000-0000-0000-0000-0000000000d3', 'prueba-cob-fecha-2', 'Área 4 · Fecha 2', '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000e1', '2026-11-08', 'Fecha 2')$q$));
select pg_temp.probar('NO permite duplicar por error la misma jornada', 'bloqueado',
  pg_temp.como('authenticated', pg_temp.admin(), $q$insert into public.albumes (slug, titulo, campeonato_id, categoria_id, fecha, jornada) values ('prueba-cob-fecha-2-bis', 'Duplicada', '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000e1', '2026-11-08', 'fecha 2')$q$));
select pg_temp.probar('SÍ permite otro evento el mismo día con otro nombre de jornada', 'permitido (1 filas)',
  pg_temp.como('authenticated', pg_temp.admin(), $q$insert into public.albumes (id, slug, titulo, campeonato_id, categoria_id, fecha, jornada) values ('00000000-0000-0000-0000-0000000000d4', 'prueba-cob-fecha-2-final', 'Área 4 · Fecha 2 · Finales', '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000e1', '2026-11-08', 'Fecha 2 · Finales')$q$));
select pg_temp.probar('NO puede quedar visible sin partido ni campeonato y fecha', 'bloqueado',
  pg_temp.como('authenticated', pg_temp.admin(), $q$insert into public.albumes (slug, titulo, visible) values ('prueba-cob-sin-datos', 'Sin datos', true)$q$));

-- =====================================================================
-- D) Video independiente
-- =====================================================================
select pg_temp.probar('Admin: marca la cobertura visible (todavía sin fotos ni video)', 'permitido (1 filas)',
  pg_temp.como('authenticated', pg_temp.admin(), $q$update public.albumes set visible = true, portada_path = 'albumes/00000000-0000-0000-0000-0000000000d1/portada.jpg' where id = '00000000-0000-0000-0000-0000000000d1'$q$));
select pg_temp.probar('Visitante: NO ve una cobertura visible sin nada disponible', '0',
  pg_temp.leer('anon', pg_temp.anon(), $q$select count(*)::text from public.albumes where id = '00000000-0000-0000-0000-0000000000d1'$q$));
select pg_temp.probar('NO permite video "disponible" sin enlace de YouTube', 'bloqueado',
  pg_temp.como('authenticated', pg_temp.admin(), $q$update public.albumes set estado_video = 'disponible' where id = '00000000-0000-0000-0000-0000000000d1'$q$));
select pg_temp.probar('NO acepta un ID de YouTube inválido', 'bloqueado',
  pg_temp.como('authenticated', pg_temp.admin(), $q$update public.albumes set youtube_id = 'https://youtu.be/x' where id = '00000000-0000-0000-0000-0000000000d1'$q$));
select pg_temp.probar('Admin: carga el video "en edición"', 'permitido (1 filas)',
  pg_temp.como('authenticated', pg_temp.admin(), $q$update public.albumes set youtube_id = 'dQw4w9WgXcQ', estado_video = 'edicion' where id = '00000000-0000-0000-0000-0000000000d1'$q$));
select pg_temp.probar('Visitante: NO ve la cobertura mientras el video está en edición', '0',
  pg_temp.leer('anon', pg_temp.anon(), $q$select count(*)::text from public.albumes where id = '00000000-0000-0000-0000-0000000000d1'$q$));

update public.albumes set actividad_en = '2020-01-01' where id = '00000000-0000-0000-0000-0000000000d1';  -- marca antigua para comparar

select pg_temp.probar('Admin: marca el video "disponible"', 'permitido (1 filas)',
  pg_temp.como('authenticated', pg_temp.admin(), $q$update public.albumes set estado_video = 'disponible' where id = '00000000-0000-0000-0000-0000000000d1'$q$));
select pg_temp.probar('Visitante: ve la cobertura solo con video', '1 / video=dQw4w9WgXcQ / fotos=false / portada=(sin)',
  pg_temp.leer('anon', pg_temp.anon(), $q$select count(*) || ' / video=' || max(video_publico) || ' / fotos=' || bool_or(fotos_disponibles) || ' / portada=' || coalesce(max(portada_publica), '(sin)') from public.albumes where id = '00000000-0000-0000-0000-0000000000d1'$q$));
select pg_temp.probar('La actividad pública se actualiza al publicar el video', 'actualizada',
  (select case when actividad_en > '2020-01-02' then 'actualizada' else 'sin cambio' end from public.albumes where id = '00000000-0000-0000-0000-0000000000d1'));

update public.albumes set actividad_en = '2020-01-01' where id = '00000000-0000-0000-0000-0000000000d1';

select pg_temp.probar('Admin: corrige la descripción', 'permitido (1 filas)',
  pg_temp.como('authenticated', pg_temp.admin(), $q$update public.albumes set descripcion = 'Texto corregido' where id = '00000000-0000-0000-0000-0000000000d1'$q$));
select pg_temp.probar('Una corrección menor NO cambia la actividad pública', 'sin cambio',
  (select case when actividad_en > '2020-01-02' then 'actualizada' else 'sin cambio' end from public.albumes where id = '00000000-0000-0000-0000-0000000000d1'));
select pg_temp.probar('Visitante: NO puede leer el ID de YouTube directo', 'bloqueado',
  pg_temp.como('anon', pg_temp.anon(), $q$select youtube_id from public.albumes$q$));

-- =====================================================================
-- E) Fotos independientes (privadas hasta estar disponibles)
-- =====================================================================
select pg_temp.probar('Admin: sube una foto al bucket privado', 'permitido (1 filas)',
  pg_temp.como('authenticated', pg_temp.admin(), $q$insert into storage.objects (bucket_id, name) values ('fotos-borradores', 'albumes/00000000-0000-0000-0000-0000000000d1/f1.jpg')$q$));
select pg_temp.probar('Admin: registra la foto y marca fotos "en preparación"', 'permitido (1 filas)',
  pg_temp.como('authenticated', pg_temp.admin(), $q$with f as (insert into public.fotos (album_id, path) values ('00000000-0000-0000-0000-0000000000d1', 'albumes/00000000-0000-0000-0000-0000000000d1/f1.jpg') returning 1) update public.albumes set estado_fotos = 'preparacion' where id = '00000000-0000-0000-0000-0000000000d1'$q$));
select pg_temp.probar('Visitante: NO ve fotos en preparación (aunque la cobertura sea visible)', '0',
  pg_temp.leer('anon', pg_temp.anon(), $q$select count(*)::text from public.fotos where album_id = '00000000-0000-0000-0000-0000000000d1'$q$));
select pg_temp.probar('NO se pueden pasar al bucket público fotos en preparación', 'bloqueado',
  pg_temp.como('authenticated', pg_temp.admin(), $q$insert into storage.objects (bucket_id, name) values ('fotos-publicas', 'albumes/00000000-0000-0000-0000-0000000000d1/f2.jpg')$q$));
select pg_temp.probar('NO se puede empezar a publicar fotos que no están "disponibles"', 'bloqueado',
  pg_temp.como('authenticated', pg_temp.admin(), $q$update public.albumes set estado = 'publicando' where id = '00000000-0000-0000-0000-0000000000d1'$q$));
select pg_temp.probar('NO se pueden publicar fotos de una cobertura oculta', 'bloqueado',
  pg_temp.como('authenticated', pg_temp.admin(), $q$update public.albumes set estado = 'publicando', estado_fotos = 'disponible' where id = '00000000-0000-0000-0000-0000000000d2'$q$));
select pg_temp.probar('Admin: fotos "disponibles" y empieza a publicarlas', 'permitido (1 filas)',
  pg_temp.como('authenticated', pg_temp.admin(), $q$update public.albumes set estado_fotos = 'disponible', estado = 'publicando' where id = '00000000-0000-0000-0000-0000000000d1'$q$));
select pg_temp.probar('Admin (permiso de move): pasa la foto al bucket público', 'permitido (1 filas)',
  pg_temp.como('authenticated', pg_temp.admin(), $q$update storage.objects set bucket_id = 'fotos-publicas' where bucket_id = 'fotos-borradores' and name = 'albumes/00000000-0000-0000-0000-0000000000d1/f1.jpg'$q$));
select pg_temp.probar('Admin: termina de publicar las fotos', 'permitido (1 filas)',
  pg_temp.como('authenticated', pg_temp.admin(), $q$update public.albumes set estado = 'publicada' where id = '00000000-0000-0000-0000-0000000000d1'$q$));
select pg_temp.probar('Visitante: ahora ve fotos, video y portada', 'fotos=true / 1 foto / portada=sí / video=sí',
  pg_temp.leer('anon', pg_temp.anon(), $q$select 'fotos=' || a.fotos_disponibles || ' / ' || (select count(*) from public.fotos f where f.album_id = a.id) || ' foto / portada=' || case when a.portada_publica is not null then 'sí' else 'no' end || ' / video=' || case when a.video_publico is not null then 'sí' else 'no' end from public.albumes a where a.id = '00000000-0000-0000-0000-0000000000d1'$q$));
select pg_temp.probar('La actividad pública se actualiza al publicar las fotos', 'actualizada',
  (select case when actividad_en > '2020-01-02' then 'actualizada' else 'sin cambio' end from public.albumes where id = '00000000-0000-0000-0000-0000000000d1'));

-- =====================================================================
-- F) Retirar fotos y ocultar (siempre por el flujo seguro)
-- =====================================================================
select pg_temp.probar('NO se pueden marcar "en preparación" fotos todavía publicadas', 'bloqueado',
  pg_temp.como('authenticated', pg_temp.admin(), $q$update public.albumes set estado_fotos = 'preparacion' where id = '00000000-0000-0000-0000-0000000000d1'$q$));
select pg_temp.probar('NO se puede ocultar la cobertura con fotos publicadas', 'bloqueado',
  pg_temp.como('authenticated', pg_temp.admin(), $q$update public.albumes set visible = false where id = '00000000-0000-0000-0000-0000000000d1'$q$));
select pg_temp.probar('Admin: empieza a retirar las fotos ("despublicando")', 'permitido (1 filas)',
  pg_temp.como('authenticated', pg_temp.admin(), $q$update public.albumes set estado = 'despublicando' where id = '00000000-0000-0000-0000-0000000000d1'$q$));
select pg_temp.probar('Visitante: deja de ver las fotos al instante, el video sigue', '1 / fotos=false / 0 fotos / portada=(sin)',
  pg_temp.leer('anon', pg_temp.anon(), $q$select count(*) || ' / fotos=' || bool_or(a.fotos_disponibles) || ' / ' || (select count(*) from public.fotos f where f.album_id = '00000000-0000-0000-0000-0000000000d1') || ' fotos / portada=' || coalesce(max(a.portada_publica), '(sin)') from public.albumes a where a.id = '00000000-0000-0000-0000-0000000000d1'$q$));
select pg_temp.probar('NO se cierra el retiro con archivos todavía en el bucket público', 'bloqueado',
  pg_temp.como('authenticated', pg_temp.admin(), $q$update public.albumes set estado = 'borrador' where id = '00000000-0000-0000-0000-0000000000d1'$q$));
select pg_temp.probar('Admin (permiso de move): devuelve la foto al bucket privado', 'permitido (1 filas)',
  pg_temp.como('authenticated', pg_temp.admin(), $q$update storage.objects set bucket_id = 'fotos-borradores' where bucket_id = 'fotos-publicas' and name = 'albumes/00000000-0000-0000-0000-0000000000d1/f1.jpg'$q$));
select pg_temp.probar('Admin: cierra el retiro y marca fotos "en preparación"', 'permitido (1 filas)',
  pg_temp.como('authenticated', pg_temp.admin(), $q$update public.albumes set estado = 'borrador', estado_fotos = 'preparacion' where id = '00000000-0000-0000-0000-0000000000d1'$q$));
select pg_temp.probar('Admin: pasa el video a "en edición"', 'permitido (1 filas)',
  pg_temp.como('authenticated', pg_temp.admin(), $q$update public.albumes set estado_video = 'edicion' where id = '00000000-0000-0000-0000-0000000000d1'$q$));
select pg_temp.probar('Visitante: sin fotos ni video disponibles, la cobertura no se ve', '0',
  pg_temp.leer('anon', pg_temp.anon(), $q$select count(*)::text from public.albumes where id = '00000000-0000-0000-0000-0000000000d1'$q$));
select pg_temp.probar('Admin: oculta la cobertura (ya sin fotos públicas)', 'permitido (1 filas)',
  pg_temp.como('authenticated', pg_temp.admin(), $q$update public.albumes set visible = false where id = '00000000-0000-0000-0000-0000000000d1'$q$));

-- =====================================================================
-- G) Dirección permanente y sincronía con el partido
-- =====================================================================
select pg_temp.probar('NO se puede cambiar la dirección de una cobertura ya publicada', 'bloqueado',
  pg_temp.como('authenticated', pg_temp.admin(), $q$update public.albumes set slug = 'otra-direccion' where id = '00000000-0000-0000-0000-0000000000d1'$q$));
select pg_temp.probar('SÍ se puede cambiar la dirección de una cobertura nunca publicada', 'permitido (1 filas)',
  pg_temp.como('authenticated', pg_temp.admin(), $q$update public.albumes set slug = 'prueba-cob-fecha-2-corregida' where id = '00000000-0000-0000-0000-0000000000d3'$q$));
select pg_temp.probar('Admin: corrige la jornada y la fecha del partido', 'permitido (1 filas)',
  pg_temp.como('authenticated', pg_temp.admin(), $q$update public.partidos set fase = 'Fecha 3', fecha = '2026-11-09' where id = '00000000-0000-0000-0000-0000000000f1'$q$));
select pg_temp.probar('La cobertura del partido se actualiza sola', 'Fecha 3 / 2026-11-09',
  (select jornada || ' / ' || fecha from public.albumes where id = '00000000-0000-0000-0000-0000000000d1'));

-- Noticias: misma regla de dirección permanente
insert into public.noticias (id, slug, titulo, estado) values ('00000000-0000-0000-0000-0000000000b9', 'prueba-cob-noticia', 'Noticia', 'publicada');
select pg_temp.probar('Noticias: NO se puede cambiar la dirección de una noticia publicada', 'bloqueado',
  pg_temp.como('authenticated', pg_temp.admin(), $q$update public.noticias set slug = 'otra' where id = '00000000-0000-0000-0000-0000000000b9'$q$));
select pg_temp.probar('Noticias: el visitante sigue viendo las publicadas', '1',
  pg_temp.leer('anon', pg_temp.anon(), $q$select count(*)::text from public.noticias where id = '00000000-0000-0000-0000-0000000000b9'$q$));

-- =====================================================================
-- H) Sin permisos nuevos para quien no es administrador
-- =====================================================================
select pg_temp.probar('Usuario no admin: NO puede hacer visible una cobertura', 'bloqueado',
  pg_temp.como('authenticated', pg_temp.usuario(), $q$update public.albumes set visible = true where id = '00000000-0000-0000-0000-0000000000d2'$q$));
select pg_temp.probar('Usuario no admin: NO puede cambiar el video', 'bloqueado',
  pg_temp.como('authenticated', pg_temp.usuario(), $q$update public.albumes set youtube_id = 'dQw4w9WgXcQ', estado_video = 'disponible' where id = '00000000-0000-0000-0000-0000000000d2'$q$));
select pg_temp.probar('Usuario no admin: NO puede crear coberturas', 'bloqueado',
  pg_temp.como('authenticated', pg_temp.usuario(), $q$insert into public.albumes (slug, titulo) values ('prueba-cob-intruso', 'x')$q$));
select pg_temp.probar('Visitante: NO puede modificar coberturas', 'bloqueado',
  pg_temp.como('anon', pg_temp.anon(), $q$update public.albumes set visible = true$q$));

-- =====================================================================
-- Resultado
-- =====================================================================
select n, ok, prueba, esperado, obtenido from resultados order by ok, n;

rollback;  -- deshace TODO
