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
type EstadoVendedor = { esperando?: "monto" | "motivo"; solicitud_id?: string; desde?: string };

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
  nuevo: "afpam_nuevo_prospecto",
  recordatorio: "afpam_prospecto_sin_tomar",
  seguimiento: "afpam_seguimiento_prospecto",
  mensajeCliente: "afpam_mensaje_de_cliente",
  mensajeSinAsignar: "afpam_mensaje_sin_asignar",
} as const;

/** Definiciones para registrarlas en Meta (idioma es_MX, categoría UTILITY). */
export const DEFINICIONES_PLANTILLAS = [
  {
    name: PLANTILLAS_VENDEDORES.nuevo,
    components: [
      {
        type: "BODY",
        text: "Nuevo prospecto {{1}}.\nServicio: {{2}}\nZona: {{3}}\nObservaciones: {{4}}\n\nLos datos de contacto se envían a quien lo tome. Seleccione una opción para continuar.",
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
        text: "Seguimiento del prospecto {{1}} ({{2}}, {{3}}).\n¿Cuál es su estado actual? Seleccione una opción.",
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
        text: 'El cliente {{1}} del prospecto {{2}} envió un mensaje:\n"{{3}}"\nPuede responderle desde su WhatsApp al número {{4}}.',
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

function marcas(s: Solicitud) {
  const m = [
    s.urgente && "Urgente",
    s.fuera_de_horario && "Fuera de horario",
    s.fuera_de_zona && "Fuera de zona",
    !s.completa && "Incompleta",
  ].filter(Boolean);
  return m.length ? m.join(", ") : "Ninguna";
}

async function nombreServicio(db: DB, s: Solicitud) {
  const { data } = await db.from("servicios").select("codigo, nombre");
  const srv = (data ?? []).find((x) => x.codigo === s.servicio_codigo);
  if (!srv) return "Sin especificar";
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
      await canal.vendedor(tel, v.nombre, {
        tipo: "plantilla",
        nombre: plantilla.nombre,
        idioma: "es_MX",
        parametros: plantilla.parametros.map((p) => param(p)),
        botones: plantilla.botones,
      });
    }
    return true;
  } catch (err) {
    console.error(`[vendedores] No se pudo enviar a ${v.nombre}`, err);
    return false;
  }
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
    `Nuevo prospecto ${s.codigo ?? ""}`.trim(),
    `Servicio: ${servicio}`,
    `Zona: ${zona}`,
    `Observaciones: ${marcas(s)}`,
    "",
    "Los datos de contacto se envían a quien lo tome.",
  ].join("\n");
  for (const v of await vendedoresActivos(db)) {
    await enviarAVendedor(canal, v, ahora, { tipo: "botones", texto, opciones: botonesTomar(s.id) }, {
      nombre: PLANTILLAS_VENDEDORES.nuevo,
      parametros: [s.codigo ?? "", servicio, zona, marcas(s)],
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
    await enviarAVendedor(canal, v, ahora, interactivo, {
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
    `El cliente del prospecto ${s.codigo} (${servicio}, ${zona}) envió un mensaje nuevo:`,
    `"${contenido}"`,
    "",
    "El prospecto sigue sin asignar. Tómelo para recibir sus datos de contacto.",
  ].join("\n");
  for (const v of await vendedoresActivos(db)) {
    await enviarAVendedor(canal, v, ahora, { tipo: "botones", texto, opciones: botonesTomar(s.id) }, {
      nombre: PLANTILLAS_VENDEDORES.mensajeSinAsignar,
      parametros: [s.codigo ?? "", servicio, zona, param(contenido, 300)],
      botones: [`tomar:${s.id}`, `ver:${s.id}`],
    });
  }
}

function preguntaSeguimiento(s: SolicitudConContacto): Salida {
  return {
    tipo: "lista",
    texto: `Seguimiento del prospecto ${s.codigo} (${s.contactos?.nombre ?? "Sin nombre"}, ${s.contactos?.municipio ?? "sin municipio"}).\n¿Cuál es su estado actual?`,
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
    `Detalles del prospecto ${s.codigo}`,
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
    `Datos del prospecto ${s.codigo}`,
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
  v.estado_bot = estado as unknown as Json;
  await db.from("usuarios_perfil").update({ estado_bot: estado as unknown as Json }).eq("id", v.id);
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
      await responder(canal, v, { tipo: "texto", texto: `El prospecto ${s.codigo} ya está asignado a usted.` });
      return;
    }
    const { data: otro } = await db.from("usuarios_perfil").select("nombre").eq("id", s.vendedor_id ?? "").maybeSingle();
    await responder(canal, v, { tipo: "texto", texto: `Este prospecto ya fue tomado por ${otro?.nombre ?? "otro vendedor"}.` });
    return;
  }
  const c = s.contactos;
  await responder(canal, v, {
    tipo: "texto",
    texto: `Listo, el prospecto ${s.codigo} quedó asignado a usted. Le envío la tarjeta de contacto para que la guarde y los datos completos.`,
  });
  if (c?.telefono && !c.telefono.startsWith("sim-")) {
    await responder(canal, v, { tipo: "contacto", nombre: `${s.codigo} ${c.nombre ?? ""}`.trim(), telefono: c.telefono });
  }
  for (const salida of await datosCompletos(db, s)) await responder(canal, v, salida);

  // Avisa a los demás (solo si su ventana está abierta; no es un aviso crítico).
  for (const otro of await vendedoresActivos(db)) {
    if (otro.id === v.id) continue;
    if (canal.siempreVentana || ventanaAbierta(otro, ahora)) {
      await enviarAVendedor(canal, otro, ahora, { tipo: "texto", texto: `El prospecto ${s.codigo} fue tomado por ${v.nombre}.` });
    }
  }
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
    await responder(canal, v, { tipo: "texto", texto: `Sin cambios en ${s.codigo}. Le volveré a preguntar más adelante.` });
    return;
  }
  if (r.etapa === 4) {
    await db.from("solicitudes").update({ control_bot: control as unknown as Json, ...asignar }).eq("id", s.id);
    await guardarEstadoVendedor(db, v, { esperando: "monto", solicitud_id: s.id, desde: ahora.toISOString() });
    await responder(canal, v, { tipo: "texto", texto: `Felicidades. Indique el monto final de la venta de ${s.codigo} en pesos, por ejemplo: 12500` });
    return;
  }
  if (r.etapa === 0) {
    await db.from("solicitudes").update({ control_bot: control as unknown as Json, ...asignar }).eq("id", s.id);
    await guardarEstadoVendedor(db, v, { esperando: "motivo", solicitud_id: s.id, desde: ahora.toISOString() });
    await responder(canal, v, {
      tipo: "botones",
      texto: `Indique brevemente el motivo por el que se perdió ${s.codigo}, o seleccione Omitir.`,
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

async function cerrarPerdido(db: DB, canal: Canal, v: Vendedor, solicitudId: string, motivo: string | null) {
  const { data: previa } = await db.from("solicitudes").select("notas").eq("id", solicitudId).maybeSingle();
  const notas = motivo ? [previa?.notas, `Motivo de pérdida: ${motivo}`].filter(Boolean).join("\n") : previa?.notas ?? null;
  const { data: s } = await db
    .from("solicitudes")
    .update({ etapa: 0, notas })
    .eq("id", solicitudId)
    .select("codigo")
    .single();
  await guardarEstadoVendedor(db, v, {});
  await responder(canal, v, { tipo: "texto", texto: `Registrado: ${s?.codigo ?? ""} – Perdido.` });
}

async function enviarPendientes(db: DB, canal: Canal, v: Vendedor) {
  const { data } = await db
    .from("solicitudes")
    .select("*, contactos(*)")
    .eq("vendedor_id", v.id)
    .in("etapa", [1, 2, 3])
    .order("creada_en", { ascending: false })
    .limit(10);
  const abiertas = (data ?? []) as SolicitudConContacto[];
  const { data: sinTomar } = await db.from("solicitudes").select("id").eq("etapa", 1).is("vendedor_id", null).eq("es_ejemplo", false);
  const ayuda =
    "Puede actualizar un prospecto eligiéndolo de la lista, o escribiendo el número y el resultado, por ejemplo:\n0045 cotizado\n0045 vendido 12500\n0045 perdido el cliente no respondió";
  if (!abiertas.length) {
    await responder(canal, v, {
      tipo: "texto",
      texto: `Buen día, ${v.nombre}. No tiene prospectos abiertos asignados.${sinTomar?.length ? ` Hay ${sinTomar.length} prospecto(s) sin asignar.` : ""}\n\n${ayuda}`,
    });
    return;
  }
  await responder(canal, v, {
    tipo: "lista",
    texto: `Buen día, ${v.nombre}. Estos son sus prospectos abiertos.${sinTomar?.length ? ` Además hay ${sinTomar.length} sin asignar.` : ""}\n\n${ayuda}`,
    boton: "Ver prospectos",
    opciones: abiertas.map(
      (s): Opcion => ({ id: `seg:${s.id}`, titulo: s.codigo ?? "", descripcion: `${s.contactos?.nombre ?? "Sin nombre"} · ${s.contactos?.municipio ?? ""}`.trim() }),
    ),
  });
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
    await responder(canal, v, { tipo: "botones", texto: `¿Desea tomar el prospecto ${s.codigo}?`, opciones: [{ id: `tomar:${s.id}`, titulo: "Lo tomo" }] });
    return;
  }
  if (accion === "seg" && a) {
    const s = await cargarSolicitud(db, a);
    if (s) await responder(canal, v, preguntaSeguimiento(s));
    return;
  }
  if (accion === "res" && a && b) return registrarResultado(db, canal, v, a, b, ahora);
  if (accion === "omitir" && a) return cerrarPerdido(db, canal, v, a, null);

  // Botones de plantilla sin payload: llegan solo con el texto del botón.
  const texto = (entrada.texto ?? "").trim();

  const estado = (v.estado_bot ?? {}) as EstadoVendedor;
  const vigente = estado.esperando && estado.solicitud_id && horasDesde(estado.desde, ahora) < 24;
  if (vigente && texto) {
    if (/^cancelar$/i.test(texto)) {
      await guardarEstadoVendedor(db, v, {});
      return responder(canal, v, { tipo: "texto", texto: "Cancelado. No se registró ningún cambio." });
    }
    if (estado.esperando === "monto") {
      const monto = leerMonto(texto);
      if (monto === null) {
        return responder(canal, v, { tipo: "texto", texto: 'No logré leer el monto. Escriba solo la cantidad, por ejemplo 12500, o escriba "cancelar".' });
      }
      return cerrarVenta(db, canal, v, estado.solicitud_id!, monto, ahora);
    }
    if (estado.esperando === "motivo") {
      return cerrarPerdido(db, canal, v, estado.solicitud_id!, /^omitir$/i.test(texto) ? null : texto.slice(0, 300));
    }
  }

  // Comandos de texto: "0045 vendido 12500", "45 cotizado", "0045 perdido motivo".
  const cmd = /^#?(\d{1,6})\s+(cotizad[oa]|negociando|negociaci[oó]n|vendid[oa]|venta|perdid[oa])\b\s*(.*)$/i.exec(texto);
  if (cmd) {
    const { data: s } = await db.from("solicitudes").select("id").eq("numero", Number(cmd[1])).maybeSingle();
    if (!s) return responder(canal, v, { tipo: "texto", texto: `No encontré el prospecto número ${cmd[1]}.` });
    const palabra = (cmd[2] ?? "").toLowerCase();
    const resto = (cmd[3] ?? "").trim();
    if (palabra.startsWith("cotizad")) return registrarResultado(db, canal, v, "2", s.id, ahora);
    if (palabra.startsWith("negoci")) return registrarResultado(db, canal, v, "3", s.id, ahora);
    if (palabra.startsWith("perdid")) {
      if (resto) return cerrarPerdido(db, canal, v, s.id, resto.slice(0, 300));
      return registrarResultado(db, canal, v, "0", s.id, ahora);
    }
    const monto = leerMonto(resto);
    if (monto !== null) return cerrarVenta(db, canal, v, s.id, monto, ahora);
    return registrarResultado(db, canal, v, "4", s.id, ahora);
  }

  return enviarPendientes(db, canal, v);
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

export async function tareasVendedores(db: DB, canal: Canal, ahora = new Date()) {
  const resumen = { recordatoriosSinTomar: 0, seguimientos: 0, archivadas: 0 };
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
      texto: `El prospecto ${s.codigo} (${servicio}, ${zona}) sigue sin asignar desde hace ${hace}.`,
      opciones: botonesTomar(s.id),
    };
    for (const v of vendedores) {
      await enviarAVendedor(canal, v, ahora, interactivo, {
        nombre: PLANTILLAS_VENDEDORES.recordatorio,
        parametros: [s.codigo ?? "", servicio, zona, hace],
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
    await enviarAVendedor(canal, v, ahora, preguntaSeguimiento(s), {
      nombre: PLANTILLAS_VENDEDORES.seguimiento,
      parametros: [s.codigo ?? "", s.contactos?.nombre ?? "Sin nombre", s.contactos?.municipio ?? "sin municipio"],
      botones: RESULTADOS.map((r) => `res:${r.clave}:${s.id}`),
    });
    const nuevo: ControlBot = { ...control, ultimo_seguimiento: ahora.toISOString() };
    await db.from("solicitudes").update({ control_bot: nuevo as unknown as Json }).eq("id", s.id);
    resumen.seguimientos++;
  }
  return resumen;
}
