// Fase 3: comunicación del bot con los vendedores por WhatsApp.
// Avisos con "Lo tomo", datos completos, seguimiento de resultados, comisiones,
// recordatorios de prospectos sin tomar y archivado semanal.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/integrations/supabase/types";
import { ETIQUETAS_DATOS, TEXTO_INTERES, interesDe, moneda } from "@/lib/afpam";
import type { Canal } from "./motor.server";
import type { Opcion, Salida } from "./salida";
import { atenderCotizacion, cotizacionEnCurso, pausarCotizacion } from "./cotizar.server";
import { CATEGORIAS_EQUIPO, CATEGORIA_SERVICIOS, indiceCategoria, pieDeFoto } from "./equipos";
import { buscarManual, enviarManualesDeTipo, enviarPaginas, enviarPdfManual, enviarProcedimiento, enviarProcedimientos, enviarTiposManual } from "./manuales.server";
import { enHorarioLaboral } from "./textos";

type DB = SupabaseClient<Database>;
type Perfil = Database["public"]["Tables"]["usuarios_perfil"]["Row"];
type Solicitud = Database["public"]["Tables"]["solicitudes"]["Row"];
type Contacto = Database["public"]["Tables"]["contactos"]["Row"];
type SolicitudConContacto = Solicitud & { contactos: Contacto | null };

export type Vendedor = Pick<Perfil, "id" | "nombre" | "whatsapp" | "activo"> &
  Partial<Pick<Perfil, "ultimo_mensaje_wa" | "estado_bot" | "es_vendedor">>;

/** Lo que el bot espera que el vendedor responda a continuación. */
type EstadoVendedor = {
  esperando?: "monto" | "motivo" | "varios";
  solicitud_id?: string;
  /** "Varios a la vez": prospectos numerados que se le mostraron y los que eligió. */
  numerados?: string[];
  seleccion?: string[];
  grupo?: Grupo;
  desde?: string;
  /** Última vez que se le envió la lista de prospectos (evita ciclos con respuestas automáticas). */
  ultima_ayuda?: string;
  /** Resultado del último aviso que el bot intentó enviarle (se muestra en Usuarios). */
  ultimo_aviso?: { fecha: string; ok: boolean; error?: string };
  /** ultimo_mensaje_wa para el que ya se pidió renovar la ventana (un aviso por ventana). */
  aviso_ventana?: string;
};

/** Mis prospectos (aún sin cotizar), Mis cotizados (cotizados y negociando) o todos los abiertos. */
type Grupo = "prospectos" | "cotizados" | "todos";
const ETAPAS_GRUPO: Record<Grupo, number[]> = { prospectos: [1], cotizados: [2, 3], todos: [1, 2, 3] };

/** Control interno de avisos por solicitud (columna solicitudes.control_bot). */
type ControlBot = {
  dia?: string;
  recordatorios?: number;
  ultimo_recordatorio?: string;
  ultimo_seguimiento?: string;
};

// ---------------------------------------------------------------- plantillas de Meta

/** Plantillas de utilidad para escribir a vendedores fuera de la ventana de 24 h. */
export const PLANTILLAS_VENDEDORES = {
  // afpam_nuevo_prospecto y afpam_resumen_del_dia quedaron como marketing; estas son las versiones de aviso.
  nuevo: "afpam_solicitud_recibida",
  recordatorio: "afpam_prospecto_sin_tomar",
  // La primera versión (afpam_seguimiento_prospecto) Meta la clasificó como marketing.
  seguimiento: "afpam_seguimiento_asignado",
  mensajeCliente: "afpam_mensaje_de_cliente",
  mensajeSinAsignar: "afpam_mensaje_sin_asignar",
  asignado: "afpam_prospecto_asignado",
  resumenDia: "afpam_pendientes_del_dia",
} as const;

/** Versiones anteriores que Meta clasificó como marketing; se usan solo si la nueva aún no está aprobada. */
const PLANTILLAS_ANTERIORES: Record<string, string> = {
  [PLANTILLAS_VENDEDORES.nuevo]: "afpam_nuevo_prospecto",
  [PLANTILLAS_VENDEDORES.seguimiento]: "afpam_seguimiento_prospecto",
  [PLANTILLAS_VENDEDORES.resumenDia]: "afpam_resumen_del_dia",
};

/** Definiciones para registrarlas en Meta (idioma es_MX, categoría UTILITY). */
export const DEFINICIONES_PLANTILLAS = [
  {
    name: PLANTILLAS_VENDEDORES.nuevo,
    components: [
      {
        type: "BODY",
        text: "Se registró la solicitud de servicio {{1}} en el sistema de AFPAM Texcoco.\nServicio: {{2}}\nZona: {{3}}\nObservaciones: {{4}}\n\nLa solicitud está pendiente de asignación. Los datos de contacto se envían a quien la tome. Seleccione una opción para continuar.",
        example: { body_text: [["3-1-0045", "Elevadizo con paneles", "Texcoco", "Urgente"]] },
      },
      { type: "BUTTONS", buttons: [{ type: "QUICK_REPLY", text: "Lo tomo" }, { type: "QUICK_REPLY", text: "Ver detalles" }] },
    ],
  },
  {
    name: PLANTILLAS_VENDEDORES.recordatorio,
    components: [
      {
        type: "BODY",
        text: "El prospecto {{1}} ({{2}}, {{3}}) sigue sin asignar desde hace {{4}}.\nSeleccione una opción para continuar.",
        example: { body_text: [["3-1-0045", "Elevadizo con paneles", "Texcoco", "2 horas"]] },
      },
      { type: "BUTTONS", buttons: [{ type: "QUICK_REPLY", text: "Lo tomo" }, { type: "QUICK_REPLY", text: "Ver detalles" }] },
    ],
  },
  {
    name: PLANTILLAS_VENDEDORES.seguimiento,
    components: [
      {
        type: "BODY",
        text: "Recordatorio de seguimiento del prospecto {{1}} que tiene asignado.\nCliente: {{2}}\nMunicipio: {{3}}\n\nPor favor registre el estado actual del trabajo seleccionando una de las opciones.",
        example: { body_text: [["3-1-0045", "Juan Pérez", "Texcoco"]] },
      },
      {
        type: "BUTTONS",
        buttons: ["Cotizado", "Negociando", "Vendido", "Perdido", "Sin cambios"].map((text) => ({ type: "QUICK_REPLY", text })),
      },
    ],
  },
  {
    name: PLANTILLAS_VENDEDORES.mensajeCliente,
    components: [
      {
        type: "BODY",
        text: "Tiene un mensaje nuevo de un cliente que ya está asignado a usted.\n\nCliente: {{1}}\nProspecto: {{2}}\nMensaje: {{3}}\nTeléfono del cliente: {{4}}\n\nLe sugerimos responderle a la brevedad desde su WhatsApp personal para dar seguimiento a su solicitud.",
        example: { body_text: [["Juan Pérez", "3-1-0045", "Buen día, ¿a qué hora vienen?", "+52 595 123 4567"]] },
      },
    ],
  },
  {
    name: PLANTILLAS_VENDEDORES.mensajeSinAsignar,
    components: [
      {
        type: "BODY",
        text: 'El cliente del prospecto {{1}} ({{2}}, {{3}}) envió un mensaje nuevo:\n"{{4}}"\nEl prospecto sigue sin asignar. Tómelo para recibir sus datos de contacto.',
        example: { body_text: [["3-1-0045", "Elevadizo con paneles", "Texcoco", "Buen día, ¿siguen disponibles?"]] },
      },
      { type: "BUTTONS", buttons: [{ type: "QUICK_REPLY", text: "Lo tomo" }, { type: "QUICK_REPLY", text: "Ver detalles" }] },
    ],
  },
  {
    name: PLANTILLAS_VENDEDORES.asignado,
    components: [
      {
        type: "BODY",
        text: "El prospecto {{1}} ({{2}}, {{3}}) ya fue asignado a {{4}}. Ya no está disponible para tomarlo.",
        example: { body_text: [["3-1-0045", "Elevadizo con paneles", "Texcoco", "Carlos"]] },
      },
    ],
  },
  {
    name: PLANTILLAS_VENDEDORES.resumenDia,
    components: [
      {
        type: "BODY",
        text: "Reporte de cierre del día de AFPAM Texcoco.\nSolicitudes de servicio pendientes de asignación: {{1}}\nLa más antigua es la {{2}}.\n\nSeleccione la opción para ver la lista de solicitudes pendientes.",
        example: { body_text: [["3", "3-1-0045"]] },
      },
      { type: "BUTTONS", buttons: [{ type: "QUICK_REPLY", text: "Ver la lista" }] },
    ],
  },
];

// ---------------------------------------------------------------- utilidades

const RESULTADOS: Array<{ clave: string; etapa: number | null; titulo: string }> = [
  { clave: "2", etapa: 2, titulo: "Cotizado" },
  { clave: "3", etapa: 3, titulo: "Negociando" },
  { clave: "4", etapa: 4, titulo: "Vendido" },
  { clave: "n", etapa: 0, titulo: "No le interesó" },
  { clave: "0", etapa: 0, titulo: "Perdido" },
  { clave: "=", etapa: null, titulo: "Sin cambios" },
];

/** Botones de la plantilla aprobada de seguimiento, en su orden (no incluye "No le interesó"). */
const RESULTADOS_PLANTILLA = ["2", "3", "4", "0", "="];

/** Cómo queda marcado en Contactos el cliente al que no le interesó. */
export const NO_LE_INTERESO = "no le interesó";

function numeroWhatsApp(tel: string) {
  const d = tel.replace(/\D/g, "");
  return d.length === 10 ? "52" + d : d;
}

/**
 * Cómo se ve un prospecto PROPIO en las listas del vendedor: el teléfono del cliente primero (así lo reconoce
 * en su WhatsApp) y en la descripción el nombre, el municipio, el número del prospecto y la fecha.
 * No usar en prospectos sin asignar: el teléfono solo se entrega a quien lo toma.
 */
export function etiquetaProspecto(s: {
  codigo: string | null;
  numero?: number | null;
  creada_en?: string | null;
  contactos?: { nombre?: string | null; telefono?: string | null; municipio?: string | null } | null;
}) {
  const tel = s.contactos?.telefono && !s.contactos.telefono.startsWith("sim-") ? s.contactos.telefono.replace(/\D/g, "").slice(-10) : "";
  const telefono = tel.length === 10 ? `${tel.slice(0, 3)} ${tel.slice(3, 6)} ${tel.slice(6)}` : "";
  const numero = s.numero != null ? `Núm. ${String(s.numero).padStart(4, "0")}` : s.codigo;
  const fecha = s.creada_en
    ? new Intl.DateTimeFormat("es-MX", { day: "2-digit", month: "2-digit", year: "2-digit", timeZone: "America/Mexico_City" }).format(new Date(s.creada_en))
    : null;
  const nombre = s.contactos?.nombre?.trim() || "Sin nombre";
  return {
    titulo: (telefono || nombre).slice(0, 24),
    descripcion: [telefono ? nombre : null, s.contactos?.municipio, numero, fecha].filter(Boolean).join(" · ").slice(0, 72),
    /** Una línea para listas escritas ("Varios a la vez"). */
    linea: [telefono, nombre, s.contactos?.municipio, numero].filter(Boolean).join(" · "),
  };
}

function telefonoLegible(tel: string) {
  const d = tel.replace(/\D/g, "");
  if (d.length === 12 && d.startsWith("52")) return `+52 ${d.slice(2, 5)} ${d.slice(5, 8)} ${d.slice(8)}`;
  return tel;
}

/** Meta no acepta saltos de línea ni parámetros vacíos en las plantillas. */
function param(v: string | null | undefined, max = 120) {
  const t = (v ?? "").replace(/[\n\t]+/g, " ").replace(/\s{2,}/g, " ").trim();
  return (t || "-").slice(0, max);
}

function ventanaAbierta(v: Vendedor, ahora: Date) {
  if (!v.ultimo_mensaje_wa) return false;
  return ahora.getTime() - new Date(v.ultimo_mensaje_wa).getTime() < 23 * 3600000;
}

function horasDesde(iso: string | null | undefined, ahora: Date) {
  return iso ? (ahora.getTime() - new Date(iso).getTime()) / 3600000 : Infinity;
}

function haceTexto(horas: number) {
  if (horas < 1) return "menos de una hora";
  if (horas < 48) return `${Math.floor(horas)} horas`;
  return `${Math.floor(horas / 24)} días`;
}

/** Folio con la fecha de llegada para los vendedores: "19/10/26 · 3-1-0045". El folio interno no cambia. */
export function folio(s: { codigo: string | null; creada_en?: string | null }, separador = " · ") {
  const codigo = s.codigo ?? "";
  if (!s.creada_en) return codigo;
  const fecha = new Intl.DateTimeFormat("es-MX", {
    timeZone: "America/Mexico_City",
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  }).format(new Date(s.creada_en));
  return `${fecha}${separador}${codigo}`;
}

