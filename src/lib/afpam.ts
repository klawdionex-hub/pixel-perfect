export const ETAPAS = [
  { valor: 1, nombre: "Nuevo", clase: "bg-etapa-nuevo text-white" },
  { valor: 2, nombre: "Cotizado", clase: "bg-etapa-cotizado text-carbon" },
  { valor: 3, nombre: "Negociando", clase: "bg-etapa-negociando text-white" },
  { valor: 4, nombre: "Cliente", clase: "bg-etapa-cliente text-white" },
  { valor: 0, nombre: "Perdido", clase: "bg-etapa-perdido text-white" },
  { valor: 5, nombre: "Archivado", clase: "bg-etapa-archivado text-white" },
] as const;

export function etapaInfo(valor: number | null | undefined) {
  return ETAPAS.find((e) => e.valor === valor) ?? ETAPAS[0];
}

export const NIVELES_INTERES = ["alto", "medio", "bajo"] as const;

export const TZ = "America/Mexico_City";

export function moneda(valor: number | null | undefined) {
  if (valor === null || valor === undefined) return "—";
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 2,
  }).format(Number(valor));
}

export function fecha(valor: string | null | undefined) {
  if (!valor) return "—";
  return new Intl.DateTimeFormat("es-MX", {
    timeZone: TZ,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(valor));
}

export function fechaHora(valor: string | null | undefined) {
  if (!valor) return "—";
  return new Intl.DateTimeFormat("es-MX", {
    timeZone: TZ,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(valor));
}

export function antiguedad(valor: string | null | undefined) {
  if (!valor) return "—";
  const ms = Date.now() - new Date(valor).getTime();
  const horas = Math.floor(ms / 3600000);
  if (horas < 1) return `${Math.max(1, Math.floor(ms / 60000))} min`;
  if (horas < 48) return `${horas} h`;
  return `${Math.floor(horas / 24)} días`;
}

export function telefonoBonito(tel: string | null | undefined) {
  if (!tel) return "—";
  const d = tel.replace(/\D/g, "");
  if (d.length === 12 && d.startsWith("52")) {
    return `+52 ${d.slice(2, 5)} ${d.slice(5, 8)} ${d.slice(8)}`;
  }
  return tel;
}

export function enlaceWhatsApp(tel: string | null | undefined) {
  if (!tel) return "#";
  return `https://wa.me/${tel.replace(/\D/g, "")}`;
}

/** Convierte un patrón con comodines (3-2-*) en expresión regular. */
export function coincideComodin(patron: string, texto: string) {
  const limpio = patron.trim();
  if (!limpio) return true;
  const re = new RegExp(
    "^" + limpio.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".") + "$",
    "i",
  );
  return re.test(texto ?? "");
}

export function mesActualRango() {
  const ahora = new Date();
  const inicio = new Date(ahora.getFullYear(), ahora.getMonth(), 1);
  return { inicio: inicio.toISOString(), fin: ahora.toISOString() };
}

export function inicioSemana() {
  const ahora = new Date();
  const dia = (ahora.getDay() + 6) % 7;
  const inicio = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate() - dia);
  return inicio.toISOString();
}

export const ETIQUETAS_DATOS: Record<string, string> = {
  medidas: "Medidas",
  material: "Material",
  tiene_porton: "Cuenta con portón",
  marca_motor: "Marca del motor",
  falla: "Falla reportada",
  ultimo_mantenimiento: "Último mantenimiento",
  horario_preferido: "Horario preferido",
  color: "Color",
  observaciones: "Observaciones",
};
