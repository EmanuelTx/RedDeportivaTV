/* =========================================================
   Panel RedDeportivaTV · preparación de fotos antes de subir

   - Acepta JPG, PNG o WebP de hasta 40 MB (fotos de cámara).
   - Las reduce a 2048 px de lado mayor (JPEG 85 %) y crea una miniatura
     de 640 px. Así cada foto pesa ~0,3–1 MB y el plan gratuito
     (1 GB de almacenamiento, 5 GB de tráfico) rinde mucho más.
   - Al redibujar en un lienzo se eliminan los datos EXIF (incluida la
     ubicación GPS de la cámara o el celular).
   ========================================================= */

import { PESO_MAXIMO, TIPOS_PERMITIDOS } from "../../js/admin/fotos-publicacion.js";

export const PESO_ORIGINAL_MAXIMO = 40 * 1024 * 1024;
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

export async function prepararFoto(archivo) {
  if (!TIPOS_PERMITIDOS.includes(archivo.type)) throw new Error(archivo.name + ": solo JPG, PNG o WebP.");
  if (archivo.size > PESO_ORIGINAL_MAXIMO) throw new Error(archivo.name + ": supera los 40 MB.");
  let imagen;
  try {
    imagen = await createImageBitmap(archivo, { imageOrientation: "from-image" });
  } catch (_) {
    throw new Error(archivo.name + ": no es una imagen válida.");
  }
  try {
    const grande = await redimensionar(imagen, LADO_GRANDE, 0.85);
    const mini = await redimensionar(imagen, LADO_MINI, 0.8);
    if (grande.blob.size > PESO_MAXIMO) throw new Error(archivo.name + ": no se pudo reducir a menos de 5 MB.");
    return {
      archivo: new File([grande.blob], "foto.jpg", { type: "image/jpeg" }),
      mini: new File([mini.blob], "mini.jpg", { type: "image/jpeg" }),
      ancho: grande.ancho,
      alto: grande.alto
    };
  } finally {
    imagen.close();
  }
}
