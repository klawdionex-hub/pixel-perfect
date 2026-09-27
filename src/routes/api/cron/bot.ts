// Tarea programada del bot (recordatorios a clientes y solicitudes incompletas).
// Llamar cada 5 minutos: POST /api/cron/bot con "Authorization: Bearer <secreto>".
// Acepta LOVABLE_CRON_SECRET (cron de Lovable) o BOT_CRON_SECRET (cron externo).
import { createFileRoute } from "@tanstack/react-router";

async function autorizado(request: Request): Promise<Response | null> {
  const propio = process.env["BOT_CRON_SECRET"];
  const token = /^Bearer (\S+)$/.exec(request.headers.get("authorization") ?? "")?.[1];
  if (propio && token) {
    const { createHash, timingSafeEqual } = await import("node:crypto");
    const h = (v: string) => createHash("sha256").update(v, "utf8").digest();
    if (timingSafeEqual(h(token), h(propio))) return null;
  }
  if (!process.env["LOVABLE_CRON_SECRET"]) return new Response("Unauthorized", { status: 401 });
  const { authenticateCronRequest } = await import("@/integrations/supabase/cron-auth");
  return authenticateCronRequest(request);
}

async function ejecutar(request: Request) {
  const rechazo = await autorizado(request);
  if (rechazo) return rechazo;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { procesarRecordatorios } = await import("@/lib/bot/motor.server");
  const { canalWhatsApp } = await import("@/lib/bot/canal.server");
  const resumen = await procesarRecordatorios(supabaseAdmin, canalWhatsApp);
  return Response.json({ ok: true, ...resumen });
}

export const Route = createFileRoute("/api/cron/bot")({
  server: {
    handlers: {
      POST: ({ request }) => ejecutar(request),
      GET: ({ request }) => ejecutar(request),
    },
  },
});
