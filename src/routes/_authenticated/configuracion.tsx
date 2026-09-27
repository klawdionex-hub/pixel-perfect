import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { EncabezadoPagina } from "@/components/AppLayout";
import { Tabla, Celda } from "@/components/Tabla";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { claves, traerConfiguracion, traerServicios, type Servicio } from "@/lib/datos";
import { cabeza } from "@/lib/cabeza";
import { TEXTOS, valorEditable, type ClaveTexto, type ConfigBot } from "@/lib/bot/textos";
import { normalizarOpciones, textoDeSalida } from "@/lib/bot/salida";
import {
  ejecutarRecordatorios,
  estadoIntegracion,
  reiniciarSimulacion,
  simularMensaje,
  type SalidaSimulada,
} from "@/lib/bot.functions";

export const Route = createFileRoute("/_authenticated/configuracion")({
  head: () => cabeza("Configuración del bot", "Textos, horarios, servicios y conexión con WhatsApp."),
  component: Pagina,
});

type Config = ConfigBot & Record<string, unknown>;

function Pagina() {
  const q = useQuery({ queryKey: claves.configuracion, queryFn: traerConfiguracion });
  return (
    <div>
      <EncabezadoPagina
        titulo="Configuración del bot"
        descripcion="Todo lo que el bot dice y usa se edita aquí, sin tocar código."
      />
      <div className="p-8">
        {q.isLoading ? (
          <p className="text-sm text-muted-foreground">Cargando…</p>
        ) : q.error ? (
          <p className="text-sm text-destructive">{(q.error as Error).message}</p>
        ) : (
          <Tabs defaultValue="probar">
            <TabsList className="mb-6 flex-wrap">
              <TabsTrigger value="probar">Probar bot</TabsTrigger>
              <TabsTrigger value="general">Negocio</TabsTrigger>
              <TabsTrigger value="textos">Textos del bot</TabsTrigger>
              <TabsTrigger value="tiempos">Tiempos</TabsTrigger>
              <TabsTrigger value="servicios">Servicios</TabsTrigger>
              <TabsTrigger value="whatsapp">WhatsApp</TabsTrigger>
              <TabsTrigger value="ejemplo">Datos de ejemplo</TabsTrigger>
            </TabsList>
            <TabsContent value="probar"><ProbarBot /></TabsContent>
            <TabsContent value="general"><Negocio config={q.data as Config} /></TabsContent>
            <TabsContent value="textos"><Textos config={q.data as Config} /></TabsContent>
            <TabsContent value="tiempos"><Tiempos config={q.data as Config} /></TabsContent>
            <TabsContent value="servicios"><Servicios /></TabsContent>
            <TabsContent value="whatsapp"><WhatsApp /></TabsContent>
            <TabsContent value="ejemplo"><DatosEjemplo /></TabsContent>
          </Tabs>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- guardado

function useGuardarConfig() {
  const qc = useQueryClient();
  return async (cambios: Record<string, unknown>) => {
    const { error } = await supabase.from("configuracion").update(cambios as never).eq("id", true);
    if (error) {
      toast.error(error.message);
      return false;
    }
    toast.success("Cambios guardados");
    qc.invalidateQueries({ queryKey: claves.configuracion });
    return true;
  };
}

function Campo({
  etiqueta,
  valor,
  onChange,
  largo,
  tipo = "text",
  ayuda,
}: {
  etiqueta: string;
  valor: unknown;
  onChange: (v: string) => void;
  largo?: boolean | undefined;
  tipo?: string | undefined;
  ayuda?: string | undefined;
}) {
  const v = valor == null ? "" : String(valor);
  return (
    <div className={largo ? "md:col-span-2" : ""}>
      <Label>{etiqueta}</Label>
      {largo ? (
        <Textarea rows={4} value={v} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <Input type={tipo} value={v} onChange={(e) => onChange(e.target.value)} />
      )}
      {ayuda ? <p className="mt-1 text-xs text-muted-foreground">{ayuda}</p> : null}
    </div>
  );
}

const CAMPOS_NEGOCIO: Array<{ col: string; etiqueta: string; largo?: boolean; tipo?: string; ayuda?: string | undefined }> = [
  { col: "nombre_negocio", etiqueta: "Nombre del negocio" },
  { col: "telefono_negocio", etiqueta: "Teléfono del negocio" },
  { col: "horario", etiqueta: "Horario (texto que se muestra al cliente)" },
  { col: "cobertura", etiqueta: "Zonas de cobertura" },
  { col: "direccion", etiqueta: "Dirección" },
  { col: "ubicacion_maps_url", etiqueta: "Enlace de Google Maps" },
  { col: "latitud", etiqueta: "Latitud (para enviar el pin)", tipo: "number" },
  { col: "longitud", etiqueta: "Longitud (para enviar el pin)", tipo: "number" },
  { col: "formas_pago", etiqueta: "Formas de pago" },
  { col: "garantia", etiqueta: "Garantía" },
  { col: "link_resena_google", etiqueta: "Enlace para reseñas en Google" },
  { col: "facebook_url", etiqueta: "Facebook" },
  { col: "instagram_url", etiqueta: "Instagram" },
  { col: "otras_redes", etiqueta: "Otras redes" },
  {
    col: "informacion_para_ia",
    etiqueta: "Información para la IA",
    largo: true,
    ayuda: "Servicios, tiempos aproximados, preguntas frecuentes, etc. La usará la IA en la fase 5. No incluya precios.",
  },
];

function Negocio({ config }: { config: Config }) {
  const [f, setF] = useState<Record<string, unknown>>(config);
  const guardar = useGuardarConfig();
  return (
    <div className="space-y-4 rounded-md border border-border bg-card p-5">
      <div className="grid gap-4 md:grid-cols-2">
        {CAMPOS_NEGOCIO.map((c) => (
          <Campo
            key={c.col}
            etiqueta={c.etiqueta}
            valor={f[c.col]}
            largo={c.largo}
            tipo={c.tipo}
            ayuda={c.ayuda}
            onChange={(v) => setF({ ...f, [c.col]: v })}
          />
        ))}
      </div>
      <Button
        onClick={() =>
          guardar(
            Object.fromEntries(
              CAMPOS_NEGOCIO.map((c) => {
                const v = f[c.col];
                if (c.tipo === "number") return [c.col, v === "" || v == null ? null : Number(v)];
                return [c.col, v === "" ? null : v];
              }),
            ),
          )
        }
      >
        Guardar
      </Button>
    </div>
  );
}

function Textos({ config }: { config: Config }) {
  const claves = Object.keys(TEXTOS) as ClaveTexto[];
  const [f, setF] = useState<Record<string, string>>(() =>
    Object.fromEntries(claves.map((k) => [k, valorEditable(config, k)])),
  );
  const guardar = useGuardarConfig();

  async function guardarTodo() {
    const columnas: Record<string, string> = {};
    const extra: Record<string, string> = { ...(config.textos_extra ?? {}) };
    for (const k of claves) {
      const def = TEXTOS[k];
      if (def.columna) columnas[def.columna] = f[k] ?? "";
      else extra[k] = f[k] ?? "";
    }
    await guardar({ ...columnas, textos_extra: extra });
  }

  return (
    <div className="space-y-4 rounded-md border border-border bg-card p-5">
      <p className="text-sm text-muted-foreground">
        Tono formal, trato de "usted" y sin emojis. Variables disponibles: {"{nombre}"}, {"{codigo}"},{" "}
        {"{vendedor}"}, {"{telefono_vendedor}"} (según el texto).
      </p>
      <div className="grid gap-4 md:grid-cols-2">
        {claves.map((k) => (
          <div key={k}>
            <div className="flex items-center justify-between">
              <Label>{TEXTOS[k].etiqueta}</Label>
              {f[k] !== TEXTOS[k].porDefecto ? (
                <button
                  className="text-xs text-petroleo underline"
                  onClick={() => setF({ ...f, [k]: TEXTOS[k].porDefecto })}
                >
                  Restaurar
                </button>
              ) : null}
            </div>
            <Textarea rows={4} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
          </div>
        ))}
      </div>
      <Button onClick={guardarTodo}>Guardar textos</Button>
    </div>
  );
}

const CAMPOS_TIEMPO: Array<{ col: string; etiqueta: string }> = [
  { col: "horas_recordatorio_cliente_1", etiqueta: "Primer recordatorio al cliente (horas sin responder)" },
  { col: "horas_recordatorio_cliente_2", etiqueta: "Segundo recordatorio al cliente (horas)" },
  { col: "horas_incompleto", etiqueta: "Marcar como incompleta y avisar a vendedores (horas)" },
  { col: "horas_recordatorio_vendedor", etiqueta: "Recordatorio a vendedores sin tomar (horas) — fase 3" },
  { col: "max_recordatorios_vendedor_dia", etiqueta: "Máximo de recordatorios a vendedores por día — fase 3" },
  { col: "horas_seguimiento_resultado", etiqueta: "Primer seguimiento de resultado (horas) — fase 3" },
  { col: "dias_seguimiento_repetido", etiqueta: "Repetir seguimiento cada (días) — fase 3" },
];

function Tiempos({ config }: { config: Config }) {
  const [f, setF] = useState<Record<string, unknown>>(config);
  const guardar = useGuardarConfig();
  return (
    <div className="space-y-4 rounded-md border border-border bg-card p-5">
      <p className="text-sm text-muted-foreground">
        El segundo recordatorio debe enviarse antes de 24 horas: después de ese tiempo WhatsApp no permite
        escribirle al cliente sin una plantilla aprobada.
      </p>
      <div className="grid gap-4 md:grid-cols-2">
        {CAMPOS_TIEMPO.map((c) => (
          <Campo key={c.col} etiqueta={c.etiqueta} tipo="number" valor={f[c.col]} onChange={(v) => setF({ ...f, [c.col]: v })} />
        ))}
      </div>
      <Button
        onClick={() => {
          const cambios = Object.fromEntries(CAMPOS_TIEMPO.map((c) => [c.col, Math.max(0, Math.round(Number(f[c.col]) || 0))]));
          if (Number(cambios["horas_recordatorio_cliente_2"]) >= 24) {
            toast.error("El segundo recordatorio debe ser menor a 24 horas.");
            return;
          }
          guardar(cambios);
        }}
      >
        Guardar tiempos
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------- servicios

function Servicios() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: claves.servicios, queryFn: traerServicios });

  async function actualizar(codigo: number, cambios: Partial<Servicio>) {
    const { error } = await supabase.from("servicios").update(cambios).eq("codigo", codigo);
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: claves.servicios });
  }

  async function subirCatalogo(codigo: number, archivo: File) {
    const ext = archivo.name.split(".").pop()?.toLowerCase() ?? "bin";
    const ruta = `catalogos/servicio-${codigo}-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("media").upload(ruta, archivo, { contentType: archivo.type });
    if (error) { toast.error(`No se pudo subir: ${error.message}`); return; }
    const url = supabase.storage.from("media").getPublicUrl(ruta).data.publicUrl;
    await actualizar(codigo, { catalogo_url: url });
    toast.success("Catálogo cargado");
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        El catálogo (imagen o PDF) se envía al cliente al cerrar su solicitud. Los servicios 1 a 7 aparecen en la
        lista de instalación solo si están activos.
      </p>
      <Tabla encabezados={["Código", "Nombre", "% comisión", "Activo", "Catálogo"]}>
        {(q.data ?? []).map((s) => (
          <tr key={s.codigo}>
            <Celda className="font-semibold">{s.codigo}</Celda>
            <Celda>
              <Input defaultValue={s.nombre} onBlur={(e) => e.target.value !== s.nombre && actualizar(s.codigo, { nombre: e.target.value })} />
            </Celda>
            <Celda className="w-28">
              <Input
                type="number"
                step="0.5"
                defaultValue={s.porcentaje_comision}
                onBlur={(e) => Number(e.target.value) !== Number(s.porcentaje_comision) && actualizar(s.codigo, { porcentaje_comision: Number(e.target.value) })}
              />
            </Celda>
            <Celda><Switch checked={s.activo} onCheckedChange={(v) => actualizar(s.codigo, { activo: v })} /></Celda>
            <Celda>
              <div className="flex flex-wrap items-center gap-2">
                {s.catalogo_url ? (
                  <>
                    <a href={s.catalogo_url} target="_blank" rel="noreferrer" className="text-petroleo underline">Ver</a>
                    <button className="text-xs text-destructive underline" onClick={() => actualizar(s.codigo, { catalogo_url: null })}>Quitar</button>
                  </>
                ) : null}
                <input
                  type="file"
                  accept="image/*,application/pdf"
                  className="max-w-52 text-xs"
                  onChange={(e) => e.target.files?.[0] && subirCatalogo(s.codigo, e.target.files[0])}
                />
              </div>
            </Celda>
          </tr>
        ))}
      </Tabla>
    </div>
  );
}

// ---------------------------------------------------------------- WhatsApp

function WhatsApp() {
  const estadoFn = useServerFn(estadoIntegracion);
  const recordatoriosFn = useServerFn(ejecutarRecordatorios);
  const q = useQuery({ queryKey: ["estado-integracion"], queryFn: () => estadoFn() });
  const [origen, setOrigen] = useState("");
  const [corriendo, setCorriendo] = useState(false);
  useEffect(() => {
    setOrigen(window.location.origin);
  }, []);

  const copiar = (t: string) => navigator.clipboard.writeText(t).then(() => toast.success("Copiado"));

  const NOMBRES: Record<string, string> = {
    WHATSAPP_TOKEN: "Token permanente de WhatsApp",
    WHATSAPP_PHONE_NUMBER_ID: "Phone Number ID",
    WHATSAPP_WABA_ID: "WhatsApp Business Account ID",
    WHATSAPP_VERIFY_TOKEN: "Verify Token (lo inventa usted)",
    META_APP_SECRET: "Clave secreta de la app de Meta",
    SUPABASE_SERVICE_ROLE_KEY: "Acceso del servidor a la base de datos",
    CRON: "Secreto de la tarea programada",
  };

  return (
    <div className="space-y-6">
      <div className="space-y-3 rounded-md border border-border bg-card p-5">
        <h2 className="text-base">Webhook para Meta</h2>
        <p className="text-sm text-muted-foreground">
          En developers.facebook.com, en su app: WhatsApp, Configuración, Webhook. Pegue esta URL y el mismo Verify
          Token que capturó en los secretos. Después suscriba el campo "messages".
        </p>
        <div className="flex gap-2">
          <Input readOnly value={`${origen}/api/whatsapp/webhook`} />
          <Button variant="outline" onClick={() => copiar(`${origen}/api/whatsapp/webhook`)}>Copiar</Button>
        </div>
      </div>

      <div className="space-y-3 rounded-md border border-border bg-card p-5">
        <h2 className="text-base">Secretos configurados en el servidor</h2>
        {q.isLoading ? (
          <p className="text-sm text-muted-foreground">Revisando…</p>
        ) : q.error ? (
          <p className="text-sm text-destructive">{(q.error as Error).message}</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {Object.entries(q.data ?? {}).map(([k, ok]) => (
              <li key={k} className="flex items-center justify-between gap-4 border-b border-border py-1 last:border-0">
                <span>{NOMBRES[k] ?? k} <span className="text-xs text-muted-foreground">({k === "CRON" ? "LOVABLE_CRON_SECRET o BOT_CRON_SECRET" : k})</span></span>
                <span className={ok ? "font-semibold text-etapa-cliente" : "font-semibold text-destructive"}>
                  {ok ? "Configurado" : "Falta"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="space-y-3 rounded-md border border-border bg-card p-5">
        <h2 className="text-base">Recordatorios automáticos</h2>
        <p className="text-sm text-muted-foreground">
          La tarea programada debe llamar cada 5 minutos a esta dirección (POST, con el encabezado
          "Authorization: Bearer" y el secreto de la tarea programada):
        </p>
        <div className="flex gap-2">
          <Input readOnly value={`${origen}/api/cron/bot`} />
          <Button variant="outline" onClick={() => copiar(`${origen}/api/cron/bot`)}>Copiar</Button>
        </div>
        <Button
          disabled={corriendo}
          onClick={async () => {
            setCorriendo(true);
            try {
              const r = await recordatoriosFn();
              toast.success(`Recordatorios: ${r.recordatorio1 + r.recordatorio2} enviados, ${r.incompletas} marcadas como incompletas.`);
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "No se pudo ejecutar");
            } finally {
              setCorriendo(false);
            }
          }}
        >
          Ejecutar recordatorios ahora
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- datos de ejemplo

function DatosEjemplo() {
  const qc = useQueryClient();
  const [borrando, setBorrando] = useState(false);
  async function borrar() {
    if (!window.confirm("Se borrarán los contactos, solicitudes, mensajes y preguntas de ejemplo. ¿Continuar?")) return;
    setBorrando(true);
    const pasos = [
      supabase.from("preguntas_frecuentes_log").delete().eq("es_ejemplo", true),
      supabase.from("mensajes").delete().eq("es_ejemplo", true),
      supabase.from("solicitudes").delete().eq("es_ejemplo", true),
      supabase.from("contactos").delete().eq("es_ejemplo", true),
    ];
    for (const p of pasos) {
      const { error } = await p;
      if (error) { toast.error(error.message); setBorrando(false); return; }
    }
    setBorrando(false);
    toast.success("Datos de ejemplo eliminados");
    qc.invalidateQueries();
  }
  return (
    <div className="space-y-3 rounded-md border border-border bg-card p-5">
      <p className="text-sm text-muted-foreground">
        Elimina los registros de muestra y las conversaciones de "Probar bot". Los datos reales no se tocan.
      </p>
      <Button variant="destructive" disabled={borrando} onClick={borrar}>Borrar datos de ejemplo</Button>
    </div>
  );
}

// ---------------------------------------------------------------- simulador

type Burbuja = {
  de: "cliente" | "bot" | "vendedor";
  texto: string;
  nombre?: string | undefined;
  opciones?: { id: string; titulo: string }[] | undefined;
};

function ProbarBot() {
  const simular = useServerFn(simularMensaje);
  const reiniciar = useServerFn(reiniciarSimulacion);
  const [burbujas, setBurbujas] = useState<Burbuja[]>([]);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const fin = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fin.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [burbujas]);

  function aBurbuja(s: SalidaSimulada): Burbuja {
    const sal = s.salida;
    if (sal.tipo === "lista" || sal.tipo === "botones") {
      return { de: s.para === "cliente" ? "bot" : "vendedor", nombre: s.nombre, texto: sal.texto, opciones: normalizarOpciones(sal.opciones) };
    }
    return { de: s.para === "cliente" ? "bot" : "vendedor", nombre: s.nombre, texto: textoDeSalida(sal) };
  }

  async function mandar(t: string, opcionId?: string) {
    if (!t.trim() && !opcionId) return;
    setEnviando(true);
    setBurbujas((b) => [...b, { de: "cliente", texto: t }]);
    setTexto("");
    try {
      const r = await simular({ data: { texto: t, opcionId } });
      setBurbujas((b) => [...b, ...r.salidas.map(aBurbuja)]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error en el simulador");
    } finally {
      setEnviando(false);
    }
  }

  async function empezarDeNuevo() {
    try {
      await reiniciar();
      setBurbujas([]);
      toast.success("Conversación de prueba reiniciada");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo reiniciar");
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="flex h-[620px] flex-col rounded-md border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <p className="text-sm font-semibold">Simulador de WhatsApp</p>
            <p className="text-xs text-muted-foreground">Usa la base de datos real, pero no envía mensajes.</p>
          </div>
          <Button variant="outline" size="sm" onClick={empezarDeNuevo}>Empezar de nuevo</Button>
        </div>
        <div className="flex-1 space-y-3 overflow-y-auto bg-muted/40 p-4">
          {burbujas.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground">Escriba "Hola" para iniciar la conversación como si fuera un cliente.</p>
          ) : null}
          {burbujas.map((b, i) => (
            <div key={i} className={b.de === "cliente" ? "flex justify-end" : "flex justify-start"}>
              <div
                className={
                  b.de === "cliente"
                    ? "max-w-[75%] rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground"
                    : b.de === "vendedor"
                      ? "max-w-[75%] rounded-lg border border-dashed border-petroleo bg-card px-3 py-2 text-sm"
                      : "max-w-[75%] rounded-lg bg-card px-3 py-2 text-sm shadow-sm"
                }
              >
                {b.de === "vendedor" ? (
                  <p className="mb-1 text-xs font-semibold text-petroleo">Aviso por WhatsApp a {b.nombre}</p>
                ) : null}
                <p className="whitespace-pre-wrap">{b.texto}</p>
                {b.opciones ? (
                  <div className="mt-2 flex flex-col gap-1">
                    {b.opciones.map((o) => (
                      <button
                        key={o.id}
                        disabled={enviando || i !== ultimaDelBot(burbujas)}
                        onClick={() => mandar(o.titulo, o.id)}
                        className="rounded border border-border px-2 py-1 text-left text-petroleo hover:bg-muted disabled:opacity-50"
                      >
                        {o.titulo}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          ))}
          <div ref={fin} />
        </div>
        <form
          className="flex gap-2 border-t border-border p-3"
          onSubmit={(e) => {
            e.preventDefault();
            mandar(texto);
          }}
        >
          <Input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Escriba como cliente…" disabled={enviando} />
          <Button type="submit" disabled={enviando || !texto.trim()}>Enviar</Button>
        </form>
      </div>
      <div className="space-y-3 rounded-md border border-border bg-card p-5 text-sm">
        <h2 className="text-base">Cómo probar</h2>
        <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
          <li>Escriba como lo haría un cliente. Puede tocar las opciones o escribir el número.</li>
          <li>Escriba "asesor" en cualquier momento para pasar con un vendedor.</li>
          <li>Los recuadros punteados muestran el aviso que recibiría cada vendedor con WhatsApp registrado en Usuarios.</li>
          <li>La solicitud creada aparece en Solicitudes, marcada como dato de ejemplo.</li>
          <li>"Empezar de nuevo" borra este cliente de prueba para repetir el flujo desde el saludo.</li>
        </ul>
      </div>
    </div>
  );
}

function ultimaDelBot(b: Burbuja[]) {
  for (let i = b.length - 1; i >= 0; i--) if (b[i]?.de === "bot" && b[i]?.opciones) return i;
  return -1;
}
