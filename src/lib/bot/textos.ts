// Textos del bot: etiqueta para el panel, texto por defecto y dónde se guardan.
// Los que tienen `columna` viven en su propia columna de `configuracion`;
// los demás se guardan en `configuracion.textos_extra` (JSONB).

export type ClaveTexto =
  | "saludo"
  | "menu"
  | "cliente_regresa"
  | "pregunta_zona"
  | "fuera_de_zona"
  | "pregunta_municipio"
  | "pregunta_tipo_instalacion"
  | "pregunta_tiene_porton"
  | "pregunta_medidas"
  | "pregunta_material"
  | "pregunta_foto"
  | "pregunta_equipo"
  | "pregunta_marca"
  | "pregunta_falla"
  | "pregunta_urgente"
  | "pregunta_ultimo_mantenimiento"
  | "pregunta_horario"
  | "cierre"
  | "fuera_de_horario"
  | "no_entendi"
  | "traspaso_asesor"
  | "asesor_asignado"
  | "en_espera"
  | "seguimiento"
  | "recordatorio_1"
  | "recordatorio_2"
  | "respuesta_vendedor";

type DefTexto = { etiqueta: string; porDefecto: string; columna?: string; legado?: string };

export const TEXTOS: Record<ClaveTexto, DefTexto> = {
  saludo: {
    etiqueta: "Saludo a clientes nuevos (debe pedir el nombre)",
    columna: "texto_saludo",
    legado: "Buen día. Le atiende AFPAM Texcoco, Puertas Automáticas. ¿En qué servicio está interesado?",
    porDefecto:
      "Buen día, gracias por comunicarse con AFPAM Texcoco. Somos especialistas en instalación, reparación y mantenimiento de portones automáticos y cortinas eléctricas.\n\nLe atiende el asistente virtual. Le haré algunas preguntas breves para que uno de nuestros asesores le atienda con toda su información.\n\n¿Podría indicarme su nombre, por favor?",
  },
  menu: {
    etiqueta: "Menú principal",
    porDefecto: "Gracias, {nombre}. ¿En qué podemos ayudarle?",
  },
  cliente_regresa: {
    etiqueta: "Saludo a clientes que regresan",
    columna: "texto_cliente_regresa",
    legado: "Es un gusto saludarle nuevamente. ¿En qué podemos ayudarle?",
    porDefecto: "Buen día, {nombre}. Es un gusto saludarle nuevamente. ¿En qué podemos ayudarle?",
  },
  pregunta_zona: {
    etiqueta: "Pregunta de zona",
    porDefecto: "¿El trabajo se realizaría dentro del Estado de México?",
  },
  fuera_de_zona: {
    etiqueta: "Respuesta si está fuera de zona",
    columna: "texto_fuera_de_zona",
    legado: "Actualmente damos servicio únicamente en el Estado de México.",
    porDefecto:
      "Por el momento brindamos servicio en el Estado de México; con gusto un asesor revisará su caso.",
  },
  pregunta_municipio: {
    etiqueta: "Pregunta de municipio",
    columna: "texto_pregunta_municipio",
    legado: "Indique el municipio donde se realizaría el trabajo.",
    porDefecto: "Indique, por favor, el municipio y la colonia donde se realizaría el trabajo.",
  },
  pregunta_tipo_instalacion: {
    etiqueta: "Pregunta del tipo de instalación",
    columna: "texto_pregunta_servicio",
    legado: "Indique el tipo de puerta o servicio que requiere.",
    porDefecto: "Indique el tipo de portón o equipo que desea instalar.",
  },
  pregunta_tiene_porton: {
    etiqueta: "Pregunta si ya tiene portón",
    porDefecto: "¿Ya cuenta con el portón o requiere fabricarlo?",
  },
  pregunta_medidas: {
    etiqueta: "Pregunta de medidas",
    columna: "texto_pregunta_medidas",
    legado: "Indique las medidas aproximadas del claro (ancho y alto).",
    porDefecto:
      'Indique las medidas aproximadas del portón (ancho por alto). Si no las conoce, escriba "no sé".',
  },
  pregunta_material: {
    etiqueta: "Pregunta de material",
    columna: "texto_pregunta_material",
    legado: "Indique el material deseado.",
    porDefecto: "Indique el material del portón.",
  },
  pregunta_foto: {
    etiqueta: "Solicitud de foto",
    porDefecto:
      "Si lo desea, envíe una foto o video del portón o del equipo. Si prefiere continuar sin foto, seleccione Omitir.",
  },
  pregunta_equipo: {
    etiqueta: "Pregunta del tipo de equipo (reparación y mantenimiento)",
    porDefecto: "Indique el tipo de equipo que requiere atención.",
  },
  pregunta_marca: {
    etiqueta: "Pregunta de marca del motor",
    porDefecto: 'Indique la marca del motor. Si no la conoce, escriba "no sé".',
  },
  pregunta_falla: {
    etiqueta: "Pregunta de la falla",
    porDefecto: "Describa brevemente la falla que presenta el equipo.",
  },
  pregunta_urgente: {
    etiqueta: "Pregunta de urgencia",
    porDefecto: "¿Se trata de una situación urgente?",
  },
  pregunta_ultimo_mantenimiento: {
    etiqueta: "Pregunta del último mantenimiento",
    porDefecto: "¿Hace cuánto tiempo se realizó el último mantenimiento?",
  },
  pregunta_horario: {
    etiqueta: "Pregunta de horario preferido",
    columna: "texto_pregunta_horario",
    legado: "Indique el horario en que podemos contactarle.",
    porDefecto: "¿En qué horario prefiere que le contactemos o visitemos?",
  },
  cierre: {
    etiqueta: "Cierre de la solicitud ({nombre}, {codigo})",
    columna: "texto_cierre",
    porDefecto:
      "Gracias, {nombre}. Hemos registrado su solicitud con el folio {codigo}. Uno de nuestros asesores se comunicará con usted a la brevedad.",
  },
  fuera_de_horario: {
    etiqueta: "Aviso fuera de horario (se agrega al cierre)",
    columna: "texto_fuera_de_horario",
    legado:
      "Nuestro horario de atención es de lunes a viernes de 08:00 a 17:00 y sábado de 08:00 a 14:00. Le responderemos en cuanto abramos.",
    porDefecto:
      "Nuestro horario de atención es de lunes a viernes de 8:00 a 17:00 y sábado de 8:00 a 14:00. Un asesor se comunicará con usted a partir de las 8:00 del siguiente día hábil.",
  },
  no_entendi: {
    etiqueta: "Respuesta no válida",
    porDefecto:
      "Disculpe, no logré identificar su respuesta. Por favor elija una de las opciones o escriba el número correspondiente.",
  },
  traspaso_asesor: {
    etiqueta: "Traspaso a asesor",
    columna: "texto_traspaso_asesor",
    legado: "Un asesor continuará la atención de su solicitud.",
    porDefecto: "Con gusto, en breve uno de nuestros asesores se comunicará con usted.",
  },
  asesor_asignado: {
    etiqueta: "Cliente ya asignado escribe de nuevo ({vendedor}, {telefono_vendedor})",
    porDefecto: "Su asesor {vendedor} se comunicará con usted desde el número {telefono_vendedor}.",
  },
  en_espera: {
    etiqueta: "Cliente en espera de asesor escribe de nuevo",
    porDefecto:
      "Su mensaje fue enviado a nuestros asesores. En breve uno de ellos se comunicará con usted.",
  },
  seguimiento: {
    etiqueta: "Seguimiento de solicitud",
    porDefecto: "Hemos avisado a su asesor sobre su seguimiento. En breve se comunicará con usted.",
  },
  recordatorio_1: {
    etiqueta: "Primer recordatorio al cliente",
    columna: "texto_recordatorio_cliente_1",
    legado: "Seguimos a sus órdenes para continuar con su solicitud.",
    porDefecto:
      "{nombre}, seguimos a sus órdenes para continuar con su solicitud. Solo faltan algunas preguntas.",
  },
  recordatorio_2: {
    etiqueta: "Segundo recordatorio al cliente",
    columna: "texto_recordatorio_cliente_2",
    legado: "Le recordamos que su solicitud continúa abierta.",
    porDefecto:
      "{nombre}, le recordamos que su solicitud continúa abierta. Cuando lo desee, puede continuar respondiendo.",
  },
  respuesta_vendedor: {
    etiqueta: "Respuesta cuando escribe un vendedor",
    porDefecto:
      "Buen día, {nombre}. Este número es el asistente de AFPAM Texcoco. Aquí recibirá los avisos de nuevos prospectos.",
  },
};

