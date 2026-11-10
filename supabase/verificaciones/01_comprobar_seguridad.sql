-- =====================================================================
-- RedDeportivaTV · Comprobación de seguridad (NO modifica nada)
-- ---------------------------------------------------------------------
-- Ejecutar DESPUÉS de la migración 1. Crea datos de prueba, simula a
-- un visitante y a un usuario sin permisos, muestra los resultados y
-- al final DESHACE todo (rollback). Cada fila debe decir ok = true.
-- =====================================================================

begin;

create temp table resultados (n serial, prueba text, esperado text, obtenido text, ok boolean);

-- 1) RLS activado en todas las tablas
insert into resultados (prueba, esperado, obtenido, ok)
select 'RLS activado: ' || tablename, 'true', rowsecurity::text, rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename in ('administradores','campeonatos','categorias','partidos','noticias','albumes','fotos','transmisiones');

-- 2) Datos de prueba (se borran al final)
insert into public.campeonatos (id, nombre, slug) values
  ('00000000-0000-0000-0000-0000000000c1', 'Prueba RLS', 'prueba-rls');
insert into public.noticias (slug, titulo, estado) values
  ('prueba-rls-publicada', 'Noticia publicada', 'publicada'),
  ('prueba-rls-borrador',  'Noticia borrador',  'borrador');
insert into public.albumes (id, slug, titulo, estado) values
  ('00000000-0000-0000-0000-0000000000a1', 'prueba-rls-album-pub', 'Álbum publicado', 'publicada'),
  ('00000000-0000-0000-0000-0000000000a2', 'prueba-rls-album-bor', 'Álbum borrador',  'borrador');
insert into public.fotos (album_id, path) values
  ('00000000-0000-0000-0000-0000000000a1', 'prueba-rls/pub.jpg'),
  ('00000000-0000-0000-0000-0000000000a2', 'prueba-rls/bor.jpg');
insert into public.transmisiones (titulo, youtube_url, en_vivo, termina_en) values
  ('Prueba RLS vigente', 'https://www.youtube.com/watch?v=prueba1', true,  now() + interval '2 hours'),
  ('Prueba RLS vencida', 'https://www.youtube.com/watch?v=prueba2', true,  now() - interval '1 hour'),
  ('Prueba RLS apagada', 'https://www.youtube.com/watch?v=prueba3', false, null);

-- 3) Simulaciones
do $$
declare
  n int;
  intento text;
