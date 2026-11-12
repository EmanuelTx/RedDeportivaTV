-- =====================================================================
-- RedDeportivaTV · Datos de prueba EQUIVALENTES a la base original
-- ---------------------------------------------------------------------
-- SOLO para el proyecto de PRUEBAS (reddeportivatv-pruebas), después de
-- la migración 1 y ANTES de la migración 2. Reproduce el estado de la
-- base original del 11/11/2026 (respaldo local respaldos/…):
--   * campeonatos "Area 4" y "Area 1" (2026), sin categorías;
--   * partido Alemania 1-2 Argentina (Area 4, "Fecha 2", 05/11/2026);
--   * transmisión "FUTSAL PARANAENSE 2026" apagada;
--   * álbum PUBLICADO "Fecha 2 Area 4" sin campeonato ni fecha, con 6
--     fotos (registros con las mismas rutas que la original). Los
--     archivos se suben DESPUÉS como archivos reales con la Storage API
--     (pruebas/legado.html); nunca se escribe storage.objects con SQL.
-- No contiene usuarios, correos, contraseñas ni datos personales.
--
-- Protección: si la base ya tiene contenido (por ejemplo, si por error
-- se abrió el proyecto ORIGINAL), se detiene sin cambiar nada.
-- =====================================================================

begin;

do $$
begin
  -- (la base original tiene álbumes y campeonatos: aquí se detendría)
  if exists (select 1 from public.albumes) or exists (select 1 from public.campeonatos) then
    raise exception 'Esta base ya tiene datos: este script es solo para el proyecto de PRUEBAS vacío. No se aplicó nada.';
  end if;
end;
$$;

insert into public.campeonatos (id, nombre, slug, temporada) values
  ('c14ee5c1-1a8e-49f7-af2e-958286ebb6d3', 'Area 4', 'area-4', '2026'),
  ('a5938fe1-9db2-4e14-98f5-95226072b625', 'Area 1', 'area-1', '2026');

insert into public.partidos (id, campeonato_id, equipo_local, equipo_visitante, fecha, lugar, fase, goles_local, goles_visitante) values
  ('edd72646-8a83-4c31-9398-2373b67bf5aa', 'c14ee5c1-1a8e-49f7-af2e-958286ebb6d3', 'Alemania', 'Argentina', '2026-11-05', 'Club Social Area 4', 'Fecha 2', 1, 2);

insert into public.transmisiones (titulo, youtube_url, en_vivo) values
  ('FUTSAL PARANAENSE 2026', 'https://www.youtube.com/watch?v=iCsUq6GlX0Y&t=16s', false);

insert into public.albumes (id, slug, titulo, estado, portada_path, publicado_en, creado_en) values
  ('90fce53a-154a-49eb-8ec4-7e5ac91d7eb2', 'fecha-2-area-4', 'Fecha 2 Area 4', 'publicada',
   'albumes/90fce53a-154a-49eb-8ec4-7e5ac91d7eb2/mwchht96-3886e4255303.jpg',
   '2026-11-11 19:00:50.648696+00', '2026-11-11 19:00:11.729457+00');

insert into public.fotos (id, album_id, path, mini_path, ancho, alto, peso_bytes, orden, creado_en)
select f.id::uuid, '90fce53a-154a-49eb-8ec4-7e5ac91d7eb2',
       'albumes/90fce53a-154a-49eb-8ec4-7e5ac91d7eb2/' || f.base || '.jpg',
       'albumes/90fce53a-154a-49eb-8ec4-7e5ac91d7eb2/' || f.base || '-mini.jpg',
       2048, f.alto, f.peso, f.orden, f.creado::timestamptz
from (values
  ('a47fee78-5729-435a-8cad-3be7770ab1df', 'mwchhprj-7d010fc3928b', 1365, 321763, 10, '2026-11-11 19:00:20+00'),
  ('092b553d-4f64-46b0-9ff7-fc733cd1b3aa', 'mwchhqr8-f5159e214144', 1365, 248980, 20, '2026-11-11 19:00:21+00'),
  ('c6536e8c-1e0b-41c5-acdb-5be6fe825583', 'mwchhrat-b038a85ee643', 1365, 681225, 30, '2026-11-11 19:00:22+00'),
  ('a034da30-5163-46c6-abff-238086974ef2', 'mwchhrwd-d1f653143938', 1365, 646116, 40, '2026-11-11 19:00:22+00'),
  ('9ac47c17-f34b-45a4-9138-cef5b49e03e5', 'mwchhsmf-5919b1bc7799', 1462, 352011, 50, '2026-11-11 19:00:23+00'),
  ('af7b81c4-45ff-499b-a600-972eab10ab10', 'mwchht96-3886e4255303', 1466, 353398, 60, '2026-11-11 19:00:24+00')
) as f(id, base, alto, peso, orden, creado);

-- Los ARCHIVOS no se crean acá: se suben como archivos reales con la
-- Storage API desde pruebas/legado.html (con el administrador de prueba),
-- en estas mismas rutas, y esa página ajusta peso y medidas reales.

-- Resumen
select (select count(*) from public.campeonatos) as campeonatos,
       (select count(*) from public.partidos) as partidos,
       (select count(*) from public.albumes) as albumes,
       (select count(*) from public.fotos) as fotos;

commit;
