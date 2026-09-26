-- ============ USUARIOS ============
CREATE TABLE public.usuarios_perfil (
  id UUID PRIMARY KEY,
  nombre TEXT NOT NULL DEFAULT '',
  whatsapp TEXT,
  es_vendedor BOOLEAN NOT NULL DEFAULT true,
  recibe_resumen_semanal BOOLEAN NOT NULL DEFAULT false,
  activo BOOLEAN NOT NULL DEFAULT true,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.usuarios_perfil TO authenticated;
GRANT ALL ON public.usuarios_perfil TO service_role;
ALTER TABLE public.usuarios_perfil ENABLE ROW LEVEL SECURITY;
CREATE POLICY "usuarios_perfil_auth" ON public.usuarios_perfil FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.crear_perfil_usuario()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.usuarios_perfil (id, nombre, whatsapp)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'nombre', split_part(NEW.email, '@', 1)), NEW.raw_user_meta_data->>'whatsapp')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END; $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.crear_perfil_usuario();

-- ============ SERVICIOS ============
CREATE TABLE public.servicios (
  codigo INTEGER PRIMARY KEY,
  nombre TEXT NOT NULL,
  tipo TEXT NOT NULL,
  porcentaje_comision NUMERIC(5,2) NOT NULL DEFAULT 3,
  requiere_equipo BOOLEAN NOT NULL DEFAULT false,
  descripcion TEXT,
  catalogo_url TEXT,
  activo BOOLEAN NOT NULL DEFAULT true
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.servicios TO authenticated;
GRANT ALL ON public.servicios TO service_role;
ALTER TABLE public.servicios ENABLE ROW LEVEL SECURITY;
CREATE POLICY "servicios_auth" ON public.servicios FOR ALL TO authenticated USING (true) WITH CHECK (true);

INSERT INTO public.servicios (codigo, nombre, tipo, requiere_equipo) VALUES
 (1,'Abatible hacia afuera','instalación',false),
 (2,'Abatible hacia adentro','instalación',false),
 (3,'Elevadizo con paneles tipo americano','instalación',false),
 (4,'Corredizo','instalación',false),
 (5,'Plegadizas','instalación',false),
 (6,'De maroma','instalación',false),
 (7,'Cortina eléctrica','instalación',false),
 (8,'Reparación','reparación',true),
 (9,'Mantenimiento','mantenimiento',true);

-- ============ CONTACTOS ============
CREATE TABLE public.contactos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  telefono TEXT NOT NULL UNIQUE,
  nombre TEXT,
  municipio TEXT,
  en_estado_de_mexico BOOLEAN NOT NULL DEFAULT true,
  es_cliente BOOLEAN NOT NULL DEFAULT false,
  nombre_mostrado TEXT,
  acepta_publicidad BOOLEAN NOT NULL DEFAULT true,
  fecha_baja_publicidad TIMESTAMPTZ,
  origen TEXT,
  nivel_interes TEXT NOT NULL DEFAULT 'medio',
  primer_contacto TIMESTAMPTZ NOT NULL DEFAULT now(),
  ultimo_mensaje TIMESTAMPTZ,
  es_ejemplo BOOLEAN NOT NULL DEFAULT false
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contactos TO authenticated;
GRANT ALL ON public.contactos TO service_role;
ALTER TABLE public.contactos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "contactos_auth" ON public.contactos FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============ SOLICITUDES ============
CREATE SEQUENCE public.solicitudes_numero_seq START 1;
GRANT USAGE, SELECT ON SEQUENCE public.solicitudes_numero_seq TO authenticated, service_role;

CREATE TABLE public.solicitudes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contacto_id UUID NOT NULL REFERENCES public.contactos(id) ON DELETE CASCADE,
  numero INTEGER NOT NULL UNIQUE DEFAULT nextval('public.solicitudes_numero_seq'),
  servicio_codigo INTEGER NOT NULL REFERENCES public.servicios(codigo),
  equipo_codigo INTEGER,
  etapa INTEGER NOT NULL DEFAULT 1,
  codigo TEXT,
  completa BOOLEAN NOT NULL DEFAULT false,
  fuera_de_horario BOOLEAN NOT NULL DEFAULT false,
  fuera_de_zona BOOLEAN NOT NULL DEFAULT false,
  urgente BOOLEAN NOT NULL DEFAULT false,
  datos JSONB NOT NULL DEFAULT '{}'::jsonb,
  vendedor_id UUID REFERENCES public.usuarios_perfil(id) ON DELETE SET NULL,
  tomada_en TIMESTAMPTZ,
  monto_venta NUMERIC(12,2),
  comision NUMERIC(12,2),
  notas TEXT,
  resultado_en TIMESTAMPTZ,
  creada_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  archivada_en TIMESTAMPTZ,
  es_ejemplo BOOLEAN NOT NULL DEFAULT false
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.solicitudes TO authenticated;
GRANT ALL ON public.solicitudes TO service_role;
ALTER TABLE public.solicitudes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "solicitudes_auth" ON public.solicitudes FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE INDEX idx_solicitudes_contacto ON public.solicitudes(contacto_id);
CREATE INDEX idx_solicitudes_codigo ON public.solicitudes(codigo);

CREATE OR REPLACE FUNCTION public.calcular_solicitud()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  parte_servicio TEXT;
  pct NUMERIC;
BEGIN
  IF NEW.servicio_codigo IN (8,9) AND NEW.equipo_codigo IS NOT NULL THEN
    parte_servicio := NEW.servicio_codigo::text || '.' || NEW.equipo_codigo::text;
  ELSE
    parte_servicio := NEW.servicio_codigo::text;
  END IF;
  NEW.codigo := parte_servicio || '-' || NEW.etapa::text || '-' || lpad(NEW.numero::text, 4, '0');

  SELECT porcentaje_comision INTO pct FROM public.servicios WHERE codigo = NEW.servicio_codigo;
  IF NEW.monto_venta IS NOT NULL THEN
    NEW.comision := round(NEW.monto_venta * COALESCE(pct, 3) / 100, 2);
  ELSE
    NEW.comision := NULL;
  END IF;

  IF NEW.etapa = 5 AND NEW.archivada_en IS NULL THEN NEW.archivada_en := now(); END IF;
  IF NEW.etapa IN (0,4) AND NEW.resultado_en IS NULL THEN NEW.resultado_en := now(); END IF;
  IF NEW.vendedor_id IS NOT NULL AND NEW.tomada_en IS NULL THEN NEW.tomada_en := now(); END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_calcular_solicitud BEFORE INSERT OR UPDATE ON public.solicitudes
  FOR EACH ROW EXECUTE FUNCTION public.calcular_solicitud();

CREATE OR REPLACE FUNCTION public.actualizar_nombre_mostrado()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  c RECORD;
  parte TEXT;
BEGIN
  SELECT * INTO c FROM public.contactos WHERE id = NEW.contacto_id;
  IF c IS NULL THEN RETURN NEW; END IF;

  IF NEW.servicio_codigo IN (8,9) AND NEW.equipo_codigo IS NOT NULL THEN
    parte := NEW.servicio_codigo::text || '.' || NEW.equipo_codigo::text;
  ELSE
    parte := NEW.servicio_codigo::text;
  END IF;

  IF NEW.etapa = 4 THEN
    UPDATE public.contactos SET es_cliente = true,
      nombre_mostrado = COALESCE(NULLIF(c.nombre, ''), 'Sin nombre') || ' (' || parte || '-' || lpad(NEW.numero::text,4,'0') || ')'
    WHERE id = c.id;
  ELSIF NOT c.es_cliente THEN
    UPDATE public.contactos SET nombre_mostrado = NEW.codigo WHERE id = c.id;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_nombre_mostrado AFTER INSERT OR UPDATE ON public.solicitudes
  FOR EACH ROW EXECUTE FUNCTION public.actualizar_nombre_mostrado();

-- ============ MENSAJES ============
CREATE TABLE public.mensajes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contacto_id UUID REFERENCES public.contactos(id) ON DELETE CASCADE,
  solicitud_id UUID REFERENCES public.solicitudes(id) ON DELETE SET NULL,
  direccion TEXT NOT NULL DEFAULT 'entrante',
  autor TEXT NOT NULL DEFAULT 'cliente',
  tipo TEXT NOT NULL DEFAULT 'texto',
  contenido TEXT,
  media_url TEXT,
  wa_message_id TEXT,
  estado TEXT,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  es_ejemplo BOOLEAN NOT NULL DEFAULT false
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mensajes TO authenticated;
GRANT ALL ON public.mensajes TO service_role;
ALTER TABLE public.mensajes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mensajes_auth" ON public.mensajes FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE INDEX idx_mensajes_solicitud ON public.mensajes(solicitud_id);

-- ============ ARCHIVOS ============
CREATE TABLE public.archivos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  solicitud_id UUID REFERENCES public.solicitudes(id) ON DELETE CASCADE,
  contacto_id UUID REFERENCES public.contactos(id) ON DELETE CASCADE,
  tipo TEXT,
  url TEXT NOT NULL,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.archivos TO authenticated;
GRANT ALL ON public.archivos TO service_role;
ALTER TABLE public.archivos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "archivos_auth" ON public.archivos FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============ ESTADO CONVERSACION ============
CREATE TABLE public.estado_conversacion (
  contacto_id UUID PRIMARY KEY REFERENCES public.contactos(id) ON DELETE CASCADE,
  flujo_actual TEXT,
  paso_actual TEXT,
  intentos_fallidos INTEGER NOT NULL DEFAULT 0,
  solicitud_id UUID REFERENCES public.solicitudes(id) ON DELETE SET NULL,
  ultima_actividad TIMESTAMPTZ NOT NULL DEFAULT now(),
  recordatorios_enviados INTEGER NOT NULL DEFAULT 0,
  en_manos_de_vendedor BOOLEAN NOT NULL DEFAULT false
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.estado_conversacion TO authenticated;
GRANT ALL ON public.estado_conversacion TO service_role;
ALTER TABLE public.estado_conversacion ENABLE ROW LEVEL SECURITY;
CREATE POLICY "estado_conversacion_auth" ON public.estado_conversacion FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============ PLANTILLAS ============
CREATE TABLE public.plantillas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL,
  texto TEXT NOT NULL DEFAULT '',
  imagen_url TEXT,
  servicio_relacionado INTEGER REFERENCES public.servicios(codigo),
  botones JSONB NOT NULL DEFAULT '[]'::jsonb,
  estado_meta TEXT NOT NULL DEFAULT 'borrador',
  nombre_meta TEXT,
  idioma TEXT NOT NULL DEFAULT 'es_MX',
  veces_usada INTEGER NOT NULL DEFAULT 0,
  tasa_interaccion NUMERIC(5,2) NOT NULL DEFAULT 0,
  creada_en TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.plantillas TO authenticated;
GRANT ALL ON public.plantillas TO service_role;
ALTER TABLE public.plantillas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "plantillas_auth" ON public.plantillas FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============ CAMPANAS ============
CREATE TABLE public.campanas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL,
  plantilla_id UUID REFERENCES public.plantillas(id) ON DELETE SET NULL,
  estado TEXT NOT NULL DEFAULT 'borrador',
  fecha_inicio DATE,
  dias_reparto INTEGER NOT NULL DEFAULT 1,
  max_por_dia INTEGER NOT NULL DEFAULT 100,
  hora_inicio TIME NOT NULL DEFAULT '09:00',
  hora_fin TIME NOT NULL DEFAULT '17:00',
  dias_minimos_entre_campanas INTEGER NOT NULL DEFAULT 15,
  enviados INTEGER NOT NULL DEFAULT 0,
  entregados INTEGER NOT NULL DEFAULT 0,
  leidos INTEGER NOT NULL DEFAULT 0,
  me_interesa INTEGER NOT NULL DEFAULT 0,
  clics INTEGER NOT NULL DEFAULT 0,
  bajas INTEGER NOT NULL DEFAULT 0,
  creada_en TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.campanas TO authenticated;
GRANT ALL ON public.campanas TO service_role;
ALTER TABLE public.campanas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "campanas_auth" ON public.campanas FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.campana_destinatarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campana_id UUID NOT NULL REFERENCES public.campanas(id) ON DELETE CASCADE,
  contacto_id UUID NOT NULL REFERENCES public.contactos(id) ON DELETE CASCADE,
  programado_para TIMESTAMPTZ,
  enviado_en TIMESTAMPTZ,
  entregado_en TIMESTAMPTZ,
  leido_en TIMESTAMPTZ,
  respondio BOOLEAN NOT NULL DEFAULT false,
  tipo_interaccion TEXT,
  wa_message_id TEXT,
  estado TEXT NOT NULL DEFAULT 'pendiente'
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.campana_destinatarios TO authenticated;
GRANT ALL ON public.campana_destinatarios TO service_role;
ALTER TABLE public.campana_destinatarios ENABLE ROW LEVEL SECURITY;
CREATE POLICY "campana_destinatarios_auth" ON public.campana_destinatarios FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============ CLICS ============
CREATE TABLE public.clics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token TEXT NOT NULL UNIQUE,
  contacto_id UUID REFERENCES public.contactos(id) ON DELETE SET NULL,
  campana_id UUID REFERENCES public.campanas(id) ON DELETE SET NULL,
  destino TEXT,
  url_destino TEXT,
  clic_en TIMESTAMPTZ
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clics TO authenticated;
GRANT ALL ON public.clics TO service_role;
ALTER TABLE public.clics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "clics_auth" ON public.clics FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============ PREGUNTAS FRECUENTES ============
CREATE TABLE public.preguntas_frecuentes_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contacto_id UUID REFERENCES public.contactos(id) ON DELETE SET NULL,
  pregunta TEXT NOT NULL,
  respuesta_ia TEXT,
  creada_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  es_ejemplo BOOLEAN NOT NULL DEFAULT false
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.preguntas_frecuentes_log TO authenticated;
GRANT ALL ON public.preguntas_frecuentes_log TO service_role;
ALTER TABLE public.preguntas_frecuentes_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pfl_auth" ON public.preguntas_frecuentes_log FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============ CONFIGURACION ============
CREATE TABLE public.configuracion (
  id BOOLEAN PRIMARY KEY DEFAULT true,
  nombre_negocio TEXT NOT NULL DEFAULT 'AFPAM Texcoco - Puertas Automáticas',
  telefono_negocio TEXT NOT NULL DEFAULT '+525959544763',
  horario TEXT NOT NULL DEFAULT 'Lunes a viernes 08:00-17:00, sábado 08:00-14:00, domingo cerrado',
  cobertura TEXT NOT NULL DEFAULT 'Estado de México',
  ubicacion_maps_url TEXT,
  latitud NUMERIC(10,6),
  longitud NUMERIC(10,6),
  direccion TEXT,
  link_resena_google TEXT,
  facebook_url TEXT,
  instagram_url TEXT,
  otras_redes TEXT,
  formas_pago TEXT DEFAULT 'Efectivo, transferencia y depósito bancario',
  garantia TEXT DEFAULT 'Garantía de un año en instalación y equipo',
  informacion_para_ia TEXT DEFAULT '',
  texto_saludo TEXT DEFAULT 'Buen día. Le atiende AFPAM Texcoco, Puertas Automáticas. ¿En qué servicio está interesado?',
  texto_pregunta_servicio TEXT DEFAULT 'Indique el tipo de puerta o servicio que requiere.',
  texto_pregunta_medidas TEXT DEFAULT 'Indique las medidas aproximadas del claro (ancho y alto).',
  texto_pregunta_material TEXT DEFAULT 'Indique el material deseado.',
  texto_pregunta_municipio TEXT DEFAULT 'Indique el municipio donde se realizaría el trabajo.',
  texto_pregunta_horario TEXT DEFAULT 'Indique el horario en que podemos contactarle.',
  texto_recordatorio_cliente_1 TEXT DEFAULT 'Seguimos a sus órdenes para continuar con su solicitud.',
  texto_recordatorio_cliente_2 TEXT DEFAULT 'Le recordamos que su solicitud continúa abierta.',
  texto_fuera_de_horario TEXT DEFAULT 'Nuestro horario de atención es de lunes a viernes de 08:00 a 17:00 y sábado de 08:00 a 14:00. Le responderemos en cuanto abramos.',
  texto_fuera_de_zona TEXT DEFAULT 'Actualmente damos servicio únicamente en el Estado de México.',
  texto_traspaso_asesor TEXT DEFAULT 'Un asesor continuará la atención de su solicitud.',
  texto_cliente_regresa TEXT DEFAULT 'Es un gusto saludarle nuevamente. ¿En qué podemos ayudarle?',
  horas_recordatorio_cliente_1 INTEGER NOT NULL DEFAULT 2,
  horas_recordatorio_cliente_2 INTEGER NOT NULL DEFAULT 20,
  horas_incompleto INTEGER NOT NULL DEFAULT 24,
  horas_recordatorio_vendedor INTEGER NOT NULL DEFAULT 2,
  max_recordatorios_vendedor_dia INTEGER NOT NULL DEFAULT 2,
  horas_seguimiento_resultado INTEGER NOT NULL DEFAULT 24,
  dias_seguimiento_repetido INTEGER NOT NULL DEFAULT 3,
  CONSTRAINT configuracion_fila_unica CHECK (id = true)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.configuracion TO authenticated;
GRANT ALL ON public.configuracion TO service_role;
ALTER TABLE public.configuracion ENABLE ROW LEVEL SECURITY;
CREATE POLICY "configuracion_auth" ON public.configuracion FOR ALL TO authenticated USING (true) WITH CHECK (true);
INSERT INTO public.configuracion (id) VALUES (true);

-- ============ STORAGE ============
CREATE POLICY "media_select_auth" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'media');
CREATE POLICY "media_insert_auth" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'media');
CREATE POLICY "media_update_auth" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'media');
CREATE POLICY "media_delete_auth" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'media');