begin
  -- ---------- Visitante (anon) ----------
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  set local role anon;
  select count(*) into n from public.noticias where slug like 'prueba-rls-%';
  reset role;
  insert into resultados (prueba, esperado, obtenido, ok) values ('Visitante: ve solo noticias publicadas', '1', n::text, n = 1);

  set local role anon;
  select count(*) into n from public.albumes where slug like 'prueba-rls-%';
  reset role;
  insert into resultados (prueba, esperado, obtenido, ok) values ('Visitante: ve solo álbumes publicados', '1', n::text, n = 1);

  set local role anon;
  select count(*) into n from public.fotos where path like 'prueba-rls/%';
  reset role;
  insert into resultados (prueba, esperado, obtenido, ok) values ('Visitante: ve solo fotos de álbumes publicados', '1', n::text, n = 1);

  set local role anon;
  select count(*) into n from public.transmisiones where titulo like 'Prueba RLS%';
  reset role;
  insert into resultados (prueba, esperado, obtenido, ok) values ('Visitante: ve solo la transmisión EN VIVO vigente', '1', n::text, n = 1);

  set local role anon;
  select count(*) into n from public.campeonatos where slug = 'prueba-rls';
  reset role;
  insert into resultados (prueba, esperado, obtenido, ok) values ('Visitante: puede leer campeonatos visibles', '1', n::text, n = 1);

  -- Intentos prohibidos del visitante (deben fallar)
  begin
    set local role anon;
    insert into public.noticias (slug, titulo) values ('prueba-rls-intruso', 'x');
    intento := 'lo permitió';
  exception when others then intento := 'bloqueado (' || sqlstate || ')';
  end;
  reset role;
  insert into resultados (prueba, esperado, obtenido, ok) values ('Visitante: NO puede crear noticias', 'bloqueado', intento, intento like 'bloqueado%');

  begin
    set local role anon;
    update public.noticias set titulo = 'hackeado' where slug = 'prueba-rls-publicada';
    get diagnostics n = row_count;
    intento := case when n = 0 then 'bloqueado (0 filas)' else 'lo permitió' end;
  exception when others then intento := 'bloqueado (' || sqlstate || ')';
  end;
  reset role;
  insert into resultados (prueba, esperado, obtenido, ok) values ('Visitante: NO puede editar noticias', 'bloqueado', intento, intento like 'bloqueado%');

  begin
    set local role anon;
    delete from public.campeonatos where slug = 'prueba-rls';
    get diagnostics n = row_count;
    intento := case when n = 0 then 'bloqueado (0 filas)' else 'lo permitió' end;
  exception when others then intento := 'bloqueado (' || sqlstate || ')';
  end;
  reset role;
  insert into resultados (prueba, esperado, obtenido, ok) values ('Visitante: NO puede borrar campeonatos', 'bloqueado', intento, intento like 'bloqueado%');

  begin
    set local role anon;
    perform creado_por from public.noticias limit 1;
    intento := 'lo permitió';
  exception when others then intento := 'bloqueado (' || sqlstate || ')';
  end;
  reset role;
  insert into resultados (prueba, esperado, obtenido, ok) values ('Visitante: NO ve columnas internas (creado_por)', 'bloqueado', intento, intento like 'bloqueado%');

  begin
    set local role anon;
    perform * from public.administradores limit 1;
    intento := 'lo permitió';
  exception when others then intento := 'bloqueado (' || sqlstate || ')';
  end;
  reset role;
  insert into resultados (prueba, esperado, obtenido, ok) values ('Visitante: NO ve la lista de administradores', 'bloqueado', intento, intento like 'bloqueado%');

  -- ---------- Usuario con sesión pero NO administrador ----------
  perform set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

  set local role authenticated;
  select count(*) into n from public.noticias where slug like 'prueba-rls-%';
  reset role;
  insert into resultados (prueba, esperado, obtenido, ok) values ('Usuario no admin: NO ve borradores', '1', n::text, n = 1);

  begin
    set local role authenticated;
    insert into public.noticias (slug, titulo) values ('prueba-rls-intruso-2', 'x');
    intento := 'lo permitió';
  exception when others then intento := 'bloqueado (' || sqlstate || ')';
  end;
  reset role;
  insert into resultados (prueba, esperado, obtenido, ok) values ('Usuario no admin: NO puede crear noticias', 'bloqueado', intento, intento like 'bloqueado%');

  begin
    set local role authenticated;
    update public.noticias set titulo = 'hackeado' where slug = 'prueba-rls-publicada';
    get diagnostics n = row_count;
    intento := case when n = 0 then 'bloqueado (0 filas)' else 'lo permitió' end;
  exception when others then intento := 'bloqueado (' || sqlstate || ')';
  end;
  reset role;
  insert into resultados (prueba, esperado, obtenido, ok) values ('Usuario no admin: NO puede editar noticias', 'bloqueado', intento, intento like 'bloqueado%');

  -- ---------- Administrador real (solo si ya se registraron) ----------
  select count(*) into n from public.administradores;
  if n > 0 then
    perform set_config('request.jwt.claims',
      json_build_object('sub', (select user_id from public.administradores limit 1), 'role', 'authenticated')::text, true);
    begin
      set local role authenticated;
      insert into public.noticias (slug, titulo) values ('prueba-rls-admin', 'Creada por admin');
      select count(*) into n from public.noticias where slug like 'prueba-rls-%';
      intento := 'permitido, ve ' || n || ' noticias';
    exception when others then intento := 'bloqueado (' || sqlstate || ')';
    end;
    reset role;
    insert into resultados (prueba, esperado, obtenido, ok) values ('Administrador: puede crear y ve borradores', 'permitido, ve 3 noticias', intento, intento = 'permitido, ve 3 noticias');
  else
    insert into resultados (prueba, esperado, obtenido, ok) values ('Administrador: (se prueba cuando estén registrados)', '-', 'sin administradores todavía', true);
  end if;
end;
$$;

-- 4) Bucket de fotos
insert into resultados (prueba, esperado, obtenido, ok)
select 'Bucket fotos: público, 5 MB, JPG/PNG/WebP',
       'true / 5242880 / 3 tipos',
       public::text || ' / ' || file_size_limit || ' / ' || array_length(allowed_mime_types, 1) || ' tipos',
       public and file_size_limit = 5242880 and array_length(allowed_mime_types, 1) = 3
from storage.buckets where id = 'fotos';

select n, ok, prueba, esperado, obtenido from resultados order by n;

rollback;  -- deshace todos los datos de prueba
