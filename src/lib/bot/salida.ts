// Tipos de mensaje saliente compartidos entre el servidor (WhatsApp) y el simulador del panel.

type Opc<T> = T | undefined;

export type Opcion = { id: string; titulo: string; descripcion?: Opc<string> };

export type Salida =
  | { tipo: "texto"; texto: string }
  | { tipo: "imagen"; url: string; texto?: Opc<string> }
  | { tipo: "documento"; url: string; nombre?: Opc<string>; texto?: Opc<string> }
  | { tipo: "ubicacion"; lat: number; lng: number; nombre?: Opc<string>; direccion?: Opc<string> }
  | { tipo: "contacto"; nombre: string; telefono: string }
  | { tipo: "lista"; texto: string; boton?: Opc<string>; opciones: Array<string | Opcion> }
  | { tipo: "botones"; texto: string; opciones: Array<string | Opcion> }
  | { tipo: "plantilla"; nombre: string; idioma?: Opc<string>; parametros?: Opc<string[]> };

export function normalizarOpciones(opciones: Array<string | Opcion>): Opcion[] {
  return opciones.map((o, i) => (typeof o === "string" ? { id: String(i + 1), titulo: o } : o));
}

/** Representación en texto plano de un mensaje saliente (historial y simulador). */
export function textoDeSalida(s: Salida): string {
  switch (s.tipo) {
    case "texto":
      return s.texto;
    case "imagen":
      return s.texto ? `[Imagen] ${s.texto}` : "[Imagen]";
    case "documento":
      return `[Documento${s.nombre ? `: ${s.nombre}` : ""}]${s.texto ? ` ${s.texto}` : ""}`;
    case "ubicacion":
      return `[Ubicación] ${s.nombre ?? ""} ${s.direccion ?? ""}`.trim();
    case "contacto":
      return `[Contacto] ${s.nombre} ${s.telefono}`;
    case "lista":
    case "botones":
      return `${s.texto}\n${normalizarOpciones(s.opciones)
        .map((o, i) => `${i + 1}) ${o.titulo}`)
        .join("\n")}`;
    case "plantilla":
      return `[Plantilla ${s.nombre}] ${(s.parametros ?? []).join(" | ")}`;
  }
}

/** Deja el teléfono como +52 seguido de 10 dígitos (quita el 1 de móviles de México). */
export function normalizarTelefono(tel: string): string {
  let d = tel.replace(/\D/g, "");
  if (d.length === 10) d = "52" + d;
  if (d.length === 13 && d.startsWith("521")) d = "52" + d.slice(3);
  return "+" + d;
}