function marcas(s: Solicitud) {
  const m = [
    s.urgente && "Urgente",
    s.fuera_de_horario && "Fuera de horario",
    s.fuera_de_zona && "Fuera de zona",
    !s.completa && "Incompleta",
    (s.datos as Record<string, unknown> | null)?.["zona"] === "Por confirmar" && "Zona por confirmar",
  ].filter(Boolean);
  return m.length ? m.join(", ") : "Ninguna";
}

async function nombreServicio(db: DB, s: Solicitud) {
  const { data } = await db.from("servicios").select("codigo, nombre");
  const srv = (data ?? []).find((x) => x.codigo === s.servicio_codigo);
  if (!srv) return "Sin especificar";
  const equipoCompra = (s.datos as Record<string, unknown> | null)?.["equipo_compra"];
  if (typeof equipoCompra === "string" && equipoCompra) return `${srv.nombre}: ${equipoCompra}`;
  const eq = s.equipo_codigo ? (data ?? []).find((x) => x.codigo === s.equipo_codigo) : null;
  return eq ? `${srv.nombre} de ${eq.nombre.toLowerCase()}` : srv.nombre;
}

async function cargarSolicitud(db: DB, id: string) {
  const { data } = await db.from("solicitudes").select("*, contactos(*)").eq("id", id).maybeSingle();
  return data as SolicitudConContacto | null;
}

export async function vendedoresActivos(db: DB): Promise<Array<Vendedor & { whatsapp: string }>> {
  const { data } = await db.from("usuarios_perfil").select("*").eq("activo", true).eq("es_vendedor", true);
  return (data ?? []).filter((v): v is Perfil & { whatsapp: string } => !!v.whatsapp);
}

/** Si el número pertenece a un usuario del panel, lo devuelve. */
export async function buscarVendedorPorTelefono(db: DB, telefono: string): Promise<Vendedor | null> {
  const ultimos = telefono.replace(/\D/g, "").slice(-10);
  const { data } = await db.from("usuarios_perfil").select("*");
  return (data ?? []).find((u) => u.whatsapp && u.whatsapp.replace(/\D/g, "").slice(-10) === ultimos) ?? null;
}

/**
 * Envía a un vendedor: mensaje interactivo si la ventana de 24 h está abierta,
 * o la plantilla aprobada si no. Devuelve false si no se pudo enviar.
 */
async function enviarAVendedor(
  db: DB,
  canal: Canal,
  v: Vendedor,
  ahora: Date,
  interactivo: Salida,
  plantilla?: { nombre: string; parametros: string[]; botones?: string[] },
): Promise<boolean> {
  if (!v.whatsapp) return false;
  const tel = numeroWhatsApp(v.whatsapp);
  try {
    if (canal.siempreVentana || ventanaAbierta(v, ahora) || !plantilla) {
      await canal.vendedor(tel, v.nombre, interactivo);
    } else {
      const enviarPlantilla = (nombre: string) =>
        canal.vendedor(tel, v.nombre, {
          tipo: "plantilla",
          nombre,
          idioma: "es_MX",
          parametros: plantilla.parametros.map((p) => param(p)),
          botones: plantilla.botones,
        });
      try {
        await enviarPlantilla(plantilla.nombre);
      } catch (err) {
        // Mientras Meta aprueba la versión nueva, se usa la anterior (mismos datos y botones).
        const anterior = PLANTILLAS_ANTERIORES[plantilla.nombre];
        if (!anterior) throw err;
        await enviarPlantilla(anterior);
      }
    }
    await registrarAviso(db, v, ahora);
    return true;
  } catch (err) {
    console.error(`[vendedores] No se pudo enviar a ${v.nombre}`, err);
    await registrarAviso(db, v, ahora, err instanceof Error ? err.message : String(err));
    return false;
  }
}

/** Guarda si el último aviso al vendedor llegó a WhatsApp o el error que dio. */
async function registrarAviso(db: DB, v: Vendedor, ahora: Date, error?: string) {
  const estado: EstadoVendedor = {
    ...((v.estado_bot ?? {}) as EstadoVendedor),
    ultimo_aviso: { fecha: ahora.toISOString(), ok: !error, ...(error ? { error: error.slice(0, 300) } : {}) },
  };
  v.estado_bot = estado as unknown as Json;
  await db.from("usuarios_perfil").update({ estado_bot: estado as unknown as Json }).eq("id", v.id);
}

/** Respuesta directa a un vendedor que acaba de escribir (la ventana está abierta). */
export async function responder(canal: Canal, v: Vendedor, s: Salida) {
  if (!v.whatsapp) return;
  try {
    await canal.vendedor(numeroWhatsApp(v.whatsapp), v.nombre, s);
  } catch (err) {
    console.error(`[vendedores] No se pudo responder a ${v.nombre}`, err);
  }
}

// ---------------------------------------------------------------- avisos

/** Aviso de nuevo prospecto a todos los vendedores activos. */
export async function avisarNuevoProspecto(db: DB, canal: Canal, solicitudId: string, ahora = new Date()) {
  const s = await cargarSolicitud(db, solicitudId);
  if (!s) return;
  const servicio = await nombreServicio(db, s);
  const zona = zonaDe(s);
  // Solo datos del trabajo: nombre y teléfono se envían únicamente a quien lo tome.
  const texto = [
    `Nuevo prospecto ${folio(s)}`.trim(),
    `Servicio: ${servicio}`,
    `Zona: ${zona}`,
    `Observaciones: ${marcas(s)}`,
    "",
    "Los datos de contacto se envían a quien lo tome.",
  ].join("\n");
  for (const v of await vendedoresActivos(db)) {
    await enviarAVendedor(db, canal, v, ahora, { tipo: "botones", texto, opciones: botonesTomar(s.id) }, {
      nombre: PLANTILLAS_VENDEDORES.nuevo,
      parametros: [folio(s), servicio, zona, marcas(s)],
      botones: [`tomar:${s.id}`, `ver:${s.id}`],
    });
  }
}

/** Reenvía un mensaje del cliente al vendedor asignado (o a todos si no tiene). */
export async function reenviarMensajeCliente(
  db: DB,
  canal: Canal,
  o: {
    contacto: Pick<Contacto, "nombre" | "telefono">;
    codigo: string | null;
    vendedorId: string | null;
    solicitudId?: string | null | undefined;
    contenido: string;
  },
  ahora = new Date(),
) {
  if (!o.vendedorId && o.solicitudId) {
    return reenviarSinAsignar(db, canal, o.solicitudId, o.contenido, ahora);
  }
  const tel = o.contacto.telefono;
  const interactivo: Salida = {
    tipo: "texto",
    texto: [
      `Mensaje del cliente ${o.codigo ?? ""}`.trim(),
      `${o.contacto.nombre ?? "Sin nombre"} (${telefonoLegible(tel)})`,
      `"${o.contenido}"`,
      `Abrir chat: https://wa.me/${tel.replace(/\D/g, "")}`,
    ].join("\n"),
  };
  const todos = await vendedoresActivos(db);
  const asignado = o.vendedorId ? todos.filter((v) => v.id === o.vendedorId) : [];
  for (const v of asignado.length ? asignado : todos) {
    await enviarAVendedor(db, canal, v, ahora, interactivo, {
      nombre: PLANTILLAS_VENDEDORES.mensajeCliente,
      parametros: [o.contacto.nombre ?? "Sin nombre", o.codigo ?? "-", param(o.contenido, 300), telefonoLegible(tel)],
    });
  }
}

/** Mensaje de un cliente cuyo prospecto nadie ha tomado: se avisa a todos sin datos de contacto. */
async function reenviarSinAsignar(db: DB, canal: Canal, solicitudId: string, contenido: string, ahora: Date) {
  const s = await cargarSolicitud(db, solicitudId);
  if (!s) return;
  const servicio = await nombreServicio(db, s);
  const zona = zonaDe(s);
  const texto = [
    `El cliente del prospecto ${folio(s)} (${servicio}, ${zona}) envió un mensaje nuevo:`,
    `"${contenido}"`,
    "",
    "El prospecto sigue sin asignar. Tómelo para recibir sus datos de contacto.",
  ].join("\n");
  for (const v of await vendedoresActivos(db)) {
    await enviarAVendedor(db, canal, v, ahora, { tipo: "botones", texto, opciones: botonesTomar(s.id) }, {
      nombre: PLANTILLAS_VENDEDORES.mensajeSinAsignar,
      parametros: [folio(s), servicio, zona, param(contenido, 300)],
      botones: [`tomar:${s.id}`, `ver:${s.id}`],
    });
  }
}

function preguntaSeguimiento(s: SolicitudConContacto): Salida {
  return {
    tipo: "lista",
    texto: `Seguimiento del prospecto ${etiquetaProspecto(s).linea}${s.etapa === 1 ? "" : ` (${ETAPA_ABIERTA[s.etapa]})`}.\n¿Cuál es su estado actual?`,
    boton: "Ver opciones",
    opciones: opcionesDeProspecto(s),
  };
}

/**
 * Opciones de un prospecto propio según su etapa.
 * Sin cotizar (Mis prospectos): cotizar o registrar qué pasó. Cotizado (Mis cotizados): su cotización y el resultado.
 */
function opcionesDeProspecto(s: Solicitud): Opcion[] {
  if (s.etapa === 1) {
    return [
      { id: `cmd:cotizar:${s.id}`, titulo: "Hacer cotización", descripcion: "Al generarla pasa a Mis cotizados", seccion: "Este prospecto" },
      { id: `todo:${s.id}`, titulo: "Ver todo del cliente", descripcion: "Datos, fotos, conversación y cotizaciones", seccion: "Este prospecto" },
      { id: `conv:${s.id}`, titulo: "Ver conversación", descripcion: "Lo que escribió al bot", seccion: "Este prospecto" },
      { id: `res:2:${s.id}`, titulo: "Cotizado", descripcion: "Pasa a Mis cotizados (si no hizo el PDF en el bot)", seccion: "Resultado" },
      { id: `res:n:${s.id}`, titulo: "No le interesó", seccion: "Resultado" },
      { id: `res:0:${s.id}`, titulo: "Perdido", seccion: "Resultado" },
      { id: `res:=:${s.id}`, titulo: "Sin cambios", descripcion: "Le vuelvo a preguntar más adelante", seccion: "Resultado" },
      { id: "cmd:mis", titulo: "Ver otro prospecto", seccion: "Más" },
      { id: "cmd:menu", titulo: "Menú", seccion: "Más" },
    ];
  }
  return [
    { id: `vcot:${s.id}`, titulo: "Ver la cotización", descripcion: "Le reenvío el PDF", seccion: "Este prospecto" },
    { id: `cmd:recotizar:${s.id}`, titulo: "Volver a cotizar", descripcion: "Con los conceptos de la anterior", seccion: "Este prospecto" },
    { id: `todo:${s.id}`, titulo: "Ver todo del cliente", descripcion: "Datos, fotos, conversación y cotizaciones", seccion: "Este prospecto" },
    ...(s.etapa === 2 ? [{ id: `res:3:${s.id}`, titulo: "Negociando", seccion: "Resultado" }] : []),
    { id: `res:4:${s.id}`, titulo: "Vendido", seccion: "Resultado" },
    { id: `res:n:${s.id}`, titulo: "No le interesó", seccion: "Resultado" },
    { id: `res:0:${s.id}`, titulo: "Perdido", seccion: "Resultado" },
    { id: `res:=:${s.id}`, titulo: "Sin cambios", descripcion: "Le vuelvo a preguntar más adelante", seccion: "Resultado" },
    { id: "cmd:cotizados", titulo: "Ver otro cotizado", seccion: "Más" },
    { id: "cmd:menu", titulo: "Menú", seccion: "Más" },
  ];
}

/** Al terminar algo con un prospecto abierto se vuelven a ofrecer sus opciones. */
function opcionesTras(db: DB, canal: Canal, v: Vendedor, s: Solicitud, texto = "¿Qué desea hacer con este prospecto?") {
  if (![1, 2, 3].includes(s.etapa)) return otraAccion(db, canal, v, SIGUIENTE_RESULTADO);
  return responder(canal, v, { tipo: "lista", texto, boton: "Ver opciones", opciones: opcionesDeProspecto(s) });
}

const fechaCorta = (iso: string) =>
  new Intl.DateTimeFormat("es-MX", { day: "2-digit", month: "2-digit", year: "2-digit", timeZone: "America/Mexico_City" }).format(new Date(iso));

