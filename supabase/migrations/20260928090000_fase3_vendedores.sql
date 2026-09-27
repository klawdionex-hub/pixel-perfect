-- Fase 3: comunicación con vendedores por WhatsApp.

-- Última vez que el vendedor escribió al bot (ventana de 24 h de WhatsApp)
-- y lo que el bot espera que responda (monto de venta, motivo de pérdida).
ALTER TABLE public.usuarios_perfil ADD COLUMN IF NOT EXISTS ultimo_mensaje_wa TIMESTAMPTZ;
ALTER TABLE public.usuarios_perfil ADD COLUMN IF NOT EXISTS estado_bot JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Control de recordatorios y seguimientos por solicitud.
ALTER TABLE public.solicitudes ADD COLUMN IF NOT EXISTS control_bot JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_solicitudes_vendedor_etapa ON public.solicitudes(vendedor_id, etapa);
