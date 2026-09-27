import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const crearUsuario = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        correo: z.string().email().max(255),
        contrasena: z.string().min(8).max(72),
        nombre: z.string().min(1).max(100),
        whatsapp: z.string().max(20).optional(),
        es_vendedor: z.boolean(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: yo } = await context.supabase
      .from("usuarios_perfil")
      .select("activo")
      .eq("id", context.userId)
      .single();
    if (!yo?.activo) throw new Error("No autorizado");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: creado, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.correo,
      password: data.contrasena,
      email_confirm: true,
    });
    if (error) throw new Error(error.message);
    const { error: e2 } = await supabaseAdmin
      .from("usuarios_perfil")
      .upsert({
        id: creado.user.id,
        nombre: data.nombre,
        whatsapp: data.whatsapp || null,
        es_vendedor: data.es_vendedor,
      });
    if (e2) throw new Error(e2.message);
    return { ok: true };
  });
