// Motor de conversación del bot de WhatsApp.
// Lo usan el webhook (mensajes reales) y el simulador "Probar bot" del panel.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/integrations/supabase/types";
import { normalizarOpciones, textoDeSalida, type Opcion, type Salida } from "./salida";
import { enHorarioLaboral, texto, type ClaveTexto, type ConfigBot } from "./textos";
import { avisarNuevoProspecto, reenviarMensajeCliente, tareasVendedores } from "./vendedores.server";

type DB = SupabaseClient<Database>;

/** Por dónde salen los mensajes: WhatsApp real o el simulador. */
export interface Canal {
  /** Envía al cliente. Devuelve el id de WhatsApp si lo hay. */
  cliente(telefono: string, s: Salida): Promise<string | null>;
  /** Envía a un vendedor (o al dueño). */
  vendedor(telefono: string, nombre: string, s: Salida): Promise<void>;
  /** Simulador: trata la ventana de 24 h como abierta (no usa plantillas). */
  siempreVentana?: boolean;
}

export type Entrada = {
  texto?: string | undefined;
  /** id de la opción elegida en una lista o botón. */
  opcionId?: string | undefined;
  /** Archivo recibido (ya guardado en Storage). */
  media?: { url: string; tipo: string } | undefined;
  /** Tipo original del mensaje (texto, imagen, ubicacion...). */
  tipo?: string | undefined;
  waMessageId?: string | undefined;
};

type Contacto = Database["public"]["Tables"]["contactos"]["Row"];
type Servicio = Database["public"]["Tables"]["servicios"]["Row"];

type Flujo = "instalacion" | "reparacion" | "mantenimiento";

type Respuestas = Partial<
  Record<
    "tiene_porton" | "medidas" | "material" | "marca_motor" | "falla" | "ultimo_mantenimiento" | "horario_preferido",
    string
  >
>;

type DatosSesion = {
  flujo?: Flujo | undefined;
  servicio?: number | undefined;
  equipo?: number | undefined;
  urgente?: boolean | undefined;
  fuera_de_zona?: boolean | undefined;
  respuestas?: Respuestas | undefined;
};

type Estado = {
  contacto_id: string;
  flujo_actual: string | null;
  paso_actual: string | null;
  intentos_fallidos: number;
  solicitud_id: string | null;
  ultima_actividad: string;
  recordatorios_enviados: number;
  en_manos_de_vendedor: boolean;
  ultimo_aviso_vendedor: string | null;
  datos: DatosSesion;
};

type Sesion = {
  db: DB;
  canal: Canal;
  config: ConfigBot;
  contacto: Contacto;
  estado: Estado;
  servicios: Servicio[];
  ahora: Date;
};

// ---------------------------------------------------------------- utilidades

