// Canal real: envía por la API de WhatsApp y guarda archivos en Storage.
import { descargarMedia, enviarWhatsApp } from "@/lib/whatsapp.server";
import type { Canal } from "./motor.server";

export const canalWhatsApp: Canal = {
  cliente: (telefono, s) => enviarWhatsApp(telefono, s),
  vendedor: async (telefono, _nombre, s) => {
    await enviarWhatsApp(telefono, s);
  },
};

const EXTENSIONES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "video/mp4": "mp4",
  "video/3gpp": "3gp",
  "audio/ogg": "ogg",
  "audio/mpeg": "mp3",
  "application/pdf": "pdf",
};

/** Descarga un archivo de WhatsApp y lo sube al bucket "media". Devuelve la URL pública. */
export async function guardarMediaWhatsApp(mediaId: string, contactoTel: string): Promise<{ url: string; mime: string }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { bytes, mime } = await descargarMedia(mediaId);
  const ext = EXTENSIONES[mime.split(";")[0] ?? ""] ?? "bin";
  const ruta = `whatsapp/${contactoTel.replace(/\D/g, "")}/${crypto.randomUUID()}.${ext}`;
  const subir = () => supabaseAdmin.storage.from("media").upload(ruta, bytes, { contentType: mime, upsert: false });
  let { error } = await subir();
  if (error && /not found/i.test(error.message)) {
    await supabaseAdmin.storage.createBucket("media", { public: true });
    ({ error } = await subir());
  }
  if (error) throw new Error(`No se pudo guardar el archivo: ${error.message}`);
  return { url: supabaseAdmin.storage.from("media").getPublicUrl(ruta).data.publicUrl, mime };
}
