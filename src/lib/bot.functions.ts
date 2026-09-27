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
