import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "get_solicitud_summary",
  title: "Consultar resumen de solicitud",
  description: "Obtiene el estado y los importes de una solicitud por su identificador, respetando los permisos del usuario.",
  inputSchema: { id: z.string().uuid().describe("Identificador de solicitud obtenido con list_solicitudes.") },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ id }, ctx) => {
    const { data, error } = await supabaseForUser(ctx).from("solicitudes")
      .select("id,codigo,etapa,servicio_codigo,equipo_codigo,completa,urgente,fuera_de_zona,vendedor_id,monto_venta,comision,creada_en,resultado_en")
      .eq("id", id).abortSignal(ctx.signal).maybeSingle();
    if (error) throw new ToolError("No se pudo consultar la solicitud.");
    if (!data) throw new ToolError("Solicitud no disponible para este usuario.");
    return { content: [{ type: "text", text: JSON.stringify(data) }] };
  },
});