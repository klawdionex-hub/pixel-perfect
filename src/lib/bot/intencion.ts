// Reconoce lo que quiere el cliente cuando escribe en lugar de elegir una opción (o en lugar de su nombre),
// para mandarlo a la encuesta que corresponde. Si sigue la encuesta normal, esto no se usa.

export type Intencion = {
  flujo?: "instalacion" | "reparacion" | "mantenimiento" | "compra";
  /** Opción informativa del menú. */
  info?: "m_hor" | "m_zon" | "m_pago";
  asesor?: boolean;
  /** Código del tipo de portón (1 a 7) si lo mencionó. */
  tipoPorton?: number | undefined;
  /** Equipo de "Compra de equipo" si lo mencionó (mismos títulos que la encuesta). */
  equipoCompra?: string | undefined;
  /** Frase corta para la respuesta: "los pistones para su portón". */
  frase?: string;
};

const normal = (t: string) =>
  ` ${t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9ñ ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()} `;

const tiene = (t: string, palabras: string[]) => palabras.some((p) => t.includes(p));

const REPARACION = [" no abre", " no cierra", " no funciona", " no sirve", " no jala", " no prende", " no responde", "falla", "descompuest", "arregl", "repar", " atoro", " atora", " atorado", " se trabo", " trabado", " quemo", " se cayo", "se salio", "descarril"];
const MANTENIMIENTO = ["mantenimiento", "revision", "revisar", "hace ruido", "rechina", "ajuste", "ajustar", "aceit", "engras", "lubric", "preventivo"];
const COMPRA = [" comprar", " compro ", " venden", " vende ", " vendes", "refaccion", "control remoto", "controles", " solo el motor", "sin instalacion", " pieza", " repuesto"];
const INSTALACION = ["cotiz", "precio", "cuanto", "costo", "cuesta", "salen", "instal", "automatiz", "motor", "porton", "zaguan", "pist", "cortina", "elevadizo", "corredizo", "abatible", "presupuesto", "puerta"];
const UBICACION = ["ubicacion", "donde estan", "donde se encuentran", "direccion", "domicilio", "horario", "a que hora", "que hora", "abren", "cierran"];
const ZONAS = ["zona", "cobertura", "llegan a", "dan servicio en", "van a ", "trabajan en"];
const PAGO = ["forma de pago", "formas de pago", "tarjeta", "meses sin intereses", "transferencia", "garantia", "aceptan"];
const ASESOR = ["asesor", "hablar con", "llamar", "llamenme", "marquenme", "llamada", "una persona", "humano", "vendedor"];

/** Tipo de portón mencionado (códigos de servicio 1 a 7). */
function tipoPorton(t: string): number | undefined {
  const adentro = tiene(t, ["adentro", "hacia dentro", "para dentro", "hacia el interior"]);
  const afuera = tiene(t, ["afuera", "hacia fuera", "para fuera", "hacia la calle"]);
  if (tiene(t, ["abatible", "pist", "dos hojas", "batiente"])) return adentro ? 2 : afuera ? 1 : undefined;
  if (tiene(t, ["elevadizo", "americano", "seccional", "paneles", "levadizo"])) return 3;
  if (tiene(t, ["corredizo", "corrediza", "deslizante", "cremallera"])) return 4;
  if (tiene(t, ["plegadiz", "plegable"])) return 5;
  if (tiene(t, ["maroma", "basculante"])) return 6;
  if (tiene(t, ["cortina"])) return 7;
  return undefined;
}

function equipoCompra(t: string): string | undefined {
  if (tiene(t, ["cadena"])) return "Motor de cadena";
  if (tiene(t, ["pist"])) return "Pistones";
  if (tiene(t, ["cremallera", "corredizo"])) return "Motor de cremallera";
  if (tiene(t, ["cortina"])) return "Motor para cortina";
  if (tiene(t, ["control", "refaccion", "repuesto", "pieza"])) return "Otro (controles, refacciones u otro equipo)";
  return undefined;
}

/** Lo que quiere el cliente según su texto; vacío si no se reconoce nada. */
export function detectarIntencion(texto: string): Intencion {
  const t = normal(texto);
  if (!t.trim()) return {};
  const tipo = tipoPorton(t);
  // El orden importa: "el motor no abre" es reparación, no instalación.
  if (tiene(t, REPARACION)) return { flujo: "reparacion", tipoPorton: tipo, frase: "la reparación de su equipo" };
  if (tiene(t, MANTENIMIENTO)) return { flujo: "mantenimiento", tipoPorton: tipo, frase: "el mantenimiento de su equipo" };
  if (tiene(t, COMPRA)) return { flujo: "compra", equipoCompra: equipoCompra(t), frase: "la compra de su equipo" };
  if (tiene(t, ASESOR)) return { asesor: true };
  if (tiene(t, PAGO)) return { info: "m_pago" };
  if (tiene(t, ZONAS) && !tiene(t, INSTALACION)) return { info: "m_zon" };
  if (tiene(t, UBICACION) && !tiene(t, INSTALACION)) return { info: "m_hor" };
  if (tiene(t, INSTALACION) || tipo) {
    const frase = tiene(t, ["pist"]) ? "los pistones para su portón" : tipo === 7 ? "su cortina eléctrica" : "la instalación de su portón automático";
    return { flujo: "instalacion", tipoPorton: tipo, frase };
  }
  return {};
}

/**
 * true si lo que escribió en la pregunta del nombre claramente NO es un nombre (es una pregunta o una petición).
 * Conservador: un nombre normal de hasta 5 palabras se acepta.
 */
export function pareceNoNombre(texto: string): boolean {
  const crudo = texto.trim();
  if (/[?¿]/.test(crudo)) return true;
  if (/\d{3,}/.test(crudo)) return true;
  const t = normal(crudo);
  const palabras = t.trim().split(" ").filter(Boolean);
  if (palabras.length > 5) return true;
  const claves = ["cuanto", "precio", "costo", "cotiz", "motor", "porton", "pist", "instal", "informacion", "quiero", "necesito", "busco", "me interesa", "tienen", "venden", "repar", "mantenimiento", "cortina", "zaguan", "puerta", "control"];
  return tiene(t, claves);
}
