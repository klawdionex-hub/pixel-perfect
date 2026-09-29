import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import type { ReactNode } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  AlertTriangle,
  ArrowRight,
  BadgeDollarSign,
  CalendarDays,
  CheckCircle2,
  Circle,
  ClipboardList,
  Clock,
  Hourglass,
  Inbox,
  MapPinOff,
  PartyPopper,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { EncabezadoPagina } from "@/components/AppLayout";
import { Marca } from "@/components/EtapaBadge";
import { Folio } from "@/components/Folio";
import { Vacio } from "@/components/Vacio";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { estadoIntegracion } from "@/lib/bot.functions";
import { claves, traerCampanas, traerServicios, traerSolicitudes, traerUsuarios, type Solicitud } from "@/lib/datos";
import { haceTiempo, horasDesde, inicioSemana, mesActualRango, moneda, TZ } from "@/lib/afpam";
import { cabeza } from "@/lib/cabeza";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/panel")({
  head: () => cabeza("Inicio", "Qué atender hoy, ventas, comisiones y prospectos de AFPAM Texcoco."),
  component: PaginaInicio,
});

type Busqueda = { vista?: "tablero" | "tabla" | undefined; vendedor?: string | undefined; filtro?: string | undefined };

/** "1 prospecto" / "3 prospectos". */
function plural(n: number, uno: string, varios: string) {
  return `${n} ${n === 1 ? uno : varios}`;
}

function saludo() {
  const hora = Number(new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "numeric", hour12: false }).format(new Date())) % 24;
  return hora < 12 ? "Buenos días" : hora < 19 ? "Buenas tardes" : "Buenas noches";
}

