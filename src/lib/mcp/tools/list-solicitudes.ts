import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_solicitudes",
  title: "Consultar solicitudes",
  description: "Consulta solicitudes recientes accesibles para el usuario, filtradas por etapa o urgencia, sin teléfonos ni conversaciones.",
  inputSchema: {
    etapa: z.number().int().min(1).max(6).optional().describe("Etapa de la solicitud, del 1 al 6."),
    urgente: z.boolean().optional().describe("Filtrar por solicitudes urgentes o no urgentes."),
    limite: z.number().int().min(1).max(50).default(20).describe("Máximo de solicitudes devueltas, hasta 50."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ etapa, urgente, limite }, ctx) => {
    let query = supabaseForUser(ctx).from("solicitudes")
      .select("id,codigo,etapa,servicio_codigo,completa,urgente,vendedor_id,creada_en")
      .order("creada_en", { ascending: false }).limit(limite).abortSignal(ctx.signal);
    if (etapa !== undefined) query = query.eq("etapa", etapa);
    if (urgente !== undefined) query = query.eq("urgente", urgente);
    const { data, error } = await query;
    if (error) throw new ToolError("No se pudieron consultar las solicitudes.");
    return { content: [{ type: "text", text: JSON.stringify(data ?? []) }] };
  },
});