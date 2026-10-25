// Manuales técnicos: tipos de equipo, procedimientos que se buscan en cada manual y validación de lo que lee la IA.

export const TIPOS_MANUAL = [
  "Pistones",
  "Motor corredizo",
  "Motor de cadena",
  "Motor para cortina",
  "Elevadizo",
  "Controles y tarjetas",
  "Otro",
] as const;

/** Procedimientos que la IA busca en cada manual (en este orden aparecen en el bot). */
export const PROCEDIMIENTOS = [
  { clave: "programar_controles", titulo: "Programar controles" },
  { clave: "borrar_controles", titulo: "Borrar controles" },
  { clave: "clonar_control", titulo: "Clonar control / frecuencia" },
  { clave: "programar_carrera", titulo: "Programar la carrera" },
  { clave: "ajustar_fuerza", titulo: "Ajustar fuerza" },
  { clave: "cierre_automatico", titulo: "Cierre automático" },
  { clave: "fotoceldas", titulo: "Fotoceldas" },
  { clave: "sentido_giro", titulo: "Cambiar sentido de giro" },
  { clave: "desbloqueo", titulo: "Desbloqueo manual" },
  { clave: "conexion", titulo: "Diagrama de conexión" },
  { clave: "codigos_error", titulo: "Códigos de error" },
  { clave: "bateria", titulo: "Batería de respaldo" },
] as const;

export type ProcedimientoLeido = { clave: string | null; titulo: string; pasos: string[]; pagina_inicio: number | null; pagina_fin: number | null };

export type LecturaManual = {
  tipo: string;
  marca: string | null;
  modelo: string | null;
  frecuencia: string | null;
  tipo_codigo: string | null;
  procedimientos: ProcedimientoLeido[];
};

const texto = (v: unknown, max = 120) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
const pagina = (v: unknown, total: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= 1 && n <= Math.max(total, 1) ? n : null;
};

/** Revisa y limpia lo que devolvió la IA (nunca se confía tal cual). */
export function validarLectura(x: unknown, totalPaginas: number): LecturaManual {
  const o = (x ?? {}) as Record<string, unknown>;
  const tipo = (TIPOS_MANUAL as readonly string[]).includes(String(o["tipo"])) ? String(o["tipo"]) : "Otro";
  const claves = new Set(PROCEDIMIENTOS.map((p) => p.clave as string));
  const lista = Array.isArray(o["procedimientos"]) ? (o["procedimientos"] as Array<Record<string, unknown>>) : [];
  const procedimientos: ProcedimientoLeido[] = lista
    .map((p) => {
      const clave = typeof p["clave"] === "string" && claves.has(p["clave"]) ? p["clave"] : null;
      const def = PROCEDIMIENTOS.find((d) => d.clave === clave);
      const pasos = (Array.isArray(p["pasos"]) ? p["pasos"] : String(p["pasos"] ?? "").split("\n"))
        .map((s) => String(s).replace(/^\s*\d+[.)-]\s*/, "").trim())
        .filter(Boolean)
        .slice(0, 25)
        .map((s) => s.slice(0, 400));
      const ini = pagina(p["pagina_inicio"], totalPaginas);
      const fin = pagina(p["pagina_fin"], totalPaginas);
      return {
        clave,
        titulo: texto(p["titulo"], 60) ?? def?.titulo ?? "Procedimiento",
        pasos,
        pagina_inicio: ini,
        pagina_fin: fin != null && ini != null && fin >= ini ? Math.min(fin, ini + 4) : ini,
      };
    })
    .filter((p) => p.pasos.length > 0)
    .slice(0, 20);
  return {
    tipo,
    marca: texto(o["marca"], 60),
    modelo: texto(o["modelo"], 60),
    frecuencia: texto(o["frecuencia"], 60),
    tipo_codigo: texto(o["tipo_codigo"], 60),
    procedimientos,
  };
}

/** Nombre corto del manual: "Marca X · Modelo 300". */
export const nombreManual = (m: { marca?: string | null; modelo?: string | null; pdf_nombre?: string | null }) =>
  [m.marca, m.modelo].filter(Boolean).join(" · ") || m.pdf_nombre || "Manual sin nombre";