/** Cotizaciones hechas a un prospecto, la más reciente primero. */
async function cotizacionesDe(db: DB, solicitudId: string) {
  const { data } = await db
    .from("cotizaciones")
    .select("folio, total, creada_en, pdf_url, cliente_nombre")
    .eq("solicitud_id", solicitudId)
    .order("creada_en", { ascending: false })
    .limit(5);
  return data ?? [];
}

function zonaDe(s: SolicitudConContacto) {
  const c = s.contactos;
  if (!c?.municipio) return "Sin especificar";
  return c.en_estado_de_mexico ? c.municipio : `${c.municipio} (fuera del Estado de México)`;
}

function botonesTomar(id: string): Opcion[] {
  return [
    { id: `tomar:${id}`, titulo: "Lo tomo" },
    { id: `ver:${id}`, titulo: "Ver detalles" },
  ];
}

async function archivosDe(db: DB, solicitudId: string): Promise<Salida[]> {
  const { data: archivos } = await db.from("archivos").select("url, tipo").eq("solicitud_id", solicitudId).limit(5);
  return (archivos ?? []).map((a): Salida =>
    a.tipo === "image" || /\.(jpe?g|png|webp)$/i.test(a.url)
      ? { tipo: "imagen", url: a.url }
      : { tipo: "documento", url: a.url, nombre: "Archivo del cliente" },
  );
}

function lineasDelTrabajo(s: SolicitudConContacto) {
  const datos = (s.datos ?? {}) as Record<string, unknown>;
  return Object.entries(datos)
    .filter(([, v]) => v !== null && v !== undefined && v !== "")
    .map(([k, v]) => `${ETIQUETAS_DATOS[k] ?? k}: ${String(v)}`);
}

/** Detalles para decidir si tomarlo: sin nombre, teléfono ni enlace al chat. */
/**
 * Ficha resumida de un prospecto SIN TOMAR, en un solo mensaje con el botón Lo tomo.
 * Sin datos de contacto ni fotos: esos llegan una sola vez, al tomarlo.
 */
async function fichaResumida(db: DB, s: SolicitudConContacto): Promise<Salida> {
  const datos = (s.datos ?? {}) as Record<string, unknown>;
  const clave = (k: string) => (typeof datos[k] === "string" && (datos[k] as string).trim() ? `${ETIQUETAS_DATOS[k] ?? k}: ${String(datos[k]).slice(0, 60)}` : null);
  const { data: archivos } = await db.from("archivos").select("id").eq("solicitud_id", s.id);
  const fotos = archivos?.length ?? 0;
  const lineas = [
    `*Prospecto ${folio(s)}*`,
    `Servicio: ${await nombreServicio(db, s)}`,
    `Zona: ${zonaDe(s)}`,
    ...["pedido_cliente", "medidas", "tiene_porton", "equipo_compra", "falla", "horario_preferido"].map(clave).filter((x): x is string => !!x),
    `Observaciones: ${marcas(s)}`,
    `Interés: ${TEXTO_INTERES[interesDe(s)]}`,
    datos["fuera_encuesta"] ? `Mensajes fuera de la encuesta: ${String(datos["fuera_encuesta"]).split(" | ").length} (se envían al tomarlo)` : null,
    fotos ? `Fotos del cliente: ${fotos} (se envían al tomarlo)` : null,
    "",
    "Los datos de contacto se envían a quien lo tome.",
  ].filter((x): x is string => x !== null);
  return {
    tipo: "botones",
    texto: lineas.join("\n"),
    opciones: [
      { id: `tomar:${s.id}`, titulo: "Lo tomo" },
      { id: "cmd:pendientes", titulo: "Ver otro sin tomar" },
      { id: "cmd:menu", titulo: "Menú" },
    ],
  };
}

async function datosCompletos(db: DB, s: SolicitudConContacto): Promise<Salida[]> {
  const c = s.contactos;
  const lineas = [
    `Datos del prospecto ${folio(s)}`,
    `Nombre: ${c?.nombre ?? "Sin nombre"}`,
    `Teléfono: ${telefonoLegible(c?.telefono ?? "")}`,
    `Municipio: ${c?.municipio ?? "Sin especificar"}${c && !c.en_estado_de_mexico ? " (fuera del Estado de México)" : ""}`,
    `Servicio: ${await nombreServicio(db, s)}`,
    ...lineasDelTrabajo(s),
    `Observaciones: ${marcas(s)}`,
    `Interés: ${TEXTO_INTERES[interesDe(s)]}`,
    `Abrir chat: https://wa.me/${(c?.telefono ?? "").replace(/\D/g, "")}`,
  ];
  return [{ tipo: "texto", texto: lineas.join("\n") }, ...(await archivosDe(db, s.id))];
}

// ---------------------------------------------------------------- mensajes de vendedores

async function guardarEstadoVendedor(db: DB, v: Vendedor, estado: EstadoVendedor) {
  const previo = (v.estado_bot ?? {}) as EstadoVendedor;
  const ultimo = previo.ultimo_aviso ?? estado.ultimo_aviso;
  const cot = (previo as { cot?: unknown }).cot;
  const nuevo: EstadoVendedor = { ...estado, ...(ultimo ? { ultimo_aviso: ultimo } : {}), ...(cot ? { cot } : {}) } as EstadoVendedor;
  v.estado_bot = nuevo as unknown as Json;
  await db.from("usuarios_perfil").update({ estado_bot: nuevo as unknown as Json }).eq("id", v.id);
}

/** Tarjeta de contacto y datos completos del prospecto para el vendedor asignado. */
/**
 * Nombre con el que el vendedor guarda al cliente en su celular:
 * "Juan Pérez · Texcoco, San Lorenzo"; si no dio un nombre válido, "Cliente 0045" (más la colonia si la dio).
 */
export function nombreTarjeta(s: { numero?: number | null; codigo: string | null; contactos?: { nombre?: string | null; municipio?: string | null } | null }) {
  const nombre = (s.contactos?.nombre ?? "").trim();
  const t = nombre.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const valido = t.length >= 3 && !/^\d+$/.test(t) && !/^(.)\1*$/.test(t) && !/^(no|na|n\/a|ninguno|nadie|anonimo|cliente|sin nombre|no quiero|xxx?)\b/.test(t);
  const lugar = s.contactos?.municipio?.trim();
  const base = valido ? nombre : `Cliente ${s.numero != null ? String(s.numero).padStart(4, "0") : s.codigo ?? ""}`.trim();
  return (lugar ? `${base} · ${lugar}` : base).slice(0, 60);
}

async function entregarDatos(db: DB, canal: Canal, v: Vendedor, s: SolicitudConContacto, conConversacion: boolean | "siempre" = false) {
  const c = s.contactos;
  if (c?.telefono && !c.telefono.startsWith("sim-")) {
    await responder(canal, v, { tipo: "contacto", nombre: nombreTarjeta(s), telefono: c.telefono });
  }
  for (const salida of await datosCompletos(db, s)) await responder(canal, v, salida);
  // Si no terminó la encuesta o escribió cosas fuera de ella, se manda la conversación para no perder nada.
  const datos = (s.datos ?? {}) as Record<string, unknown>;
  if (conConversacion === "siempre" || (conConversacion && (!s.completa || datos["fuera_encuesta"] || datos["pedido_cliente"]))) {
    for (const salida of await conversacionDe(db, s)) await responder(canal, v, salida);
  }
}

/**
 * La conversación del cliente con el bot, en texto, para el vendedor asignado.
 * Primero lo que escribió fuera de la encuesta; luego la conversación (lo del bot, recortado).
 */
