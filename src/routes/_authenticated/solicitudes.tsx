import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Archive, Columns3, Inbox, Search, Table2, X } from "lucide-react";
import { EncabezadoPagina } from "@/components/AppLayout";
import { DialogoPerdido, DialogoVenta, useMoverEtapa } from "@/components/AccionesSolicitud";
import { EtapaBadge, Marca } from "@/components/EtapaBadge";
import { Folio } from "@/components/Folio";
import { Vacio } from "@/components/Vacio";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { claves, traerServicios, traerSolicitudes, traerUsuarios, type Solicitud } from "@/lib/datos";
import { coincideComodin, etapaInfo, haceTiempo, horasDesde, inicioSemana, mesActualRango, moneda, telefonoBonito } from "@/lib/afpam";
import { cabeza } from "@/lib/cabeza";
import { cn } from "@/lib/utils";

const FILTROS: Record<string, string> = {
  incompletas: "Incompletas",
  urgentes: "Urgentes abiertas",
  estancadas: "Sin avance en más de 3 días",
  semana: "Llegaron esta semana",
  "ventas-mes": "Vendidas este mes",
  "fuera-zona": "Fuera de zona sin asignar",
};

type Busqueda = { vista?: "tablero" | "tabla" | undefined; vendedor?: string | undefined; filtro?: string | undefined };

export const Route = createFileRoute("/_authenticated/solicitudes")({
  head: () => cabeza("Solicitudes", "Tablero de ventas por etapa y listado de solicitudes."),
  validateSearch: (s: Record<string, unknown>): Busqueda => ({
    vista: s["vista"] === "tabla" ? "tabla" : s["vista"] === "tablero" ? "tablero" : undefined,
    vendedor: typeof s["vendedor"] === "string" ? s["vendedor"] : undefined,
    filtro: typeof s["filtro"] === "string" && FILTROS[s["filtro"]] ? s["filtro"] : undefined,
  }),
  component: PaginaSolicitudes,
});

const COLUMNAS = [1, 2, 3, 4, 0];

