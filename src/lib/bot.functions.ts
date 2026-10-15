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
        siempreVentana: true,
      },
    });
    return { salidas };
  });

/** Responde al bot como si fuera el vendedor que tiene la sesión abierta (botones "Lo tomo", resultados...). */
export const simularVendedor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ texto: z.string().max(1000).optional(), opcionId: z.string().max(200).optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { procesarMensajeVendedor } = await import("@/lib/bot/vendedores.server");
    const { data: yo } = await context.supabase.from("usuarios_perfil").select("*").eq("id", context.userId).single();
    if (!yo) throw new Error("Su usuario no tiene perfil.");
    const salidas: SalidaSimulada[] = [];
    await procesarMensajeVendedor(
      context.supabase,
      {
        cliente: async () => null,
        vendedor: async (_tel, nombre, salida) => {
          salidas.push({ para: "vendedor", nombre, salida });
        },
        siempreVentana: true,
      },
      // En el simulador el vendedor siempre "tiene" WhatsApp para poder ver las respuestas.
      { ...yo, whatsapp: yo.whatsapp ?? "0000000000" },
      { texto: data.texto, opcionId: data.opcionId },
    );
    return { salidas };
  });

/** Estado en Meta de las plantillas de avisos a vendedores. */
export const estadoPlantillasVendedores = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { consultarMeta } = await import("@/lib/whatsapp.server");
    const { DEFINICIONES_PLANTILLAS } = await import("@/lib/bot/vendedores.server");
    const r = await consultarMeta(
      `${process.env["WHATSAPP_WABA_ID"] ?? ""}/message_templates?fields=name,status,language,rejected_reason&limit=200`,
    );
    const lista = ((r.datos as { data?: Array<{ name: string; status: string; language: string; rejected_reason?: string }> })?.data ?? []);
    return {
      error: r.ok ? null : JSON.stringify(r.datos),
      plantillas: DEFINICIONES_PLANTILLAS.map((d) => {
        const m = lista.find((x) => x.name === d.name && x.language === "es_MX");
        return { nombre: d.name, estado: m?.status ?? "NO CREADA", motivo: m?.rejected_reason ?? null };
      }),
    };
  });

/** Registra en Meta las plantillas de avisos a vendedores que falten. */
export const crearPlantillasVendedores = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { publicarMeta } = await import("@/lib/whatsapp.server");
    const { DEFINICIONES_PLANTILLAS } = await import("@/lib/bot/vendedores.server");
    const waba = process.env["WHATSAPP_WABA_ID"] ?? "";
    const resultados: Array<{ nombre: string; ok: boolean; detalle: string }> = [];
    for (const d of DEFINICIONES_PLANTILLAS) {
      const r = await publicarMeta(`${waba}/message_templates`, { ...d, language: "es_MX", category: "UTILITY" });
      resultados.push({ nombre: d.name, ok: r.ok, detalle: JSON.stringify(r.datos) });
    }
    return resultados;
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
      consultarMeta(`${phoneId}?fields=display_phone_number,verified_name,name_status,code_verification_status,quality_rating,status,platform_type,account_mode,messaging_limit_tier`),
      consultarMeta(`${wabaId}?fields=name,account_review_status,business_verification_status,currency`),
      consultarMeta(`${wabaId}/message_templates?fields=name,language,status&limit=20`),
    ]);
    // Se devuelve como texto: la respuesta de Meta no tiene un tipo fijo.
    return JSON.stringify({ numero, cuenta, plantillas }, null, 2);
  });

/**
 * Revisa si la cuenta de WhatsApp está suscrita a la app (sin esto no llegan los mensajes
 * de los clientes al webhook) y, si se pide, la suscribe.
 */
export const suscripcionWhatsApp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ suscribir: z.boolean().default(false) }).parse(d))
  .handler(async ({ data }) => {
    const { consultarMeta, publicarMeta } = await import("@/lib/whatsapp.server");
    const wabaId = process.env["WHATSAPP_WABA_ID"] ?? "";
    const resultado: Record<string, unknown> = {};
    if (data.suscribir) resultado["suscribir"] = await publicarMeta(`${wabaId}/subscribed_apps`, {});
    resultado["apps_suscritas"] = await consultarMeta(`${wabaId}/subscribed_apps`);
    return JSON.stringify(resultado, null, 2);
  });

/**
 * Registra en la API de WhatsApp el número configurado (WHATSAPP_PHONE_NUMBER_ID) con un PIN de
 * 6 dígitos (verificación en dos pasos). Necesario cuando el número aparece como "Pendiente".
 */
export const registrarNumero = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ pin: z.string().regex(/^\d{6}$/, "El PIN debe tener 6 dígitos") }).parse(d))
  .handler(async ({ data }) => {
    const { publicarMeta, consultarMeta } = await import("@/lib/whatsapp.server");
    const phoneId = process.env["WHATSAPP_PHONE_NUMBER_ID"] ?? "";
    const registro = await publicarMeta(`${phoneId}/register`, { messaging_product: "whatsapp", pin: data.pin });
    const numero = await consultarMeta(`${phoneId}?fields=display_phone_number,verified_name,name_status,status,code_verification_status`);
    return JSON.stringify({ registro, numero }, null, 2);
  });

/** Últimos mensajes y avisos que llegaron al webhook (para saber si Meta está entregando). */
export const ultimosRecibidos = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("mensajes")
      .select("creado_en, autor, tipo, contenido, estado")
      .eq("direccion", "entrante")
      .order("creado_en", { ascending: false })
      .limit(8);
    const filas = (data ?? []).map(
      (m) => `${new Date(m.creado_en).toLocaleString("es-MX", { timeZone: "America/Mexico_City" })} · ${m.autor} · ${m.estado ?? ""} · ${(m.contenido ?? `[${m.tipo}]`).slice(0, 120)}`,
    );
    return filas.length ? filas.join("\n") : "Todavía no ha llegado ningún mensaje al webhook.";
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

/** Pasa a los vendedores un contacto que no terminó la encuesta (crea su prospecto incompleto). */
export const pasarContactoAVendedores = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ contactoId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const motor = await import("@/lib/bot/motor.server");
    const { canalWhatsApp } = await import("@/lib/bot/canal.server");
    return motor.pasarContactoAVendedores(context.supabase, canalWhatsApp, data.contactoId);
  });