async function conversacionDe(db: DB, s: SolicitudConContacto): Promise<Salida[]> {
  const { data } = await db
    .from("mensajes")
    .select("direccion, contenido, tipo, creado_en")
    .eq("contacto_id", s.contacto_id)
    .order("creado_en", { ascending: false })
    .limit(60);
  // Desde 14 días antes del prospecto, para no mezclar conversaciones de meses atrás.
  const desde = new Date(new Date(s.creada_en).getTime() - 14 * 86400000).toISOString();
  const mensajes = (data ?? []).filter((m) => m.creado_en >= desde).reverse().slice(-40);
  const hora = (iso: string) =>
    new Intl.DateTimeFormat("es-MX", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/Mexico_City" }).format(new Date(iso));
  const lineas = mensajes.map((m) => {
    const contenido = (m.contenido ?? "").replace(/\s+/g, " ").trim() || `[${m.tipo === "image" || m.tipo === "imagen" ? "foto" : m.tipo}]`;
    return m.direccion === "entrante"
      ? `*Cliente* ${hora(m.creado_en)}: ${contenido.slice(0, 600)}`
      : `_Bot: ${contenido.length > 70 ? `${contenido.slice(0, 70)}…` : contenido}_`;
  });
  const datos = (s.datos ?? {}) as Record<string, unknown>;
  const fuera = String(datos["fuera_encuesta"] ?? "").split(" | ").filter(Boolean);
  const encabezado = [
    `*Conversación con el bot – ${folio(s)}*`,
    fuera.length ? `\n*Escribió fuera de la encuesta:*\n${fuera.map((f) => `· ${f}`).join("\n")}` : "",
    "",
  ].join("\n");
  const partes: string[] = [];
  let actual = encabezado;
  for (const l of lineas.length ? lineas : ["(Sin mensajes guardados.)"]) {
    if ((actual + "\n" + l).length > 3500) {
      partes.push(actual);
      actual = "";
    }
    actual = actual ? `${actual}\n${l}` : l;
  }
  if (actual) partes.push(actual);
  return partes.map((texto): Salida => ({ tipo: "texto", texto }));
}

/**
 * "Ver todo del cliente" (o escribir el número del prospecto): vuelve a mandar todo junto
 * —tarjeta, datos, fotos, conversación y cotizaciones— para cuando se perdió entre los mensajes.
 */
async function verTodo(db: DB, canal: Canal, v: Vendedor, s: SolicitudConContacto) {
  await responder(canal, v, { tipo: "texto", texto: `Le envío toda la información del prospecto ${folio(s)}.` });
  await entregarDatos(db, canal, v, s, "siempre");
  const cots = await cotizacionesDe(db, s.id);
  if (cots.length) {
    await responder(canal, v, {
      tipo: "texto",
      texto: `*Cotizaciones de este prospecto*\n${cots.map((c) => `· ${c.folio ?? "COT"} · ${moneda(c.total)} · ${fechaCorta(c.creada_en)}`).join("\n")}`,
    });
    const ultima = cots[0]!;
    if (ultima.pdf_url) await responder(canal, v, { tipo: "documento", url: ultima.pdf_url, nombre: `${ultima.folio ?? "Cotización"} ${ultima.cliente_nombre}.pdf` });
  }
  return opcionesTras(db, canal, v, s);
}

async function tomar(db: DB, canal: Canal, v: Vendedor, solicitudId: string, ahora: Date) {
  const { data: tomada } = await db
    .from("solicitudes")
    .update({ vendedor_id: v.id, tomada_en: ahora.toISOString() })
    .eq("id", solicitudId)
    .is("vendedor_id", null)
    .select("id")
    .maybeSingle();
  const s = await cargarSolicitud(db, solicitudId);
  if (!s) {
    await responder(canal, v, { tipo: "texto", texto: "No encontré ese prospecto." });
    return;
  }
  if (!tomada) {
    if (s.vendedor_id === v.id) {
      await responder(canal, v, { tipo: "texto", texto: `El prospecto ${folio(s)} está asignado a usted. Le envío los datos del cliente.` });
      await entregarDatos(db, canal, v, s);
      return otraAccion(db, canal, v, [
    { id: `cmd:cotizar:${s.id}`, titulo: "Hacer cotización" },
    { id: `conv:${s.id}`, titulo: "Ver conversación" },
  ]);
    }
    const { data: otro } = await db.from("usuarios_perfil").select("nombre").eq("id", s.vendedor_id ?? "").maybeSingle();
    await responder(canal, v, { tipo: "texto", texto: `Este prospecto ya fue tomado por ${otro?.nombre ?? "otro vendedor"}.` });
    return;
  }
  await responder(canal, v, {
    tipo: "texto",
    texto: `Listo, el prospecto ${folio(s)} quedó asignado a usted. Le envío la tarjeta de contacto para que la guarde y los datos completos.`,
  });
  await entregarDatos(db, canal, v, s, true);

  // Avisa a los demás que ya no está disponible.
  const servicio = await nombreServicio(db, s);
  const zona = zonaDe(s);
  for (const otro of await vendedoresActivos(db)) {
    if (otro.id === v.id) continue;
    await enviarAVendedor(
      db,
      canal,
      otro,
      ahora,
      { tipo: "texto", texto: `El prospecto ${folio(s)} (${servicio}, ${zona}) ya fue asignado a ${v.nombre}. Ya no está disponible para tomarlo.` },
      { nombre: PLANTILLAS_VENDEDORES.asignado, parametros: [folio(s), servicio, zona, v.nombre] },
    );
  }
  await otraAccion(db, canal, v, [
    { id: `cmd:cotizar:${s.id}`, titulo: "Hacer cotización" },
    { id: `conv:${s.id}`, titulo: "Ver conversación" },
  ]);
}

/**
 * Si el prospecto está asignado a otro vendedor, se lo dice y devuelve true.
 * Solo el vendedor asignado registra resultados; el administrador puede hacerlo desde el panel.
 */
async function asignadoAOtro(db: DB, canal: Canal, v: Vendedor, solicitudId: string): Promise<boolean> {
  const { data: s } = await db.from("solicitudes").select("codigo, vendedor_id").eq("id", solicitudId).maybeSingle();
  if (!s?.vendedor_id || s.vendedor_id === v.id) return false;
  const { data: otro } = await db.from("usuarios_perfil").select("nombre").eq("id", s.vendedor_id).maybeSingle();
  await responder(canal, v, {
    tipo: "texto",
    texto: `El prospecto ${folio(s)} está asignado a ${otro?.nombre ?? "otro vendedor"}. Solo esa persona puede registrar su resultado.`,
  });
  return true;
}

async function registrarResultado(db: DB, canal: Canal, v: Vendedor, clave: string, solicitudId: string, ahora: Date) {
  const r = RESULTADOS.find((x) => x.clave === clave);
  const s = await cargarSolicitud(db, solicitudId);
  if (!r || !s) {
    await responder(canal, v, { tipo: "texto", texto: "No encontré ese prospecto." });
    return;
  }
  if (await yaCerrado(canal, v, s)) return enviarMisProspectos(db, canal, v, "seg");
  const control = { ...((s.control_bot ?? {}) as ControlBot), ultimo_seguimiento: ahora.toISOString() };
  const asignar = s.vendedor_id ? {} : { vendedor_id: v.id, tomada_en: ahora.toISOString() };

  if (r.etapa === null) {
    await db.from("solicitudes").update({ control_bot: control as unknown as Json }).eq("id", s.id);
    await responder(canal, v, { tipo: "texto", texto: `Sin cambios en ${folio(s)}. Le volveré a preguntar más adelante.` });
    return otraAccion(db, canal, v, SIGUIENTE_RESULTADO);
  }
  if (r.clave === "n") {
    await db.from("solicitudes").update({ control_bot: control as unknown as Json, ...asignar }).eq("id", s.id);
    return cerrarNoLeIntereso(db, canal, v, s.id);
  }
  // Vendido y Perdido se guardan de inmediato; el monto y el motivo se piden después (si no contesta, ya quedó registrado).
  if (r.etapa === 4) {
    const { data: n } = await db.from("solicitudes").update({ etapa: 4, control_bot: control as unknown as Json, ...asignar }).eq("id", s.id).select("codigo").single();
    await guardarEstadoVendedor(db, v, { esperando: "monto", solicitud_id: s.id, desde: ahora.toISOString() });
    await responder(canal, v, {
      tipo: "botones",
      texto: `Felicidades. Registrado como vendido: ${n?.codigo ?? s.codigo}.\nIndique el monto final de la venta en pesos, por ejemplo: *12500*`,
      opciones: [{ id: `montodespues:${s.id}`, titulo: "Lo pongo después" }],
    });
    return;
  }
  if (r.etapa === 0) {
    const { data: n } = await db.from("solicitudes").update({ etapa: 0, control_bot: control as unknown as Json, ...asignar }).eq("id", s.id).select("codigo").single();
    await guardarEstadoVendedor(db, v, { esperando: "motivo", solicitud_id: s.id, desde: ahora.toISOString() });
    await responder(canal, v, {
      tipo: "botones",
      texto: `Registrado como perdido: ${n?.codigo ?? s.codigo}.\nSi quiere, indique brevemente el motivo, o seleccione Omitir.`,
      opciones: [{ id: `omitir:${s.id}`, titulo: "Omitir" }],
    });
    return;
  }
  const { data: nueva } = await db
    .from("solicitudes")
    .update({ etapa: r.etapa, control_bot: control as unknown as Json, ...asignar })
    .eq("id", s.id)
    .select("codigo")
    .single();
  await responder(canal, v, {
    tipo: "texto",
    texto: `Registrado: ${nueva?.codigo ?? s.codigo} – ${r.titulo}.${s.etapa === 1 ? " Ahora aparece en *Mis cotizados*." : ""}`,
  });
  return otraAccion(db, canal, v, SIGUIENTE_RESULTADO);
}

/** Cierra el prospecto como "No le interesó" y deja marcado al cliente en Contactos. */
async function cerrarNoLeIntereso(db: DB, canal: Canal, v: Vendedor, solicitudId: string) {
  const { data: previa } = await db.from("solicitudes").select("notas, contacto_id").eq("id", solicitudId).maybeSingle();
  const notas = [previa?.notas, "Resultado: no le interesó"].filter(Boolean).join("\n");
  const { data: s } = await db.from("solicitudes").update({ etapa: 0, notas }).eq("id", solicitudId).select("codigo").single();
  if (previa?.contacto_id) await db.from("contactos").update({ nivel_interes: NO_LE_INTERESO }).eq("id", previa.contacto_id);
  await guardarEstadoVendedor(db, v, {});
  await responder(canal, v, {
    tipo: "texto",
    texto: `Registrado: ${s?.codigo ?? ""} – No le interesó. El número quedó guardado en Contactos como "No le interesó".`,
  });
  return otraAccion(db, canal, v, SIGUIENTE_RESULTADO);
}

function leerMonto(t: string): number | null {
  const limpio = t.replace(/[$\s]/g, "").replace(/,(?=\d{3}(\D|$))/g, "").replace(",", ".");
  const m = /\d+(\.\d{1,2})?/.exec(limpio);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) && n > 0 && n < 100_000_000 ? n : null;
}

async function cerrarVenta(db: DB, canal: Canal, v: Vendedor, solicitudId: string, monto: number, ahora: Date) {
  const { data: s } = await db
    .from("solicitudes")
    .update({ etapa: 4, monto_venta: monto })
    .eq("id", solicitudId)
    .select("codigo, comision, vendedor_id")
    .single();
  if (s && !s.vendedor_id) {
    await db.from("solicitudes").update({ vendedor_id: v.id, tomada_en: ahora.toISOString() }).eq("id", solicitudId);
  }
  await guardarEstadoVendedor(db, v, {});
  await responder(canal, v, {
    tipo: "texto",
    texto: `Registrado: ${s?.codigo ?? ""} – ${moneda(monto)} – ${v.nombre}. Comisión: ${moneda(s?.comision ?? null)}.`,
  });
  return otraAccion(db, canal, v, SIGUIENTE_RESULTADO);
}

async function cerrarPerdido(db: DB, canal: Canal, v: Vendedor, solicitudId: string, motivo: string | null, ahora: Date, yaRegistrado = false) {
  const { data: previa } = await db.from("solicitudes").select("notas, vendedor_id").eq("id", solicitudId).maybeSingle();
  const notas = motivo ? [previa?.notas, `Motivo de pérdida: ${motivo}`].filter(Boolean).join("\n") : previa?.notas ?? null;
  const asignar = previa?.vendedor_id ? {} : { vendedor_id: v.id, tomada_en: ahora.toISOString() };
  const { data: s } = await db
    .from("solicitudes")
    .update({ etapa: 0, notas, ...asignar })
    .eq("id", solicitudId)
    .select("codigo")
    .single();
  await guardarEstadoVendedor(db, v, {});
  if (!yaRegistrado) await responder(canal, v, { tipo: "texto", texto: `Registrado: ${s?.codigo ?? ""} – Perdido.` });
  else if (motivo) await responder(canal, v, { tipo: "texto", texto: `Motivo guardado en ${s?.codigo ?? ""}.` });
  return otraAccion(db, canal, v, SIGUIENTE_RESULTADO);
}

/**
 * Si el prospecto ya tiene resultado final (vendido, perdido o archivado), lo avisa y devuelve true.
 * Pasa cuando el vendedor toca un prospecto en una lista vieja del chat: WhatsApp no actualiza esos mensajes.
 */
async function yaCerrado(canal: Canal, v: Vendedor, s: Solicitud) {
  if ([1, 2, 3].includes(s.etapa)) return false;
  const estado = s.etapa === 4 ? "vendido" : s.etapa === 5 ? "archivado" : "perdido o no le interesó";
  await responder(canal, v, {
    tipo: "texto",
    texto: `El prospecto ${s.codigo} ya tiene resultado final (${estado}). Esa lista era de antes; aquí van sus prospectos actualizados.`,
  });
  return true;
}