function PaginaSolicitudes() {
  const busquedaUrl = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const solicitudes = useQuery({ queryKey: claves.solicitudes, queryFn: traerSolicitudes });
  const servicios = useQuery({ queryKey: claves.servicios, queryFn: traerServicios });
  const usuarios = useQuery({ queryKey: claves.usuarios, queryFn: traerUsuarios });

  const vista = busquedaUrl.vista ?? "tablero";
  const vendedor = busquedaUrl.vendedor ?? "";
  const filtro = busquedaUrl.filtro;
  const [servicio, setServicio] = useState("");
  const [texto, setTexto] = useState("");
  const [archivados, setArchivados] = useState(false);
  const [venta, setVenta] = useState<Solicitud | null>(null);
  const [perdido, setPerdido] = useState<Solicitud | null>(null);
  const mover = useMoverEtapa(setVenta, setPerdido);

  const cambiar = (c: Partial<Busqueda>) => navigate({ search: (prev) => ({ ...prev, ...c }), replace: true });

  const semana = inicioSemana();
  const { inicio: inicioMes } = mesActualRango();
  const nombreServicio = (codigo: number | null) => servicios.data?.find((sv) => sv.codigo === codigo)?.nombre ?? "Sin servicio";
  const nombreVendedor = (id: string | null) => (id ? usuarios.data?.find((u) => u.id === id)?.nombre ?? "Asignado" : null);

  const filtradas = (solicitudes.data ?? []).filter((s) => {
    if (servicio && s.servicio_codigo !== Number(servicio)) return false;
    if (vendedor === "sin" && s.vendedor_id) return false;
    if (vendedor && vendedor !== "sin" && s.vendedor_id !== vendedor) return false;
    if (filtro === "incompletas" && (s.completa || ![1, 2, 3].includes(s.etapa))) return false;
    if (filtro === "urgentes" && (!s.urgente || ![1, 2, 3].includes(s.etapa))) return false;
    if (filtro === "estancadas" && !([2, 3].includes(s.etapa) && horasDesde(s.tomada_en ?? s.creada_en) > 72)) return false;
    if (filtro === "semana" && s.creada_en < semana) return false;
    if (filtro === "ventas-mes" && !(s.etapa === 4 && (s.resultado_en ?? s.creada_en) >= inicioMes)) return false;
    if (filtro === "fuera-zona" && !(s.fuera_de_zona && !s.vendedor_id && [1, 2, 3].includes(s.etapa))) return false;
    if (texto.trim()) {
      const t = texto.trim().toLowerCase();
      const coincide =
        coincideComodin(t.includes("*") ? t : `*${t}*`, s.codigo ?? "") ||
        (s.contactos?.nombre ?? "").toLowerCase().includes(t) ||
        (s.contactos?.municipio ?? "").toLowerCase().includes(t) ||
        (t.replace(/\D/g, "").length >= 3 && (s.contactos?.telefono ?? "").includes(t.replace(/\D/g, "")));
      if (!coincide) return false;
    }
    return true;
  });

  const columnas = archivados ? [...COLUMNAS, 5] : COLUMNAS;

  return (
    <>
      <EncabezadoPagina
        titulo="Solicitudes"
        descripcion={`${filtradas.length} ${filtradas.length === 1 ? "solicitud" : "solicitudes"} con los filtros actuales.`}
        acciones={
          <div className="flex rounded-lg border border-border bg-muted p-0.5">
            <BotonVista activo={vista === "tablero"} onClick={() => cambiar({ vista: "tablero" })} icono={<Columns3 className="h-4 w-4" />}>
              Tablero
            </BotonVista>
            <BotonVista activo={vista === "tabla"} onClick={() => cambiar({ vista: "tabla" })} icono={<Table2 className="h-4 w-4" />}>
              Tabla
            </BotonVista>
          </div>
        }
      />
      <div className="space-y-4 p-8">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-64 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Buscar por folio, nombre, municipio o teléfono"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
            />
          </div>
          <select
            value={servicio}
            onChange={(e) => setServicio(e.target.value)}
            className="h-9 rounded-md border border-input bg-card px-3 text-sm"
          >
            <option value="">Todos los servicios</option>
            {(servicios.data ?? []).map((sv) => (
              <option key={sv.codigo} value={sv.codigo}>
                {sv.nombre}
              </option>
            ))}
          </select>
          <select
            value={vendedor}
            onChange={(e) => cambiar({ vendedor: e.target.value || undefined })}
            className="h-9 rounded-md border border-input bg-card px-3 text-sm"
          >
            <option value="">Todos los vendedores</option>
            <option value="sin">Sin tomar</option>
            {(usuarios.data ?? []).map((u) => (
              <option key={u.id} value={u.id}>
                {u.nombre}
              </option>
            ))}
          </select>
          {vista === "tablero" ? (
            <Button variant={archivados ? "default" : "outline"} size="sm" onClick={() => setArchivados(!archivados)}>
              <Archive className="mr-1.5 h-4 w-4" />
              {archivados ? "Ocultar archivados" : "Ver archivados"}
            </Button>
          ) : null}
        </div>

        {filtro || vendedor === "sin" ? (
          <div className="flex flex-wrap gap-2">
            {filtro ? <Chip texto={FILTROS[filtro] ?? filtro} onQuitar={() => cambiar({ filtro: undefined })} /> : null}
            {vendedor === "sin" ? <Chip texto="Sin tomar" onQuitar={() => cambiar({ vendedor: undefined })} /> : null}
          </div>
        ) : null}

        {vista === "tablero" ? (
          <>
            <p className="text-xs text-muted-foreground">Arrastre una tarjeta a otra columna para cambiar su etapa. Haga clic en ella para ver el detalle.</p>
            <div className="flex gap-4 overflow-x-auto pb-4">
              {columnas.map((etapa) => (
                <Columna
                  key={etapa}
                  etapa={etapa}
                  tarjetas={filtradas.filter((s) => s.etapa === etapa)}
                  nombreServicio={nombreServicio}
                  nombreVendedor={nombreVendedor}
                  onSoltar={(id) => {
                    const s = filtradas.find((x) => x.id === id);
                    if (s) mover(s, etapa);
                  }}
                />
              ))}
            </div>
          </>
        ) : (
          <TablaSolicitudes filas={filtradas} nombreServicio={nombreServicio} nombreVendedor={nombreVendedor} />
        )}
      </div>
      <DialogoVenta solicitud={venta} abierto={!!venta} onCerrar={() => setVenta(null)} />
      <DialogoPerdido solicitud={perdido} abierto={!!perdido} onCerrar={() => setPerdido(null)} />
    </>
  );
}

