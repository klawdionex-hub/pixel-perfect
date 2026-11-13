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

const REPARACION = [" program", " no abre", " no cierra", " no funciona", " no sirve", " no jala", " no prende", " no responde", "falla", "descompuest", "arregl", "repar", " atoro", " atora", " atorado", " se trabo", " trabado", " quemo", " se cayo", "se salio", "descarril"];
const MANTENIMIENTO = ["mantenimiento", "revision", "revisar", "hace ruido", "rechina", "ajuste", "ajustar", "aceit", "engras", "lubric", "preventivo"];
const COMPRA = [" comprar", " compro ", " venden", " vende ", " vendes", "refaccion", "control remoto", "controles", " solo el motor", "sin instalacion", " pieza", " repuesto"];
const INSTALACION = ["cotiz", "precio", "cuanto", "costo", "cuesta", "salen", "instal", "automatiz", "motor", "porton", "zaguan", "zahuan", "saguan", "sahuan", "electric", "pist", "cortina", "elevadizo", "corredizo", "abatible", "presupuesto", "puerta"];
const UBICACION = ["ubicacion", "donde estan", "donde se encuentran", "direccion", "domicilio", "horario", "a que hora", "que hora", "abren", "cierran"];
const ZONAS = ["zona", "cobertura", "llegan a", "dan servicio en", "van a ", "trabajan en"];
const PAGO = ["forma de pago", "formas de pago", "tarjeta", "meses sin intereses", "transferencia", "garantia", "aceptan"];
const ASESOR = ["asesor", "hablar con", "llamar", "llamenme", "marquenme", "llamada", "una persona", "humano", "vendedor"];

/** Tipo de portón mencionado (códigos de servicio 1 a 7). */
function tipoPorton(t: string): number | undefined {
  const adentro = tiene(t, ["adentro", "hacia dentro", "para dentro", "hacia el interior"]);
  const afuera = tiene(t, ["afuera", "hacia fuera", "para fuera", "hacia la calle"]);
  if (tiene(t, ["abatible", "pist", "dos hojas", "batiente", " brazo"])) return adentro ? 2 : afuera ? 1 : undefined;
  // "tipo a mericano", "abre hacia arriba": así lo escriben los clientes.
  if (tiene(t, ["elevadizo", "americano", "mericano", "seccional", "paneles", "levadizo", "hacia arriba", "para arriba"])) return 3;
  if (tiene(t, ["corredizo", "corrediza", "deslizante", "cremallera", " carril", " riel"])) return 4;
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
  // Respuestas cortas que no son un nombre.
  if (/^(no|si|sí|ok|okay|hola+|gracias|nada|ninguno|x+d*|\.+|buenas|buen dia|buen día|buenos dias|buenos días|buenas tardes|buenas noches)[\s.!]*$/i.test(crudo)) return true;
  if (/\d{3,}/.test(crudo)) return true;
  const t = normal(crudo);
  const palabras = t.trim().split(" ").filter(Boolean);
  if (palabras.length > 5) return true;
  const claves = ["cuanto", "precio", "costo", "cotiz", "motor", "porton", "pist", "instal", "informacion", "quiero", "necesito", "busco", "me interesa", "tienen", "venden", "repar", "mantenimiento", "cortina", "zaguan", "puerta", "control"];
  return tiene(t, claves);
}

// ---------------------------------------------------------------- lo que el cliente ya dijo

/**
 * Medidas escritas de cualquier forma: "3.80x2.40", "4×3", "3 por 2.48", "6 de ancho por 3 de alto",
 * "6 metros de largo y 2.50 de alto". Devuelve "3.80 x 2.40" o undefined.
 */
