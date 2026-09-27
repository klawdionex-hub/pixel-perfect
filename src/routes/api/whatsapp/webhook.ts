// Webhook de la API de WhatsApp (Meta). URL para Meta: https://<dominio>/api/whatsapp/webhook
import { createFileRoute } from "@tanstack/react-router";

type MensajeMeta = {
  from: string;
  id: string;
  type: string;
  text?: { body: string };
  interactive?: {
    type: string;
    list_reply?: { id: string; title: string };
    button_reply?: { id: string; title: string };
  };
  button?: { text: string; payload: string };
  image?: { id: string; caption?: string };
  video?: { id: string; caption?: string };
  document?: { id: string; caption?: string; filename?: string };
  audio?: { id: string };
  location?: { latitude: number; longitude: number; name?: string; address?: string };
};

type EstadoMeta = {
  id: string;
  status: string;
  timestamp: string;
  recipient_id: string;
  errors?: Array<{ code: number; title?: string; message?: string }>;
};

type CuerpoMeta = {
  entry?: Array<{
    changes?: Array<{ value?: { messages?: MensajeMeta[]; statuses?: EstadoMeta[] } }>;
  }>;
};

export const Route = createFileRoute("/api/whatsapp/webhook")({
  server: {
    handlers: {
      // Verificación del webhook al configurarlo en Meta.
      GET: ({ request }) => {
        const url = new URL(request.url);
        const esperado = process.env["WHATSAPP_VERIFY_TOKEN"];
        if (
          url.searchParams.get("hub.mode") === "subscribe" &&
          esperado &&
          url.searchParams.get("hub.verify_token") === esperado
        ) {
          return new Response(url.searchParams.get("hub.challenge") ?? "", { status: 200 });
        }
        return new Response("Forbidden", { status: 403 });
      },

      POST: async ({ request }) => {
        const cuerpo = await request.text();
        const { verificarFirma } = await import("@/lib/whatsapp.server");
        if (!(await verificarFirma(cuerpo, request.headers.get("x-hub-signature-256")))) {
          return new Response("Firma inválida", { status: 401 });
        }

        let datos: CuerpoMeta;
        try {
          datos = JSON.parse(cuerpo) as CuerpoMeta;
        } catch {
          return new Response("JSON inválido", { status: 400 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { procesarMensajeCliente, procesarMensajeVendedor, buscarVendedorPorTelefono } = await import(
          "@/lib/bot/motor.server"
        );
        const { canalWhatsApp, guardarMediaWhatsApp } = await import("@/lib/bot/canal.server");
        const { normalizarTelefono } = await import("@/lib/bot/salida");

        for (const entry of datos.entry ?? []) {
          for (const change of entry.changes ?? []) {
            const valor = change.value ?? {};

            for (const st of valor.statuses ?? []) {
              await actualizarEstado(supabaseAdmin, st);
            }

            for (const m of valor.messages ?? []) {
              try {
                const telefono = normalizarTelefono(m.from);
                const vendedor = await buscarVendedorPorTelefono(supabaseAdmin, telefono);
                if (vendedor?.activo) {
                  await procesarMensajeVendedor(supabaseAdmin, canalWhatsApp, vendedor);
                  continue;
                }

                const media = m.image ?? m.video ?? m.document ?? m.audio;
                let archivo: { url: string; tipo: string } | undefined;
                if (media?.id) {
                  try {
                    const g = await guardarMediaWhatsApp(media.id, telefono);
                    archivo = { url: g.url, tipo: m.type };
                  } catch (err) {
                    console.error("[webhook] No se pudo guardar el archivo", err);
                  }
                }

                const textoMensaje =
                  m.text?.body ??
                  m.interactive?.list_reply?.title ??
                  m.interactive?.button_reply?.title ??
                  m.button?.text ??
                  (m.location
                    ? `Ubicación: ${m.location.name ?? ""} ${m.location.address ?? ""} https://maps.google.com/?q=${m.location.latitude},${m.location.longitude}`.trim()
                    : undefined) ??
                  (m.image?.caption || m.video?.caption || m.document?.caption || undefined);

                await procesarMensajeCliente({
                  db: supabaseAdmin,
                  canal: canalWhatsApp,
                  telefono,
                  entrada: {
                    texto: textoMensaje,
                    opcionId: m.interactive?.list_reply?.id ?? m.interactive?.button_reply?.id ?? m.button?.payload,
                    media: archivo,
                    tipo: m.type,
                    waMessageId: m.id,
                  },
                });
              } catch (err) {
                console.error("[webhook] Error al procesar mensaje", m.id, err);
              }
            }
          }
        }

        return new Response("OK", { status: 200 });
      },
    },
  },
});

async function actualizarEstado(
  db: Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"],
  st: EstadoMeta,
) {
  const err = st.errors?.[0];
  if (err) console.error("[webhook] Meta no entregó el mensaje", st.id, err);
  const estado = st.status === "failed" ? `fallido${err ? `: ${err.code} ${err.title ?? err.message ?? ""}`.trimEnd() : ""}` : st.status === "delivered" ? "entregado" : st.status === "read" ? "leido" : "enviado";
  await db.from("mensajes").update({ estado }).eq("wa_message_id", st.id);
  const cuando = new Date(Number(st.timestamp) * 1000).toISOString();
  if (st.status === "delivered") {
    await db.from("campana_destinatarios").update({ entregado_en: cuando, estado }).eq("wa_message_id", st.id);
  } else if (st.status === "read") {
    await db.from("campana_destinatarios").update({ leido_en: cuando, estado }).eq("wa_message_id", st.id);
  } else if (st.status === "failed") {
    await db.from("campana_destinatarios").update({ estado }).eq("wa_message_id", st.id);
  }
}
