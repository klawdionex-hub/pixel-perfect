// Datos y cálculos de las cotizaciones, compartidos entre el bot, el PDF y el panel.

export type Partida = {
  equipo_id?: string | null;
  concepto: string;
  cantidad: number;
  precio: number;
  /** Costo unitario interno (para calcular la ganancia). Nunca se imprime. */
  costo?: number | null;
};

export type Iva = "incluye" | "mas" | null;

/** Datos fijos de la plantilla de AFPAM. Se pueden cambiar en configuracion.textos_extra (claves cot_*). */
export const EMPRESA_POR_DEFECTO = {
  razon_social: "AFPAM Texcoco Puertas Automáticas",
  rfc: "SAEL620515HE2",
  telefono: "59 5957 0643 / 59 5957 6766",
  correo: "salcedapuertas@gmail.com",
  vigencia: "1 mes",
  forma_pago: "anticipo del 70%; el 30% restante se liquida al estar en el domicilio.",
  vigencia_texto: "1 mes a partir de la fecha de entrega de esta cotización.",
  garantia_duracion: "1 año a partir de la fecha de entrega.",
  garantia_no_procede: [
    "No se realiza la visita de mantenimiento (con costo)",
    "El zaguán/portón no abre por defectos de construcción (colgado, carretillas o riel dañados); debe abrir sin dificultad para un adulto",
    "El motor presenta alteraciones o la tableta electrónica no es la original",
    "No se acepta el mantenimiento preventivo",
    "El equipo se moja",
  ],
  garantia_motor_no_cubre: [
    "Daños por mal uso, abuso o falta de mantenimiento preventivo",
    "Mano de obra por desmontaje, reinstalación o cambio de batería",
  ],
  garantia_nota:
    "Tiempo de entrega del servicio de garantía sujeto a disponibilidad (1 a 15 días). No incluye instalación eléctrica, salvo que se especifique con su costo en el recibo.",
  telefono_garantia: "59 59 54 47 63",
  nota_precios: "Precios en MXN. No incluye fletes/instalación salvo que se indique.",
};

export type Empresa = typeof EMPRESA_POR_DEFECTO & { direccion?: string | null; ubicacion?: string | null; servicios?: string[] };

/** Datos de la empresa con lo que se haya cambiado en Configuración. */
export function empresaDe(config: Record<string, unknown>): Empresa {
  const extra = (config["textos_extra"] ?? {}) as Record<string, string>;
  const texto = (clave: keyof typeof EMPRESA_POR_DEFECTO) => {
    const v = extra[`cot_${clave}`];
    return typeof v === "string" && v.trim() ? v.trim() : (EMPRESA_POR_DEFECTO[clave] as string);
  };
  return {
    ...EMPRESA_POR_DEFECTO,
    razon_social: texto("razon_social"),
    rfc: texto("rfc"),
    telefono: texto("telefono"),
    correo: texto("correo"),
    vigencia: texto("vigencia"),
    forma_pago: texto("forma_pago"),
    vigencia_texto: texto("vigencia_texto"),
    garantia_duracion: texto("garantia_duracion"),
    direccion: typeof config["direccion"] === "string" ? (config["direccion"] as string) : null,
    ubicacion: typeof config["ubicacion_maps_url"] === "string" ? (config["ubicacion_maps_url"] as string) : null,
  };
}

export const importe = (p: Partida) => Math.round(p.cantidad * p.precio * 100) / 100;
export const totalDe = (partidas: Partida[]) => Math.round(partidas.reduce((t, p) => t + importe(p), 0) * 100) / 100;

/** Costo total si todas las partidas tienen costo; si falta alguno, null (no se puede calcular la ganancia). */
export function costoDe(partidas: Partida[]): number | null {
  if (!partidas.length || partidas.some((p) => p.costo == null)) return null;
  return Math.round(partidas.reduce((t, p) => t + p.cantidad * Number(p.costo), 0) * 100) / 100;
}

export function textoIva(iva: Iva): string | null {
  if (iva === "incluye") return "Precios con IVA incluido.";
  if (iva === "mas") return "Precios más IVA.";
  return null;
}

export const pesos = (n: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 2 }).format(n);

/**
 * Lee lo que escribe el vendedor como precio: "8500", "$8,500.00", "2 x 350" (cantidad por precio).
 * Devuelve null si no se entiende.
 */
export function leerPrecio(t: string): { cantidad: number; precio: number } | null {
  const limpio = t.replace(/\$/g, "").replace(/\s+/g, " ").trim().toLowerCase();
  const num = (s: string) => Number(s.replace(/,/g, ""));
  const m = /^(\d+)\s*(?:x|\*|por)\s*([\d,]+(?:\.\d{1,2})?)$/.exec(limpio);
  if (m) {
    const cantidad = Number(m[1]);
    const precio = num(m[2]!);
    return cantidad > 0 && Number.isFinite(precio) && precio >= 0 ? { cantidad, precio } : null;
  }
  if (/^[\d,]+(?:\.\d{1,2})?$/.test(limpio)) {
    const precio = num(limpio);
    return Number.isFinite(precio) && precio >= 0 ? { cantidad: 1, precio } : null;
  }
  return null;
}
