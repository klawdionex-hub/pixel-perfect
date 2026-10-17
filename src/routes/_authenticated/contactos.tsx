import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronDown, MessageCircle } from "lucide-react";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { EncabezadoPagina } from "@/components/AppLayout";
import { EtapaBadge, Marca } from "@/components/EtapaBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { pasarContactoAVendedores } from "@/lib/bot.functions";
import { claves, traerContactos, traerSolicitudes, type Contacto, type Solicitud } from "@/lib/datos";
import { enlaceWhatsApp, fechaHora, haceTiempo, telefonoBonito } from "@/lib/afpam";
import { cabeza } from "@/lib/cabeza";
import { NOMBRE_PASO } from "@/lib/bot/pasos";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/contactos")({
  head: () => cabeza("Contactos", "Directorio de contactos con historial de solicitudes y conversación."),
  component: PaginaContactos,
});

/** Pregunta del bot en la que se quedó el cliente. */
const PASOS: Record<string, string> = {
  nombre: "su nombre",
  menu: "el menú principal",
  regreso: "el menú de cliente que regresa",
  zona: "si está en el Estado de México",
  municipio: "el municipio",
  tipo_instalacion: "el tipo de portón",
  tiene_porton: "si ya tiene portón",
  medidas: "las medidas",
  material: "el material",
  foto: "la foto",
  equipo: "el tipo de equipo",
  marca: "la marca del motor",
  falla: "la falla",
  urgente: "la urgencia",
  ultimo_mantenimiento: "el último mantenimiento",
  horario: "el horario preferido",
};

type EstadoConversacion = {
  contacto_id: string;
  paso_actual: string | null;
  en_manos_de_vendedor: boolean;
  ultima_actividad: string;
};
type Filtro = "todos" | "sin_terminar" | "con_prospecto" | "clientes";

const pasoLegible = (e: EstadoConversacion | undefined) => PASOS[e?.paso_actual ?? ""] ?? e?.paso_actual ?? "";

function PaginaContactos() {
  const contactos = useQuery({ queryKey: claves.contactos, queryFn: traerContactos });
  const solicitudes = useQuery({ queryKey: claves.solicitudes, queryFn: traerSolicitudes });
  const estados = useQuery({
    queryKey: ["estado_conversacion"],
    queryFn: async () => {
      const { data, error } = await supabase.from("estado_conversacion").select("contacto_id, paso_actual, en_manos_de_vendedor, ultima_actividad");
      if (error) throw new Error(error.message);
      return data as EstadoConversacion[];
    },
  });
  const [busqueda, setBusqueda] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [abierto, setAbierto] = useState<string | null>(null);

  const porContacto = new Map<string, Solicitud[]>();
  for (const s of solicitudes.data ?? []) {
    const l = porContacto.get(s.contacto_id) ?? [];
    l.push(s);
    porContacto.set(s.contacto_id, l);
  }
  const estadoDe = new Map((estados.data ?? []).map((e) => [e.contacto_id, e]));
  const sinTerminar = (c: Contacto) => {
    const e = estadoDe.get(c.id);
    return !porContacto.get(c.id)?.length && !!e?.paso_actual && !e.en_manos_de_vendedor;
  };

  const todos = contactos.data ?? [];
  const conteo: Record<Filtro, number> = {
    todos: todos.length,
    sin_terminar: todos.filter(sinTerminar).length,
    con_prospecto: todos.filter((c) => porContacto.get(c.id)?.length).length,
    clientes: todos.filter((c) => c.es_cliente).length,
  };

  const lista = todos.filter((c) => {
    if (filtro === "sin_terminar" && !sinTerminar(c)) return false;
    if (filtro === "con_prospecto" && !porContacto.get(c.id)?.length) return false;
    if (filtro === "clientes" && !c.es_cliente) return false;
    if (!busqueda) return true;
    const t = busqueda.toLowerCase();
    const d = busqueda.replace(/\D/g, "");
    return (
      (c.nombre ?? "").toLowerCase().includes(t) ||
      (c.municipio ?? "").toLowerCase().includes(t) ||
      (!!d && c.telefono.includes(d))
    );
  });

  const FILTROS: Array<{ id: Filtro; texto: string }> = [
    { id: "todos", texto: "Todos" },
    { id: "sin_terminar", texto: "No terminaron la encuesta" },
    { id: "con_prospecto", texto: "Con prospecto" },
    { id: "clientes", texto: "Clientes" },
  ];

  return (
    <>
      <EncabezadoPagina
        titulo="Contactos"
        descripcion={`${lista.length} de ${todos.length} contactos. Haga clic en uno para ver sus datos.`}
        acciones={
          <Input
            placeholder="Buscar por nombre, teléfono o municipio"
            className="w-72"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
        }
      />
      <div className="space-y-4 p-8">
        <div className="flex flex-wrap gap-2">
          {FILTROS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFiltro(f.id)}
              className={cn(
                "rounded-full border px-3 py-1 text-sm",
                filtro === f.id ? "border-petroleo bg-petroleo text-white" : "border-border bg-card hover:bg-muted",
              )}
            >
              {f.texto} <span className="opacity-70">({conteo[f.id]})</span>
            </button>
          ))}
        </div>

        <Abandono estados={estados.data ?? []} solicitudes={solicitudes.data ?? []} contactos={todos} />

        {conteo.sin_terminar > 0 && filtro !== "sin_terminar" ? (
          <p className="rounded-md border border-primary/50 bg-primary/10 px-4 py-2 text-sm">
            {conteo.sin_terminar} contacto(s) escribieron pero no terminaron la encuesta. El bot los pasa solo a los vendedores
            después del tiempo configurado en Configuración → Tiempos, o puede pasarlos ahora desde su ficha.{" "}
            <button className="font-semibold text-petroleo underline" onClick={() => setFiltro("sin_terminar")}>
              Ver cuáles
            </button>
          </p>
        ) : null}

        <div className="overflow-hidden rounded-md border border-border bg-card">
          {lista.map((c) => (
            <FilaContacto
              key={c.id}
              c={c}
              suyas={porContacto.get(c.id) ?? []}
              estado={estadoDe.get(c.id)}
              sinTerminar={sinTerminar(c)}
              abierto={abierto === c.id}
              alternar={() => setAbierto(abierto === c.id ? null : c.id)}
            />
          ))}
          {lista.length === 0 ? <p className="p-6 text-sm text-muted-foreground">No hay contactos que coincidan.</p> : null}
        </div>
      </div>
    </>
  );
}

