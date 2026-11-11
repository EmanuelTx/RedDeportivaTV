/* =========================================================
   Panel RedDeportivaTV · preparación de fotos antes de subir

   Tres versiones de cada foto:
   - Miniatura 640 px (~60 KB): tarjetas y galerías, carga rápida.
   - Versión web 2048 px, JPEG de alta calidad (~0,4–0,9 MB): visor
     ampliado. Se ve nítida incluso en pantallas grandes.
   - Original (opcional, hasta 50 MB): tal como vino de la cámara, en un
     bucket privado. No se pierde calidad de forma permanente.
   Al redibujar en un lienzo se eliminan los datos EXIF de las versiones
   web (incluida la ubicación GPS). El original no se modifica.
   ========================================================= */

import { PESO_MAXIMO, TIPOS_PERMITIDOS, PESO_ORIGINAL_MAXIMO } from "../../js/admin/fotos-publicacion.js";

export { PESO_ORIGINAL_MAXIMO };
const LADO_GRANDE = 2048;
const LADO_MINI = 640;

function lienzo(ancho, alto) {
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(ancho, alto);
  const c = document.createElement("canvas");
  c.width = ancho;
  c.height = alto;
  return c;
}

async function aJpeg(c, calidad) {
  if (c.convertToBlob) return c.convertToBlob({ type: "image/jpeg", quality: calidad });
  return new Promise((ok, mal) => c.toBlob((b) => (b ? ok(b) : mal(new Error("No se pudo procesar la foto."))), "image/jpeg", calidad));
}

async function redimensionar(imagen, ladoMax, calidad) {
  const escala = Math.min(1, ladoMax / Math.max(imagen.width, imagen.height));
  const ancho = Math.max(1, Math.round(imagen.width * escala));
  const alto = Math.max(1, Math.round(imagen.height * escala));
  const c = lienzo(ancho, alto);
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#ffffff"; // fondo blanco para PNG con transparencia
  ctx.fillRect(0, 0, ancho, alto);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(imagen, 0, 0, ancho, alto);
  let blob = await aJpeg(c, calidad);
  // Si aún supera el límite del bucket, baja la calidad.
  for (let q = calidad - 0.1; blob.size > PESO_MAXIMO && q >= 0.5; q -= 0.1) blob = await aJpeg(c, q);
  return { blob, ancho, alto };
}

export async function prepararFoto(archivo, { conservarOriginal = false } = {}) {
  if (!TIPOS_PERMITIDOS.includes(archivo.type)) throw new Error(archivo.name + ": solo JPG, PNG o WebP.");
  if (archivo.size > PESO_ORIGINAL_MAXIMO) throw new Error(archivo.name + ": supera los 50 MB.");
  let imagen;
  try {
    imagen = await createImageBitmap(archivo, { imageOrientation: "from-image" });
  } catch (_) {
    throw new Error(archivo.name + ": no es una imagen válida.");
  }
  try {
    const grande = await redimensionar(imagen, LADO_GRANDE, 0.88);
    const mini = await redimensionar(imagen, LADO_MINI, 0.8);
    if (grande.blob.size > PESO_MAXIMO) throw new Error(archivo.name + ": no se pudo reducir a menos de 5 MB.");
    return {
      archivo: new File([grande.blob], "foto.jpg", { type: "image/jpeg" }),
      mini: new File([mini.blob], "mini.jpg", { type: "image/jpeg" }),
      original: conservarOriginal ? archivo : null,
      ancho: grande.ancho,
      alto: grande.alto
    };
  } finally {
    imagen.close();
  }
}
