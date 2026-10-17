// Fase 3: comunicación del bot con los vendedores por WhatsApp.
// Avisos con "Lo tomo", datos completos, seguimiento de resultados, comisiones,
// recordatorios de prospectos sin tomar y archivado semanal.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/integrations/supabase/types";
import { ETIQUETAS_DATOS, moneda } from "@/lib/afpam";
import type { Canal } from "./motor.server";
import type { Opcion, Salida } from "./salida";
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
  esperando?: "monto" | "motivo";
  solicitud_id?: string;
  desde?: string;
  /** Última vez que se le envió la lista de prospectos (evita ciclos con respuestas automáticas). */
  ultima_ayuda?: string;
  /** Resultado del último aviso que el bot intentó enviarle (se muestra en Usuarios). */
  ultimo_aviso?: { fecha: string; ok: boolean; error?: string };
  /** ultimo_mensaje_wa para el que ya se pidió renovar la ventana (un aviso por ventana). */
  aviso_ventana?: string;
};

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
  { clave: "0", etapa: 0, titulo: "Perdido" },
  { clave: "=", etapa: null, titulo: "Sin cambios" },
];

function numeroWhatsApp(tel: string) {
  const d = tel.replace(/\D/g, "");
  return d.length === 10 ? "52" + d : d;
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
async function responder(canal: Canal, v: Vendedor, s: Salida) {
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
    texto: `Seguimiento del prospecto ${folio(s)} (${s.contactos?.nombre ?? "Sin nombre"}, ${s.contactos?.municipio ?? "sin municipio"}).\n¿Cuál es su estado actual?`,
    boton: "Ver opciones",
    opciones: RESULTADOS.map((r) => ({ id: `res:${r.clave}:${s.id}`, titulo: r.titulo })),
  };
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
async function detallesDelTrabajo(db: DB, s: SolicitudConContacto): Promise<Salida[]> {
  const texto = [
    `Detalles del prospecto ${folio(s)}`,
    `Servicio: ${await nombreServicio(db, s)}`,
    `Zona: ${zonaDe(s)}`,
    ...lineasDelTrabajo(s),
    `Observaciones: ${marcas(s)}`,
    "",
    "Los datos de contacto se envían a quien lo tome.",
  ].join("\n");
  return [{ tipo: "texto", texto }, ...(await archivosDe(db, s.id))];
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
    `Abrir chat: https://wa.me/${(c?.telefono ?? "").replace(/\D/g, "")}`,
  ];
  return [{ tipo: "texto", texto: lineas.join("\n") }, ...(await archivosDe(db, s.id))];
}

// ---------------------------------------------------------------- mensajes de vendedores

async function guardarEstadoVendedor(db: DB, v: Vendedor, estado: EstadoVendedor) {
  const previo = (v.estado_bot ?? {}) as EstadoVendedor;
  const ultimo = previo.ultimo_aviso ?? estado.ultimo_aviso;
  const nuevo: EstadoVendedor = { ...estado, ...(ultimo ? { ultimo_aviso: ultimo } : {}) };
  v.estado_bot = nuevo as unknown as Json;
  await db.from("usuarios_perfil").update({ estado_bot: nuevo as unknown as Json }).eq("id", v.id);
}