function FilaContacto({
  c,
  suyas,
  estado,
  sinTerminar,
  abierto,
  alternar,
}: {
  c: Contacto;
  suyas: Solicitud[];
  estado: EstadoConversacion | undefined;
  sinTerminar: boolean;
  abierto: boolean;
  alternar: () => void;
}) {
  const ultima = suyas[0];
  return (
    <div className="border-b border-border last:border-b-0">
      <button
        onClick={alternar}
        className={cn(
          "grid w-full grid-cols-[1fr_auto] items-center gap-3 px-4 py-3 text-left hover:bg-muted/60 md:grid-cols-[1.4fr_1fr_1.4fr_7rem_auto]",
          abierto && "bg-muted/60",
        )}
      >
        <div className="min-w-0">
          <p className="truncate font-semibold text-card-foreground">
            {c.nombre ?? "Sin nombre"}
            {c.es_cliente ? <span className="ml-2 rounded-full bg-etapa-cliente px-2 py-0.5 text-[11px] text-white">Cliente</span> : null}
          </p>
          <p className="text-xs text-muted-foreground">{telefonoBonito(c.telefono)}</p>
        </div>
        <p className="hidden truncate text-sm text-muted-foreground md:block">{c.municipio ?? "Sin municipio"}</p>
        <div className="hidden md:block">
          {ultima ? (
            <span className="flex items-center gap-2">
              <span className="font-mono text-sm font-semibold">{ultima.codigo}</span>
              <EtapaBadge etapa={ultima.etapa} />
            </span>
          ) : sinTerminar ? (
            <Marca texto={`No terminó: se quedó en ${pasoLegible(estado)}`} tono="ambar" />
          ) : (
            <Marca texto="Sin prospecto" tono="gris" />
          )}
        </div>
        <p className="hidden text-xs text-muted-foreground md:block">{haceTiempo(c.ultimo_mensaje ?? c.primer_contacto)}</p>
        <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", abierto && "rotate-180")} />
      </button>
      {abierto ? <Detalle c={c} suyas={suyas} sinTerminar={sinTerminar} estado={estado} /> : null}
    </div>
  );
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{etiqueta}</p>
      <p className="text-sm text-card-foreground">{valor}</p>
    </div>
  );
}

