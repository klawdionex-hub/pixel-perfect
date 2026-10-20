// Fórmula de AFPAM para portones elevadizos de paneles tipo americano.
// Precio al cliente = USD de la tabla × incremento (1.20) × IVA (1.16) × precio del dólar.
// La medida del cliente (en metros) se lleva a la medida estándar igual o mayor, en pies.

export const PIE_M = 0.3048;

/** Anchos (largo del panel) y altos con precio en la tabla, en pies. */
export const ANCHOS_PIES = [8, 9, 10, 12, 14, 16, 18, 20];
export const ALTOS_PIES = [7, 8];

export type PrecioElevadizo = { ancho: number; alto: number; usd: number };

/** Tabla de precios en dólares, color blanco (lista de AFPAM). */
export const TABLA_POR_DEFECTO: PrecioElevadizo[] = [
  { ancho: 8, alto: 7, usd: 1043 },
  { ancho: 8, alto: 8, usd: 1245 },
  { ancho: 9, alto: 7, usd: 1129 },
  { ancho: 9, alto: 8, usd: 1346 },
  { ancho: 10, alto: 7, usd: 1212 },
  { ancho: 10, alto: 8, usd: 1455 },
  { ancho: 12, alto: 7, usd: 1460 },
  { ancho: 12, alto: 8, usd: 1744 },
  { ancho: 14, alto: 7, usd: 1701 },
  { ancho: 14, alto: 8, usd: 2035 },
  { ancho: 16, alto: 7, usd: 1768 },
  { ancho: 16, alto: 8, usd: 2147 },
  { ancho: 18, alto: 7, usd: 2147 },
  { ancho: 18, alto: 8, usd: 2589 },
  { ancho: 20, alto: 7, usd: 2371 },
  { ancho: 20, alto: 8, usd: 2853 },
];

export type Formula = {
  tabla: PrecioElevadizo[];
  /** Precio del dólar en pesos; null si no se ha capturado. */
  dolar: number | null;
  dolarFecha: string | null;
  incremento: number;
  iva: number;
  /** Si la medida estándar le queda al cliente con menos de esto (en metros), se toma la siguiente. */
  holgura: number;
};

/** Lee la fórmula de configuracion.textos_extra (claves elev_*), con los valores de AFPAM por defecto. */
export function formulaDe(config: Record<string, unknown> | null | undefined): Formula {
  const extra = (config?.["textos_extra"] ?? {}) as Record<string, string>;
  const numero = (k: string, d: number) => {
    const n = Number(extra[k]);
    return Number.isFinite(n) && n > 0 ? n : d;
  };
  let tabla = TABLA_POR_DEFECTO;
  try {
    const t = JSON.parse(extra["elev_tabla"] ?? "null") as PrecioElevadizo[] | null;
    if (Array.isArray(t) && t.length) tabla = t.filter((x) => x && Number(x.usd) > 0);
  } catch {
    tabla = TABLA_POR_DEFECTO;
  }
  const dolar = Number(extra["elev_dolar"]);
  return {
    tabla,
    dolar: Number.isFinite(dolar) && dolar > 0 ? dolar : null,
    dolarFecha: extra["elev_dolar_fecha"] || null,
    incremento: numero("elev_incremento", 1.2),
    iva: numero("elev_iva", 1.16),
    holgura: numero("elev_holgura_cm", 3) / 100,
  };
}

/** "2.90", "2,90", "290 cm" o "2.90 m" → metros. */
export function leerMetros(t: string): number | null {
  const limpio = t.toLowerCase().replace(",", ".").trim();
  const m = /^(\d+(?:\.\d+)?)\s*(cm|centimetros|centímetros|m|mts?|metros)?$/.exec(limpio);
  if (!m) return null;
  let n = Number(m[1]);
  if (m[2]?.startsWith("c") || (!m[2] && n > 20)) n = n / 100;
  return n > 0.5 && n < 30 ? Math.round(n * 1000) / 1000 : null;
}

