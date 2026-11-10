/* =========================================================
   RedDeportivaTV · Fotos y publicación (panel de administración)

   Usa SOLO métodos oficiales del cliente de Supabase:
     supabase.storage.from(bucket).upload / list / move / remove / download
     supabase.from(tabla).select / insert / update / delete
   Nunca escribe storage.objects directamente.

   Buckets:
     fotos-borradores  privado: fotos de borradores
     fotos-publicas    público: fotos de lo publicado
   Rutas (iguales en los dos):  albumes/<id>/<archivo>  noticias/<id>/<archivo>

   Estados:  borrador → publicando → publicada → despublicando → borrador
     Publicar:    1) estado "publicando"     (sigue oculto)
                  2) mover archivos privado → público
                  3) estado "publicada"      (la base exige que no quede
                                              ningún archivo en el privado)
     Despublicar: 1) estado "despublicando"  (se oculta al instante)
                  2) mover archivos público → privado
                  3) estado "borrador"       (la base exige que no quede
                                              ningún archivo en el público)
   Si la red falla en cualquier paso, la publicación queda en un estado
   intermedio, oculta para los visitantes, y completar() la termina.
   Todos los pasos se pueden repetir sin daño.
   ========================================================= */

export const BUCKET_PRIVADO = "fotos-borradores";
export const BUCKET_PUBLICO = "fotos-publicas";
export const TIPOS_PERMITIDOS = ["image/jpeg", "image/png", "image/webp"];
export const PESO_MAXIMO = 5 * 1024 * 1024; // 5 MB, igual que los buckets
// Tiempo que navegadores y CDN pueden guardar una foto pública.
// Al despublicar, una copia en caché puede seguir viéndose hasta este tiempo.
export const CACHE_SEGUNDOS = "600"; // 10 minutos

const TABLAS = { albumes: "albumes", noticias: "noticias" };
const EXTENSION = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

function tabla(tipo) {
  const t = TABLAS[tipo];
  if (!t) throw new Error("Tipo no permitido: " + tipo);
  return t;
}

export function carpeta(tipo, id) {
  return tabla(tipo) + "/" + id;
}

function fallar(paso, error) {
  const e = new Error(paso + ": " + (error && error.message ? error.message : String(error)));
  e.causa = error;
  throw e;
}

/* ---------- Estado ---------- */

export async function leerEstado(sb, tipo, id) {
  const { data, error } = await sb.from(tabla(tipo)).select("id, estado").eq("id", id).single();
  if (error) fallar("Leer estado", error);
  return data.estado;
}

async function cambiarEstado(sb, tipo, id, estado) {
  const { data, error } = await sb
    .from(tabla(tipo))
    .update({ estado })
    .eq("id", id)
    .select("id, estado")
    .single();
  if (error) fallar("Cambiar estado a " + estado, error);
  return data.estado;
}

/* ---------- Archivos ---------- */

export async function listar(sb, bucket, prefijo) {
  const rutas = [];
  for (let offset = 0; ; offset += 100) {
    const { data, error } = await sb.storage.from(bucket).list(prefijo, { limit: 100, offset });
    if (error) fallar("Listar " + bucket, error);
    for (const f of data) if (f.id) rutas.push(prefijo + "/" + f.name); // f.id nulo = subcarpeta
    if (data.length < 100) break;
  }
  return rutas;
}

export async function existe(sb, bucket, ruta) {
  const i = ruta.lastIndexOf("/");
  const nombre = ruta.slice(i + 1);
  const { data, error } = await sb.storage.from(bucket).list(ruta.slice(0, i), { limit: 100, search: nombre });
  if (error) fallar("Buscar archivo", error);
  return data.some((f) => f.id && f.name === nombre);
}

/* Mueve todo lo que quede en "desde" hacia "hacia". Si un move falla pero
   el archivo ya llegó (la respuesta se perdió), lo da por movido. */
async function moverTodo(sb, desde, hacia, prefijo) {
  const pendientes = await listar(sb, desde, prefijo);
  for (const ruta of pendientes) {
    let error = null;
    try {
      ({ error } = await sb.storage.from(desde).move(ruta, ruta, { destinationBucket: hacia }));
    } catch (e) {
      error = e;
    }
    if (!error) continue;
    let yaLlego = false;
    try {
      yaLlego = (await existe(sb, hacia, ruta)) && !(await existe(sb, desde, ruta));
    } catch (_) {
      /* sin red: se informa el error original */
    }
    if (!yaLlego) fallar("Mover " + ruta, error);
  }
}

