-- Material de venta que los vendedores piden desde el menú del bot (pestaña Comandos del panel).
CREATE TABLE IF NOT EXISTS public.material_venta (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo TEXT NOT NULL,
  descripcion TEXT,
  texto TEXT,
  -- [{ "url": "...", "tipo": "imagen" | "documento", "nombre": "catalogo.pdf" }]
  archivos JSONB NOT NULL DEFAULT '[]'::jsonb,
  solo_admin BOOLEAN NOT NULL DEFAULT false,
  activo BOOLEAN NOT NULL DEFAULT true,
  orden INTEGER NOT NULL DEFAULT 0,
  usos INTEGER NOT NULL DEFAULT 0,
  ultimo_uso TIMESTAMPTZ,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Quién pidió qué y cuándo.
CREATE TABLE IF NOT EXISTS public.material_uso (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  material_id UUID NOT NULL REFERENCES public.material_venta(id) ON DELETE CASCADE,
  usuario_id UUID REFERENCES public.usuarios_perfil(id) ON DELETE SET NULL,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_material_uso_material ON public.material_uso(material_id, creado_en DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.material_venta, public.material_uso TO authenticated;
GRANT ALL ON public.material_venta, public.material_uso TO service_role;
ALTER TABLE public.material_venta ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.material_uso ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS material_venta_personal ON public.material_venta;
CREATE POLICY material_venta_personal ON public.material_venta FOR ALL TO authenticated
  USING (public.es_personal_activo()) WITH CHECK (public.es_personal_activo());
DROP POLICY IF EXISTS material_uso_personal ON public.material_uso;
CREATE POLICY material_uso_personal ON public.material_uso FOR ALL TO authenticated
  USING (public.es_personal_activo()) WITH CHECK (public.es_personal_activo());
