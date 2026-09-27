-- Fase 2: textos adicionales del bot y bucket de archivos.

-- Textos del bot que no tienen columna propia (el código tiene los valores por defecto).
ALTER TABLE public.configuracion ADD COLUMN IF NOT EXISTS textos_extra JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Bucket público para fotos de clientes, catálogos e imágenes de anuncios
-- (WhatsApp necesita una URL pública para enviar imágenes y documentos).
INSERT INTO storage.buckets (id, name, public)
VALUES ('media', 'media', true)
ON CONFLICT (id) DO UPDATE SET public = true;

CREATE INDEX IF NOT EXISTS idx_mensajes_contacto ON public.mensajes(contacto_id);
CREATE INDEX IF NOT EXISTS idx_estado_conversacion_pendientes
  ON public.estado_conversacion(ultima_actividad)
  WHERE en_manos_de_vendedor = false AND paso_actual IS NOT NULL;
