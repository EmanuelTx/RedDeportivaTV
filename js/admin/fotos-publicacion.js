/* =========================================================
   RedDeportivaTV · Fotos y publicación (panel de administración)

   Usa SOLO métodos oficiales del cliente de Supabase:
     supabase.storage.from(bucket).upload / list / move / remove / createSignedUrls
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
async function moverTodo(sb, desde, hacia, prefijo, alProgresar) {
  const pendientes = await listar(sb, desde, prefijo);
  let hechos = 0;
  if (alProgresar) alProgresar(0, pendientes.length);
  for (const ruta of pendientes) {
    let error = null;
    try {
      ({ error } = await sb.storage.from(desde).move(ruta, ruta, { destinationBucket: hacia }));
    } catch (e) {
      error = e;
    }
    if (error) {
      let yaLlego = false;
      try {
        yaLlego = (await existe(sb, hacia, ruta)) && !(await existe(sb, desde, ruta));
      } catch (_) {
        /* sin red: se informa el error original */
      }
      if (!yaLlego) fallar("Mover " + ruta, error);
    }
    hechos++;
    if (alProgresar) alProgresar(hechos, pendientes.length);
  }
}

/* ---------- Publicar / despublicar ---------- */

export async function publicar(sb, tipo, id, { alProgresar } = {}) {
  if ((await leerEstado(sb, tipo, id)) === "publicada") return "publicada";
  await cambiarEstado(sb, tipo, id, "publicando");
  await moverTodo(sb, BUCKET_PRIVADO, BUCKET_PUBLICO, carpeta(tipo, id), alProgresar);
  return cambiarEstado(sb, tipo, id, "publicada");
}

export async function despublicar(sb, tipo, id, { alProgresar } = {}) {
  if ((await leerEstado(sb, tipo, id)) === "borrador") return "borrador";
  await cambiarEstado(sb, tipo, id, "despublicando");
  await moverTodo(sb, BUCKET_PUBLICO, BUCKET_PRIVADO, carpeta(tipo, id), alProgresar);
  return cambiarEstado(sb, tipo, id, "borrador");
}

/* Termina una publicación o despublicación que quedó a medias. */
export async function completar(sb, tipo, id, opciones = {}) {
  const estado = await leerEstado(sb, tipo, id);
  if (estado === "publicando") return publicar(sb, tipo, id, opciones);
  if (estado === "despublicando") return despublicar(sb, tipo, id, opciones);
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

/* Borra una publicación con sus archivos: primero la despublica (si hace
   falta), después borra los archivos y por último el registro. */
export async function borrarPublicacion(sb, tipo, id, opciones = {}) {
  await completar(sb, tipo, id, opciones);
  await despublicar(sb, tipo, id, opciones);
  const rutas = await listar(sb, BUCKET_PRIVADO, carpeta(tipo, id));
  for (let i = 0; i < rutas.length; i += 100) {
    const { error } = await sb.storage.from(BUCKET_PRIVADO).remove(rutas.slice(i, i + 100));
    if (error) fallar("Borrar archivos", error);
  }
  const { error } = await sb.from(tabla(tipo)).delete().eq("id", id);
  if (error) fallar("Borrar " + tipo, error);
}

/* ---------- Subir fotos ---------- */

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

function nombreBase() {
  const azar = Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => b.toString(16).padStart(2, "0")).join("");
  return Date.now().toString(36) + "-" + azar;
}

function bucketSegunEstado(estado) {
  return estado === "publicando" || estado === "publicada" ? BUCKET_PUBLICO : BUCKET_PRIVADO;
}

async function subirArchivo(sb, bucket, ruta, archivo) {
  const { error } = await sb.storage.from(bucket).upload(ruta, archivo, {
    cacheControl: CACHE_SEGUNDOS,
    contentType: archivo.type,
    upsert: false
  });
  if (error) fallar("Subir foto", error);
}

