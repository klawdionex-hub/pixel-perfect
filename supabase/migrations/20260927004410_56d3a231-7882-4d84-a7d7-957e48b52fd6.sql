ALTER TABLE public.estado_conversacion ADD COLUMN IF NOT EXISTS datos JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.estado_conversacion ADD COLUMN IF NOT EXISTS ultimo_aviso_vendedor TIMESTAMPTZ;
ALTER TABLE public.configuracion ADD COLUMN IF NOT EXISTS texto_cierre TEXT DEFAULT 'Gracias, {nombre}. Hemos registrado su solicitud con el folio {codigo}. Uno de nuestros asesores se comunicará con usted a la brevedad.';
ALTER TABLE public.solicitudes ALTER COLUMN servicio_codigo DROP NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS mensajes_wa_message_id_unico ON public.mensajes (wa_message_id) WHERE wa_message_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.calcular_solicitud()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
DECLARE parte_servicio TEXT; pct NUMERIC;
BEGIN
  IF NEW.servicio_codigo IN (8,9) AND NEW.equipo_codigo IS NOT NULL THEN
    parte_servicio := NEW.servicio_codigo::text || '.' || NEW.equipo_codigo::text;
  ELSE
    parte_servicio := COALESCE(NEW.servicio_codigo::text, '0');
  END IF;
  NEW.codigo := parte_servicio || '-' || NEW.etapa::text || '-' || lpad(NEW.numero::text, 4, '0');
  SELECT porcentaje_comision INTO pct FROM public.servicios WHERE codigo = NEW.servicio_codigo;
  IF NEW.monto_venta IS NOT NULL THEN NEW.comision := round(NEW.monto_venta * COALESCE(pct, 3) / 100, 2);
  ELSE NEW.comision := NULL; END IF;
  IF NEW.etapa = 5 AND NEW.archivada_en IS NULL THEN NEW.archivada_en := now(); END IF;
  IF NEW.etapa IN (0,4) AND NEW.resultado_en IS NULL THEN NEW.resultado_en := now(); END IF;
  IF NEW.vendedor_id IS NOT NULL AND NEW.tomada_en IS NULL THEN NEW.tomada_en := now(); END IF;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.actualizar_nombre_mostrado()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
DECLARE c RECORD; parte TEXT;
BEGIN
  SELECT * INTO c FROM public.contactos WHERE id = NEW.contacto_id;
  IF c IS NULL THEN RETURN NEW; END IF;
  IF NEW.servicio_codigo IN (8,9) AND NEW.equipo_codigo IS NOT NULL THEN
    parte := NEW.servicio_codigo::text || '.' || NEW.equipo_codigo::text;
  ELSE parte := COALESCE(NEW.servicio_codigo::text, '0'); END IF;
  IF NEW.etapa = 4 THEN
    UPDATE public.contactos SET es_cliente = true,
      nombre_mostrado = COALESCE(NULLIF(c.nombre, ''), 'Sin nombre') || ' (' || parte || '-' || lpad(NEW.numero::text,4,'0') || ')'
    WHERE id = c.id;
  ELSIF NOT c.es_cliente THEN
    UPDATE public.contactos SET nombre_mostrado = NEW.codigo WHERE id = c.id;
  END IF;
  RETURN NEW;
END; $$;