function normal(t: string) {
  return t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9ñ ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tituloCorto(nombre: string) {
  if (nombre.length <= 24) return nombre;
  const corte = nombre.slice(0, 24);
  return corte.slice(0, corte.lastIndexOf(" ")) || corte;
}

/** Interpreta la respuesta del cliente contra una lista de opciones. */
function elegir(e: Entrada, opciones: Opcion[]): Opcion | null {
  if (e.opcionId) {
    const o = opciones.find((x) => x.id === e.opcionId);
    if (o) return o;
  }
  const t = normal(e.texto ?? "");
  if (!t) return null;
  if (/^\d+$/.test(t)) {
    const n = Number(t);
    return opciones[n - 1] ?? null;
  }
  const exacta = opciones.find(
    (o) => normal(o.titulo) === t || (o.descripcion && normal(o.descripcion) === t),
  );
  if (exacta) return exacta;
  if (t.length >= 4) {
    const parciales = opciones.filter(
      (o) => normal(o.titulo).includes(t) || normal(o.descripcion ?? "").includes(t),
    );
    if (parciales.length === 1) return parciales[0] ?? null;
  }
  return null;
}

const SI_NO: Opcion[] = [
  { id: "si", titulo: "Sí" },
  { id: "no", titulo: "No" },
];

function siNo(e: Entrada): boolean | null {
  const o = elegir(e, SI_NO);
  if (o) return o.id === "si";
  const t = normal(e.texto ?? "");
  if (/^(si|claro|correcto|asi es|afirmativo)\b/.test(t)) return true;
  if (/^(no|negativo)\b/.test(t)) return false;
  return null;
}

function textoLibre(e: Entrada, max = 500): string | null {
  const t = (e.texto ?? "").trim();
  if (!t) return null;
  return t.slice(0, max);
}

const PALABRAS_ASESOR = ["asesor", "humano", "persona", "agente"];

function pideAsesor(e: Entrada) {
  if (e.opcionId === "m_ases" || e.opcionId === "r_ases") return true;
  const t = normal(e.texto ?? "");
  if (t === "0") return true;
  return PALABRAS_ASESOR.some((p) => t === p || t.split(" ").includes(p));
}

// ---------------------------------------------------------------- opciones

const MENU: Opcion[] = [
  { id: "m_inst", titulo: "Cotizar instalación" },
  { id: "m_rep", titulo: "Reparación" },
  { id: "m_mant", titulo: "Mantenimiento" },
  { id: "m_hor", titulo: "Horarios y ubicación" },
  { id: "m_zon", titulo: "Zonas de cobertura" },
  { id: "m_pago", titulo: "Pago y garantía", descripcion: "Formas de pago y garantía" },
  { id: "m_ases", titulo: "Hablar con un asesor" },
];

const TIENE_PORTON: Opcion[] = [
  { id: "tp_si", titulo: "Sí, ya lo tengo" },
  { id: "tp_fab", titulo: "Requiero fabricación" },
  { id: "tp_nose", titulo: "No estoy seguro" },
];

const MATERIALES: Opcion[] = [
  { id: "mat_herreria", titulo: "Herrería" },
  { id: "mat_madera", titulo: "Madera" },
  { id: "mat_lamina", titulo: "Lámina" },
  { id: "mat_otro", titulo: "Otro" },
];

const ULTIMO_MANT: Opcion[] = [
  { id: "um_6", titulo: "Menos de 6 meses" },
  { id: "um_12", titulo: "De 6 a 12 meses" },
  { id: "um_mas", titulo: "Más de 1 año" },
  { id: "um_nunca", titulo: "Nunca / No sé" },
];

const HORARIOS: Opcion[] = [
  { id: "h_man", titulo: "Mañana" },
  { id: "h_tar", titulo: "Tarde" },
  { id: "h_cual", titulo: "Cualquier horario" },
];

const OMITIR: Opcion[] = [{ id: "omitir", titulo: "Omitir" }];

function opcionesEquipos(servicios: Servicio[]): Opcion[] {
  return servicios
    .filter((s) => s.codigo >= 1 && s.codigo <= 7)
    .map((s) => ({
      id: `eq_${s.codigo}`,
      titulo: tituloCorto(s.nombre),
      ...(s.nombre.length > 24 ? { descripcion: s.nombre } : {}),
    }));
}

function opcionesInstalacion(servicios: Servicio[]): Opcion[] {
  return opcionesEquipos(servicios.filter((s) => s.activo)).map((o) => ({
    ...o,
    id: o.id.replace("eq_", "srv_"),
  }));
}

// ---------------------------------------------------------------- persistencia

async function registrarSaliente(ses: Sesion, s: Salida, waId: string | null, estado = "enviado") {
  await ses.db.from("mensajes").insert({
    contacto_id: ses.contacto.id,
    solicitud_id: ses.estado.solicitud_id,
    direccion: "saliente",
    autor: "bot",
    tipo: s.tipo,
    contenido: textoDeSalida(s),
    wa_message_id: waId,
    estado,
    es_ejemplo: ses.contacto.es_ejemplo,
  });
}

async function enviar(ses: Sesion, s: Salida) {
  try {
    const id = await ses.canal.cliente(ses.contacto.telefono, s);
    await registrarSaliente(ses, s, id);
  } catch (err) {
    console.error("[bot] Error al enviar al cliente", err);
    await registrarSaliente(ses, s, null, "fallido");
  }
}

async function guardarEstado(ses: Sesion) {
  const { error } = await ses.db.from("estado_conversacion").upsert({
    ...ses.estado,
    datos: ses.estado.datos as unknown as Json,
  });
  if (error) throw new Error(`No se pudo guardar el estado: ${error.message}`);
}

// ---------------------------------------------------------------- avisos a vendedores (ver vendedores.server.ts)

async function avisarVendedores(ses: Sesion, sol: { id: string }) {
  try {
    await avisarNuevoProspecto(ses.db, ses.canal, sol.id, ses.ahora);
  } catch (err) {
    console.error("[bot] No se pudo avisar a los vendedores", err);
  }
}

async function reenviarAVendedores(ses: Sesion, e: Entrada, codigo: string | null, vendedorId: string | null) {
  const contenido = e.texto?.trim() || (e.media ? `[${e.tipo ?? "archivo"}] ${e.media.url}` : `[${e.tipo ?? "mensaje"}]`);
  try {
    await reenviarMensajeCliente(ses.db, ses.canal, { contacto: ses.contacto, codigo, vendedorId, solicitudId: ses.estado.solicitud_id, contenido }, ses.ahora);
  } catch (err) {
    console.error("[bot] No se pudo reenviar el mensaje del cliente", err);
  }
}

// ---------------------------------------------------------------- pasos

type Paso =
  | "nombre"
  | "menu"
  | "regreso"
  | "zona"
  | "municipio"
  | "tipo_instalacion"
  | "tiene_porton"
  | "medidas"
  | "material"
  | "foto"
  | "equipo"
  | "marca"
  | "falla"
  | "urgente"
  | "ultimo_mantenimiento"
  | "horario";

function preguntaDe(ses: Sesion, paso: Paso): Salida {
  const t = (c: ClaveTexto) => texto(ses.config, c, { nombre: ses.contacto.nombre });
  switch (paso) {
    case "nombre":
      return { tipo: "texto", texto: t("saludo") };
    case "menu":
      return { tipo: "lista", texto: t("menu"), boton: "Ver opciones", opciones: MENU };
    case "regreso": {
      const opciones: Opcion[] = [{ id: "r_nueva", titulo: "Nueva solicitud" }];
      if (ses.estado.solicitud_id) opciones.push({ id: "r_seg", titulo: "Seguimiento" });
      opciones.push({ id: "r_ases", titulo: "Hablar con un asesor" });
      return { tipo: "botones", texto: t("cliente_regresa"), opciones };
    }
    case "zona":
      return { tipo: "botones", texto: t("pregunta_zona"), opciones: SI_NO };
    case "municipio":
      return { tipo: "texto", texto: t("pregunta_municipio") };
    case "tipo_instalacion":
      return { tipo: "lista", texto: t("pregunta_tipo_instalacion"), boton: "Ver tipos", opciones: opcionesInstalacion(ses.servicios) };
    case "tiene_porton":
      return { tipo: "botones", texto: t("pregunta_tiene_porton"), opciones: TIENE_PORTON };
    case "medidas":
      return { tipo: "texto", texto: t("pregunta_medidas") };
    case "material":
      return { tipo: "lista", texto: t("pregunta_material"), boton: "Ver materiales", opciones: MATERIALES };
    case "foto":
      return { tipo: "botones", texto: t("pregunta_foto"), opciones: OMITIR };
    case "equipo":
      return { tipo: "lista", texto: t("pregunta_equipo"), boton: "Ver equipos", opciones: opcionesEquipos(ses.servicios) };
    case "marca":
      return { tipo: "texto", texto: t("pregunta_marca") };
    case "falla":
      return { tipo: "texto", texto: t("pregunta_falla") };
    case "urgente":
      return { tipo: "botones", texto: t("pregunta_urgente"), opciones: SI_NO };
    case "ultimo_mantenimiento":
      return { tipo: "lista", texto: t("pregunta_ultimo_mantenimiento"), boton: "Ver opciones", opciones: ULTIMO_MANT };
    case "horario":
      return { tipo: "botones", texto: t("pregunta_horario"), opciones: HORARIOS };
  }
}

async function irA(ses: Sesion, paso: Paso) {
  ses.estado.paso_actual = paso;
  ses.estado.intentos_fallidos = 0;
  await enviar(ses, preguntaDe(ses, paso));
}

function respuestas(ses: Sesion) {
  ses.estado.datos.respuestas ??= {};
  return ses.estado.datos.respuestas;
}

/** Siguiente paso después de la zona y el municipio, según el flujo. */
function pasoDeServicio(ses: Sesion): Paso {
  return ses.estado.datos.flujo === "instalacion" ? "tipo_instalacion" : "equipo";
}

function iniciarFlujo(ses: Sesion, flujo: Flujo): Paso {
  ses.estado.flujo_actual = "solicitud";
  ses.estado.datos = {
    flujo,
    servicio: flujo === "reparacion" ? 8 : flujo === "mantenimiento" ? 9 : undefined,
    respuestas: {},
  };
  return ses.contacto.municipio ? pasoDeServicio(ses) : "zona";
}

async function enviarInformacion(ses: Sesion, id: string) {
  const c = ses.config;
  if (id === "m_hor") {
    const partes = [`Horario de atención: ${c["horario"] ?? ""}`];
    if (c["direccion"]) partes.push(`Dirección: ${c["direccion"]}`);
    if (c["ubicacion_maps_url"]) partes.push(`Ubicación: ${c["ubicacion_maps_url"]}`);
    await enviar(ses, { tipo: "texto", texto: partes.join("\n") });
    if (c["latitud"] != null && c["longitud"] != null) {
      await enviar(ses, {
        tipo: "ubicacion",
        lat: Number(c["latitud"]),
        lng: Number(c["longitud"]),
        nombre: String(c["nombre_negocio"] ?? "AFPAM Texcoco"),
        ...(c["direccion"] ? { direccion: String(c["direccion"]) } : {}),
      });
    }
  } else if (id === "m_zon") {
    await enviar(ses, { tipo: "texto", texto: `Brindamos servicio en: ${c["cobertura"] ?? "Estado de México"}.` });
  } else if (id === "m_pago") {
    await enviar(ses, {
      tipo: "texto",
      texto: `Formas de pago: ${c["formas_pago"] ?? "Consulte con un asesor"}.\nGarantía: ${c["garantia"] ?? "Consulte con un asesor"}.`,
    });
  }
}

type Resultado = Paso | "cerrar" | "asesor" | "invalido" | "igual";

async function procesarPaso(ses: Sesion, paso: Paso, e: Entrada): Promise<Resultado> {
  const r = respuestas(ses);
  switch (paso) {
    case "nombre": {
      const nombre = textoLibre(e, 80);
      if (!nombre || /^\d+$/.test(nombre)) return "invalido";
      ses.contacto.nombre = nombre
        .toLowerCase()
        .replace(/(^|\s)\p{L}/gu, (m) => m.toUpperCase());
      await ses.db.from("contactos").update({ nombre: ses.contacto.nombre }).eq("id", ses.contacto.id);
      return "menu";
    }
    case "menu":
    case "regreso": {
      if (paso === "regreso") {
        const o = elegir(e, normalizarOpciones((preguntaDe(ses, "regreso") as { opciones: Opcion[] }).opciones));
        if (!o) return "invalido";
        if (o.id === "r_nueva") return "menu";
        if (o.id === "r_ases") return "asesor";
        if (o.id === "r_seg") {
          const { data: sol } = await ses.db
            .from("solicitudes")
            .select("codigo, vendedor_id")
            .eq("id", ses.estado.solicitud_id!)
            .maybeSingle();
          await reenviarAVendedores(ses, { texto: "El cliente solicita seguimiento de su solicitud." }, sol?.codigo ?? null, sol?.vendedor_id ?? null);
          await enviar(ses, { tipo: "texto", texto: texto(ses.config, "seguimiento") });
          ses.estado.paso_actual = null;
          return "igual";
        }
        return "invalido";
      }
      const o = elegir(e, MENU);
      if (!o) return "invalido";
      if (o.id === "m_inst") return iniciarFlujo(ses, "instalacion");
      if (o.id === "m_rep") return iniciarFlujo(ses, "reparacion");
      if (o.id === "m_mant") return iniciarFlujo(ses, "mantenimiento");
      if (o.id === "m_ases") return "asesor";
      await enviarInformacion(ses, o.id);
      return "menu";
    }
    case "zona": {
      const v = siNo(e);
      if (v === null) return "invalido";
      ses.estado.datos.fuera_de_zona = !v;
      await ses.db.from("contactos").update({ en_estado_de_mexico: v }).eq("id", ses.contacto.id);
      if (!v) await enviar(ses, { tipo: "texto", texto: texto(ses.config, "fuera_de_zona") });
      return "municipio";
    }
    case "municipio": {
      const m = textoLibre(e, 120);
      if (!m) return "invalido";
      ses.contacto.municipio = m;
      await ses.db.from("contactos").update({ municipio: m }).eq("id", ses.contacto.id);
      return pasoDeServicio(ses);
    }
    case "tipo_instalacion": {
      const o = elegir(e, opcionesInstalacion(ses.servicios));
      if (!o) return "invalido";
      ses.estado.datos.servicio = Number(o.id.replace("srv_", ""));
      return "tiene_porton";
    }
    case "tiene_porton": {
      const o = elegir(e, TIENE_PORTON);
      const v = o ? null : siNo(e);
      if (!o && v === null) return "invalido";
      r.tiene_porton = o ? o.titulo : v ? "Sí, ya lo tengo" : "Requiero fabricación";
      return "medidas";
    }
    case "medidas": {
      const m = textoLibre(e, 120);
      if (!m) return "invalido";
      r.medidas = m;
      return "material";
    }
    case "material": {
      const o = elegir(e, MATERIALES);
      if (o) r.material = o.titulo;
      else {
        const t = textoLibre(e, 60);
        if (!t) return "invalido";
        r.material = t;
      }
      return "foto";
    }
    case "foto": {
      if (e.media) return "horario";
      if (elegir(e, OMITIR) || /^(no|omitir|sin foto|despues|luego|continuar)/.test(normal(e.texto ?? ""))) {
        return "horario";
      }
      return "invalido";
    }
    case "equipo": {
      const o = elegir(e, opcionesEquipos(ses.servicios));
      if (!o) return "invalido";
      ses.estado.datos.equipo = Number(o.id.replace("eq_", ""));
      return "marca";
    }
    case "marca": {
      const m = textoLibre(e, 60);
      if (!m) return "invalido";
      r.marca_motor = m;
      return ses.estado.datos.flujo === "reparacion" ? "falla" : "ultimo_mantenimiento";
    }
    case "falla": {
      const f = textoLibre(e, 500);
      if (!f) return "invalido";
      r.falla = f;
      return "urgente";
    }
    case "urgente": {
      const v = siNo(e);
      if (v === null) return "invalido";
      ses.estado.datos.urgente = v;
      return "foto";
    }
    case "ultimo_mantenimiento": {
      const o = elegir(e, ULTIMO_MANT);
      if (!o) return "invalido";
      r.ultimo_mantenimiento = o.titulo;
      return "horario";
    }
    case "horario": {
      const o = elegir(e, HORARIOS);
      if (!o) return "invalido";
      r.horario_preferido = o.titulo;
      return "cerrar";
    }
  }
}

// ---------------------------------------------------------------- solicitudes

async function crearSolicitud(ses: Sesion, completa: boolean) {
  const d = ses.estado.datos;
  const { data, error } = await ses.db
    .from("solicitudes")
    .insert({
      contacto_id: ses.contacto.id,
      servicio_codigo: d.servicio ?? null,
      equipo_codigo: d.equipo ?? null,
      etapa: 1,
      completa,
      urgente: !!d.urgente,
      fuera_de_zona: !!d.fuera_de_zona || !ses.contacto.en_estado_de_mexico,
      fuera_de_horario: !enHorarioLaboral(ses.ahora),
      datos: (d.respuestas ?? {}) as unknown as Json,
      es_ejemplo: ses.contacto.es_ejemplo,
    })
    .select("id, codigo, servicio_codigo, equipo_codigo, completa, urgente, fuera_de_horario, fuera_de_zona")
    .single();
  if (error || !data) throw new Error(`No se pudo crear la solicitud: ${error?.message}`);
  ses.estado.solicitud_id = data.id;
  // Liga la conversación y los archivos que llegaron antes de crear la solicitud.
  await ses.db.from("mensajes").update({ solicitud_id: data.id }).eq("contacto_id", ses.contacto.id).is("solicitud_id", null);
  await ses.db.from("archivos").update({ solicitud_id: data.id }).eq("contacto_id", ses.contacto.id).is("solicitud_id", null);
  return data;
}

/** Solicitud abierta (etapas 1 a 3) más reciente del contacto. */
async function solicitudAbierta(ses: Sesion) {
  const { data } = await ses.db
    .from("solicitudes")
    .select("id, codigo, etapa, vendedor_id, servicio_codigo, equipo_codigo, completa, urgente, fuera_de_horario, fuera_de_zona")
    .eq("contacto_id", ses.contacto.id)
    .in("etapa", [1, 2, 3])
    .order("creada_en", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}

async function cerrarSolicitud(ses: Sesion) {
  const sol = await crearSolicitud(ses, true);
  let cierre = texto(ses.config, "cierre", { nombre: ses.contacto.nombre, codigo: sol.codigo });
  if (sol.fuera_de_horario) cierre += "\n\n" + texto(ses.config, "fuera_de_horario");
  await enviar(ses, { tipo: "texto", texto: cierre });
  const servicio = ses.servicios.find((s) => s.codigo === sol.servicio_codigo);
  if (servicio?.catalogo_url) {
    const esPdf = /\.pdf($|\?)/i.test(servicio.catalogo_url);
    await enviar(
      ses,
      esPdf
        ? { tipo: "documento", url: servicio.catalogo_url, nombre: `Catalogo ${servicio.nombre}.pdf` }
        : { tipo: "imagen", url: servicio.catalogo_url, texto: servicio.nombre },
    );
  }
  ses.estado.paso_actual = null;
  ses.estado.en_manos_de_vendedor = true;
  await avisarVendedores(ses, sol);
}

/** Pasa la conversación a los vendedores. `silencioso` = sin mensaje al cliente (p. ej. por inactividad). */
async function pasarAAsesor(ses: Sesion, silencioso = false) {
  const abierta = !ses.estado.datos.flujo ? await solicitudAbierta(ses) : null;
  if (!silencioso) await enviar(ses, { tipo: "texto", texto: texto(ses.config, "traspaso_asesor") });
  if (abierta) {
    ses.estado.solicitud_id = abierta.id;
    await reenviarAVendedores(ses, { texto: "El cliente pidió hablar con un asesor." }, abierta.codigo, abierta.vendedor_id);
  } else {
    const sol = await crearSolicitud(ses, false);
    await avisarVendedores(ses, sol);
  }
  ses.estado.paso_actual = null;
  ses.estado.en_manos_de_vendedor = true;
}

// ---------------------------------------------------------------- cliente ya atendido

async function atenderEnManosDeVendedor(ses: Sesion, e: Entrada, actividadPrevia: Date): Promise<boolean> {
  const { data: sol } = ses.estado.solicitud_id
    ? await ses.db.from("solicitudes").select("codigo, etapa, vendedor_id").eq("id", ses.estado.solicitud_id).maybeSingle()
    : { data: null };
  const diasInactivo = (ses.ahora.getTime() - actividadPrevia.getTime()) / 86400000;
  if (!sol || ![1, 2, 3].includes(sol.etapa) || diasInactivo > 30) {
    // La solicitud ya terminó: se atiende como cliente que regresa.
    ses.estado.en_manos_de_vendedor = false;
    return false;
  }
  const ultimoAviso = ses.estado.ultimo_aviso_vendedor ? new Date(ses.estado.ultimo_aviso_vendedor) : null;
  if (!ultimoAviso || ses.ahora.getTime() - ultimoAviso.getTime() > 4 * 3600000) {
    let aviso = texto(ses.config, "en_espera");
    if (sol.vendedor_id) {
      const { data: v } = await ses.db.from("usuarios_perfil").select("nombre, whatsapp").eq("id", sol.vendedor_id).maybeSingle();
      if (v?.whatsapp) {
        aviso = texto(ses.config, "asesor_asignado", { vendedor: v.nombre, telefono_vendedor: v.whatsapp });
      }
    }
    await enviar(ses, { tipo: "texto", texto: aviso });
    ses.estado.ultimo_aviso_vendedor = ses.ahora.toISOString();
  }
  await reenviarAVendedores(ses, e, sol.codigo, sol.vendedor_id);
  return true;
}

// ---------------------------------------------------------------- entrada principal

async function cargarSesion(db: DB, canal: Canal, contacto: Contacto, ahora: Date): Promise<Sesion> {
  const [{ data: config }, { data: servicios }, { data: estado }] = await Promise.all([
    db.from("configuracion").select("*").eq("id", true).single(),
    db.from("servicios").select("*").order("codigo"),
    db.from("estado_conversacion").select("*").eq("contacto_id", contacto.id).maybeSingle(),
  ]);
  return {
    db,
    canal,
    ahora,
    contacto,
    config: (config ?? {}) as ConfigBot,
    servicios: servicios ?? [],
    estado: estado
      ? { ...(estado as unknown as Estado), datos: (estado.datos ?? {}) as DatosSesion }
      : {
          contacto_id: contacto.id,
          flujo_actual: null,
          paso_actual: null,
          intentos_fallidos: 0,
          solicitud_id: null,
          ultima_actividad: ahora.toISOString(),
          recordatorios_enviados: 0,
          en_manos_de_vendedor: false,
          ultimo_aviso_vendedor: null,
          datos: {},
        },
  };
}

async function obtenerContacto(db: DB, telefono: string, esPrueba: boolean, origen: string) {
  const { data: existente } = await db.from("contactos").select("*").eq("telefono", telefono).maybeSingle();
  if (existente) return existente;
  const { data, error } = await db
    .from("contactos")
    .insert({ telefono, origen, es_ejemplo: esPrueba })
    .select("*")
    .single();
  if (error) {
    // Otro mensaje simultáneo pudo crearlo.
    const { data: otra } = await db.from("contactos").select("*").eq("telefono", telefono).single();
    if (otra) return otra;
    throw new Error(`No se pudo crear el contacto: ${error.message}`);
  }
  return data;
}

export type OpcionesProceso = {
  db: DB;
  canal: Canal;
  telefono: string;
  entrada: Entrada;
  esPrueba?: boolean;
  ahora?: Date;
};

/**
 * Procesa un mensaje entrante de un cliente. Devuelve false si el mensaje ya se había procesado.
 */
export async function procesarMensajeCliente(o: OpcionesProceso): Promise<boolean> {
  const ahora = o.ahora ?? new Date();
  const contacto = await obtenerContacto(o.db, o.telefono, !!o.esPrueba, "whatsapp");

  // Registro del mensaje entrante (el índice único de wa_message_id evita duplicados).
  const { error: errMsg } = await o.db.from("mensajes").insert({
    contacto_id: contacto.id,
    direccion: "entrante",
    autor: "cliente",
    tipo: o.entrada.tipo ?? (o.entrada.media ? "imagen" : "texto"),
    contenido: o.entrada.texto ?? null,
    media_url: o.entrada.media?.url ?? null,
    wa_message_id: o.entrada.waMessageId ?? null,
    estado: "recibido",
    es_ejemplo: contacto.es_ejemplo,
  });
  if (errMsg?.code === "23505") return false;

  const ses = await cargarSesion(o.db, o.canal, contacto, ahora);
  const actividadPrevia = new Date(ses.estado.ultima_actividad);
  ses.estado.ultima_actividad = ahora.toISOString();
  ses.estado.recordatorios_enviados = 0;
  await o.db.from("contactos").update({ ultimo_mensaje: ahora.toISOString() }).eq("id", contacto.id);

  if (o.entrada.media) {
    await o.db.from("archivos").insert({
      contacto_id: contacto.id,
      solicitud_id: ses.estado.en_manos_de_vendedor ? ses.estado.solicitud_id : null,
      tipo: o.entrada.media.tipo,
      url: o.entrada.media.url,
    });
  }

  try {
    await avanzar(ses, o.entrada, actividadPrevia);
  } finally {
    await guardarEstado(ses);
  }
  return true;
}

async function avanzar(ses: Sesion, e: Entrada, actividadPrevia: Date) {
  if (ses.estado.en_manos_de_vendedor) {
    if (await atenderEnManosDeVendedor(ses, e, actividadPrevia)) return;
  }

  if (pideAsesor(e) && ses.estado.paso_actual !== "nombre") {
    await pasarAAsesor(ses);
    return;
  }

  const paso = ses.estado.paso_actual as Paso | null;
  if (!paso) {
    // Inicio de conversación.
    ses.estado.datos = {};
    ses.estado.flujo_actual = ses.contacto.nombre ? "regreso" : "nuevo";
    if (ses.contacto.nombre) {
      const previa = await solicitudAbierta(ses);
      const { data: ultima } = previa
        ? { data: previa }
        : await ses.db
            .from("solicitudes")
            .select("id")
            .eq("contacto_id", ses.contacto.id)
            .order("creada_en", { ascending: false })
            .limit(1)
            .maybeSingle();
      ses.estado.solicitud_id = ultima?.id ?? null;
      await irA(ses, "regreso");
    } else {
      await irA(ses, "nombre");
    }
    return;
  }

  // Un archivo fuera del paso de foto se guarda, pero no cuenta como respuesta.
  if (e.media && !e.texto && paso !== "foto") {
    await enviar(ses, preguntaDe(ses, paso));
    return;
  }

  const res = await procesarPaso(ses, paso, e);
  if (res === "igual") return;
  if (res === "invalido") {
    ses.estado.intentos_fallidos += 1;
    if (ses.estado.intentos_fallidos >= 2) {
      await pasarAAsesor(ses);
      return;
    }
    await enviar(ses, { tipo: "texto", texto: texto(ses.config, "no_entendi") });
    await enviar(ses, preguntaDe(ses, paso));
    return;
  }
  if (res === "asesor") {
    await pasarAAsesor(ses);
    return;
  }
  if (res === "cerrar") {
    await cerrarSolicitud(ses);
    return;
  }
  await irA(ses, res);
}

// ---------------------------------------------------------------- recordatorios (tarea programada)

export async function procesarRecordatorios(db: DB, canal: Canal, ahora = new Date()) {
  const resumen = { recordatorio1: 0, recordatorio2: 0, incompletas: 0 };
  const [{ data: config }, { data: pendientes }] = await Promise.all([
    db.from("configuracion").select("*").eq("id", true).single(),
    db
      .from("estado_conversacion")
      .select("contacto_id, contactos(*)")
      .eq("en_manos_de_vendedor", false)
      .not("paso_actual", "is", null),
  ]);
  const cfg = (config ?? {}) as ConfigBot;
  const h1 = Number(cfg["horas_recordatorio_cliente_1"] ?? 2);
  const h2 = Number(cfg["horas_recordatorio_cliente_2"] ?? 20);
  const hInc = Number(cfg["horas_incompleto"] ?? 24);

  for (const fila of pendientes ?? []) {
    const contacto = fila.contactos as unknown as Contacto | null;
    if (!contacto || contacto.telefono.startsWith("sim-")) continue;
    const ses = await cargarSesion(db, canal, contacto, ahora);
    const horas = (ahora.getTime() - new Date(ses.estado.ultima_actividad).getTime()) / 3600000;
    try {
      if (horas >= hInc) {
        await pasarAAsesor(ses, true);
        resumen.incompletas++;
      } else if (horas >= h2 && ses.estado.recordatorios_enviados < 2) {
        await enviar(ses, { tipo: "texto", texto: texto(ses.config, "recordatorio_2", { nombre: contacto.nombre ?? "" }) });
        ses.estado.recordatorios_enviados = 2;
        resumen.recordatorio2++;
      } else if (horas >= h1 && ses.estado.recordatorios_enviados < 1) {
        await enviar(ses, { tipo: "texto", texto: texto(ses.config, "recordatorio_1", { nombre: contacto.nombre ?? "" }) });
        ses.estado.recordatorios_enviados = 1;
        resumen.recordatorio1++;
      } else {
        continue;
      }
      await guardarEstado(ses);
    } catch (err) {
      console.error(`[bot] Error en recordatorio de ${contacto.telefono}`, err);
    }
  }
  try {
    return { ...resumen, ...(await tareasVendedores(db, canal, ahora)) };
  } catch (err) {
    console.error("[bot] Error en tareas de vendedores", err);
    return { ...resumen, recordatoriosSinTomar: 0, seguimientos: 0, archivadas: 0 };
  }
}