-- ============ DATOS DE EJEMPLO ============
INSERT INTO public.contactos (telefono, nombre, municipio, en_estado_de_mexico, origen, nivel_interes, primer_contacto, ultimo_mensaje, es_ejemplo) VALUES
 ('+525551110001','Juan Pérez','Texcoco',true,'facebook','alto', now() - interval '20 days', now() - interval '1 day', true),
 ('+525551110002','María López','Chiconcuac',true,'google','medio', now() - interval '18 days', now() - interval '2 days', true),
 ('+525551110003','Carlos Ramírez','Atenco',true,'instagram','alto', now() - interval '15 days', now() - interval '3 days', true),
 ('+525551110004','Laura Sánchez','Chimalhuacán',true,'recomendación','bajo', now() - interval '13 days', now() - interval '5 days', true),
 ('+525551110005','Roberto Díaz','Ecatepec',true,'facebook','medio', now() - interval '11 days', now() - interval '1 day', true),
 ('+525551110006','Ana Martínez','Nezahualcóyotl',true,'google','alto', now() - interval '9 days', now() - interval '1 day', true),
 ('+525551110007','Miguel Torres','Texcoco',true,'facebook','medio', now() - interval '7 days', now() - interval '6 hours', true),
 ('+525551110008','Patricia Gómez','Los Reyes',true,'otro','bajo', now() - interval '5 days', now() - interval '2 days', true),
 ('+525551110009','Jorge Hernández','Puebla',false,'google','bajo', now() - interval '4 days', now() - interval '4 days', true),
 ('+525551110010','Silvia Castro','Tepetlaoxtoc',true,'instagram','alto', now() - interval '2 days', now() - interval '3 hours', true);

