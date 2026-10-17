-- Cotizaciones: precios y ficha técnica en el catálogo, y la tabla de cotizaciones hechas desde el bot o el panel.

-- Catálogo: precio sugerido, costo interno y ficha técnica (marca y modelo solo se imprimen en la versión "con marca").
ALTER TABLE public.equipos_catalogo
  ADD COLUMN IF NOT EXISTS precio NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS costo NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS unidad TEXT NOT NULL DEFAULT 'pieza',
  ADD COLUMN IF NOT EXISTS marca TEXT,
  ADD COLUMN IF NOT EXISTS modelo TEXT,
  ADD COLUMN IF NOT EXISTS capacidad TEXT,
  ADD COLUMN IF NOT EXISTS dimensiones TEXT,
  ADD COLUMN IF NOT EXISTS peso TEXT,
  ADD COLUMN IF NOT EXISTS alimentacion TEXT,
  ADD COLUMN IF NOT EXISTS consumo TEXT,
  ADD COLUMN IF NOT EXISTS incluye TEXT;

CREATE TABLE IF NOT EXISTS public.cotizaciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero INTEGER GENERATED ALWAYS AS IDENTITY,
  folio TEXT GENERATED ALWAYS AS ('COT-' || lpad(numero::text, 4, '0')) STORED,
  solicitud_id UUID REFERENCES public.solicitudes(id) ON DELETE SET NULL,
  vendedor_id UUID REFERENCES public.usuarios_perfil(id) ON DELETE SET NULL,
  cliente_nombre TEXT NOT NULL,
  cliente_telefono TEXT,
  atencion TEXT,
  correo TEXT,
  proyecto TEXT,
  equipo_principal_id UUID REFERENCES public.equipos_catalogo(id) ON DELETE SET NULL,
  -- [{ "equipo_id": "...", "concepto": "...", "cantidad": 1, "precio": 8500, "costo": 6200 }]
  partidas JSONB NOT NULL DEFAULT '[]'::jsonb,
  con_marca BOOLEAN NOT NULL DEFAULT false,
  -- 'incluye' | 'mas' | null (no se menciona)
  iva TEXT,
  total NUMERIC(12,2) NOT NULL DEFAULT 0,
  costo_total NUMERIC(12,2),
  pdf_url TEXT,
  creada_en TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cotizaciones_solicitud ON public.cotizaciones(solicitud_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cotizaciones TO authenticated;
GRANT ALL ON public.cotizaciones TO service_role;
ALTER TABLE public.cotizaciones ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cotizaciones_personal ON public.cotizaciones;
CREATE POLICY cotizaciones_personal ON public.cotizaciones FOR ALL TO authenticated
  USING (public.es_personal_activo()) WITH CHECK (public.es_personal_activo());
