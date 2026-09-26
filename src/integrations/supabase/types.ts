export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      archivos: {
        Row: {
          contacto_id: string | null
          creado_en: string
          id: string
          solicitud_id: string | null
          tipo: string | null
          url: string
        }
        Insert: {
          contacto_id?: string | null
          creado_en?: string
          id?: string
          solicitud_id?: string | null
          tipo?: string | null
          url: string
        }
        Update: {
          contacto_id?: string | null
          creado_en?: string
          id?: string
          solicitud_id?: string | null
          tipo?: string | null
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "archivos_contacto_id_fkey"
            columns: ["contacto_id"]
            isOneToOne: false
            referencedRelation: "contactos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "archivos_solicitud_id_fkey"
            columns: ["solicitud_id"]
            isOneToOne: false
            referencedRelation: "solicitudes"
            referencedColumns: ["id"]
          },
        ]
      }
      campana_destinatarios: {
        Row: {
          campana_id: string
          contacto_id: string
          entregado_en: string | null
          enviado_en: string | null
          estado: string
          id: string
          leido_en: string | null
          programado_para: string | null
          respondio: boolean
          tipo_interaccion: string | null
          wa_message_id: string | null
        }
        Insert: {
          campana_id: string
          contacto_id: string
          entregado_en?: string | null
          enviado_en?: string | null
          estado?: string
          id?: string
          leido_en?: string | null
          programado_para?: string | null
          respondio?: boolean
          tipo_interaccion?: string | null
          wa_message_id?: string | null
        }
        Update: {
          campana_id?: string
          contacto_id?: string
          entregado_en?: string | null
          enviado_en?: string | null
          estado?: string
          id?: string
          leido_en?: string | null
          programado_para?: string | null
          respondio?: boolean
          tipo_interaccion?: string | null
          wa_message_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campana_destinatarios_campana_id_fkey"
            columns: ["campana_id"]
            isOneToOne: false
            referencedRelation: "campanas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campana_destinatarios_contacto_id_fkey"
            columns: ["contacto_id"]
            isOneToOne: false
            referencedRelation: "contactos"
            referencedColumns: ["id"]
          },
        ]
      }
      campanas: {
        Row: {
          bajas: number
          clics: number
          creada_en: string
          dias_minimos_entre_campanas: number
          dias_reparto: number
          entregados: number
          enviados: number
          estado: string
          fecha_inicio: string | null
          hora_fin: string
          hora_inicio: string
          id: string
          leidos: number
          max_por_dia: number
          me_interesa: number
          nombre: string
          plantilla_id: string | null
        }
        Insert: {
          bajas?: number
          clics?: number
          creada_en?: string
          dias_minimos_entre_campanas?: number
          dias_reparto?: number
          entregados?: number
          enviados?: number
          estado?: string
          fecha_inicio?: string | null
          hora_fin?: string
          hora_inicio?: string
          id?: string
          leidos?: number
          max_por_dia?: number
          me_interesa?: number
          nombre: string
          plantilla_id?: string | null
        }
        Update: {
          bajas?: number
          clics?: number
          creada_en?: string
          dias_minimos_entre_campanas?: number
          dias_reparto?: number
          entregados?: number
          enviados?: number
          estado?: string
          fecha_inicio?: string | null
          hora_fin?: string
          hora_inicio?: string
          id?: string
          leidos?: number
          max_por_dia?: number
          me_interesa?: number
          nombre?: string
          plantilla_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campanas_plantilla_id_fkey"
            columns: ["plantilla_id"]
            isOneToOne: false
            referencedRelation: "plantillas"
            referencedColumns: ["id"]
          },
        ]
      }
      clics: {
        Row: {
          campana_id: string | null
          clic_en: string | null
          contacto_id: string | null
          destino: string | null
          id: string
          token: string
          url_destino: string | null
        }
        Insert: {
          campana_id?: string | null
          clic_en?: string | null
          contacto_id?: string | null
          destino?: string | null
          id?: string
          token: string
          url_destino?: string | null
        }
        Update: {
          campana_id?: string | null
          clic_en?: string | null
          contacto_id?: string | null
          destino?: string | null
          id?: string
          token?: string
          url_destino?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clics_campana_id_fkey"
            columns: ["campana_id"]
            isOneToOne: false
            referencedRelation: "campanas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clics_contacto_id_fkey"
            columns: ["contacto_id"]
            isOneToOne: false
            referencedRelation: "contactos"
            referencedColumns: ["id"]
          },
        ]
      }
      configuracion: {
        Row: {
          cobertura: string
          dias_seguimiento_repetido: number
          direccion: string | null
          facebook_url: string | null
          formas_pago: string | null
          garantia: string | null
          horario: string
          horas_incompleto: number
          horas_recordatorio_cliente_1: number
          horas_recordatorio_cliente_2: number
          horas_recordatorio_vendedor: number
          horas_seguimiento_resultado: number
          id: boolean
          informacion_para_ia: string | null
          instagram_url: string | null
          latitud: number | null
          link_resena_google: string | null
          longitud: number | null
          max_recordatorios_vendedor_dia: number
          nombre_negocio: string
          otras_redes: string | null
          telefono_negocio: string
          texto_cliente_regresa: string | null
          texto_fuera_de_horario: string | null
          texto_fuera_de_zona: string | null
          texto_pregunta_horario: string | null
          texto_pregunta_material: string | null
          texto_pregunta_medidas: string | null
          texto_pregunta_municipio: string | null
          texto_pregunta_servicio: string | null
          texto_recordatorio_cliente_1: string | null
          texto_recordatorio_cliente_2: string | null
          texto_saludo: string | null
          texto_traspaso_asesor: string | null
          ubicacion_maps_url: string | null
        }
        Insert: {
          cobertura?: string
          dias_seguimiento_repetido?: number
          direccion?: string | null
          facebook_url?: string | null
          formas_pago?: string | null
          garantia?: string | null
          horario?: string
          horas_incompleto?: number
          horas_recordatorio_cliente_1?: number
          horas_recordatorio_cliente_2?: number
          horas_recordatorio_vendedor?: number
          horas_seguimiento_resultado?: number
          id?: boolean
          informacion_para_ia?: string | null
          instagram_url?: string | null
          latitud?: number | null
          link_resena_google?: string | null
          longitud?: number | null
          max_recordatorios_vendedor_dia?: number
          nombre_negocio?: string
          otras_redes?: string | null
          telefono_negocio?: string
          texto_cliente_regresa?: string | null
          texto_fuera_de_horario?: string | null
          texto_fuera_de_zona?: string | null
          texto_pregunta_horario?: string | null
          texto_pregunta_material?: string | null
          texto_pregunta_medidas?: string | null
          texto_pregunta_municipio?: string | null
          texto_pregunta_servicio?: string | null
          texto_recordatorio_cliente_1?: string | null
          texto_recordatorio_cliente_2?: string | null
          texto_saludo?: string | null
          texto_traspaso_asesor?: string | null
          ubicacion_maps_url?: string | null
        }
        Update: {
          cobertura?: string
          dias_seguimiento_repetido?: number
          direccion?: string | null
          facebook_url?: string | null
          formas_pago?: string | null
          garantia?: string | null
          horario?: string
          horas_incompleto?: number
          horas_recordatorio_cliente_1?: number
          horas_recordatorio_cliente_2?: number
          horas_recordatorio_vendedor?: number
          horas_seguimiento_resultado?: number
          id?: boolean
          informacion_para_ia?: string | null
          instagram_url?: string | null
          latitud?: number | null
          link_resena_google?: string | null
          longitud?: number | null
          max_recordatorios_vendedor_dia?: number
          nombre_negocio?: string
          otras_redes?: string | null
          telefono_negocio?: string
          texto_cliente_regresa?: string | null
          texto_fuera_de_horario?: string | null
          texto_fuera_de_zona?: string | null
          texto_pregunta_horario?: string | null
          texto_pregunta_material?: string | null
          texto_pregunta_medidas?: string | null
          texto_pregunta_municipio?: string | null
          texto_pregunta_servicio?: string | null
          texto_recordatorio_cliente_1?: string | null
          texto_recordatorio_cliente_2?: string | null
          texto_saludo?: string | null
          texto_traspaso_asesor?: string | null
          ubicacion_maps_url?: string | null
        }
        Relationships: []
      }
      contactos: {
        Row: {
          acepta_publicidad: boolean
          en_estado_de_mexico: boolean
          es_cliente: boolean
          es_ejemplo: boolean
          fecha_baja_publicidad: string | null
          id: string
          municipio: string | null
          nivel_interes: string
          nombre: string | null
          nombre_mostrado: string | null
          origen: string | null
          primer_contacto: string
          telefono: string
          ultimo_mensaje: string | null
        }
        Insert: {
          acepta_publicidad?: boolean
          en_estado_de_mexico?: boolean
          es_cliente?: boolean
          es_ejemplo?: boolean
          fecha_baja_publicidad?: string | null
          id?: string
          municipio?: string | null
          nivel_interes?: string
          nombre?: string | null
          nombre_mostrado?: string | null
          origen?: string | null
          primer_contacto?: string
          telefono: string
          ultimo_mensaje?: string | null
        }
        Update: {
          acepta_publicidad?: boolean
          en_estado_de_mexico?: boolean
          es_cliente?: boolean
          es_ejemplo?: boolean
          fecha_baja_publicidad?: string | null
          id?: string
          municipio?: string | null
          nivel_interes?: string
          nombre?: string | null
          nombre_mostrado?: string | null
          origen?: string | null
          primer_contacto?: string
          telefono?: string
          ultimo_mensaje?: string | null
        }
        Relationships: []
      }
      estado_conversacion: {
        Row: {
          contacto_id: string
          en_manos_de_vendedor: boolean
          flujo_actual: string | null
          intentos_fallidos: number
          paso_actual: string | null
          recordatorios_enviados: number
          solicitud_id: string | null
          ultima_actividad: string
        }
        Insert: {
          contacto_id: string
          en_manos_de_vendedor?: boolean
          flujo_actual?: string | null
          intentos_fallidos?: number
          paso_actual?: string | null
          recordatorios_enviados?: number
          solicitud_id?: string | null
          ultima_actividad?: string
        }
        Update: {
          contacto_id?: string
          en_manos_de_vendedor?: boolean
          flujo_actual?: string | null
          intentos_fallidos?: number
          paso_actual?: string | null
          recordatorios_enviados?: number
          solicitud_id?: string | null
          ultima_actividad?: string
        }
        Relationships: [
          {
            foreignKeyName: "estado_conversacion_contacto_id_fkey"
            columns: ["contacto_id"]
            isOneToOne: true
            referencedRelation: "contactos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estado_conversacion_solicitud_id_fkey"
            columns: ["solicitud_id"]
            isOneToOne: false
            referencedRelation: "solicitudes"
            referencedColumns: ["id"]
          },
        ]
      }
      mensajes: {
        Row: {
          autor: string
          contacto_id: string | null
          contenido: string | null
          creado_en: string
          direccion: string
          es_ejemplo: boolean
          estado: string | null
          id: string
          media_url: string | null
          solicitud_id: string | null
          tipo: string
          wa_message_id: string | null
        }
        Insert: {
          autor?: string
          contacto_id?: string | null
          contenido?: string | null
          creado_en?: string
          direccion?: string
          es_ejemplo?: boolean
          estado?: string | null
          id?: string
          media_url?: string | null
          solicitud_id?: string | null
          tipo?: string
          wa_message_id?: string | null
        }
        Update: {
          autor?: string
          contacto_id?: string | null
          contenido?: string | null
          creado_en?: string
          direccion?: string
          es_ejemplo?: boolean
          estado?: string | null
          id?: string
          media_url?: string | null
          solicitud_id?: string | null
          tipo?: string
          wa_message_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mensajes_contacto_id_fkey"
            columns: ["contacto_id"]
            isOneToOne: false
            referencedRelation: "contactos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mensajes_solicitud_id_fkey"
            columns: ["solicitud_id"]
            isOneToOne: false
            referencedRelation: "solicitudes"
            referencedColumns: ["id"]
          },
        ]
      }
      plantillas: {
        Row: {
          botones: Json
          creada_en: string
          estado_meta: string
          id: string
          idioma: string
          imagen_url: string | null
          nombre: string
          nombre_meta: string | null
          servicio_relacionado: number | null
          tasa_interaccion: number
          texto: string
          veces_usada: number
        }
        Insert: {
          botones?: Json
          creada_en?: string
          estado_meta?: string
          id?: string
          idioma?: string
          imagen_url?: string | null
          nombre: string
          nombre_meta?: string | null
          servicio_relacionado?: number | null
          tasa_interaccion?: number
          texto?: string
          veces_usada?: number
        }
        Update: {
          botones?: Json
          creada_en?: string
          estado_meta?: string
          id?: string
          idioma?: string
          imagen_url?: string | null
          nombre?: string
          nombre_meta?: string | null
          servicio_relacionado?: number | null
          tasa_interaccion?: number
          texto?: string
          veces_usada?: number
        }
        Relationships: [
          {
            foreignKeyName: "plantillas_servicio_relacionado_fkey"
            columns: ["servicio_relacionado"]
            isOneToOne: false
            referencedRelation: "servicios"
            referencedColumns: ["codigo"]
          },
        ]
      }
      preguntas_frecuentes_log: {
        Row: {
          contacto_id: string | null
          creada_en: string
          es_ejemplo: boolean
          id: string
          pregunta: string
          respuesta_ia: string | null
        }
        Insert: {
          contacto_id?: string | null
          creada_en?: string
          es_ejemplo?: boolean
          id?: string
          pregunta: string
          respuesta_ia?: string | null
        }
        Update: {
          contacto_id?: string | null
          creada_en?: string
          es_ejemplo?: boolean
          id?: string
          pregunta?: string
          respuesta_ia?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "preguntas_frecuentes_log_contacto_id_fkey"
            columns: ["contacto_id"]
            isOneToOne: false
            referencedRelation: "contactos"
            referencedColumns: ["id"]
          },
        ]
      }
      servicios: {
        Row: {
          activo: boolean
          catalogo_url: string | null
          codigo: number
          descripcion: string | null
          nombre: string
          porcentaje_comision: number
          requiere_equipo: boolean
          tipo: string
        }
        Insert: {
          activo?: boolean
          catalogo_url?: string | null
          codigo: number
          descripcion?: string | null
          nombre: string
          porcentaje_comision?: number
          requiere_equipo?: boolean
          tipo: string
        }
        Update: {
          activo?: boolean
          catalogo_url?: string | null
          codigo?: number
          descripcion?: string | null
          nombre?: string
          porcentaje_comision?: number
          requiere_equipo?: boolean
          tipo?: string
        }
        Relationships: []
      }
      solicitudes: {
        Row: {
          archivada_en: string | null
          codigo: string | null
          comision: number | null
          completa: boolean
          contacto_id: string
          creada_en: string
          datos: Json
          equipo_codigo: number | null
          es_ejemplo: boolean
          etapa: number
          fuera_de_horario: boolean
          fuera_de_zona: boolean
          id: string
          monto_venta: number | null
          notas: string | null
          numero: number
          resultado_en: string | null
          servicio_codigo: number
          tomada_en: string | null
          urgente: boolean
          vendedor_id: string | null
        }
        Insert: {
          archivada_en?: string | null
          codigo?: string | null
          comision?: number | null
          completa?: boolean
          contacto_id: string
          creada_en?: string
          datos?: Json
          equipo_codigo?: number | null
          es_ejemplo?: boolean
          etapa?: number
          fuera_de_horario?: boolean
          fuera_de_zona?: boolean
          id?: string
          monto_venta?: number | null
          notas?: string | null
          numero?: number
          resultado_en?: string | null
          servicio_codigo: number
          tomada_en?: string | null
          urgente?: boolean
          vendedor_id?: string | null
        }
        Update: {
          archivada_en?: string | null
          codigo?: string | null
          comision?: number | null
          completa?: boolean
          contacto_id?: string
          creada_en?: string
          datos?: Json
          equipo_codigo?: number | null
          es_ejemplo?: boolean
          etapa?: number
          fuera_de_horario?: boolean
          fuera_de_zona?: boolean
          id?: string
          monto_venta?: number | null
          notas?: string | null
          numero?: number
          resultado_en?: string | null
          servicio_codigo?: number
          tomada_en?: string | null
          urgente?: boolean
          vendedor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "solicitudes_contacto_id_fkey"
            columns: ["contacto_id"]
            isOneToOne: false
            referencedRelation: "contactos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "solicitudes_servicio_codigo_fkey"
            columns: ["servicio_codigo"]
            isOneToOne: false
            referencedRelation: "servicios"
            referencedColumns: ["codigo"]
          },
          {
            foreignKeyName: "solicitudes_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "usuarios_perfil"
            referencedColumns: ["id"]
          },
        ]
      }
      usuarios_perfil: {
        Row: {
          activo: boolean
          creado_en: string
          es_vendedor: boolean
          id: string
          nombre: string
          recibe_resumen_semanal: boolean
          whatsapp: string | null
        }
        Insert: {
          activo?: boolean
          creado_en?: string
          es_vendedor?: boolean
          id: string
          nombre?: string
          recibe_resumen_semanal?: boolean
          whatsapp?: string | null
        }
        Update: {
          activo?: boolean
          creado_en?: string
          es_vendedor?: boolean
          id?: string
          nombre?: string
          recibe_resumen_semanal?: boolean
          whatsapp?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