INSERT INTO public.solicitudes (contacto_id, servicio_codigo, equipo_codigo, etapa, completa, urgente, fuera_de_horario, fuera_de_zona, datos, monto_venta, creada_en, es_ejemplo)
SELECT c.id, s.servicio, s.equipo, s.etapa, s.completa, s.urgente, s.fh, s.fz, s.datos, s.monto, now() - (s.dias || ' days')::interval, true
FROM (VALUES
 ('+525551110001', 3, NULL, 4, true, false, false, false, '{"medidas":"4.00 x 2.40 m","material":"lámina lisa","tiene_porton":true}'::jsonb, 38500, 19),
 ('+525551110001', 9, 3, 1, false, false, false, false, '{"ultimo_mantenimiento":"hace 1 año"}'::jsonb, NULL, 1),
 ('+525551110002', 4, NULL, 2, true, false, false, false, '{"medidas":"3.50 x 2.30 m","material":"herrería"}'::jsonb, NULL, 17),
 ('+525551110003', 1, NULL, 3, true, true, false, false, '{"medidas":"3.00 x 2.20 m","horario_preferido":"mañana"}'::jsonb, NULL, 14),
 ('+525551110003', 8, 7, 4, true, false, false, false, '{"marca_motor":"Dagon","falla":"no sube"}'::jsonb, 6200, 12),
 ('+525551110004', 5, NULL, 0, false, false, true, false, '{"medidas":"5.00 x 2.50 m"}'::jsonb, NULL, 12),
 ('+525551110005', 7, NULL, 2, true, false, false, false, '{"medidas":"4.50 x 3.00 m","material":"lámina troquelada"}'::jsonb, NULL, 10),
 ('+525551110005', 8, 4, 1, false, true, false, false, '{"falla":"motor no responde"}'::jsonb, NULL, 1),
 ('+525551110006', 2, NULL, 4, true, false, false, false, '{"medidas":"3.20 x 2.40 m","material":"lámina lisa"}'::jsonb, 42000, 8),
 ('+525551110006', 9, 2, 5, true, false, false, false, '{"ultimo_mantenimiento":"hace 6 meses"}'::jsonb, NULL, 7),
 ('+525551110007', 6, NULL, 1, false, false, true, false, '{}'::jsonb, NULL, 1),
 ('+525551110008', 4, NULL, 3, true, false, false, false, '{"medidas":"3.60 x 2.30 m"}'::jsonb, NULL, 4),
 ('+525551110009', 1, NULL, 0, false, false, false, true, '{"medidas":"3.00 x 2.20 m"}'::jsonb, NULL, 4),
 ('+525551110010', 3, NULL, 1, true, true, false, false, '{"medidas":"4.20 x 2.60 m","material":"lámina lisa","horario_preferido":"tarde"}'::jsonb, NULL, 2),
 ('+525551110010', 8, 3, 2, true, false, false, false, '{"marca_motor":"Merik","falla":"se detiene a medio camino"}'::jsonb, NULL, 1)
) AS s(tel, servicio, equipo, etapa, completa, urgente, fh, fz, datos, monto, dias)
JOIN public.contactos c ON c.telefono = s.tel;

INSERT INTO public.preguntas_frecuentes_log (contacto_id, pregunta, respuesta_ia, es_ejemplo)
SELECT c.id, p.pregunta, p.respuesta, true
FROM (VALUES
 ('+525551110002','¿Cuánto cuesta un portón corredizo?','El costo depende de las medidas y el material. Con gusto le enviamos una cotización.'),
 ('+525551110004','¿Dan factura?','Sí, emitimos factura al realizar el pago.'),
 ('+525551110006','¿Cuánto tiempo tarda la instalación?','Generalmente entre 3 y 7 días hábiles según el modelo.'),
 ('+525551110007','¿Trabajan los domingos?','Nuestro horario es de lunes a viernes de 08:00 a 17:00 y sábado de 08:00 a 14:00.'),
 ('+525551110010','¿Qué garantía tienen?','Ofrecemos un año de garantía en instalación y equipo.')
) AS p(tel, pregunta, respuesta)
JOIN public.contactos c ON c.telefono = p.tel;