/** Procesa un mensaje de un usuario del panel (vendedor o dueño). */
export async function procesarMensajeVendedor(
  db: DB,
  canal: Canal,
  v: Vendedor,
  entrada: { texto?: string | undefined; opcionId?: string | undefined },
  ahora = new Date(),
) {
  await db.from("usuarios_perfil").update({ ultimo_mensaje_wa: ahora.toISOString() }).eq("id", v.id);
  v.ultimo_mensaje_wa = ahora.toISOString();

  const id = entrada.opcionId ?? "";
  const [accion, a, b] = id.split(":");
  if (accion === "pendientes" || id === "cmd:pendientes") return enviarSinAsignar(db, canal, v);
  if (id === "cmd:menu") {
    await olvidarVarios(db, v);
    return enviarMenu(db, canal, v);
  }
  if (id === "cmd:mas") return enviarMenu(db, canal, v, true);
  if (id === "cmd:mis") return enviarMisProspectos(db, canal, v, "ficha", "prospectos");
  if (id === "cmd:cotizados") return enviarMisProspectos(db, canal, v, "ficha", "cotizados");
  if (id === "cmd:resultado") return enviarMisProspectos(db, canal, v, "seg", "todos");
  if ((accion === "todo" || accion === "vcot") && a) {
    if (await asignadoAOtro(db, canal, v, a)) return;
    const s = await cargarSolicitud(db, a);
    if (!s) return responder(canal, v, { tipo: "texto", texto: "No encontré ese prospecto." });
    if (!s.vendedor_id) return responder(canal, v, await fichaResumida(db, s));
    if (accion === "todo") return verTodo(db, canal, v, s);
    return enviarCotizacionDe(db, canal, v, s);
  }
  if (id === "cmd:ventas") return enviarMisVentas(db, canal, v, ahora);
  if (accion === "mat" && a) return enviarMaterial(db, canal, v, a, ahora);
  if (id === "cmd:material") return enviarListaMaterial(db, canal, v);
  if (id === "cmd:manuales") return enviarTiposManual(db, canal, v);
  if (accion === "man" && a && b) {
    if (a === "t") return enviarManualesDeTipo(db, canal, v, Number(b));
    if (a === "m") return enviarProcedimientos(db, canal, v, b);
    if (a === "p") return enviarProcedimiento(db, canal, v, b);
    if (a === "pag") return enviarPaginas(db, canal, v, b);
    if (a === "pdf") return enviarPdfManual(db, canal, v, b);
  }
  if (accion === "conv" && a) {
    if (await asignadoAOtro(db, canal, v, a)) return;
    const s = await cargarSolicitud(db, a);
    if (!s) return responder(canal, v, { tipo: "texto", texto: "No encontré ese prospecto." });
    if (!s.vendedor_id) return responder(canal, v, await fichaResumida(db, s));
    for (const salida of await conversacionDe(db, s)) await responder(canal, v, salida);
    return opcionesTras(db, canal, v, s);
  }
  if (accion === "montodespues" && a) {
    await guardarEstadoVendedor(db, v, {});
    const { data: s } = await db.from("solicitudes").select("numero").eq("id", a).maybeSingle();
    await responder(canal, v, {
      tipo: "texto",
      texto: `De acuerdo, la venta ya quedó registrada. Cuando tenga el monto escriba, por ejemplo: *${String(s?.numero ?? "").padStart(4, "0")} vendido 12500*`,
    });
    return otraAccion(db, canal, v, SIGUIENTE_RESULTADO);
  }
  if (accion === "varios") return pedirVarios(db, canal, v, ahora, a === "prospectos" || a === "cotizados" ? a : "todos");
  if (accion === "resv" && a) return registrarVarios(db, canal, v, a, ahora);
  if (id === "cmd:catalogo") return enviarCategorias(db, canal, v);
  if (accion === "cat" && a) return enviarEquiposDeCategoria(db, canal, v, Number(a), Number(b ?? 0));
  if (accion === "eq" && a) return enviarEquipo(db, canal, v, a, ahora);
  if (accion === "ficha" && a) return enviarFicha(db, canal, v, a);
  if (accion === "renovar") {
    return responder(canal, v, { tipo: "texto", texto: "Listo, seguirá recibiendo los avisos de prospectos con todos sus botones." });
  }
  if (accion === "tomar" && a) return tomar(db, canal, v, a, ahora);
  if (accion === "ver" && a) {
    const s = await cargarSolicitud(db, a);
    if (!s) return responder(canal, v, { tipo: "texto", texto: "No encontré ese prospecto." });
    if (s.vendedor_id === v.id) {
      for (const salida of await datosCompletos(db, s)) await responder(canal, v, salida);
      return;
    }
    if (s.vendedor_id) {
      const { data: otro } = await db.from("usuarios_perfil").select("nombre").eq("id", s.vendedor_id).maybeSingle();
      return responder(canal, v, { tipo: "texto", texto: `Este prospecto ya fue tomado por ${otro?.nombre ?? "otro vendedor"}.` });
    }
    return responder(canal, v, await fichaResumida(db, s));
  }
  if (accion === "seg" && a) {
    if (await asignadoAOtro(db, canal, v, a)) return;
    const s = await cargarSolicitud(db, a);
    if (s && (await yaCerrado(canal, v, s))) return enviarMisProspectos(db, canal, v, "seg");
    if (s) await responder(canal, v, preguntaSeguimiento(s));
    return;
  }
  if (accion === "res" && a && b) {
    if (await asignadoAOtro(db, canal, v, b)) return;
    return registrarResultado(db, canal, v, a, b, ahora);
  }
  if (accion === "omitir" && a) {
    if (await asignadoAOtro(db, canal, v, a)) return;
    return cerrarPerdido(db, canal, v, a, null, ahora, true);
  }

  // Botones de plantilla sin payload: llegan solo con el texto del botón.
  const texto = (entrada.texto ?? "").trim();
  if (/^ver la lista$/i.test(texto)) return enviarSinAsignar(db, canal, v);

  // Solo la palabra COMANDOS abre el menú.
  const pideManual = /^manual(?:es)?\s+(.{2,60})$/i.exec(texto);
  if (pideManual && !cotizacionEnCurso(v, ahora)) return buscarManual(db, canal, v, pideManual[1]!);
  if (/^#?\s*comandos?[.!]?$/i.test(texto)) {
    await pausarCotizacion(db, v, ahora);
    await olvidarVarios(db, v);
    return enviarMenu(db, canal, v);
  }
  // Cotización en curso (o el botón "Hacer cotización").
  if (await atenderCotizacion(db, canal, v, entrada, ahora)) return;

  // Orden del administrador: "asigna el último prospecto a Luis", "asigna 0025 a 5512345678".
  const orden = ORDEN_ASIGNAR.exec(texto);
  if (orden) {
    const quien = (orden[3] ?? "").replace(/[.,;!?]+$/, "").trim();
    return asignarPorOrden(db, canal, v, orden[1] ? null : Number(orden[2]), quien, ahora);
  }

  const estado = (v.estado_bot ?? {}) as EstadoVendedor;
  if (estado.esperando === "varios" && texto && horasDesde(estado.desde, ahora) < 2) {
    if (/^cancelar$/i.test(texto)) {
      await guardarEstadoVendedor(db, v, {});
      await responder(canal, v, { tipo: "texto", texto: "Cancelado. No se registró ningún cambio." });
      return otraAccion(db, canal, v, SIGUIENTE_RESULTADO);
    }
    const numeros = [...new Set((texto.match(/\d+/g) ?? []).map(Number))];
    const elegidos = numeros.map((n) => estado.numerados?.[n - 1]).filter((x): x is string => !!x);
    if (!/^[\d\s,;y.-]+$/i.test(texto) || !elegidos.length) {
      return responder(canal, v, { tipo: "texto", texto: 'Escriba solo los números de la lista, separados por coma. Por ejemplo: *1, 3, 4*. Para salir escriba "cancelar".' });
    }
    await guardarEstadoVendedor(db, v, { ...estado, seleccion: elegidos });
    return responder(canal, v, {
      tipo: "lista",
      texto: `Eligió ${elegidos.length} prospecto(s). ¿Qué resultado les registro?\n\nLas ventas se registran una por una porque llevan monto.`,
      boton: "Ver resultados",
      opciones: RESULTADOS.filter((r) => RESULTADOS_VARIOS[estado.grupo ?? "todos"].includes(r.clave)).map((r) => ({ id: `resv:${r.clave}`, titulo: r.titulo })),
    });
  }

  const vigente = estado.esperando && estado.esperando !== "varios" && estado.solicitud_id && horasDesde(estado.desde, ahora) < 24;
  if (vigente && texto) {
    if (/^cancelar$/i.test(texto)) {
      await guardarEstadoVendedor(db, v, {});
      return responder(canal, v, { tipo: "texto", texto: "Cancelado. No se registró ningún cambio." });
    }
    if (await asignadoAOtro(db, canal, v, estado.solicitud_id!)) {
      await guardarEstadoVendedor(db, v, {});
      return;
    }
    if (estado.esperando === "monto") {
      const monto = leerMonto(texto);
      if (monto === null) {
        return responder(canal, v, { tipo: "texto", texto: 'No logré leer el monto. Escriba solo la cantidad, por ejemplo 12500, o escriba "cancelar".' });
      }
      return cerrarVenta(db, canal, v, estado.solicitud_id!, monto, ahora);
    }
    if (estado.esperando === "motivo") {
      return cerrarPerdido(db, canal, v, estado.solicitud_id!, /^omitir$/i.test(texto) ? null : texto.slice(0, 300), ahora, true);
    }
  }

  // Atajo: escribir solo el número del prospecto (0045) vuelve a mandar toda su información.
  const soloNumero = /^#?\s*(?:\d{1,2}-\d{1,2}-)?(\d{1,6})$/.exec(texto);
  if (soloNumero) {
    const { data: s0 } = await db.from("solicitudes").select("id").eq("numero", Number(soloNumero[1])).maybeSingle();
    if (!s0) return responder(canal, v, { tipo: "texto", texto: `No encontré el prospecto número ${soloNumero[1]}. Para ver lo que puede pedirme, escriba *comandos*.` });
    if (await asignadoAOtro(db, canal, v, s0.id)) return;
    const s = await cargarSolicitud(db, s0.id);
    if (!s) return responder(canal, v, { tipo: "texto", texto: "No encontré ese prospecto." });
    if (!s.vendedor_id) return responder(canal, v, await fichaResumida(db, s));
    return verTodo(db, canal, v, s);
  }

  // Comandos de texto: "0045 vendido 12500", "45 cotizado", "0045 perdido motivo".
  const cmd = /^#?(\d{1,6})\s+(cotizad[oa]|negociando|negociaci[oó]n|vendid[oa]|venta|perdid[oa]|no\s+(?:le\s+)?intere(?:s[oó]|sa))(?=[\s.,;!]|$)[.,;!]?\s*(.*)$/i.exec(texto);
  if (cmd) {
    const { data: s } = await db.from("solicitudes").select("id").eq("numero", Number(cmd[1])).maybeSingle();
    if (!s) return responder(canal, v, { tipo: "texto", texto: `No encontré el prospecto número ${cmd[1]}.` });
    if (await asignadoAOtro(db, canal, v, s.id)) return;
    const palabra = (cmd[2] ?? "").toLowerCase();
    const resto = (cmd[3] ?? "").trim();
    if (palabra.startsWith("no")) return registrarResultado(db, canal, v, "n", s.id, ahora);
    if (palabra.startsWith("cotizad")) return registrarResultado(db, canal, v, "2", s.id, ahora);
    if (palabra.startsWith("negoci")) return registrarResultado(db, canal, v, "3", s.id, ahora);
    if (palabra.startsWith("perdid")) {
      if (resto) return cerrarPerdido(db, canal, v, s.id, resto.slice(0, 300), ahora);
      return registrarResultado(db, canal, v, "0", s.id, ahora);
    }
    const monto = leerMonto(resto);
    if (monto !== null) return cerrarVenta(db, canal, v, s.id, monto, ahora);
    return registrarResultado(db, canal, v, "4", s.id, ahora);
  }

  // Si el vendedor tiene respuestas automáticas (WhatsApp Business), su respuesta llegaría aquí y el bot
  // contestaría otra vez: el recordatorio solo se envía una vez cada 10 minutos para no armar un ciclo.
  if (horasDesde(estado.ultima_ayuda, ahora) < 1 / 6) return;
  await guardarEstadoVendedor(db, v, { ...estado, ultima_ayuda: ahora.toISOString() });
  return responder(canal, v, {
    tipo: "texto",
    texto: `Buen día, ${v.nombre}. Este número es el asistente de AFPAM Texcoco. Para ver lo que puede pedirme, escriba *comandos*.\nSi escribe el número de un prospecto suyo (por ejemplo *0045*), le envío toda su información.`,
  });
}

// ---------------------------------------------------------------- menú de comandos del vendedor

type Material = Database["public"]["Tables"]["material_venta"]["Row"];
type ArchivoMaterial = { url: string; tipo: "imagen" | "documento"; nombre?: string };

/** Material de venta activo que puede ver este usuario (vacío si la tabla aún no existe). */
async function materialesPara(db: DB, v: Vendedor): Promise<Material[]> {
  const { data, error } = await db.from("material_venta").select("*").eq("activo", true).order("orden", { ascending: true });
  if (error || !data?.length) return [];
  const admin = data.some((m) => m.solo_admin) ? await esAdministrador(db, v) : false;
  return data.filter((m) => admin || !m.solo_admin);
}

const MENU_FIJO: Opcion[] = [
  { id: "cmd:mis", titulo: "Mis prospectos", descripcion: "Aún sin cotizar: datos y qué pasó", seccion: "Prospectos" },
  { id: "cmd:cotizados", titulo: "Mis cotizados", descripcion: "Su cotización y el resultado", seccion: "Prospectos" },
  { id: "cmd:resultado", titulo: "Registrar resultado", descripcion: "De cualquier prospecto, sin entrar a la lista", seccion: "Prospectos" },
  { id: "cmd:pendientes", titulo: "Prospectos sin vendedor", descripcion: "Para tomar uno", seccion: "Prospectos" },
  { id: "cmd:ventas", titulo: "Ventas y comisión", descripcion: "Del mes en curso", seccion: "Mis ventas" },
  { id: "cmd:catalogo", titulo: "Catálogo de equipos", descripcion: "Fotos para enviar al cliente", seccion: "Catálogo" },
  { id: "cmd:cotizar", titulo: "Hacer cotización", descripcion: "PDF con la plantilla de AFPAM", seccion: "Catálogo" },
  { id: "cmd:manuales", titulo: "Manuales técnicos", descripcion: "Programar controles, carrera, clonar…", seccion: "Técnico" },
];

/** Menú principal (o la segunda página de material con "mas"). Una lista de WhatsApp admite 10 filas. */
/**
 * Al terminar una acción: "¿Desea hacer alguna otra acción?" con botones para repetir lo mismo
 * (hasta 2) y "Menú", para no tener que pasar siempre por el menú completo.
 */
export function otraAccion(_db: DB, canal: Canal, v: Vendedor, repetir: Opcion[] = []) {
  const opciones = [...repetir.slice(0, 8), { id: "cmd:menu", titulo: "Menú" }];
  // WhatsApp admite 3 botones; con más se manda como lista.
  if (opciones.length > 3) return responder(canal, v, { tipo: "lista", texto: "¿Desea hacer alguna otra acción?", boton: "Ver opciones", opciones });
  return responder(canal, v, { tipo: "botones", texto: "¿Desea hacer alguna otra acción?", opciones });
}

const SIGUIENTE_RESULTADO: Opcion[] = [
  { id: "cmd:mis", titulo: "Mis prospectos" },
  { id: "cmd:cotizados", titulo: "Mis cotizados" },
];

