-- Catálogo de equipos con clave propia (línea AFPAM). Los vendedores piden las fotos desde el menú del bot
-- (COMANDOS → Catálogo de equipos) para reenviarlas al cliente. Las notas internas (marca, modelo, costo)
-- nunca se envían por WhatsApp; también se usará en las cotizaciones.
CREATE TABLE IF NOT EXISTS public.equipos_catalogo (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clave TEXT NOT NULL,
  nombre TEXT NOT NULL,
  categoria TEXT NOT NULL DEFAULT 'Otro',
  descripcion TEXT,
  -- [{ "url": "..." }]
  fotos JSONB NOT NULL DEFAULT '[]'::jsonb,
  notas_internas TEXT,
  activo BOOLEAN NOT NULL DEFAULT true,
  orden INTEGER NOT NULL DEFAULT 0,
  usos INTEGER NOT NULL DEFAULT 0,
  ultimo_uso TIMESTAMPTZ,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_equipos_catalogo_clave ON public.equipos_catalogo (upper(clave));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.equipos_catalogo TO authenticated;
GRANT ALL ON public.equipos_catalogo TO service_role;
ALTER TABLE public.equipos_catalogo ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS equipos_catalogo_personal ON public.equipos_catalogo;
CREATE POLICY equipos_catalogo_personal ON public.equipos_catalogo FOR ALL TO authenticated
  USING (public.es_personal_activo()) WITH CHECK (public.es_personal_activo());