export function extraerMedidas(texto: string): string | undefined {
  // "2. 50" → "2.50"; "3,80" → "3.80"
  const t = texto.toLowerCase().replace(/(\d),(\d)/g, "$1.$2").replace(/(\d)\.\s+(\d)/g, "$1.$2");
  const num = String.raw`(\d{1,2}(?:\.\d{1,2})?)`;
  const unidad = String.raw`\s*(?:m(?:ts?|etros?)?\.?)?`;
  const relleno = String.raw`(?:\s*(?:de\s+)?(?:ancho|largo|alto|altura)\s*)?`;
  const re = new RegExp(String.raw`${num}${unidad}${relleno}\s*(?:x|×|\*|por|y)\s*(?:de\s+)?${num}${unidad}${relleno}`);
  const m = re.exec(t);
  if (!m) return undefined;
  // Con "y" solo si habla de medidas ("6 metros de largo y 2.50 de alto"), no "llámenme a las 3 y 4".
  if (/\d\s*(?:m\w*\.?)?\s*y\s/.test(m[0]) && !/ancho|largo|alto|metro|mts/.test(m[0])) return undefined;
  const a = Number(m[1]);
  const b = Number(m[2]);
  // Medidas de portón razonables (en metros).
  if (!(a > 0.5 && a < 20 && b > 0.5 && b < 20)) return undefined;
  return `${m[1]} x ${m[2]}`;
}

/** Si dijo que ya tiene el portón o que lo necesita fabricado. */
export function tienePortonDe(texto: string): "Sí, ya lo tengo" | "Requiero fabricación" | undefined {
  const t = normal(texto);
  if (tiene(t, [" ya tengo", " ya esta", " ya cuento", " ya hay", " tengo un zaguan", " tengo un porton", " mi zaguan", " mi porton", " mis zaguanes", " ya instalado"])) return "Sí, ya lo tengo";
  if (tiene(t, [" comprar un zaguan", " comprar un porton", " fabric", " hacer el porton", " hacer un porton", " no tengo porton", " hacer el zaguan"])) return "Requiero fabricación";
  return undefined;
}

/** "Solo quiero saber el precio", "son muchas preguntas", "ya no me interesa": se pasa directo con un asesor. */
export function soloQuierePrecio(texto: string): boolean {
  const t = normal(texto);
  return tiene(t, [" solo quiero saber", " solo quiero el precio", " solo quiero el costo", " solo el precio", " solo el costo", " nada mas el precio", " nada mas el costo", " muchas preguntas", " tantas preguntas", " ya no me interesa", " no quiero contestar", " solo precio", " solo costos"]);
}

/** Alguien que ofrece algo (proveedor, publicidad, financiamiento): no es un cliente. */
export function esProveedor(texto: string): boolean {
  const t = normal(texto);
  return tiene(t, [" le ofrezco", " te ofrezco", " ofrecerle", " ofrecerte", " presentarte una propuesta", " presentarle una propuesta", " propuesta comercial", " ejecutivo comercial", " mi servicio de", " nuestros servicios de marketing", " manejo de redes", " publicidad para su negocio", " mercado pago", " credito para tu negocio", " credito para su negocio", " somos una agencia"]);
}

/** El cliente que ya pasó con asesor y sigue esperando: "¿me van a atender?", "?", "no me contestan". */
export function esImpaciencia(texto: string): boolean {
  const crudo = texto.trim();
  if (/^[?¿.\s]+$/.test(crudo) && crudo.includes("?")) return true;
  const t = normal(crudo);
  return tiene(t, [" me van a atender", " me van atender", " me atienden", " nadie me", " no me contestan", " no contestan", " no le llegan", " no les llegan", " sigo esperando", " estoy esperando", " hay alguien"]) && t.trim().length < 80;
}

/** "Gracias", "ok", "va": no hace falta contestarle. */
export function esCortesia(texto: string): boolean {
  return /^(muchas\s+)?(gracias|ok|okay|va|vale|sale|grs|grax|perfecto|listo|de acuerdo|si|sí|bien|excelente|👍)[\s.!]*$/iu.test(texto.trim());
}
