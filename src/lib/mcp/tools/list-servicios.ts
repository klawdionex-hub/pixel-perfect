import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_servicios",
  title: "Consultar servicios",
  description: "Consulta el catálogo activo de servicios de AFPAM disponible para el usuario.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_args, ctx) => {
    const { data, error } = await supabaseForUser(ctx).from("servicios")
      .select("codigo,nombre,tipo,descripcion,requiere_equipo")
      .eq("activo", true).order("codigo").limit(50).abortSignal(ctx.signal);
    if (error) throw new ToolError("No se pudo consultar el catálogo.");
    return { content: [{ type: "text", text: JSON.stringify(data ?? []) }] };
  },
});