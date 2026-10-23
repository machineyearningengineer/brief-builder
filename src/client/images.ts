// Prepares a photo on the phone before upload: decodes it, scales the long edge to 1,600 px
// and re-encodes it as JPEG. Re-encoding drops all metadata, including GPS location.
const MAX_EDGE = 1600
const QUALITY = 0.82

export async function shrinkImage(file: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height))
  const w = Math.round(bitmap.width * scale)
  const h = Math.round(bitmap.height * scale)
  const canvas = new OffscreenCanvas(w, h)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('This browser can’t prepare photos.')
  ctx.drawImage(bitmap, 0, 0, w, h)
  bitmap.close()
  return canvas.convertToBlob({ type: 'image/jpeg', quality: QUALITY })
}

export const isImage = (f: File) => /^image\//.test(f.type) || /\.(heic|heif|jpe?g|png|webp)$/i.test(f.name)

// Photos the client is about to send, with a local preview while they upload.
export type Pending = { key: string; file: Blob; preview: string; state: 'ready' | 'uploading' | 'failed' }