function hoyLargo() {
  const t = new Intl.DateTimeFormat("es-MX", { timeZone: TZ, weekday: "long", day: "numeric", month: "long" }).format(new Date());
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function Tarjeta({
  titulo,
  valor,
  detalle,
  icono: Icono,
  tono,
  a,
}: {
  titulo: string;
  valor: string;
  detalle?: string | undefined;
  icono: LucideIcon;
  tono: "ambar" | "petroleo" | "verde" | "carbon";
  a: { to: string; search?: Busqueda };
}) {
  const colores = {
    ambar: "bg-primary/15 text-primary",
    petroleo: "bg-petroleo/15 text-petroleo",
    verde: "bg-etapa-cliente/15 text-etapa-cliente",
    carbon: "bg-carbon/10 text-carbon",
  }[tono];
  return (
    <Link
      to={a.to}
      search={a.search ?? {}}
      className="panel group flex items-start gap-4 p-5 transition-all hover:-translate-y-0.5 hover:shadow-md"
    >
      <div className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-lg", colores)}>
        <Icono className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{titulo}</div>
        <div className="mt-1 font-display text-2xl font-bold text-card-foreground">{valor}</div>
        {detalle ? <div className="mt-0.5 truncate text-xs text-muted-foreground">{detalle}</div> : null}
      </div>
      <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
    </Link>
  );
}

type Pendiente = {
  clave: string;
  icono: LucideIcon;
  tono: "rojo" | "naranja" | "ambar" | "gris";
  titulo: string;
  detalle: string;
  a: { to: string; search?: Busqueda };
  boton: string;
};

function QueAtender({ pendientes }: { pendientes: Pendiente[] }) {
  const tonos = {
    rojo: "bg-destructive/10 text-destructive",
    naranja: "bg-etapa-negociando/15 text-etapa-negociando",
    ambar: "bg-primary/15 text-foreground",
    gris: "bg-muted text-muted-foreground",
  };
  return (
    <section className="panel">
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <div>
          <h2 className="text-base text-card-foreground">Qué atender hoy</h2>
          <p className="text-xs text-muted-foreground">Lo más urgente primero.</p>
        </div>
        {pendientes.length ? (
          <span className="rounded-full bg-destructive px-2.5 py-0.5 text-xs font-bold text-white">{pendientes.length}</span>
        ) : null}
      </div>
      {pendientes.length === 0 ? (
        <Vacio icono={PartyPopper} titulo="Todo al día" texto="No hay prospectos sin tomar ni seguimientos atrasados. Buen trabajo." />
      ) : (
        <ul className="divide-y divide-border">
          {pendientes.map((p) => (
            <li key={p.clave} className="flex items-center gap-4 px-5 py-3.5">
              <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-full", tonos[p.tono])}>
                <p.icono className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-foreground">{p.titulo}</div>
                <div className="truncate text-xs text-muted-foreground">{p.detalle}</div>
              </div>
              <Link to={p.a.to} search={p.a.search ?? {}}>
                <Button size="sm" variant="outline">
                  {p.boton}
                </Button>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function PrimerosPasos() {
  const estadoFn = useServerFn(estadoIntegracion);
  const estado = useQuery({ queryKey: ["estado-integracion"], queryFn: () => estadoFn(), staleTime: 300000 });
  const usuarios = useQuery({ queryKey: claves.usuarios, queryFn: traerUsuarios });
  const whatsapp = estado.data
    ? ["WHATSAPP_TOKEN", "WHATSAPP_PHONE_NUMBER_ID", "WHATSAPP_WABA_ID", "WHATSAPP_VERIFY_TOKEN", "META_APP_SECRET"].every(
        (k) => (estado.data as Record<string, boolean>)[k],
      )
    : false;
  const vendedores = (usuarios.data ?? []).filter((u) => u.activo && u.es_vendedor && u.whatsapp).length;
  const pasos: Array<{ hecho: boolean; texto: string; to: string }> = [
    { hecho: true, texto: "Panel y bot configurados", to: "/configuracion" },
    { hecho: vendedores > 0, texto: vendedores > 0 ? `${plural(vendedores, "vendedor", "vendedores")} con WhatsApp registrado` : "Registrar el WhatsApp de los vendedores", to: "/usuarios" },
    { hecho: whatsapp, texto: "Conectar WhatsApp (secretos de Meta)", to: "/configuracion" },
    { hecho: false, texto: "Crear las plantillas para vendedores en Meta", to: "/configuracion" },
  ];
  const hechos = pasos.filter((p) => p.hecho).length;
  return (
    <section className="panel p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-base text-card-foreground">Primeros pasos</h2>
        <span className="text-xs font-semibold text-muted-foreground">
          {hechos} de {pasos.length}
        </span>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${(hechos / pasos.length) * 100}%` }} />
      </div>
      <ul className="mt-4 space-y-2.5">
        {pasos.map((p) => (
          <li key={p.texto}>
            <Link to={p.to} className="flex items-start gap-2.5 text-sm hover:underline">
              {p.hecho ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-etapa-cliente" />
              ) : (
                <Circle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              )}
              <span className={p.hecho ? "text-muted-foreground line-through" : "text-foreground"}>{p.texto}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Seccion({ titulo, accion, children }: { titulo: string; accion?: ReactNode; children: ReactNode }) {
  return (
    <section className="panel">
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <h2 className="text-base text-card-foreground">{titulo}</h2>
        {accion}
      </div>
      {children}
    </section>
  );
}

function PaginaInicio() {
  const solicitudes = useQuery({ queryKey: claves.solicitudes, queryFn: traerSolicitudes });
  const servicios = useQuery({ queryKey: claves.servicios, queryFn: traerServicios });
  const usuarios = useQuery({ queryKey: claves.usuarios, queryFn: traerUsuarios });
  const campanas = useQuery({ queryKey: claves.campanas, queryFn: traerCampanas });
  const yo = useQuery({ queryKey: ["yo"], queryFn: async () => (await supabase.auth.getUser()).data.user?.id ?? null });

  const lista = solicitudes.data ?? [];
  const semana = inicioSemana();
  const { inicio: inicioMes } = mesActualRango();
  const abiertas = lista.filter((s) => [1, 2, 3].includes(s.etapa));
  const nombreServicio = (c: number | null) => servicios.data?.find((sv) => sv.codigo === c)?.nombre ?? "Sin servicio";
  const miNombre = usuarios.data?.find((u) => u.id === yo.data)?.nombre;

  const sinTomar = lista
    .filter((s) => !s.vendedor_id && s.etapa === 1)
    .sort((a, b) => a.creada_en.localeCompare(b.creada_en));
  const incompletas = abiertas.filter((s) => !s.completa);
  const urgentes = abiertas.filter((s) => s.urgente);
  const estancadas = lista.filter((s) => [2, 3].includes(s.etapa) && horasDesde(s.tomada_en ?? s.creada_en) > 72);
  const fueraZona = abiertas.filter((s) => s.fuera_de_zona && !s.vendedor_id);
  const deLaSemana = lista.filter((s) => s.creada_en >= semana);
  const ventasMes = lista.filter((s) => s.etapa === 4 && (s.resultado_en ?? s.creada_en) >= inicioMes);
  const totalVendido = ventasMes.reduce((t, s) => t + Number(s.monto_venta ?? 0), 0);
  const totalComision = ventasMes.reduce((t, s) => t + Number(s.comision ?? 0), 0);

  const pendientes: Pendiente[] = [];
  if (sinTomar.length) {
    const viejo = sinTomar[0]!;
    pendientes.push({
      clave: "sin-tomar",
      icono: Inbox,
      tono: horasDesde(viejo.creada_en) > 2 ? "rojo" : "naranja",
      titulo: plural(sinTomar.length, "prospecto sin tomar", "prospectos sin tomar"),
      detalle: `El más antiguo (${viejo.codigo}) llegó ${haceTiempo(viejo.creada_en)}.`,
      a: { to: "/solicitudes", search: { vista: "tablero", vendedor: "sin" } },
      boton: "Asignar",
    });
  }
  if (urgentes.length) {
    pendientes.push({
      clave: "urgentes",
      icono: AlertTriangle,
      tono: "rojo",
      titulo: plural(urgentes.length, "urgente abierto", "urgentes abiertos"),
      detalle: urgentes.map((s) => s.codigo).slice(0, 4).join(", "),
      a: { to: "/solicitudes", search: { vista: "tablero", filtro: "urgentes" } },
      boton: "Ver",
    });
  }
  if (estancadas.length) {
    pendientes.push({
      clave: "estancadas",
      icono: Hourglass,
      tono: "ambar",
      titulo: `${plural(estancadas.length, "cotización", "cotizaciones")} sin avance en más de 3 días`,
      detalle: "Conviene preguntar al vendedor cómo van.",
      a: { to: "/solicitudes", search: { vista: "tablero", filtro: "estancadas" } },
      boton: "Ver",
    });
  }
  if (incompletas.length) {
    pendientes.push({
      clave: "incompletas",
      icono: Clock,
      tono: "ambar",
      titulo: plural(incompletas.length, "solicitud incompleta", "solicitudes incompletas"),
      detalle: "El cliente dejó de responder antes de terminar.",
      a: { to: "/solicitudes", search: { vista: "tabla", filtro: "incompletas" } },
      boton: "Ver",
    });
  }
  if (fueraZona.length) {
    pendientes.push({
      clave: "fuera-zona",
      icono: MapPinOff,
      tono: "gris",
      titulo: `${plural(fueraZona.length, "solicitud", "solicitudes")} fuera de zona por revisar`,
      detalle: "Decida si se atienden o se descartan.",
      a: { to: "/solicitudes", search: { vista: "tabla", filtro: "fuera-zona" } },
      boton: "Ver",
    });
  }

  const porVendedor = (usuarios.data ?? [])
    .filter((u) => u.es_vendedor)
    .map((u) => {
      const suyas = ventasMes.filter((s) => s.vendedor_id === u.id);
      return {
        nombre: u.nombre || "Sin nombre",
        ventas: suyas.length,
        vendido: suyas.reduce((t, s) => t + Number(s.monto_venta ?? 0), 0),
        comision: suyas.reduce((t, s) => t + Number(s.comision ?? 0), 0),
      };
    })
    .sort((a, b) => b.vendido - a.vendido);
  const maxVendido = Math.max(1, ...porVendedor.map((v) => v.vendido));

  const datosGrafica = (servicios.data ?? [])
    .map((sv) => ({
      nombre: sv.nombre.length > 14 ? sv.nombre.slice(0, 13) + "…" : sv.nombre,
      completo: sv.nombre,
      prospectos: deLaSemana.filter((s) => s.servicio_codigo === sv.codigo).length,
    }))
    .filter((d) => d.prospectos > 0);

  const campanaActiva = (campanas.data ?? []).find((c) => c.estado === "enviando" || c.estado === "programada");

  return (
    <>
      <EncabezadoPagina titulo={`${saludo()}${miNombre ? `, ${miNombre}` : ""}`} descripcion={hoyLargo()} />
      <div className="space-y-6 p-8">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Tarjeta
            titulo="Sin tomar"
            valor={String(sinTomar.length)}
            detalle={sinTomar[0] ? `El más antiguo, ${haceTiempo(sinTomar[0].creada_en)}` : "Ninguno pendiente"}
            icono={Inbox}
            tono="ambar"
            a={{ to: "/solicitudes", search: { vista: "tablero", vendedor: "sin" } }}
          />
          <Tarjeta
            titulo="Prospectos de la semana"
            valor={String(deLaSemana.length)}
            detalle={`${abiertas.length} abiertos en total`}
            icono={CalendarDays}
            tono="petroleo"
            a={{ to: "/solicitudes", search: { vista: "tabla", filtro: "semana" } }}
          />
          <Tarjeta
            titulo="Ventas del mes"
            valor={moneda(totalVendido)}
            detalle={plural(ventasMes.length, "venta cerrada", "ventas cerradas")}
            icono={Wallet}
            tono="verde"
            a={{ to: "/solicitudes", search: { vista: "tabla", filtro: "ventas-mes" } }}
          />
          <Tarjeta
            titulo="Comisiones del mes"
            valor={moneda(totalComision)}
            detalle="Ver detalle por vendedor"
            icono={BadgeDollarSign}
            tono="carbon"
            a={{ to: "/vendedores" }}
          />
        </div>

        <div className="grid gap-6 xl:grid-cols-3">
          <div className="min-w-0 space-y-6 xl:col-span-2">
            <QueAtender pendientes={pendientes} />

            <Seccion
              titulo="Prospectos sin tomar"
              accion={
                <Link to="/solicitudes" search={{ vista: "tablero", vendedor: "sin" }} className="text-sm font-semibold text-petroleo hover:underline">
                  Ver tablero
                </Link>
              }
            >
              {sinTomar.length === 0 ? (
                <Vacio icono={Inbox} titulo="No hay prospectos sin tomar" texto="Cuando un cliente termine con el bot, aparecerá aquí." />
              ) : (
                <ul className="divide-y divide-border">
                  {sinTomar.slice(0, 6).map((s) => (
                    <FilaProspecto key={s.id} s={s} servicio={nombreServicio(s.servicio_codigo)} />
                  ))}
                </ul>
              )}
            </Seccion>
          </div>

          <div className="min-w-0 space-y-6">
            <PrimerosPasos />

            <Seccion titulo="Ventas por vendedor (mes)">
              <div className="space-y-4 p-5">
                {porVendedor.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Registre vendedores en la página Usuarios.</p>
                ) : (
                  porVendedor.map((v) => (
                    <div key={v.nombre}>
                      <div className="flex items-baseline justify-between text-sm">
                        <span className="font-semibold text-foreground">{v.nombre}</span>
                        <span className="font-semibold">{moneda(v.vendido)}</span>
                      </div>
                      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full bg-etapa-cliente" style={{ width: `${(v.vendido / maxVendido) * 100}%` }} />
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {plural(v.ventas, "venta", "ventas")} · comisión {moneda(v.comision)}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </Seccion>

            <Seccion titulo="Campaña activa">
              {campanaActiva ? (
                <div className="space-y-1 p-5 text-sm">
                  <div className="font-semibold">{campanaActiva.nombre}</div>
                  <div className="text-muted-foreground">
                    Enviados {campanaActiva.enviados} · Leídos {campanaActiva.leidos} · Me interesa {campanaActiva.me_interesa}
                  </div>
                </div>
              ) : (
                <p className="p-5 text-sm text-muted-foreground">No hay campañas en envío.</p>
              )}
            </Seccion>
          </div>
        </div>

        <Seccion titulo="Prospectos de la semana por servicio">
          {datosGrafica.length === 0 ? (
            <Vacio icono={ClipboardList} titulo="Sin prospectos esta semana" />
          ) : (
            <div className="h-64 p-5">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={datosGrafica}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="nombre" stroke="var(--muted-foreground)" fontSize={12} />
                  <YAxis allowDecimals={false} stroke="var(--muted-foreground)" fontSize={12} />
                  <Tooltip
                    formatter={(v) => [String(v), "Prospectos"]}
                    labelFormatter={(l) => datosGrafica.find((d) => d.nombre === l)?.completo ?? String(l)}
                  />
                  <Bar dataKey="prospectos" fill="var(--petroleo)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Seccion>
      </div>
    </>
  );
}

function FilaProspecto({ s, servicio }: { s: Solicitud; servicio: string }) {
  const horas = horasDesde(s.creada_en);
  return (
    <li>
      <Link to="/solicitud/$id" params={{ id: s.id }} className="flex items-center gap-4 px-5 py-3 transition-colors hover:bg-muted">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Folio codigo={s.codigo} className="text-sm" />
            {s.urgente ? <Marca texto="Urgente" tono="rojo" /> : null}
            {!s.completa ? <Marca texto="Incompleta" tono="ambar" /> : null}
          </div>
          <div className="truncate text-sm text-muted-foreground">
            {servicio} · {s.contactos?.municipio ?? "Sin municipio"}
          </div>
        </div>
        <span className={cn("shrink-0 text-sm font-semibold", horas > 2 ? "text-destructive" : "text-foreground")}>
          {haceTiempo(s.creada_en)}
        </span>
      </Link>
    </li>
  );
}
