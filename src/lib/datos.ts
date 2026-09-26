import { supabase } from "@/integrations/supabase/client";

export type Servicio = {
  codigo: number;
  nombre: string;
  tipo: string;
  porcentaje_comision: number;
  requiere_equipo: boolean;
  descripcion: string | null;
  catalogo_url: string | null;
  activo: boolean;
};

export type Contacto = {
  id: string;
  telefono: string;
  nombre: string | null;
  municipio: string | null;
  en_estado_de_mexico: boolean;
  es_cliente: boolean;
  nombre_mostrado: string | null;
  acepta_publicidad: boolean;
  fecha_baja_publicidad: string | null;
  origen: string | null;
  nivel_interes: string;
  primer_contacto: string;
  ultimo_mensaje: string | null;
};

export type Solicitud = {
  id: string;
  contacto_id: string;
  numero: number;
  servicio_codigo: number;
  equipo_codigo: number | null;
  etapa: number;
  codigo: string | null;
  completa: boolean;
  fuera_de_horario: boolean;
  fuera_de_zona: boolean;
  urgente: boolean;
  datos: Record<string, unknown>;
  vendedor_id: string | null;
  tomada_en: string | null;
  monto_venta: number | null;
  comision: number | null;
  notas: string | null;
  resultado_en: string | null;
  creada_en: string;
  archivada_en: string | null;
  contactos?: Contacto | null;
};

export type UsuarioPerfil = {
  id: string;
  nombre: string;
  whatsapp: string | null;
  es_vendedor: boolean;
  recibe_resumen_semanal: boolean;
  activo: boolean;
};

function revisar<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

export const claves = {
  servicios: ["servicios"] as const,
  contactos: ["contactos"] as const,
  solicitudes: ["solicitudes"] as const,
  usuarios: ["usuarios"] as const,
  configuracion: ["configuracion"] as const,
  plantillas: ["plantillas"] as const,
  campanas: ["campanas"] as const,
  preguntas: ["preguntas"] as const,
};

export async function traerServicios() {
  return revisar(
    await supabase.from("servicios").select("*").order("codigo"),
  ) as unknown as Servicio[];
}

export async function traerContactos() {
  return revisar(
    await supabase.from("contactos").select("*").order("primer_contacto", { ascending: false }),
  ) as unknown as Contacto[];
}

export async function traerSolicitudes() {
  return revisar(
    await supabase
      .from("solicitudes")
      .select("*, contactos(*)")
      .order("creada_en", { ascending: false }),
  ) as unknown as Solicitud[];
}

export async function traerSolicitud(id: string) {
  return revisar(
    await supabase.from("solicitudes").select("*, contactos(*)").eq("id", id).single(),
  ) as unknown as Solicitud;
}

export async function traerMensajes(solicitudId: string, contactoId: string) {
  return revisar(
    await supabase
      .from("mensajes")
      .select("*")
      .or(`solicitud_id.eq.${solicitudId},contacto_id.eq.${contactoId}`)
      .order("creado_en"),
  ) as unknown as Array<{
    id: string;
    direccion: string;
    autor: string;
    tipo: string;
    contenido: string | null;
    media_url: string | null;
    estado: string | null;
    creado_en: string;
  }>;
}

export async function traerArchivos(solicitudId: string) {
  return revisar(
    await supabase.from("archivos").select("*").eq("solicitud_id", solicitudId),
  ) as unknown as Array<{ id: string; tipo: string | null; url: string; creado_en: string }>;
}

export async function traerUsuarios() {
  return revisar(
    await supabase.from("usuarios_perfil").select("*").order("nombre"),
  ) as unknown as UsuarioPerfil[];
}

export async function traerConfiguracion() {
  return revisar(
    await supabase.from("configuracion").select("*").eq("id", true).single(),
  ) as unknown as Record<string, unknown>;
}

export async function traerPlantillas() {
  return revisar(
    await supabase.from("plantillas").select("*").order("creada_en", { ascending: false }),
  ) as unknown as Array<{
    id: string;
    nombre: string;
    texto: string;
    imagen_url: string | null;
    servicio_relacionado: number | null;
    botones: string[];
    estado_meta: string;
    nombre_meta: string | null;
    idioma: string;
    veces_usada: number;
    tasa_interaccion: number;
  }>;
}

export async function traerCampanas() {
  return revisar(
    await supabase
      .from("campanas")
      .select("*, plantillas(nombre)")
      .order("creada_en", { ascending: false }),
  ) as unknown as Array<{
    id: string;
    nombre: string;
    plantilla_id: string | null;
    estado: string;
    fecha_inicio: string | null;
    dias_reparto: number;
    max_por_dia: number;
    hora_inicio: string;
    hora_fin: string;
    enviados: number;
    entregados: number;
    leidos: number;
    me_interesa: number;
    clics: number;
    bajas: number;
    plantillas?: { nombre: string } | null;
  }>;
}

export async function traerPreguntas() {
  return revisar(
    await supabase
      .from("preguntas_frecuentes_log")
      .select("*, contactos(telefono, nombre_mostrado)")
      .order("creada_en", { ascending: false }),
  ) as unknown as Array<{
    id: string;
    pregunta: string;
    respuesta_ia: string | null;
    creada_en: string;
    contactos?: { telefono: string; nombre_mostrado: string | null } | null;
  }>;
}