function BotonVista({ activo, onClick, icono, children }: { activo: boolean; onClick: () => void; icono: React.ReactNode; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-semibold transition-colors",
        activo ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {icono}
      {children}
    </button>
  );
}

function Chip({ texto, onQuitar }: { texto: string; onQuitar: () => void }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-petroleo/30 bg-petroleo/10 py-1 pl-3 pr-1.5 text-xs font-semibold text-petroleo">
      {texto}
      <button onClick={onQuitar} className="rounded-full p-0.5 hover:bg-petroleo/20" aria-label={`Quitar filtro ${texto}`}>
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}

const BORDE_ETAPA: Record<number, string> = {
  1: "border-t-etapa-nuevo",
  2: "border-t-etapa-cotizado",
  3: "border-t-etapa-negociando",
  4: "border-t-etapa-cliente",
  0: "border-t-etapa-perdido",
  5: "border-t-etapa-archivado",
};

function Columna({
  etapa,
  tarjetas,
  nombreServicio,
  nombreVendedor,
  onSoltar,
}: {
  etapa: number;
  tarjetas: Solicitud[];
  nombreServicio: (c: number | null) => string;
  nombreVendedor: (id: string | null) => string | null;
  onSoltar: (id: string) => void;
}) {
  const [encima, setEncima] = useState(false);
  const info = etapaInfo(etapa);
  const total = tarjetas.reduce((t, s) => t + Number(s.monto_venta ?? 0), 0);
  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setEncima(true);
      }}
      onDragLeave={() => setEncima(false)}
      onDrop={(e) => {
        e.preventDefault();
        setEncima(false);
        const id = e.dataTransfer.getData("text/plain");
        if (id) onSoltar(id);
      }}
      className={cn(
        "flex w-72 shrink-0 flex-col rounded-lg border-t-4 bg-muted/70 transition-colors",
        BORDE_ETAPA[etapa],
        encima && "bg-primary/10 ring-2 ring-primary",
      )}
    >
      <div className="flex items-center justify-between px-3 py-2.5">
        <div className="flex items-center gap-2">
          <span className="font-display text-sm font-bold text-foreground">{info.nombre}</span>
          <span className="rounded-full bg-card px-2 py-0.5 text-xs font-bold text-muted-foreground">{tarjetas.length}</span>
        </div>
        {etapa === 4 && total > 0 ? <span className="text-xs font-semibold text-etapa-cliente">{moneda(total)}</span> : null}
      </div>
      <div className="flex max-h-[calc(100vh-300px)] min-h-32 flex-col gap-2 overflow-y-auto px-2 pb-3">
        {tarjetas.length === 0 ? (
          <div className="rounded-md border-2 border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
            Sin solicitudes
          </div>
        ) : (
          tarjetas.map((s) => (
            <TarjetaSolicitud
              key={s.id}
              s={s}
              servicio={s.equipo_codigo ? `${nombreServicio(s.servicio_codigo)} · ${nombreServicio(s.equipo_codigo)}` : nombreServicio(s.servicio_codigo)}
              vendedor={nombreVendedor(s.vendedor_id)}
            />
          ))
        )}
      </div>
    </div>
  );
}

