import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Salida } from "@/lib/bot/salida";

export type SalidaSimulada = { para: "cliente" | "vendedor"; nombre?: string | undefined; salida: Salida };

const telefonoSimulado = (userId: string) => `sim-${userId.slice(0, 8)}`;

/** Envía un mensaje al bot como si fuera un cliente, sin usar WhatsApp. */
export const simularMensaje = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ texto: z.string().max(1000).optional(), opcionId: z.string().max(40).optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { procesarMensajeCliente } = await import("@/lib/bot/motor.server");
    const salidas: SalidaSimulada[] = [];
    await procesarMensajeCliente({
      db: context.supabase,
      telefono: telefonoSimulado(context.userId),
      esPrueba: true,
      entrada: { texto: data.texto, opcionId: data.opcionId, tipo: "texto" },
      canal: {
        cliente: async (_tel, salida) => {
          salidas.push({ para: "cliente", salida });
          return null;
        },
        vendedor: async (_tel, nombre, salida) => {
          salidas.push({ para: "vendedor", nombre, salida });
        },
      },
    });
    return { salidas };
  });

/** Borra la conversación de prueba del usuario actual. */
export const reiniciarSimulacion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { error } = await context.supabase
      .from("contactos")
      .delete()
      .eq("telefono", telefonoSimulado(context.userId));
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Ejecuta al momento la tarea de recordatorios (la misma que corre programada). */
export const ejecutarRecordatorios = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { procesarRecordatorios } = await import("@/lib/bot/motor.server");
    const { canalWhatsApp } = await import("@/lib/bot/canal.server");
    return procesarRecordatorios(context.supabase, canalWhatsApp);
  });

/** Revisa con Meta el token, el número y la cuenta de WhatsApp. No revela los secretos. */
export const diagnosticoWhatsApp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { consultarMeta } = await import("@/lib/whatsapp.server");
    const phoneId = process.env["WHATSAPP_PHONE_NUMBER_ID"] ?? "";
    const wabaId = process.env["WHATSAPP_WABA_ID"] ?? "";
    const [numero, cuenta, plantillas] = await Promise.all([
      consultarMeta(`${phoneId}?fields=display_phone_number,verified_name,code_verification_status,quality_rating,status,platform_type,account_mode`),
      consultarMeta(`${wabaId}?fields=name,account_review_status,business_verification_status,currency`),
      consultarMeta(`${wabaId}/message_templates?fields=name,language,status&limit=20`),
    ]);
    // Se devuelve como texto: la respuesta de Meta no tiene un tipo fijo.
    return JSON.stringify({ numero, cuenta, plantillas }, null, 2);
  });

/** Envía la plantilla hello_world a un número para comprobar que los envíos funcionan. */
export const enviarPlantillaPrueba = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        telefono: z.string().min(10).max(20),
        plantilla: z.string().max(80).default("hello_world"),
        idioma: z.string().max(10).default("en_US"),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { enviarWhatsApp } = await import("@/lib/whatsapp.server");
    let digitos = data.telefono.replace(/\D/g, "");
    if (digitos.length === 10) digitos = "52" + digitos;
    try {
      const id = await enviarWhatsApp(digitos, { tipo: "plantilla", nombre: data.plantilla, idioma: data.idioma });
      // Se registra para que el webhook anote si Meta lo entregó o por qué falló.
      await context.supabase.from("mensajes").insert({
        direccion: "saliente",
        autor: "sistema",
        tipo: "plantilla",
        contenido: `Prueba ${data.plantilla} a ${digitos}`,
        wa_message_id: id,
        estado: "enviado",
        es_ejemplo: true,
      });
      return { ok: true as const, enviadoA: digitos, id };
    } catch (e) {
      return { ok: false as const, enviadoA: digitos, error: e instanceof Error ? e.message : String(e) };
    }
  });

/** Estado de entrega que Meta reportó por el webhook para un mensaje enviado. */
export const estadoEnvio = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().min(5).max(200) }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: fila } = await context.supabase
      .from("mensajes")
      .select("estado, creado_en")
      .eq("wa_message_id", data.id)
      .maybeSingle();
    return { estado: fila?.estado ?? "sin registro", enviado: fila?.creado_en ?? null };
  });

/** Indica qué secretos de WhatsApp están configurados (sin revelar sus valores). */
export const estadoIntegracion = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const hay = (n: string) => !!process.env[n];
    return {
      WHATSAPP_TOKEN: hay("WHATSAPP_TOKEN"),
      WHATSAPP_PHONE_NUMBER_ID: hay("WHATSAPP_PHONE_NUMBER_ID"),
      WHATSAPP_WABA_ID: hay("WHATSAPP_WABA_ID"),
      WHATSAPP_VERIFY_TOKEN: hay("WHATSAPP_VERIFY_TOKEN"),
      META_APP_SECRET: hay("META_APP_SECRET"),
      SUPABASE_SERVICE_ROLE_KEY: hay("SUPABASE_SERVICE_ROLE_KEY"),
      CRON: hay("LOVABLE_CRON_SECRET") || hay("BOT_CRON_SECRET"),
    };
  });
