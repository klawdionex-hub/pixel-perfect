-- Manuales técnicos: el PDF se lee con inteligencia artificial, el usuario revisa los procedimientos
-- y, al publicarlo, los vendedores los piden desde el bot (COMANDOS → Manuales técnicos).
CREATE TABLE IF NOT EXISTS public.manuales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo TEXT NOT NULL DEFAULT 'Otro',
  marca TEXT,
  modelo TEXT,
  frecuencia TEXT,
  tipo_codigo TEXT,
  notas TEXT,
  pdf_url TEXT NOT NULL,
  pdf_nombre TEXT,
  paginas INTEGER,
  -- 'leyendo' | 'borrador' | 'publicado' | 'error'
  estado TEXT NOT NULL DEFAULT 'borrador',
  error TEXT,
  usos INTEGER NOT NULL DEFAULT 0,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.manual_procedimientos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  manual_id UUID NOT NULL REFERENCES public.manuales(id) ON DELETE CASCADE,
  clave TEXT,
  titulo TEXT NOT NULL,
  -- un paso por renglón
  pasos TEXT NOT NULL DEFAULT '',
  pagina_inicio INTEGER,
  pagina_fin INTEGER,
  -- PDF con solo esas páginas (se genera la primera vez que alguien lo pide)
  paginas_url TEXT,
  activo BOOLEAN NOT NULL DEFAULT true,
  orden INTEGER NOT NULL DEFAULT 0,
  usos INTEGER NOT NULL DEFAULT 0,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_manual_procedimientos_manual ON public.manual_procedimientos(manual_id, orden);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.manuales, public.manual_procedimientos TO authenticated;
GRANT ALL ON public.manuales, public.manual_procedimientos TO service_role;
ALTER TABLE public.manuales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.manual_procedimientos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS manuales_personal ON public.manuales;
CREATE POLICY manuales_personal ON public.manuales FOR ALL TO authenticated
  USING (public.es_personal_activo()) WITH CHECK (public.es_personal_activo());
DROP POLICY IF EXISTS manual_procedimientos_personal ON public.manual_procedimientos;
CREATE POLICY manual_procedimientos_personal ON public.manual_procedimientos FOR ALL TO authenticated
  USING (public.es_personal_activo()) WITH CHECK (public.es_personal_activo());