async function enviarMenu(db: DB, canal: Canal, v: Vendedor, mas = false, o: { texto?: string; extras?: Opcion[] } = {}) {
  const materiales = await materialesPara(db, v);
  const opcionMaterial = (m: Material): Opcion => ({
    id: `mat:${m.id}`,
    titulo: m.titulo,
    ...(m.descripcion ? { descripcion: m.descripcion } : {}),
    seccion: "Material de venta",
  });
  // Si dejó una cotización a medias, la primera opción es retomarla.
  // Hora del mensaje que se está atendiendo (procesarMensajeVendedor la guarda en ultimo_mensaje_wa).
  const enCurso = cotizacionEnCurso(v, v.ultimo_mensaje_wa ? new Date(v.ultimo_mensaje_wa) : new Date());
  const extras = [
    ...(enCurso ? [{ id: "cot:seguir", titulo: "Continuar cotización", descripcion: enCurso.cliente.nombre ? `Para ${enCurso.cliente.nombre}` : "Donde se quedó", seccion: "En curso" }] : []),
    ...(o.extras ?? []),
  ].slice(0, materiales.length ? 1 : 2);
  const espacio = 10 - MENU_FIJO.length - extras.length;
  const enPrimera = Math.max(0, materiales.length > espacio ? espacio - 1 : espacio);
  if (mas) {
    const resto = materiales.slice(enPrimera, enPrimera + 9).map(opcionMaterial);
    return responder(canal, v, {
      tipo: "lista",
      texto: "Más material de venta. Elija el que necesita.",
      boton: "Ver material",
      opciones: [...resto, { id: "cmd:menu", titulo: "Regresar al menú", seccion: "Material de venta" }],
    });
  }
  const opciones: Opcion[] = [...extras, ...MENU_FIJO, ...materiales.slice(0, enPrimera).map(opcionMaterial)];
  if (materiales.length > enPrimera) opciones.push({ id: "cmd:mas", titulo: "Más material…", seccion: "Material de venta" });
  return responder(canal, v, {
    tipo: "lista",
    texto:
      o.texto ??
      `${v.nombre}, ¿qué desea hacer? Elija una opción del menú.\n\nPuede abrir este menú cuando quiera escribiendo *comandos*. Si escribe el número de un prospecto suyo (por ejemplo *0045*), le envío toda su información.`,
    boton: "Ver menú",
    opciones,
  });
}

/**
 * Lista de sus prospectos: "prospectos" (aún sin cotizar), "cotizados" (cotizados y negociando) o "todos".
 * "ficha" abre las opciones del prospecto; "seg" pregunta el resultado.
 */
async function enviarMisProspectos(db: DB, canal: Canal, v: Vendedor, para: "ficha" | "seg", grupo: Grupo = para === "ficha" ? "prospectos" : "todos") {
  const { data } = await db
    .from("solicitudes")
    .select("*, contactos(*)")
    .eq("vendedor_id", v.id)
    .in("etapa", ETAPAS_GRUPO[grupo])
    .order("creada_en", { ascending: false })
    .limit(60);
  // Primero los que no tienen resultado; luego los cotizados y en negociación.
  const abiertas = ordenarPorEtapa((data ?? []) as SolicitudConContacto[]);
  if (!abiertas.length) {
    if (grupo === "prospectos") {
      return responder(canal, v, {
        tipo: "botones",
        texto: "No tiene prospectos sin cotizar.",
        opciones: [{ id: "cmd:cotizados", titulo: "Mis cotizados" }, { id: "cmd:pendientes", titulo: "Ver sin vendedor" }, { id: "cmd:menu", titulo: "Menú" }],
      });
    }
    if (grupo === "cotizados") {
      return responder(canal, v, {
        tipo: "botones",
        texto: "No tiene prospectos cotizados pendientes de resultado.",
        opciones: [{ id: "cmd:mis", titulo: "Mis prospectos" }, { id: "cmd:menu", titulo: "Menú" }],
      });
    }
    return responder(canal, v, {
      tipo: "botones",
      texto: "No tiene prospectos abiertos asignados en este momento.",
      opciones: [{ id: "cmd:pendientes", titulo: "Ver sin vendedor" }, { id: "cmd:menu", titulo: "Regresar al menú" }],
    });
  }
  const cupo = abiertas.length > 1 ? 9 : 10;
  const seccionDe = (s: Solicitud) => (s.etapa === 1 ? "Sin cotizar" : "Cotizados y negociando");
  const opciones: Opcion[] = abiertas.slice(0, cupo).map((s): Opcion => {
    const e = etiquetaProspecto(s);
    return {
      id: `${para}:${s.id}`,
      titulo: e.titulo,
      descripcion: s.etapa === 1 ? e.descripcion : `${ETAPA_ABIERTA[s.etapa]} · ${e.descripcion}`.slice(0, 72),
      seccion: seccionDe(s),
    };
  });
  if (abiertas.length > 1) {
    opciones.unshift({ id: `varios:${grupo}`, titulo: "Varios a la vez", descripcion: "Ver todos y registrar varios", seccion: seccionDe(abiertas[0]!) });
  }
  const sinResultado = abiertas.filter((s) => s.etapa === 1).length;
  const faltan = abiertas.length > cupo ? `\nSe muestran ${cupo} de ${abiertas.length}; con *Varios a la vez* ve la lista completa.` : "";
  const texto =
    grupo === "prospectos"
      ? `*Mis prospectos* (aún sin cotizar): ${abiertas.length}.\nElija uno para ver sus datos, cotizarlo o registrar qué pasó.`
      : grupo === "cotizados"
        ? `*Mis cotizados*: ${abiertas.length}.\nElija uno para ver su cotización, volver a cotizar o registrar el resultado.`
        : `¿De qué prospecto desea registrar el resultado?\n\nSin resultado: ${sinResultado} · Cotizados o negociando: ${abiertas.length - sinResultado}.`;
  return responder(canal, v, { tipo: "lista", texto: texto + faltan, boton: "Ver prospectos", opciones });
}

/** "Ver la cotización": reenvía el PDF de la última (y lista las anteriores). */
async function enviarCotizacionDe(db: DB, canal: Canal, v: Vendedor, s: SolicitudConContacto) {
  const cots = await cotizacionesDe(db, s.id);
  const ultima = cots[0];
  if (!ultima?.pdf_url) {
    return opcionesTras(db, canal, v, s, `El prospecto ${folio(s)} no tiene una cotización hecha en el bot (se registró como cotizado sin hacer el PDF en el bot). Puede hacerla con *Volver a cotizar*.`);
  }
  await responder(canal, v, { tipo: "documento", url: ultima.pdf_url, nombre: `${ultima.folio ?? "Cotización"} ${ultima.cliente_nombre}.pdf` });
  const anteriores = cots.slice(1).map((c) => `· ${c.folio ?? "COT"} · ${moneda(c.total)} · ${fechaCorta(c.creada_en)}`);
  return opcionesTras(
    db,
    canal,
    v,
    s,
    `Cotización *${ultima.folio}* · ${moneda(ultima.total)} · ${fechaCorta(ultima.creada_en)}.${anteriores.length ? `\n\nAnteriores:\n${anteriores.join("\n")}` : ""}\n\n¿Qué desea hacer con este prospecto?`,
  );
}

const ETAPA_ABIERTA: Record<number, string> = { 1: "Sin resultado", 2: "Cotizado", 3: "Negociando" };

/** Ordena: sin resultado primero, luego cotizados y negociando; dentro de cada grupo, los más recientes primero. */
function ordenarPorEtapa<T extends { etapa: number; creada_en: string }>(lista: T[]): T[] {
  return [...lista].sort((a, b) => (a.etapa === 1 ? 0 : 1) - (b.etapa === 1 ? 0 : 1) || b.creada_en.localeCompare(a.creada_en));
}

/** Varios a la vez: muestra los prospectos numerados para que escriba cuáles. */
async function pedirVarios(db: DB, canal: Canal, v: Vendedor, ahora: Date, grupo: Grupo = "todos") {
  const { data } = await db
    .from("solicitudes")
    .select("*, contactos(*)")
    .eq("vendedor_id", v.id)
    .in("etapa", ETAPAS_GRUPO[grupo])
    .order("creada_en", { ascending: false })
    .limit(40);
  const abiertas = ordenarPorEtapa((data ?? []) as SolicitudConContacto[]);
  if (!abiertas.length) return enviarMisProspectos(db, canal, v, "ficha", grupo);
  await guardarEstadoVendedor(db, v, { ...((v.estado_bot ?? {}) as EstadoVendedor), esperando: "varios", grupo, numerados: abiertas.map((s) => s.id), seleccion: [], desde: ahora.toISOString() });
  const lineas: string[] = [];
  abiertas.forEach((s, i) => {
    const grupo = s.etapa === 1 ? "*Sin resultado*" : "*Cotizados y negociando*";
    if (i === 0 || (abiertas[i - 1]!.etapa === 1) !== (s.etapa === 1)) lineas.push(`${i ? "\n" : ""}${grupo}`);
    lineas.push(`${i + 1}) ${etiquetaProspecto(s).linea}${s.etapa !== 1 ? ` · ${ETAPA_ABIERTA[s.etapa]}` : ""}`);
  });
  return responder(canal, v, {
    tipo: "texto",
    texto: `*Varios a la vez.* Estos son sus prospectos abiertos:\n\n${lineas.join("\n")}\n\nEscriba los números de los que quiere registrar, separados por coma. Por ejemplo: *1, 3, 4*\nPara salir escriba "cancelar".`,
  });
}

/** Resultados que se pueden poner a varios a la vez; las ventas van una por una porque llevan monto. */
const RESULTADOS_VARIOS: Record<Grupo, string[]> = { prospectos: ["2", "n", "0", "="], cotizados: ["3", "n", "0", "="], todos: ["2", "3", "n", "0", "="] };

/** Al abrir el menú se descarta una selección de "Varios a la vez" que quedó a medias. */
async function olvidarVarios(db: DB, v: Vendedor) {
  const estado = (v.estado_bot ?? {}) as EstadoVendedor;
  if (estado.esperando !== "varios") return;
  const { esperando: _e, numerados: _n, seleccion: _s, grupo: _g, ...resto } = estado;
  await guardarEstadoVendedor(db, v, resto);
}

/** Aplica el mismo resultado a todos los prospectos elegidos. "Vendido" se registra uno por uno (lleva monto). */
async function registrarVarios(db: DB, canal: Canal, v: Vendedor, clave: string, ahora: Date) {
  const estado = (v.estado_bot ?? {}) as EstadoVendedor;
  const ids = estado.seleccion ?? [];
  const r = RESULTADOS.find((x) => x.clave === clave);
  if (!ids.length || !r) return enviarMisProspectos(db, canal, v, "seg");
  const codigos: string[] = [];
  for (const id of ids) {
    const s = await cargarSolicitud(db, id);
    if (!s || s.vendedor_id !== v.id || ![1, 2, 3].includes(s.etapa)) continue;
    const control = { ...((s.control_bot ?? {}) as ControlBot), ultimo_seguimiento: ahora.toISOString() };
    if (r.etapa === null) {
      await db.from("solicitudes").update({ control_bot: control as unknown as Json }).eq("id", s.id);
    } else if (clave === "n") {
      const notas = [s.notas, "Resultado: no le interesó"].filter(Boolean).join("\n");
      await db.from("solicitudes").update({ etapa: 0, notas, control_bot: control as unknown as Json }).eq("id", s.id);
      if (s.contacto_id) await db.from("contactos").update({ nivel_interes: NO_LE_INTERESO }).eq("id", s.contacto_id);
    } else {
      await db.from("solicitudes").update({ etapa: r.etapa, control_bot: control as unknown as Json }).eq("id", s.id);
    }
    codigos.push(s.codigo ?? "");
  }
  await guardarEstadoVendedor(db, v, {});
  await responder(canal, v, {
    tipo: "texto",
    texto: codigos.length
      ? `Registrado: ${r.titulo} en ${codigos.length} prospecto(s): ${codigos.join(", ")}.${clave === "n" ? ' Los números quedaron guardados en Contactos como "No le interesó".' : ""}`
      : "No se registró ningún cambio.",
  });
  return otraAccion(db, canal, v, SIGUIENTE_RESULTADO);
}

/** Un prospecto propio: sus datos principales y sus opciones (las de Mis prospectos o las de Mis cotizados). */
async function enviarFicha(db: DB, canal: Canal, v: Vendedor, solicitudId: string) {
  if (await asignadoAOtro(db, canal, v, solicitudId)) return;
  const s = await cargarSolicitud(db, solicitudId);
  if (!s) return responder(canal, v, { tipo: "texto", texto: "No encontré ese prospecto." });
  if (!s.vendedor_id) {
    return responder(canal, v, await fichaResumida(db, s));
  }
  if (await yaCerrado(canal, v, s)) return enviarMisProspectos(db, canal, v, "ficha", "prospectos");
  const c = s.contactos;
  const ultima = (await cotizacionesDe(db, s.id))[0];
  const lineas = [
    `*Prospecto ${folio(s)}*${s.etapa === 1 ? "" : ` · ${ETAPA_ABIERTA[s.etapa]}`}`,
    `Nombre: ${c?.nombre?.trim() || "Sin nombre"}`,
    `Teléfono: ${telefonoLegible(c?.telefono ?? "")}`,
    `Municipio: ${c?.municipio ?? "Sin especificar"}`,
    `Servicio: ${await nombreServicio(db, s)}`,
    ultima ? `Última cotización: ${ultima.folio ?? "COT"} · ${moneda(ultima.total)} · ${fechaCorta(ultima.creada_en)}` : null,
    "",
    "¿Qué desea hacer?",
  ].filter((x): x is string => x !== null);
  return responder(canal, v, { tipo: "lista", texto: lineas.join("\n"), boton: "Ver opciones", opciones: opcionesDeProspecto(s) });
}