/** Tarjeta de contacto y datos completos del prospecto para el vendedor asignado. */
async function entregarDatos(db: DB, canal: Canal, v: Vendedor, s: SolicitudConContacto) {
  const c = s.contactos;
  if (c?.telefono && !c.telefono.startsWith("sim-")) {
    await responder(canal, v, { tipo: "contacto", nombre: `${folio(s, " ")} ${c.nombre ?? ""}`.trim(), telefono: c.telefono });
  }
  for (const salida of await datosCompletos(db, s)) await responder(canal, v, salida);
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
      return;
    }
    const { data: otro } = await db.from("usuarios_perfil").select("nombre").eq("id", s.vendedor_id ?? "").maybeSingle();
    await responder(canal, v, { tipo: "texto", texto: `Este prospecto ya fue tomado por ${otro?.nombre ?? "otro vendedor"}.` });
    return;
  }
  await responder(canal, v, {
    tipo: "texto",
    texto: `Listo, el prospecto ${folio(s)} quedó asignado a usted. Le envío la tarjeta de contacto para que la guarde y los datos completos.`,
  });
  await entregarDatos(db, canal, v, s);

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
  const control = { ...((s.control_bot ?? {}) as ControlBot), ultimo_seguimiento: ahora.toISOString() };
  const asignar = s.vendedor_id ? {} : { vendedor_id: v.id, tomada_en: ahora.toISOString() };

  if (r.etapa === null) {
    await db.from("solicitudes").update({ control_bot: control as unknown as Json }).eq("id", s.id);
    await responder(canal, v, { tipo: "texto", texto: `Sin cambios en ${folio(s)}. Le volveré a preguntar más adelante.` });
    return;
  }
  if (r.etapa === 4) {
    await db.from("solicitudes").update({ control_bot: control as unknown as Json, ...asignar }).eq("id", s.id);
    await guardarEstadoVendedor(db, v, { esperando: "monto", solicitud_id: s.id, desde: ahora.toISOString() });
    await responder(canal, v, { tipo: "texto", texto: `Felicidades. Indique el monto final de la venta de ${folio(s)} en pesos, por ejemplo: 12500` });
    return;
  }
  if (r.etapa === 0) {
    await db.from("solicitudes").update({ control_bot: control as unknown as Json, ...asignar }).eq("id", s.id);
    await guardarEstadoVendedor(db, v, { esperando: "motivo", solicitud_id: s.id, desde: ahora.toISOString() });
    await responder(canal, v, {
      tipo: "botones",
      texto: `Indique brevemente el motivo por el que se perdió ${folio(s)}, o seleccione Omitir.`,
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
  await responder(canal, v, { tipo: "texto", texto: `Registrado: ${nueva?.codigo ?? s.codigo} – ${r.titulo}.` });
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
}

async function cerrarPerdido(db: DB, canal: Canal, v: Vendedor, solicitudId: string, motivo: string | null, ahora: Date) {
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
  await responder(canal, v, { tipo: "texto", texto: `Registrado: ${s?.codigo ?? ""} – Perdido.` });
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
  if (id === "cmd:menu") return enviarMenu(db, canal, v);
  if (id === "cmd:mas") return enviarMenu(db, canal, v, true);
  if (id === "cmd:mis") return enviarMisProspectos(db, canal, v, "ficha");
  if (id === "cmd:resultado") return enviarMisProspectos(db, canal, v, "seg");
  if (id === "cmd:ventas") return enviarMisVentas(db, canal, v, ahora);
  if (accion === "mat" && a) return enviarMaterial(db, canal, v, a, ahora);
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
    for (const salida of await detallesDelTrabajo(db, s)) await responder(canal, v, salida);
    await responder(canal, v, { tipo: "botones", texto: `¿Desea tomar el prospecto ${folio(s)}?`, opciones: [{ id: `tomar:${s.id}`, titulo: "Lo tomo" }] });
    return;
  }
  if (accion === "seg" && a) {
    if (await asignadoAOtro(db, canal, v, a)) return;
    const s = await cargarSolicitud(db, a);
    if (s) await responder(canal, v, preguntaSeguimiento(s));
    return;
  }
  if (accion === "res" && a && b) {
    if (await asignadoAOtro(db, canal, v, b)) return;
    return registrarResultado(db, canal, v, a, b, ahora);
  }
  if (accion === "omitir" && a) {
    if (await asignadoAOtro(db, canal, v, a)) return;
    return cerrarPerdido(db, canal, v, a, null, ahora);
  }

  // Botones de plantilla sin payload: llegan solo con el texto del botón.
  const texto = (entrada.texto ?? "").trim();
  if (/^ver la lista$/i.test(texto)) return enviarSinAsignar(db, canal, v);

  if (/^#?\s*(comandos?|men[uú]|ayuda|opciones)$/i.test(texto)) return enviarMenu(db, canal, v);

  // Orden del administrador: "asigna el último prospecto a Luis", "asigna 0025 a 5512345678".
  const orden = ORDEN_ASIGNAR.exec(texto);
  if (orden) {
    const quien = (orden[3] ?? "").replace(/[.,;!?]+$/, "").trim();
    return asignarPorOrden(db, canal, v, orden[1] ? null : Number(orden[2]), quien, ahora);
  }

  const estado = (v.estado_bot ?? {}) as EstadoVendedor;
  const vigente = estado.esperando && estado.solicitud_id && horasDesde(estado.desde, ahora) < 24;
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
      return cerrarPerdido(db, canal, v, estado.solicitud_id!, /^omitir$/i.test(texto) ? null : texto.slice(0, 300), ahora);
    }
  }

  // Comandos de texto: "0045 vendido 12500", "45 cotizado", "0045 perdido motivo".
  const cmd = /^#?(\d{1,6})\s+(cotizad[oa]|negociando|negociaci[oó]n|vendid[oa]|venta|perdid[oa])\b\s*(.*)$/i.exec(texto);
  if (cmd) {
    const { data: s } = await db.from("solicitudes").select("id").eq("numero", Number(cmd[1])).maybeSingle();
    if (!s) return responder(canal, v, { tipo: "texto", texto: `No encontré el prospecto número ${cmd[1]}.` });
    if (await asignadoAOtro(db, canal, v, s.id)) return;
    const palabra = (cmd[2] ?? "").toLowerCase();
    const resto = (cmd[3] ?? "").trim();
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
  // contestaría otra vez: la lista solo se envía una vez cada 10 minutos para no armar un ciclo.
  if (horasDesde(estado.ultima_ayuda, ahora) < 1 / 6) return;
  await guardarEstadoVendedor(db, v, { ...estado, ultima_ayuda: ahora.toISOString() });
  return enviarMenu(db, canal, v);
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
  { id: "cmd:mis", titulo: "Ver mis prospectos", descripcion: "Ficha y datos de cada uno", seccion: "Mis prospectos" },
  { id: "cmd:resultado", titulo: "Registrar resultado", descripcion: "Cotizado, negociando, vendido o perdido", seccion: "Mis prospectos" },
  { id: "cmd:pendientes", titulo: "Prospectos sin vendedor", descripcion: "Para tomar uno", seccion: "Mis prospectos" },
  { id: "cmd:ventas", titulo: "Ventas y comisión", descripcion: "Del mes en curso", seccion: "Mis ventas" },
];

/** Menú principal (o la segunda página de material con "mas"). Una lista de WhatsApp admite 10 filas. */
async function enviarMenu(db: DB, canal: Canal, v: Vendedor, mas = false) {
  const materiales = await materialesPara(db, v);
  const opcionMaterial = (m: Material): Opcion => ({
    id: `mat:${m.id}`,
    titulo: m.titulo,
    ...(m.descripcion ? { descripcion: m.descripcion } : {}),
    seccion: "Material de venta",
  });
  const espacio = 10 - MENU_FIJO.length;
  const enPrimera = materiales.length > espacio ? espacio - 1 : espacio;
  if (mas) {
    const resto = materiales.slice(enPrimera, enPrimera + 9).map(opcionMaterial);
    return responder(canal, v, {
      tipo: "lista",
      texto: "Más material de venta. Elija el que necesita.",
      boton: "Ver material",
      opciones: [...resto, { id: "cmd:menu", titulo: "Regresar al menú", seccion: "Material de venta" }],
    });
  }
  const opciones: Opcion[] = [...MENU_FIJO, ...materiales.slice(0, enPrimera).map(opcionMaterial)];
  if (materiales.length > enPrimera) opciones.push({ id: "cmd:mas", titulo: "Más material…", seccion: "Material de venta" });
  return responder(canal, v, {
    tipo: "lista",
    texto: `${v.nombre}, ¿qué desea hacer? Elija una opción del menú.\n\nPuede abrir este menú cuando quiera escribiendo *comandos*.`,
    boton: "Ver menú",
    opciones,
  });
}

/** Lista de sus prospectos abiertos: "ficha" muestra los datos, "seg" pregunta el resultado. */
async function enviarMisProspectos(db: DB, canal: Canal, v: Vendedor, para: "ficha" | "seg") {
  const { data } = await db
    .from("solicitudes")
    .select("*, contactos(*)")
    .eq("vendedor_id", v.id)
    .in("etapa", [1, 2, 3])
    .order("creada_en", { ascending: false })
    .limit(10);
  const abiertas = (data ?? []) as SolicitudConContacto[];
  if (!abiertas.length) {
    return responder(canal, v, {
      tipo: "botones",
      texto: "No tiene prospectos abiertos asignados en este momento.",
      opciones: [{ id: "cmd:pendientes", titulo: "Ver sin vendedor" }, { id: "cmd:menu", titulo: "Regresar al menú" }],
    });
  }
  return responder(canal, v, {
    tipo: "lista",
    texto: para === "ficha" ? "Elija el prospecto para ver su ficha." : "¿De qué prospecto desea registrar el resultado?",
    boton: "Ver prospectos",
    opciones: abiertas.map(
      (s): Opcion => ({
        id: `${para}:${s.id}`,
        titulo: folio(s),
        descripcion: `${s.contactos?.nombre ?? "Sin nombre"} · ${s.contactos?.municipio ?? ""}`.trim(),
      }),
    ),
  });
}

/** Ficha completa de un prospecto propio, con botón para registrar el resultado. */
async function enviarFicha(db: DB, canal: Canal, v: Vendedor, solicitudId: string) {
  if (await asignadoAOtro(db, canal, v, solicitudId)) return;
  const s = await cargarSolicitud(db, solicitudId);
  if (!s) return responder(canal, v, { tipo: "texto", texto: "No encontré ese prospecto." });
  if (!s.vendedor_id) {
    for (const salida of await detallesDelTrabajo(db, s)) await responder(canal, v, salida);
    return responder(canal, v, { tipo: "botones", texto: `¿Desea tomar el prospecto ${folio(s)}?`, opciones: [{ id: `tomar:${s.id}`, titulo: "Lo tomo" }] });
  }
  await entregarDatos(db, canal, v, s);
  return responder(canal, v, {
    tipo: "botones",
    texto: `¿Qué desea hacer con el prospecto ${folio(s)}?`,
    opciones: [{ id: `seg:${s.id}`, titulo: "Registrar resultado" }, { id: "cmd:menu", titulo: "Regresar al menú" }],
  });
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
  return responder(canal, v, {
    tipo: "botones",
    texto: lineas.join("\n"),
    opciones: [{ id: "cmd:menu", titulo: "Regresar al menú" }],
  });
}

/** Envía el material de venta elegido y registra el uso. */
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
    await entregarDatos(db, canal, destino, s);
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
      botones: RESULTADOS.map((r) => `res:${r.clave}:${s.id}`),
    });
    const nuevo: ControlBot = { ...control, ultimo_seguimiento: ahora.toISOString() };
    await db.from("solicitudes").update({ control_bot: nuevo as unknown as Json }).eq("id", s.id);
    resumen.seguimientos++;
  }
  return resumen;
}