/* foto: un File/Blob, o { archivo, mini, ancho, alto } (ver admin/js/imagenes.js) */
export async function subirFotoAlbum(sb, albumId, foto, datos = {}) {
  const f = foto instanceof Blob ? { archivo: foto } : foto;
  const medidas = f.ancho ? { ancho: f.ancho, alto: f.alto } : await validarImagen(f.archivo);
  if (!TIPOS_PERMITIDOS.includes(f.archivo.type) || f.archivo.size > PESO_MAXIMO) await validarImagen(f.archivo);

  const bucket = bucketSegunEstado(await leerEstado(sb, "albumes", albumId));
  const base = carpeta("albumes", albumId) + "/" + nombreBase();
  const ruta = base + "." + EXTENSION[f.archivo.type];
  const rutaMini = f.mini ? base + "-mini." + EXTENSION[f.mini.type] : null;

  await subirArchivo(sb, bucket, ruta, f.archivo);
  if (rutaMini) {
    try {
      await subirArchivo(sb, bucket, rutaMini, f.mini);
    } catch (e) {
      await sb.storage.from(bucket).remove([ruta]);
      throw e;
    }
  }

  const { data, error } = await sb
    .from("fotos")
    .insert({
      album_id: albumId,
      path: ruta,
      mini_path: rutaMini,
      ancho: medidas.ancho,
      alto: medidas.alto,
      peso_bytes: f.archivo.size,
      alt: datos.alt || null,
      descripcion: datos.descripcion || null,
      orden: datos.orden || 0
    })
    .select("*")
    .single();
  if (error) {
    await sb.storage.from(bucket).remove([ruta, rutaMini].filter(Boolean)); // deshacer la subida
    fallar("Guardar foto", error);
  }
  return Object.assign({ bucket }, data);
}

/* Sube la portada de una noticia; devuelve la ruta para guardar en portada_path. */
export async function subirPortada(sb, tipo, id, archivo) {
  if (!TIPOS_PERMITIDOS.includes(archivo.type) || archivo.size > PESO_MAXIMO) await validarImagen(archivo);
  const bucket = bucketSegunEstado(await leerEstado(sb, tipo, id));
  const ruta = carpeta(tipo, id) + "/portada-" + nombreBase() + "." + EXTENSION[archivo.type];
  await subirArchivo(sb, bucket, ruta, archivo);
  return ruta;
}

/* Borra archivos de los dos buckets (remove() ignora lo que no existe). */
export async function borrarArchivos(sb, rutas) {
  const lista = rutas.filter(Boolean);
  if (!lista.length) return;
  for (const bucket of [BUCKET_PUBLICO, BUCKET_PRIVADO]) {
    const r = await sb.storage.from(bucket).remove(lista);
    if (r.error) fallar("Borrar archivo", r.error);
  }
}

export async function borrarFoto(sb, foto) {
  const { error } = await sb.from("fotos").delete().eq("id", foto.id);
  if (error) fallar("Borrar foto", error);
  await borrarArchivos(sb, [foto.path, foto.mini_path]);
}

/* ---------- Ver fotos ---------- */

export function urlPublica(sb, ruta) {
  return sb.storage.from(BUCKET_PUBLICO).getPublicUrl(ruta).data.publicUrl;
}

/* URLs para mostrar en el panel: firmadas (1 hora) si están en el bucket
   privado; públicas si están en el público. */
export async function urlsParaVer(sb, rutas) {
  const lista = [...new Set(rutas.filter(Boolean))];
  const urls = {};
  if (!lista.length) return urls;
  const { data } = await sb.storage.from(BUCKET_PRIVADO).createSignedUrls(lista, 3600);
  for (const d of data || []) if (d && d.signedUrl && !d.error) urls[d.path] = d.signedUrl;
  for (const r of lista) if (!urls[r]) urls[r] = urlPublica(sb, r);
  return urls;
}