export type ConfigBot = Record<string, unknown> & { textos_extra?: Record<string, string> | null };

/** Devuelve el texto configurado (o el de por defecto) con las variables reemplazadas. */
export function texto(
  config: ConfigBot,
  clave: ClaveTexto,
  variables: Record<string, string | number | null | undefined> = {},
): string {
  const def = TEXTOS[clave];
  let valor: string | undefined;
  if (def.columna) {
    const v = config[def.columna];
    if (typeof v === "string" && v.trim() && v !== def.legado) valor = v;
  } else {
    const v = config.textos_extra?.[clave];
    if (typeof v === "string" && v.trim()) valor = v;
  }
  let t = valor ?? def.porDefecto;
  for (const [k, v] of Object.entries(variables)) {
    t = t.split(`{${k}}`).join(v == null ? "" : String(v));
  }
  // Si una variable quedó vacía (p. ej. sin nombre), limpia la puntuación sobrante.
  t = t.replace(/\s+([,.])/g, "$1").replace(/,([.?])/g, "$1").replace(/^[,.\s]+/, "").trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** Valor que debe mostrarse en el panel para editar (ignora los textos antiguos de ejemplo). */
export function valorEditable(config: ConfigBot, clave: ClaveTexto): string {
  const def = TEXTOS[clave];
  const v = def.columna ? config[def.columna] : config.textos_extra?.[clave];
  if (typeof v === "string" && v.trim() && v !== def.legado) return v;
  return def.porDefecto;
}

// Horario laboral: lunes a viernes 8:00–17:00, sábado 8:00–14:00 (America/Mexico_City).
export function enHorarioLaboral(fecha: Date): boolean {
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Mexico_City",
    weekday: "short",
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  }).formatToParts(fecha);
  const dia = partes.find((p) => p.type === "weekday")?.value;
  const hora = Number(partes.find((p) => p.type === "hour")?.value ?? 0) % 24;
  const minuto = Number(partes.find((p) => p.type === "minute")?.value ?? 0);
  const m = hora * 60 + minuto;
  if (dia === "Sun") return false;
  if (dia === "Sat") return m >= 8 * 60 && m < 14 * 60;
  return m >= 8 * 60 && m < 17 * 60;
}
