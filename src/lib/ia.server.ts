// Lectura de manuales con la inteligencia artificial de Lovable (Lovable AI).
// Lovable genera la clave LOVABLE_API_KEY para el proyecto al activar su IA. Si cambia la forma de conectarse,
// solo hay que ajustar esta función: el resto del programa no depende de cómo se llame a la IA.
import { PROCEDIMIENTOS, TIPOS_MANUAL } from "@/lib/manuales/datos";

const URL_IA = process.env["LOVABLE_AI_URL"] ?? "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODELO_IA = process.env["LOVABLE_AI_MODEL"] ?? "google/gemini-2.5-flash";

/** Máximo de texto que se manda a la IA (un manual de ~150 páginas). */
const MAX_CARACTERES = 300_000;

const INSTRUCCIONES = `Eres un técnico experto en motores para portones automáticos y cortinas eléctricas.
Recibirás el texto de un manual técnico, separado por páginas ("=== Página N ===").
Devuelve SOLO un objeto JSON con esta forma exacta:
{
  "tipo": uno de ${JSON.stringify(TIPOS_MANUAL)},
  "marca": "marca del equipo o null",
  "modelo": "modelo o null",
  "frecuencia": "frecuencia de los controles, p. ej. 433.92 MHz, o null",
  "tipo_codigo": "código fijo, código variable (rolling code) u otro, o null",
  "procedimientos": [
    { "clave": una de ${JSON.stringify(PROCEDIMIENTOS.map((p) => p.clave))} o null si es otro procedimiento útil,
      "titulo": "título corto en español",
      "pasos": ["paso 1", "paso 2", ...],
      "pagina_inicio": número, "pagina_fin": número }
  ]
}
Reglas:
- Escribe los pasos en español claro, aunque el manual esté en otro idioma, uno por elemento, cortos y en orden.
- Conserva exactos los tiempos, nombres de botones, interruptores (DIP), LED y valores.
- Incluye solo procedimientos que SÍ vienen en el manual. No inventes nada.
- Las páginas son las del texto recibido.`;

/**
 * soloBuscar: busca únicamente esos procedimientos (los que el usuario agregó vacíos).
 * yaTenemos: procedimientos que ya están; no se repiten.
 */
export async function leerManualConIA(paginas: string[], opciones: { soloBuscar?: string[]; yaTenemos?: string[] } = {}): Promise<unknown> {
  const clave = process.env["LOVABLE_API_KEY"];
  if (!clave) {
    throw new Error("Falta activar la inteligencia artificial de Lovable en el proyecto (no existe LOVABLE_API_KEY).");
  }
  let contenido = "";
  for (const [i, p] of paginas.entries()) {
    const bloque = `\n=== Página ${i + 1} ===\n${p}`;
    if (contenido.length + bloque.length > MAX_CARACTERES) break;
    contenido += bloque;
  }
  const r = await fetch(URL_IA, {
    method: "POST",
    headers: { Authorization: `Bearer ${clave}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODELO_IA,
      messages: [
        { role: "system", content: INSTRUCCIONES },
        {
          role: "user",
          content:
            (opciones.soloBuscar?.length
              ? `Busca ÚNICAMENTE estos procedimientos y no incluyas otros: ${opciones.soloBuscar.join("; ")}.\n`
              : "") +
            (opciones.yaTenemos?.length ? `Ya tenemos estos procedimientos, NO los incluyas: ${opciones.yaTenemos.join("; ")}.\n` : "") +
            contenido,
        },
      ],
      response_format: { type: "json_object" },
    }),
  });
  if (r.status === 429) throw new Error("La inteligencia artificial está ocupada (demasiadas solicitudes). Intente en un minuto.");
  if (r.status === 402) throw new Error("Se acabaron los créditos de IA de Lovable. Agregue créditos en Lovable e intente de nuevo.");
  if (!r.ok) throw new Error(`La inteligencia artificial respondió con error ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const json = (await r.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const texto = json.choices?.[0]?.message?.content ?? "";
  const inicio = texto.indexOf("{");
  const fin = texto.lastIndexOf("}");
  if (inicio < 0 || fin < inicio) throw new Error("La inteligencia artificial no devolvió una lectura válida.");
  return JSON.parse(texto.slice(inicio, fin + 1));
}
