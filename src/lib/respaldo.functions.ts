import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Json } from "@/integrations/supabase/types";

/** Todas las tablas del programa, en el orden en que se vuelven a cargar en otro servidor. */
const TABLAS = [
  "configuracion", "servicios", "usuarios_perfil", "contactos", "estado_conversacion", "solicitudes", "mensajes", "archivos",
  "plantillas", "campanas", "campana_destinatarios", "clics", "preguntas_frecuentes_log",
  "equipos_catalogo", "material_venta", "material_uso", "cotizaciones", "manuales", "manual_procedimientos",
] as const;

/**
 * Respaldo completo para poder mudar el programa: todas las tablas, la lista de archivos guardados (fotos, PDF de
 * cotizaciones y manuales, con su dirección para bajarlos) y los correos de los usuarios del panel.
 * Las contraseñas no se pueden sacar: en el servidor nuevo cada usuario pone una nueva.
 * Solo para administradores, porque lleva los teléfonos y conversaciones de todos los clientes.
 */
export const respaldoCompleto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { esAdministrador } = await import("@/lib/bot/vendedores.server");
    if (!(await esAdministrador(supabaseAdmin, { id: context.userId }))) throw new Error("Solo un administrador puede descargar el respaldo completo.");

    const tablas: Record<string, Json[]> = {};
    for (const tabla of TABLAS) {
      const filas: Json[] = [];
      for (let desde = 0; ; desde += 1000) {
        const consulta = supabaseAdmin.from(tabla).select("*").range(desde, desde + 999);
        const conOrden = await consulta.order("id" as never);
        const { data, error } = conOrden.error ? await supabaseAdmin.from(tabla).select("*").range(desde, desde + 999) : conOrden;
        if (error) throw new Error(`No se pudo leer ${tabla}: ${error.message}`);
        filas.push(...((data ?? []) as unknown as Json[]));
        if (!data || data.length < 1000) break;
      }
      tablas[tabla] = filas;
    }

    // Archivos del bucket "media" (público): ruta y dirección para bajarlos.
    const archivos: Array<{ ruta: string; url: string; tamano: number | null }> = [];
    const recorrer = async (carpeta: string) => {
      for (let desde = 0; ; desde += 1000) {
        const { data, error } = await supabaseAdmin.storage.from("media").list(carpeta, { limit: 1000, offset: desde });
        if (error) throw new Error(`No se pudo leer la carpeta de archivos ${carpeta || "/"}: ${error.message}`);
        for (const f of data ?? []) {
          const ruta = carpeta ? `${carpeta}/${f.name}` : f.name;
          if (f.id === null) await recorrer(ruta);
          else archivos.push({ ruta, url: supabaseAdmin.storage.from("media").getPublicUrl(ruta).data.publicUrl, tamano: (f.metadata as { size?: number } | null)?.size ?? null });
        }
        if (!data || data.length < 1000) break;
      }
    };
    await recorrer("");

    const usuarios: Array<{ id: string; correo: string | null; creado: string }> = [];
    for (let pagina = 1; ; pagina++) {
      const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page: pagina, perPage: 1000 });
      if (error) throw new Error(`No se pudo leer los usuarios: ${error.message}`);
      usuarios.push(...data.users.map((u) => ({ id: u.id, correo: u.email ?? null, creado: u.created_at })));
      if (data.users.length < 1000) break;
    }

    return {
      programa: "AFPAM Texcoco",
      creado: new Date().toISOString(),
      cuantos: Object.fromEntries(Object.entries(tablas).map(([k, v]) => [k, v.length])),
      tablas,
      archivos,
      usuarios,
    };
  });