/* ---------- Publicar / despublicar ---------- */

export async function publicar(sb, tipo, id) {
  if ((await leerEstado(sb, tipo, id)) === "publicada") return "publicada";
  await cambiarEstado(sb, tipo, id, "publicando");
  await moverTodo(sb, BUCKET_PRIVADO, BUCKET_PUBLICO, carpeta(tipo, id));
  return cambiarEstado(sb, tipo, id, "publicada");
}

export async function despublicar(sb, tipo, id) {
  if ((await leerEstado(sb, tipo, id)) === "borrador") return "borrador";
  await cambiarEstado(sb, tipo, id, "despublicando");
  await moverTodo(sb, BUCKET_PUBLICO, BUCKET_PRIVADO, carpeta(tipo, id));
  return cambiarEstado(sb, tipo, id, "borrador");
}

/* Termina una publicación o despublicación que quedó a medias. */
export async function completar(sb, tipo, id) {
  const estado = await leerEstado(sb, tipo, id);
  if (estado === "publicando") return publicar(sb, tipo, id);
  if (estado === "despublicando") return despublicar(sb, tipo, id);
  return estado;
}

/* Diagnóstico para el panel: dónde está cada archivo y si es coherente. */
export async function revisar(sb, tipo, id) {
  const estado = await leerEstado(sb, tipo, id);
  const enPublico = await listar(sb, BUCKET_PUBLICO, carpeta(tipo, id));
  const enPrivado = await listar(sb, BUCKET_PRIVADO, carpeta(tipo, id));
  const coherente =
    (estado === "publicada" && enPrivado.length === 0) ||
    (estado === "borrador" && enPublico.length === 0);
  return { estado, enPublico, enPrivado, coherente, pendiente: !coherente };
}

/* ---------- Subir y borrar fotos de álbumes ---------- */

export async function validarImagen(archivo) {
  if (!TIPOS_PERMITIDOS.includes(archivo.type)) throw new Error("Solo se aceptan fotos JPG, PNG o WebP.");
  if (archivo.size > PESO_MAXIMO) throw new Error("La foto supera los 5 MB.");
  let imagen;
  try {
    imagen = await createImageBitmap(archivo); // confirma que es una imagen real
  } catch (_) {
    throw new Error("El archivo no es una imagen válida.");
  }
  const medidas = { ancho: imagen.width, alto: imagen.height };
  imagen.close();
  return medidas;
}

function nombreNuevo(tipoMime) {
  const azar = Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => b.toString(16).padStart(2, "0")).join("");
  return Date.now().toString(36) + "-" + azar + "." + EXTENSION[tipoMime];
}

function bucketSegunEstado(estado) {
  return estado === "publicando" || estado === "publicada" ? BUCKET_PUBLICO : BUCKET_PRIVADO;
}

export async function subirFotoAlbum(sb, albumId, archivo, datos = {}) {
  const medidas = await validarImagen(archivo);
  const bucket = bucketSegunEstado(await leerEstado(sb, "albumes", albumId));
  const ruta = carpeta("albumes", albumId) + "/" + nombreNuevo(archivo.type);

  const subida = await sb.storage.from(bucket).upload(ruta, archivo, {
    cacheControl: CACHE_SEGUNDOS,
    contentType: archivo.type,
    upsert: false
  });
  if (subida.error) fallar("Subir foto", subida.error);

  const { data, error } = await sb
    .from("fotos")
    .insert({
      album_id: albumId,
      path: ruta,
      ancho: medidas.ancho,
      alto: medidas.alto,
      peso_bytes: archivo.size,
      alt: datos.alt || null,
      descripcion: datos.descripcion || null,
      orden: datos.orden || 0
    })
    .select("id, path")
    .single();
  if (error) {
    await sb.storage.from(bucket).remove([ruta]); // deshacer la subida
    fallar("Guardar foto", error);
  }
  return Object.assign({ bucket }, data);
}

export async function borrarFoto(sb, foto) {
  const { error } = await sb.from("fotos").delete().eq("id", foto.id);
  if (error) fallar("Borrar foto", error);
  // Se borra de los dos buckets: remove() ignora lo que no existe.
  for (const bucket of [BUCKET_PUBLICO, BUCKET_PRIVADO]) {
    const r = await sb.storage.from(bucket).remove([foto.path]);
    if (r.error) fallar("Borrar archivo", r.error);
  }
}

export function urlPublica(sb, ruta) {
  return sb.storage.from(BUCKET_PUBLICO).getPublicUrl(ruta).data.publicUrl;
}