/** Ventas y comisión del mes en curso (hora de Ciudad de México). */
async function enviarMisVentas(db: DB, canal: Canal, v: Vendedor, ahora: Date) {
  const { dia } = fechaLocal(ahora);
  const [y, m] = dia.split("-").map(Number) as [number, number];
  const inicio = new Date(Date.UTC(y, m - 1, 1, 6, 0)).toISOString();
  const { data } = await db
    .from("solicitudes")
    .select("codigo, creada_en, monto_venta, comision, resultado_en")
    .eq("vendedor_id", v.id)
    .eq("etapa", 4)
    .eq("es_ejemplo", false)
    .gte("resultado_en", inicio)
    .order("resultado_en", { ascending: true });
  const ventas = data ?? [];
  const mes = new Intl.DateTimeFormat("es-MX", { month: "long", timeZone: "America/Mexico_City" }).format(ahora);
  const total = ventas.reduce((t, x) => t + Number(x.monto_venta ?? 0), 0);
  const comision = ventas.reduce((t, x) => t + Number(x.comision ?? 0), 0);
  const { data: abiertas } = await db.from("solicitudes").select("id").eq("vendedor_id", v.id).in("etapa", [1, 2, 3]);
  const lineas = [
    `Sus ventas de ${mes}:`,
    `Ventas cerradas: ${ventas.length}`,
    `Total vendido: ${moneda(total)}`,
    `Comisión: ${moneda(comision)}`,
    `Prospectos abiertos: ${abiertas?.length ?? 0}`,
  ];
  if (ventas.length) lineas.push("", ...ventas.map((x) => `${folio(x)}: ${moneda(Number(x.monto_venta ?? 0))}`));
  await responder(canal, v, { tipo: "texto", texto: lineas.join("\n") });
  return otraAccion(db, canal, v);
}

/** Envía el material de venta elegido y registra el uso. */
/** Solo la lista de material de venta (para "Otro material"). */
async function enviarListaMaterial(db: DB, canal: Canal, v: Vendedor) {
  const materiales = await materialesPara(db, v);
  if (!materiales.length) return otraAccion(db, canal, v);
  return responder(canal, v, {
    tipo: "lista",
    texto: "Elija el material de venta.",
    boton: "Ver material",
    opciones: materiales.slice(0, 10).map((m): Opcion => ({ id: `mat:${m.id}`, titulo: m.titulo, ...(m.descripcion ? { descripcion: m.descripcion } : {}) })),
  });
}

async function enviarMaterial(db: DB, canal: Canal, v: Vendedor, materialId: string, ahora: Date) {
  const m = (await materialesPara(db, v)).find((x) => x.id === materialId);
  if (!m) return responder(canal, v, { tipo: "texto", texto: "Ese material ya no está disponible. Escriba *comandos* para ver el menú." });
  const archivos = (Array.isArray(m.archivos) ? m.archivos : []) as unknown as ArchivoMaterial[];
  if (m.texto?.trim()) await responder(canal, v, { tipo: "texto", texto: m.texto.trim() });
  for (const a of archivos) {
    if (a.tipo === "imagen") await responder(canal, v, { tipo: "imagen", url: a.url });
    else await responder(canal, v, { tipo: "documento", url: a.url, nombre: a.nombre ?? m.titulo });
  }
  if (!m.texto?.trim() && !archivos.length) await responder(canal, v, { tipo: "texto", texto: `El material "${m.titulo}" todavía no tiene contenido.` });
  await db.from("material_venta").update({ usos: (m.usos ?? 0) + 1, ultimo_uso: ahora.toISOString() }).eq("id", m.id);
  await db.from("material_uso").insert({ material_id: m.id, usuario_id: v.id, creado_en: ahora.toISOString() });
  return otraAccion(db, canal, v, [{ id: "cmd:material", titulo: "Otro material" }]);
}

// ---------------------------------------------------------------- asignar desde WhatsApp

const ORDEN_ASIGNAR =
  /^asign(?:a|ar|ale|e)\s+(?:el\s+|al\s+)?(?:prospecto\s+)?(?:(u|ú)ltimo|#?(?:\d+-\d+-)?(\d{1,6}))\s+(?:prospecto\s+)?(?:a|al|para|con)\s+(.+)$/i;

const sinAcentos = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

/** Usuarios que pueden dar órdenes al bot (se activan en el panel, página Usuarios). */
export async function esAdministrador(db: DB, v: Pick<Vendedor, "id">) {
  const { data } = await db.from("configuracion").select("textos_extra").eq("id", true).maybeSingle();
  const extra = (data?.textos_extra ?? {}) as Record<string, string>;
  return String(extra["administradores"] ?? "").split(",").includes(v.id);
}

/** Busca un vendedor activo por número (últimos dígitos) o por nombre. */
async function buscarDestino(db: DB, quien: string): Promise<{ v: Vendedor & { whatsapp: string } } | { error: string }> {
  const todos = await vendedoresActivos(db);
  const digitos = quien.replace(/\D/g, "");
  let c = digitos.length >= 4 ? todos.filter((v) => v.whatsapp.replace(/\D/g, "").endsWith(digitos.slice(-10))) : [];
  if (!c.length) {
    const q = sinAcentos(quien);
    c = todos.filter((v) => sinAcentos(v.nombre) === q);
    if (!c.length) c = todos.filter((v) => sinAcentos(v.nombre).startsWith(q) || sinAcentos(v.nombre).split(/\s+/).includes(q));
  }
  if (c.length === 1) return { v: c[0]! };
  if (c.length > 1) return { error: `Hay varios vendedores que coinciden con "${quien}": ${c.map((v) => v.nombre).join(", ")}. Escriba el nombre completo o su número.` };
  return { error: `No encontré al vendedor "${quien}". Vendedores activos: ${todos.map((v) => v.nombre).join(", ") || "ninguno"}.` };
}

async function asignarPorOrden(db: DB, canal: Canal, admin: Vendedor, numero: number | null, quien: string, ahora: Date) {
  if (!(await esAdministrador(db, admin))) {
    return responder(canal, admin, {
      tipo: "texto",
      texto: "Solo un administrador puede asignar prospectos desde WhatsApp. Se activa en el panel, en la página Usuarios.",
    });
  }
  const base = db.from("solicitudes").select("id, codigo, vendedor_id, etapa").eq("es_ejemplo", false);
  const { data: sol } = numero === null
    ? await base.order("creada_en", { ascending: false }).limit(1).maybeSingle()
    : await base.eq("numero", numero).maybeSingle();
  if (!sol) return responder(canal, admin, { tipo: "texto", texto: numero === null ? "No hay prospectos registrados." : `No encontré el prospecto número ${numero}.` });
  const d = await buscarDestino(db, quien);
  if ("error" in d) return responder(canal, admin, { tipo: "texto", texto: d.error });
  const destino = d.v;
  if (sol.vendedor_id === destino.id) {
    return responder(canal, admin, { tipo: "texto", texto: `El prospecto ${sol.codigo} ya está asignado a ${destino.nombre}.` });
  }
  const anteriorId = sol.vendedor_id;
  const { data: anterior } = sol.vendedor_id
    ? await db.from("usuarios_perfil").select("nombre").eq("id", sol.vendedor_id).maybeSingle()
    : { data: null };
  await db
    .from("solicitudes")
    .update({ vendedor_id: destino.id, tomada_en: ahora.toISOString(), ...(sol.etapa === 5 ? { etapa: 1 } : {}) })
    .eq("id", sol.id);
  const s = await cargarSolicitud(db, sol.id);
  if (!s) return;
  const servicio = await nombreServicio(db, s);
  const zona = zonaDe(s);

  // Al vendedor: los datos de inmediato si su ventana de 24 h está abierta; si no, la plantilla
  // de nuevo prospecto, y al pulsar cualquiera de sus botones recibe los datos.
  let entregado = false;
  const ventana = canal.siempreVentana || ventanaAbierta(destino, ahora);
  if (ventana) {
    await responder(canal, destino, {
      tipo: "texto",
      texto: `${admin.nombre} le asignó el prospecto ${folio(s)} (${servicio}, ${zona}). Le envío la tarjeta de contacto y los datos completos.`,
    });
    await entregarDatos(db, canal, destino, s, true);
    entregado = true;
  } else {
    entregado = await enviarAVendedor(db, canal, destino, ahora, { tipo: "texto", texto: "" }, {
      nombre: PLANTILLAS_VENDEDORES.nuevo,
      parametros: [folio(s), servicio, zona, `Asignado por ${admin.nombre}`],
      botones: [`ver:${s.id}`, `ver:${s.id}`],
    });
  }

  for (const otro of await vendedoresActivos(db)) {
    if (otro.id === destino.id || otro.id === admin.id) continue;
    const eraSuyo = otro.id === anteriorId;
    await enviarAVendedor(
      db,
      canal,
      otro,
      ahora,
      {
        tipo: "texto",
        texto: eraSuyo
          ? `El prospecto ${folio(s)} (${servicio}, ${zona}) que tenía asignado fue reasignado a ${destino.nombre}. Ya no necesita darle seguimiento.`
          : `El prospecto ${folio(s)} (${servicio}, ${zona}) fue asignado a ${destino.nombre}. Ya no está disponible para tomarlo.`,
      },
      { nombre: PLANTILLAS_VENDEDORES.asignado, parametros: [folio(s), servicio, zona, destino.nombre] },
    );
  }

  const partes = [`Listo. El prospecto ${folio(s)} quedó asignado a ${destino.nombre}${anterior ? ` (antes lo tenía ${anterior.nombre})` : ""}.`];
  if (destino.id !== admin.id) {
    if (!entregado) {
      partes.push(
        `No se le pudo enviar el aviso por WhatsApp a ${destino.nombre}. Lo más probable es que no le haya escrito al bot en las últimas 24 horas y aún falten las plantillas de Meta. Pídale que le escriba "hola" a este número y después escriba aquí otra vez la orden de asignar.`,
      );
    } else if (ventana) partes.push("Ya se le enviaron los datos del cliente.");
    else partes.push("Se le envió el aviso; al pulsar cualquiera de sus botones recibirá los datos del cliente.");
  }
  return responder(canal, admin, { tipo: "texto", texto: partes.join(" ") });
}

// ---------------------------------------------------------------- tareas programadas

/** Fecha local (Ciudad de México) en formato AAAA-MM-DD y día de la semana. */
function fechaLocal(d: Date) {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Mexico_City",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "numeric",
    hour12: false,
  }).formatToParts(d);
  const v = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  return { dia: `${v("year")}-${v("month")}-${v("day")}`, semana: v("weekday"), hora: Number(v("hour")) % 24 };
}

/** Sábado 14:00 (hora de Ciudad de México, UTC-6) de la semana actual, si ya pasó. */
function corteSabado(ahora: Date): Date | null {
  const { dia, semana, hora } = fechaLocal(ahora);
  const [y, m, d] = dia.split("-").map(Number) as [number, number, number];
  if (semana === "Sat" && hora >= 14) return new Date(Date.UTC(y, m - 1, d, 20, 0));
  if (semana === "Sun") return new Date(Date.UTC(y, m - 1, d - 1, 20, 0));
  return null;
}

/**
 * Antes de que se cierre la ventana de 24 h de un vendedor, le pide que pulse un botón para renovarla.
 * Es un mensaje normal (gratis) y mientras la ventana siga abierta los avisos no necesitan plantillas.
 * Se envía de 7:00 a 22:00; si la ventana vence de madrugada, se adelanta para no despertarlo.
 */
async function pedirRenovarVentana(db: DB, canal: Canal, ahora: Date) {
  const { hora } = fechaLocal(ahora);
  if (hora < 7 || hora >= 22) return 0;
  let enviados = 0;
  for (const v of await vendedoresActivos(db)) {
    if (!v.ultimo_mensaje_wa) continue;
    const horas = horasDesde(v.ultimo_mensaje_wa, ahora);
    if (horas >= 23 || horas < 12) continue;
    const vence = fechaLocal(new Date(new Date(v.ultimo_mensaje_wa).getTime() + 23 * 3600000)).hora;
    const venceDeNoche = vence < 7 || vence >= 22;
    if (horas < 20 && !venceDeNoche) continue;
    const estado = (v.estado_bot ?? {}) as EstadoVendedor;
    if (estado.aviso_ventana === v.ultimo_mensaje_wa) continue;
    await guardarEstadoVendedor(db, v, { ...estado, aviso_ventana: v.ultimo_mensaje_wa });
    await responder(canal, v, {
      tipo: "botones",
      texto: `${v.nombre}, para seguir recibiendo los avisos de prospectos con todos sus datos y botones, pulse el botón de abajo.`,
      opciones: [{ id: "renovar", titulo: "Seguir recibiendo" }],
    });
    enviados++;
  }
  return enviados;
}

