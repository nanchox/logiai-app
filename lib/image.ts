// Preparación de imágenes en el navegador antes de subirlas a Storage.

async function decode(file: File): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error("No se pudo leer la imagen. Usa un archivo JPG, PNG o WebP.");
  }
}

async function toBlob(bitmap: ImageBitmap, maxSide: number, type: "image/jpeg", quality: number) {
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff"; // los PNG con transparencia quedan sobre blanco
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, type, quality));
  if (!blob) throw new Error("No se pudo procesar la imagen.");
  return blob;
}

export type PreparedImage = { bytes: ArrayBuffer; contentType: string; ext: string };

/** Foto de una posición: máx. 1600 px, JPEG. */
export async function preparePhoto(file: File): Promise<PreparedImage> {
  const blob = await toBlob(await decode(file), 1600, "image/jpeg", 0.82);
  return { bytes: await blob.arrayBuffer(), contentType: "image/jpeg", ext: "jpg" };
}

const MAP_LIMIT = 9 * 1024 * 1024; // el bucket admite 10 MB
const EXT: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };

/** Mapa: se conserva el archivo tal cual (los planos tienen texto fino); solo se reduce si pasa el límite. */
export async function prepareMap(file: File): Promise<PreparedImage> {
  if (EXT[file.type] && file.size <= MAP_LIMIT) {
    return { bytes: await file.arrayBuffer(), contentType: file.type, ext: EXT[file.type] };
  }
  const blob = await toBlob(await decode(file), 4096, "image/jpeg", 0.9);
  if (blob.size > MAP_LIMIT) throw new Error("La imagen pesa demasiado incluso reducida. Usa una de menos de 9 MB.");
  return { bytes: await blob.arrayBuffer(), contentType: "image/jpeg", ext: "jpg" };
}