export const piesAMetros = (p: number) => Math.round(p * PIE_M * 100) / 100;

/** Medida estándar (índice) igual o mayor que la del cliente más la holgura; -1 si no alcanza ninguna. */
function indiceMedida(medidas: number[], metros: number, holgura: number) {
  return medidas.findIndex((p) => p * PIE_M >= metros + holgura - 1e-9);
}

export type ResultadoElevadizo =
  | {
      ok: true;
      anchoPies: number;
      altoPies: number;
      usd: number;
      precio: number;
      costo: number;
      /** true si se subió a la siguiente medida porque la exacta quedaba muy justa. */
      ajustado: boolean;
      puedeMayor: boolean;
      puedeMenor: boolean;
    }
  | { ok: false; error: string };

/**
 * Calcula el portón para la medida del cliente. "salto" mueve el ancho estándar arriba (+1) o abajo (-1)
 * respecto al elegido automáticamente, sin bajar nunca de la medida del cliente.
 */
export function calcularElevadizo(f: Formula, anchoM: number, altoM: number, salto = 0): ResultadoElevadizo {
  if (!f.dolar) return { ok: false, error: "Falta capturar el precio del dólar en el panel (Cotizaciones → Fórmula de elevadizos)." };
  const iaExacta = indiceMedida(ANCHOS_PIES, anchoM, 0);
  const ihExacta = indiceMedida(ALTOS_PIES, altoM, 0);
  if (iaExacta < 0 || ihExacta < 0) {
    return {
      ok: false,
      error: `La medida ${anchoM.toFixed(2)} × ${altoM.toFixed(2)} m es más grande que los paneles disponibles (máximo ${piesAMetros(20).toFixed(2)} × ${piesAMetros(8).toFixed(2)} m). Esta se cotiza a mano.`,
    };
  }
  // Con holgura: si la exacta queda muy justa se toma la siguiente (si existe).
  const iaHolgura = indiceMedida(ANCHOS_PIES, anchoM, f.holgura);
  const ihHolgura = indiceMedida(ALTOS_PIES, altoM, f.holgura);
  const iaBase = iaHolgura >= 0 ? iaHolgura : iaExacta;
  const ih = ihHolgura >= 0 ? ihHolgura : ihExacta;
  const ia = Math.min(Math.max(iaBase + salto, iaExacta), ANCHOS_PIES.length - 1);
  const anchoPies = ANCHOS_PIES[ia]!;
  const altoPies = ALTOS_PIES[ih]!;
  const fila = f.tabla.find((x) => x.ancho === anchoPies && x.alto === altoPies);
  if (!fila) return { ok: false, error: `No hay precio para ${anchoPies} × ${altoPies} pies en la tabla. Se cotiza a mano.` };
  return {
    ok: true,
    anchoPies,
    altoPies,
    usd: fila.usd,
    precio: Math.round(fila.usd * f.incremento * f.iva * f.dolar * 100) / 100,
    costo: Math.round(fila.usd * f.dolar * 100) / 100,
    ajustado: ia > iaExacta || ih > ihExacta,
    puedeMayor: ia < ANCHOS_PIES.length - 1,
    puedeMenor: ia > iaExacta,
  };
}

export const conceptoElevadizo = (r: { anchoPies: number; altoPies: number }) =>
  `Portón elevadizo de paneles tipo americano ${r.anchoPies} × ${r.altoPies} pies (${piesAMetros(r.anchoPies).toFixed(2)} × ${piesAMetros(r.altoPies).toFixed(2)} m), color blanco`;

/** Días desde que se actualizó el dólar (para avisar si está viejo). */
export function diasDelDolar(f: Formula, ahora = new Date()): number | null {
  if (!f.dolarFecha) return null;
  return Math.floor((ahora.getTime() - new Date(f.dolarFecha).getTime()) / 86400000);
}