async function prospectosSinAsignar(db: DB) {
  const { data } = await db
    .from("solicitudes")
    .select("*, contactos(*)")
    .eq("etapa", 1)
    .is("vendedor_id", null)
    .eq("es_ejemplo", false)
    .order("creada_en", { ascending: true });
  return (data ?? []) as SolicitudConContacto[];
}

/** Lista de prospectos sin vendedor, con opción de ver cada uno y tomarlo. */
async function enviarSinAsignar(db: DB, canal: Canal, v: Vendedor) {
  const lista = await prospectosSinAsignar(db);
  if (!lista.length) return responder(canal, v, { tipo: "texto", texto: "En este momento todos los prospectos tienen vendedor." });
  const servicios = await Promise.all(lista.slice(0, 10).map((s) => nombreServicio(db, s)));
  return responder(canal, v, {
    tipo: "lista",
    texto: `Hay ${lista.length} prospecto(s) sin vendedor${lista.length > 10 ? "; estos son los 10 más antiguos" : ""}. Elija uno para ver sus detalles y tomarlo.`,
    boton: "Ver prospectos",
    opciones: lista.slice(0, 10).map(
      (s, i): Opcion => ({ id: `ver:${s.id}`, titulo: folio(s), descripcion: `${servicios[i]} · ${zonaDe(s)}`.slice(0, 72) }),
    ),
  });
}

/**
 * Resumen al final del día (lunes a viernes 17:00, sábado 14:00): cuántos prospectos siguen sin vendedor.
 * Se envía una sola vez por día; se marca en configuracion.textos_extra.resumen_dia_enviado.
 */
async function resumenDelDia(db: DB, canal: Canal, ahora: Date) {
  const { dia, semana, hora } = fechaLocal(ahora);
  if (semana === "Sun") return 0;
  if (hora < (semana === "Sat" ? 14 : 17) || hora >= 21) return 0;
  const { data: config } = await db.from("configuracion").select("textos_extra").eq("id", true).maybeSingle();
  const extra = (config?.textos_extra ?? {}) as Record<string, string>;
  if (extra["resumen_dia_enviado"] === dia) return 0;
  await db.from("configuracion").update({ textos_extra: { ...extra, resumen_dia_enviado: dia } }).eq("id", true);
  const lista = await prospectosSinAsignar(db);
  if (!lista.length) return 0;
  const texto = `Resumen del día: ${lista.length} prospecto(s) siguen sin vendedor. El más antiguo es el ${folio(lista[0]!)}.\n\nPulse el botón para ver la lista y tomar alguno.`;
  let enviados = 0;
  for (const v of await vendedoresActivos(db)) {
    const ok = await enviarAVendedor(
      db,
      canal,
      v,
      ahora,
      { tipo: "botones", texto, opciones: [{ id: "pendientes", titulo: "Ver la lista" }] },
      { nombre: PLANTILLAS_VENDEDORES.resumenDia, parametros: [String(lista.length), folio(lista[0]!)], botones: ["pendientes"] },
    );
    if (ok) enviados++;
  }
  return enviados;
}

export async function tareasVendedores(db: DB, canal: Canal, ahora = new Date()) {
  const resumen = { recordatoriosSinTomar: 0, seguimientos: 0, archivadas: 0, renovaciones: 0, resumenDia: 0 };
  // Sin la columna control_bot (migración de la fase 3 sin aplicar) no se puede llevar la cuenta
  // de avisos y se repetirían en cada ejecución; en ese caso no se hace nada.
  const { error: sinMigracion } = await db.from("solicitudes").select("control_bot").limit(1);
  if (sinMigracion) {
    console.error("[vendedores] Falta aplicar la migración de la fase 3:", sinMigracion.message);
    return resumen;
  }
  const { data: config } = await db.from("configuracion").select("*").eq("id", true).single();
  const horasRec = Number(config?.horas_recordatorio_vendedor ?? 2);
  const maxDia = Number(config?.max_recordatorios_vendedor_dia ?? 2);
  const horasSeg = Number(config?.horas_seguimiento_resultado ?? 24);
  const diasRep = Number(config?.dias_seguimiento_repetido ?? 3);
  const hoy = fechaLocal(ahora).dia;

  // Archivado semanal: lo que nadie tomó antes del sábado a las 14:00.
  const corte = corteSabado(ahora);
  if (corte) {
    const { data: arch } = await db
      .from("solicitudes")
      .update({ etapa: 5 })
      .eq("etapa", 1)
      .is("vendedor_id", null)
      .eq("es_ejemplo", false)
      .lt("creada_en", corte.toISOString())
      .select("id");
    resumen.archivadas = arch?.length ?? 0;
  }

  resumen.renovaciones = await pedirRenovarVentana(db, canal, ahora);
  resumen.resumenDia = await resumenDelDia(db, canal, ahora);

  if (!enHorarioLaboral(ahora)) return resumen;
  const vendedores = await vendedoresActivos(db);

  // Recordatorio de prospectos sin tomar.
  const { data: sinTomar } = await db
    .from("solicitudes")
    .select("*, contactos(*)")
    .eq("etapa", 1)
    .is("vendedor_id", null)
    .eq("es_ejemplo", false);
  for (const s of (sinTomar ?? []) as SolicitudConContacto[]) {
    const control = (s.control_bot ?? {}) as ControlBot;
    const enviadosHoy = control.dia === hoy ? control.recordatorios ?? 0 : 0;
    const ultimo = control.ultimo_recordatorio ?? s.creada_en;
    if (enviadosHoy >= maxDia || horasDesde(ultimo, ahora) < horasRec) continue;
    const hace = haceTexto(horasDesde(s.creada_en, ahora));
    const servicio = await nombreServicio(db, s);
    const zona = zonaDe(s);
    const interactivo: Salida = {
      tipo: "botones",
      texto: `El prospecto ${folio(s)} (${servicio}, ${zona}) sigue sin asignar desde hace ${hace}.`,
      opciones: botonesTomar(s.id),
    };
    for (const v of vendedores) {
      await enviarAVendedor(db, canal, v, ahora, interactivo, {
        nombre: PLANTILLAS_VENDEDORES.recordatorio,
        parametros: [folio(s), servicio, zona, hace],
        botones: [`tomar:${s.id}`, `ver:${s.id}`],
      });
    }
    const nuevo: ControlBot = { ...control, dia: hoy, recordatorios: enviadosHoy + 1, ultimo_recordatorio: ahora.toISOString() };
    await db.from("solicitudes").update({ control_bot: nuevo as unknown as Json }).eq("id", s.id);
    resumen.recordatoriosSinTomar++;
  }

  // Seguimiento del resultado con el vendedor asignado.
  const { data: asignadas } = await db
    .from("solicitudes")
    .select("*, contactos(*)")
    .in("etapa", [1, 2, 3])
    .not("vendedor_id", "is", null)
    .eq("es_ejemplo", false);
  for (const s of (asignadas ?? []) as SolicitudConContacto[]) {
    const control = (s.control_bot ?? {}) as ControlBot;
    const toca = control.ultimo_seguimiento
      ? horasDesde(control.ultimo_seguimiento, ahora) >= diasRep * 24
      : horasDesde(s.tomada_en, ahora) >= horasSeg;
    if (!toca) continue;
    const v = vendedores.find((x) => x.id === s.vendedor_id);
    if (!v) continue;
    await enviarAVendedor(db, canal, v, ahora, preguntaSeguimiento(s), {
      nombre: PLANTILLAS_VENDEDORES.seguimiento,
      parametros: [folio(s), s.contactos?.nombre ?? "Sin nombre", s.contactos?.municipio ?? "sin municipio"],
      botones: RESULTADOS_PLANTILLA.map((clave) => `res:${clave}:${s.id}`),
    });
    const nuevo: ControlBot = { ...control, ultimo_seguimiento: ahora.toISOString() };
    await db.from("solicitudes").update({ control_bot: nuevo as unknown as Json }).eq("id", s.id);
    resumen.seguimientos++;
  }
  return resumen;
}

// ---------------------------------------------------------------- catálogo de equipos

type Equipo = Database["public"]["Tables"]["equipos_catalogo"]["Row"];

async function equiposActivos(db: DB): Promise<Equipo[]> {
  const { data, error } = await db.from("equipos_catalogo").select("*").eq("activo", true).order("orden", { ascending: true });
  if (error) return [];
  return (data ?? []).filter((e) => e.categoria !== CATEGORIA_SERVICIOS);
}

/** Categorías con equipos; si solo hay una, va directo a sus equipos. */
async function enviarCategorias(db: DB, canal: Canal, v: Vendedor): Promise<void> {
  const equipos = await equiposActivos(db);
  if (!equipos.length) {
    return responder(canal, v, {
      tipo: "botones",
      texto: "Todavía no hay equipos en el catálogo. Se dan de alta en el panel, en la pestaña Catálogo de equipos.",
      opciones: [{ id: "cmd:menu", titulo: "Regresar al menú" }],
    });
  }
  const conteo = CATEGORIAS_EQUIPO.map((_, i) => equipos.filter((e) => indiceCategoria(e.categoria) === i).length);
  const usadas = conteo.map((n, i) => ({ n, i })).filter((x) => x.n > 0);
  if (usadas.length === 1) return enviarEquiposDeCategoria(db, canal, v, usadas[0]!.i, 0);
  return responder(canal, v, {
    tipo: "lista",
    texto: "Catálogo de equipos. Elija la categoría.",
    boton: "Ver categorías",
    opciones: [
      ...usadas.map(({ n, i }): Opcion => ({ id: `cat:${i}`, titulo: CATEGORIAS_EQUIPO[i]!, descripcion: `${n} equipo(s)` })),
      { id: "cmd:menu", titulo: "Regresar al menú" },
    ],
  });
}

/** Equipos de una categoría, de 8 en 8 (una lista de WhatsApp admite 10 filas). */
async function enviarEquiposDeCategoria(db: DB, canal: Canal, v: Vendedor, categoria: number, pagina: number): Promise<void> {
  const todos = (await equiposActivos(db)).filter((e) => indiceCategoria(e.categoria) === categoria);
  if (!todos.length) return enviarCategorias(db, canal, v);
  const POR_PAGINA = 8;
  const desde = Math.max(0, pagina) * POR_PAGINA;
  const estos = todos.slice(desde, desde + POR_PAGINA);
  const opciones: Opcion[] = estos.map((e) => ({ id: `eq:${e.id}`, titulo: e.clave, descripcion: e.nombre }));
  if (desde + POR_PAGINA < todos.length) opciones.push({ id: `cat:${categoria}:${pagina + 1}`, titulo: "Ver más equipos" });
  opciones.push({ id: "cmd:catalogo", titulo: "Otra categoría" });
  return responder(canal, v, {
    tipo: "lista",
    texto: `${CATEGORIAS_EQUIPO[categoria]}: elija el equipo. Le enviaré sus fotos listas para reenviar al cliente.`,
    boton: "Ver equipos",
    opciones,
  });
}

/** Fotos del equipo con el pie listo para reenviar (sin marca ni modelo). */
async function enviarEquipo(db: DB, canal: Canal, v: Vendedor, equipoId: string, ahora: Date) {
  const e = (await equiposActivos(db)).find((x) => x.id === equipoId);
  if (!e) return responder(canal, v, { tipo: "texto", texto: "Ese equipo ya no está en el catálogo. Escriba *comandos* para ver el menú." });
  const fotos = ((Array.isArray(e.fotos) ? e.fotos : []) as unknown as Array<{ url: string }>).filter((f) => f?.url);
  const pie = pieDeFoto(e);
  if (!fotos.length) await responder(canal, v, { tipo: "texto", texto: `${pie}\n\n(Este equipo todavía no tiene fotos.)` });
  for (const [i, f] of fotos.entries()) await responder(canal, v, { tipo: "imagen", url: f.url, ...(i === 0 ? { texto: pie } : {}) });
  await db.from("equipos_catalogo").update({ usos: (e.usos ?? 0) + 1, ultimo_uso: ahora.toISOString() }).eq("id", e.id);
  await responder(canal, v, { tipo: "texto", texto: "Puede reenviar las fotos al cliente manteniéndolas presionadas y eligiendo Reenviar." });
  return otraAccion(db, canal, v, [{ id: `cat:${indiceCategoria(e.categoria)}`, titulo: "Otro equipo" }]);
}