function Detalle({
  c,
  suyas,
  sinTerminar,
  estado,
}: {
  c: Contacto;
  suyas: Solicitud[];
  sinTerminar: boolean;
  estado: EstadoConversacion | undefined;
}) {
  const qc = useQueryClient();
  const pasar = useServerFn(pasarContactoAVendedores);
  const [pasando, setPasando] = useState(false);
  const mensajes = useQuery({
    queryKey: ["mensajes-contacto", c.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("mensajes")
        .select("id, direccion, contenido, tipo, media_url, creado_en")
        .eq("contacto_id", c.id)
        .order("creado_en", { ascending: false })
        .limit(40);
      if (error) throw new Error(error.message);
      return (data ?? []).reverse();
    },
  });

  const publicidad = useMutation({
    mutationFn: async (alta: boolean) => {
      const { error } = await supabase
        .from("contactos")
        .update({ acepta_publicidad: alta, fecha_baja_publicidad: alta ? null : new Date().toISOString() })
        .eq("id", c.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Preferencia de publicidad actualizada");
      qc.invalidateQueries({ queryKey: claves.contactos });
    },
    onError: () => toast.error("No se pudo actualizar la preferencia"),
  });

  async function pasarAVendedores() {
    setPasando(true);
    try {
      const r = await pasar({ data: { contactoId: c.id } });
      toast.success(r.yaExistia ? `Ya tenía el prospecto ${r.codigo}.` : `Se creó el prospecto ${r.codigo ?? ""} y se avisó a los vendedores.`);
      qc.invalidateQueries({ queryKey: claves.solicitudes });
      qc.invalidateQueries({ queryKey: ["estado_conversacion"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo pasar a vendedores.");
    } finally {
      setPasando(false);
    }
  }

  return (
    <div className="grid gap-6 border-t border-border bg-background px-4 py-5 lg:grid-cols-2">
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-4">
          <Dato etiqueta="Teléfono" valor={telefonoBonito(c.telefono)} />
          <Dato etiqueta="Municipio" valor={c.municipio ?? "—"} />
          <Dato etiqueta="Zona" valor={c.en_estado_de_mexico ? "Estado de México" : "Fuera de cobertura"} />
          <Dato etiqueta="Origen" valor={c.origen ?? "—"} />
          <Dato etiqueta="Primer mensaje" valor={fechaHora(c.primer_contacto)} />
          <Dato etiqueta="Último mensaje" valor={fechaHora(c.ultimo_mensaje)} />
          <Dato etiqueta="Nombre en WhatsApp" valor={c.nombre_mostrado ?? "—"} />
          <Dato etiqueta="Publicidad" valor={c.acepta_publicidad ? "Acepta" : `Baja el ${fechaHora(c.fecha_baja_publicidad)}`} />
        </div>

        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm">
            <a href={enlaceWhatsApp(c.telefono)} target="_blank" rel="noreferrer">
              <MessageCircle className="mr-1 h-4 w-4" /> Abrir en WhatsApp
            </a>
          </Button>
          {sinTerminar ? (
            <Button size="sm" disabled={pasando} onClick={pasarAVendedores}>
              {pasando ? "Pasando…" : "Pasar a vendedores ahora"}
            </Button>
          ) : null}
          <Button variant="ghost" size="sm" onClick={() => publicidad.mutate(!c.acepta_publicidad)}>
            {c.acepta_publicidad ? "Dar de baja de publicidad" : "Dar de alta en publicidad"}
          </Button>
        </div>
        {sinTerminar ? (
          <p className="text-xs text-muted-foreground">
            No terminó la encuesta: se quedó en {pasoLegible(estado)}. Al pasarlo se crea un prospecto marcado como incompleto
            y se avisa a los vendedores.
          </p>
        ) : null}

        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Prospectos</h3>
          <ul className="mt-2 space-y-1.5">
            {suyas.length === 0 ? (
              <li className="text-sm text-muted-foreground">Sin prospectos.</li>
            ) : (
              suyas.map((s) => (
                <li key={s.id} className="flex items-center gap-3 text-sm">
                  <Link to="/solicitud/$id" params={{ id: s.id }} className="font-mono font-semibold text-petroleo hover:underline">
                    {s.codigo}
                  </Link>
                  <EtapaBadge etapa={s.etapa} />
                  {!s.completa ? <Marca texto="Incompleta" tono="ambar" /> : null}
                  <span className="text-muted-foreground">{fechaHora(s.creada_en)}</span>
                </li>
              ))
            )}
          </ul>
        </div>
      </div>

      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Conversación con el bot</h3>
        <div className="mt-2 max-h-80 space-y-2 overflow-y-auto rounded-md border border-border bg-[#efeae2] p-3">
          {mensajes.isLoading ? <p className="text-sm text-muted-foreground">Cargando…</p> : null}
          {mensajes.data?.length === 0 ? <p className="text-sm text-[#667781]">Sin mensajes guardados.</p> : null}
          {(mensajes.data ?? []).map((m) => {
            const delCliente = m.direccion === "entrante";
            return (
              <div key={m.id} className={cn("flex", delCliente ? "justify-start" : "justify-end")}>
                <div className={cn("max-w-[85%] rounded-lg px-3 py-1.5 text-sm shadow-sm", delCliente ? "bg-white" : "bg-[#d9fdd3]")}>
                  {m.media_url ? (
                    <a href={m.media_url} target="_blank" rel="noreferrer" className="text-petroleo underline">
                      Ver archivo ({m.tipo})
                    </a>
                  ) : null}
                  {m.contenido ? <p className="whitespace-pre-wrap text-[#111b21]">{m.contenido}</p> : null}
                  <p className="text-right text-[10px] text-[#667781]">{fechaHora(m.creado_en)}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/**
 * En qué pregunta dejan la encuesta los clientes (últimos 30 días): los que siguen sin terminar
 * más los que el bot pasó a vendedores como incompletos (se guarda la pregunta en datos.abandono_en).
 */
function Abandono({
  estados,
  solicitudes,
  contactos,
}: {
  estados: EstadoConversacion[];
  solicitudes: Solicitud[];
  contactos: Contacto[];
}) {
  const [abierto, setAbierto] = useState(false);
  const desde = Date.now() - 30 * 86400000;
  const dePrueba = new Set(contactos.filter((c) => c.es_ejemplo || c.telefono.startsWith("sim-")).map((c) => c.id));
  const cuenta = new Map<string, number>();
  const sumar = (k: string) => cuenta.set(k, (cuenta.get(k) ?? 0) + 1);
  for (const e of estados) {
    if (!e.paso_actual || e.en_manos_de_vendedor || dePrueba.has(e.contacto_id)) continue;
    const t = new Date(e.ultima_actividad).getTime();
    // Solo cuenta si lleva más de una hora sin contestar (los que están contestando ahora no).
    if (t < desde || Date.now() - t < 3600000) continue;
    sumar(NOMBRE_PASO[e.paso_actual] ?? e.paso_actual);
  }
  let terminaron = 0;
  for (const s of solicitudes) {
    if (new Date(s.creada_en).getTime() < desde || dePrueba.has(s.contacto_id) || s.es_ejemplo) continue;
    const en = (s.datos ?? {})["abandono_en"];
    if (typeof en === "string" && en) sumar(en);
    else if (s.completa) terminaron++;
  }
  const filas = [...cuenta.entries()].sort((a, b) => b[1] - a[1]);
  const abandonaron = filas.reduce((t, [, n]) => t + n, 0);
  const maximo = Math.max(1, ...filas.map(([, n]) => n));
  const total = abandonaron + terminaron;

  return (
    <div className="rounded-md border border-border bg-card">
      <button onClick={() => setAbierto(!abierto)} className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left">
        <div>
          <p className="font-semibold text-card-foreground">Dónde abandonan la encuesta</p>
          <p className="text-xs text-muted-foreground">
            Últimos 30 días: {terminaron} la terminaron y {abandonaron} la dejaron a medias
            {total ? ` (${Math.round((terminaron / total) * 100)}% la termina)` : ""}.
          </p>
        </div>
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", abierto && "rotate-180")} />
      </button>
      {abierto ? (
        <div className="space-y-2 border-t border-border px-4 py-4">
          {filas.length === 0 ? <p className="text-sm text-muted-foreground">Nadie ha dejado la encuesta a medias en este periodo.</p> : null}
          {filas.map(([paso, n]) => (
            <div key={paso} className="grid grid-cols-[10rem_1fr_2.5rem] items-center gap-3 text-sm">
              <span className="truncate text-card-foreground">{paso}</span>
              <div className="h-3 rounded-full bg-muted">
                <div className="h-3 rounded-full bg-primary" style={{ width: `${(n / maximo) * 100}%` }} />
              </div>
              <span className="text-right font-semibold tabular-nums">{n}</span>
            </div>
          ))}
          <p className="pt-1 text-xs text-muted-foreground">
            Cuenta la pregunta en la que cada cliente dejó de contestar. La pregunta con la barra más larga es la primera que
            conviene simplificar.
          </p>
        </div>
      ) : null}
    </div>
  );
}