function TarjetaSolicitud({ s, servicio, vendedor }: { s: Solicitud; servicio: string; vendedor: string | null }) {
  const navigate = useNavigate();
  const atrasada = !s.vendedor_id && s.etapa === 1 && horasDesde(s.creada_en) > 2;
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", s.id);
        e.dataTransfer.effectAllowed = "move";
      }}
      onClick={() => navigate({ to: "/solicitud/$id", params: { id: s.id } })}
      className="cursor-grab rounded-md border border-border bg-card p-3 shadow-sm transition-shadow hover:shadow-md active:cursor-grabbing"
    >
      <div className="flex items-start justify-between gap-2">
        <Folio codigo={s.codigo} className="text-sm" />
        <span className={cn("text-[11px]", atrasada ? "font-semibold text-destructive" : "text-muted-foreground")}>
          {haceTiempo(s.creada_en)}
        </span>
      </div>
      <div className="mt-1 text-sm font-semibold leading-snug text-foreground">{servicio}</div>
      <div className="truncate text-xs text-muted-foreground">
        {s.contactos?.nombre ?? "Sin nombre"} · {s.contactos?.municipio ?? "Sin municipio"}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1">
        {vendedor ? (
          <span className="rounded-full bg-petroleo/10 px-2 py-0.5 text-[11px] font-semibold text-petroleo">{vendedor}</span>
        ) : (
          <span className="rounded-full bg-primary/20 px-2 py-0.5 text-[11px] font-semibold text-foreground">Sin tomar</span>
        )}
        {s.urgente ? <Marca texto="Urgente" tono="rojo" /> : null}
        {!s.completa ? <Marca texto="Incompleta" tono="ambar" /> : null}
        {s.fuera_de_zona ? <Marca texto="Fuera de zona" tono="gris" /> : null}
        {s.monto_venta ? <span className="ml-auto text-xs font-bold text-etapa-cliente">{moneda(s.monto_venta)}</span> : null}
      </div>
    </div>
  );
}

function TablaSolicitudes({
  filas,
  nombreServicio,
  nombreVendedor,
}: {
  filas: Solicitud[];
  nombreServicio: (c: number | null) => string;
  nombreVendedor: (id: string | null) => string | null;
}) {
  if (filas.length === 0) {
    return (
      <div className="panel">
        <Vacio icono={Inbox} titulo="No hay solicitudes con estos filtros" texto="Pruebe quitando algún filtro o buscando otro folio." />
      </div>
    );
  }
  return (
    <div className="panel overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-carbon text-left text-xs uppercase tracking-wide text-white">
          <tr>
            <th className="px-4 py-3">Folio</th>
            <th className="px-4 py-3">Servicio</th>
            <th className="px-4 py-3">Cliente</th>
            <th className="px-4 py-3">Municipio</th>
            <th className="px-4 py-3">Etapa</th>
            <th className="px-4 py-3">Vendedor</th>
            <th className="px-4 py-3">Llegó</th>
            <th className="px-4 py-3">Monto</th>
            <th className="px-4 py-3">Marcas</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {filas.map((s) => (
            <tr key={s.id} className="transition-colors hover:bg-muted">
              <td className="px-4 py-3">
                <Link to="/solicitud/$id" params={{ id: s.id }}>
                  <Folio codigo={s.codigo} />
                </Link>
              </td>
              <td className="px-4 py-3">
                {nombreServicio(s.servicio_codigo)}
                {s.equipo_codigo ? <span className="text-muted-foreground"> · {nombreServicio(s.equipo_codigo)}</span> : null}
              </td>
              <td className="px-4 py-3">
                <div className="font-medium">{s.contactos?.nombre ?? "Sin nombre"}</div>
                <div className="text-xs text-muted-foreground">{telefonoBonito(s.contactos?.telefono)}</div>
              </td>
              <td className="px-4 py-3">{s.contactos?.municipio ?? "—"}</td>
              <td className="px-4 py-3">
                <EtapaBadge etapa={s.etapa} />
              </td>
              <td className="px-4 py-3">{nombreVendedor(s.vendedor_id) ?? <span className="font-semibold text-primary">Sin tomar</span>}</td>
              <td className="px-4 py-3 whitespace-nowrap">{haceTiempo(s.creada_en)}</td>
              <td className="px-4 py-3">{s.monto_venta ? moneda(s.monto_venta) : "—"}</td>
              <td className="px-4 py-3">
                <div className="flex flex-wrap gap-1">
                  {s.urgente ? <Marca texto="Urgente" tono="rojo" /> : null}
                  {s.fuera_de_horario ? <Marca texto="Fuera de horario" tono="gris" /> : null}
                  {s.fuera_de_zona ? <Marca texto="Fuera de zona" tono="rojo" /> : null}
                  {!s.completa ? <Marca texto="Incompleta" tono="ambar" /> : null}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

