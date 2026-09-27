-- Seguridad: solo el personal activo (usuarios_perfil.activo = true) puede leer y
-- escribir datos. Antes bastaba con tener sesión, y cualquiera que se registrara
-- por la API pública de autenticación podía ver todo.
-- El bot (webhook y tareas) usa la clave de servicio y no se ve afectado.

CREATE OR REPLACE FUNCTION public.es_personal_activo()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.usuarios_perfil WHERE id = auth.uid() AND activo);
$$;
REVOKE ALL ON FUNCTION public.es_personal_activo() FROM public;
GRANT EXECUTE ON FUNCTION public.es_personal_activo() TO authenticated, service_role;

-- Las cuentas nuevas nacen inactivas, salvo la primera del sistema.
-- Las que se crean desde la página Usuarios se activan al crearlas.
CREATE OR REPLACE FUNCTION public.crear_perfil_usuario()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.usuarios_perfil (id, nombre, whatsapp, activo)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'nombre', split_part(NEW.email, '@', 1)),
    NEW.raw_user_meta_data->>'whatsapp',
    NOT EXISTS (SELECT 1 FROM public.usuarios_perfil WHERE activo)
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END; $$;

DO $$
DECLARE
  t TEXT;
  politicas CONSTANT TEXT[][] := ARRAY[
    ['usuarios_perfil', 'usuarios_perfil_auth'],
    ['servicios', 'servicios_auth'],
    ['contactos', 'contactos_auth'],
    ['solicitudes', 'solicitudes_auth'],
    ['mensajes', 'mensajes_auth'],
    ['archivos', 'archivos_auth'],
    ['estado_conversacion', 'estado_conversacion_auth'],
    ['plantillas', 'plantillas_auth'],
    ['campanas', 'campanas_auth'],
    ['campana_destinatarios', 'campana_destinatarios_auth'],
    ['clics', 'clics_auth'],
    ['preguntas_frecuentes_log', 'pfl_auth'],
    ['configuracion', 'configuracion_auth']
  ];
  i INT;
BEGIN
  FOR i IN 1 .. array_length(politicas, 1) LOOP
    t := politicas[i][1];
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', politicas[i][2], t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_personal', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (public.es_personal_activo()) WITH CHECK (public.es_personal_activo())',
      t || '_personal', t
    );
  END LOOP;
END $$;

-- Archivos: el bucket "media" es público para lectura (WhatsApp necesita el enlace),
-- pero subir, cambiar o borrar queda solo para el personal activo.
DROP POLICY IF EXISTS "media_select_auth" ON storage.objects;
DROP POLICY IF EXISTS "media_insert_auth" ON storage.objects;
DROP POLICY IF EXISTS "media_update_auth" ON storage.objects;
DROP POLICY IF EXISTS "media_delete_auth" ON storage.objects;
DROP POLICY IF EXISTS "media_select_personal" ON storage.objects;
DROP POLICY IF EXISTS "media_insert_personal" ON storage.objects;
DROP POLICY IF EXISTS "media_update_personal" ON storage.objects;
DROP POLICY IF EXISTS "media_delete_personal" ON storage.objects;
CREATE POLICY "media_select_personal" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'media' AND public.es_personal_activo());
CREATE POLICY "media_insert_personal" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'media' AND public.es_personal_activo());
CREATE POLICY "media_update_personal" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'media' AND public.es_personal_activo());
CREATE POLICY "media_delete_personal" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'media' AND public.es_personal_activo());
