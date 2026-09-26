import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { EncabezadoPagina } from "@/components/AppLayout";
import { EtapaBadge, Marca } from "@/components/EtapaBadge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { claves, traerServicios, traerSolicitudes, traerUsuarios } from "@/lib/datos";
import { ETAPAS, coincideComodin, fecha, telefonoBonito } from "@/lib/afpam";

export const Route = createFileRoute("/_authenticated/solicitudes")({
  head: () => ({
    meta: [
      { title: "Solicitudes — AFPAM Bot" },
      {
        name: "description",
        content: "Listado de solicitudes con filtros por etapa, servicio, vendedor y fechas.",
      },
      { property: "og:title", content: "Solicitudes — AFPAM Bot" },
      {
        property: "og:description",
        content: "Listado de solicitudes con filtros por etapa, servicio, vendedor y fechas.",
      },
    ],
  }),
  component: PaginaSolicitudes,
});

function PaginaSolicitudes() {
  const solicitudes = useQuery({ queryKey: claves.solicitudes, queryFn: traerSolicitudes });
  const servicios = useQuery({ queryKey: claves.servicios, queryFn: traerServicios });
  const usuarios = useQuery({ queryKey: claves.usuarios, queryFn: traerUsuarios });

  const [etapa, setEtapa] = useState("");
  const [servicio, setServicio] = useState("");
  const [vendedor, setVendedor] = useState("");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [busqueda, setBusqueda] = useState("");

  const filtradas = (solicitudes.data ?? []).filter((s) => {
    if (etapa !== "" && s.etapa !== Number(etapa)) return false;
    if (servicio !== "" && s.servicio_codigo !== Number(servicio)) return false;
    if (vendedor === "sin" && s.vendedor_id) return false;
    if (vendedor !== "" && vendedor !== "sin" && s.vendedor_id !== vendedor) return false;
    if (desde && s.creada_en < new Date(desde).toISOString()) return false;
    if (hasta && s.creada_en > new Date(hasta + "T23:59:59").toISOString()) return false;
    if (busqueda) {
      const porCodigo = coincideComodin(busqueda, s.codigo ?? "");
      const porTelefono = (s.contactos?.telefono ?? "").includes(busqueda.replace(/\D/g, ""));
      if (!porCodigo && !porTelefono) return false;
    }
    return true;
  });

  const nombreServicio = (codigo: number) =>
    servicios.data?.find((sv) => sv.codigo === codigo)?.nombre ?? String(codigo);
  const nombreVendedor = (id: string | null) =>
    id ? (usuarios.data?.find((u) => u.id === id)?.nombre ?? "Asignado") : "Sin tomar";

  return (
    <>
      <EncabezadoPagina
        titulo="Solicitudes"
        descripcion={`${filtradas.length} solicitudes con los filtros actuales.`}
      />
      <div className="space-y-4 p-8">
        <div className="panel grid gap-4 p-5 md:grid-cols-3 xl:grid-cols-6">
          <div className="space-y-1.5">
            <Label>Etapa</Label>
            <select
              value={etapa}
              onChange={(e) => setEtapa(e.target.value)}
              className="h-9 w-full rounded-md border border-input bg-card px-3 text-sm"
            >
              <option value="">Todas</option>
              {ETAPAS.map((e) => (
                <option key={e.valor} value={e.valor}>
                  {e.nombre}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>Servicio</Label>
            <select
              value={servicio}
              onChange={(e) => setServicio(e.target.value)}
              className="h-9 w-full rounded-md border border-input bg-card px-3 text-sm"
            >
              <option value="">Todos</option>
              {(servicios.data ?? []).map((sv) => (
                <option key={sv.codigo} value={sv.codigo}>
                  {sv.codigo} · {sv.nombre}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>Vendedor</Label>
            <select
              value={vendedor}
              onChange={(e) => setVendedor(e.target.value)}
              className="h-9 w-full rounded-md border border-input bg-card px-3 text-sm"
            >
              <option value="">Todos</option>
              <option value="sin">Sin tomar</option>
              {(usuarios.data ?? []).map((u) => (
                <option key={u.id} value={u.id}>
                  {u.nombre}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="desde">Desde</Label>
            <Input id="desde" type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="hasta">Hasta</Label>
            <Input id="hasta" type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="busqueda">Código o teléfono</Label>
            <Input
              id="busqueda"
              placeholder="3-2-*"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
            />
          </div>
        </div>

        <div className="panel overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-carbon text-left text-xs uppercase tracking-wide text-sidebar-foreground">
              <tr>
                <th className="px-4 py-3">Código</th>
                <th className="px-4 py-3">Nombre</th>
                <th className="px-4 py-3">Teléfono</th>
                <th className="px-4 py-3">Servicio</th>
                <th className="px-4 py-3">Municipio</th>
                <th className="px-4 py-3">Etapa</th>
                <th className="px-4 py-3">Vendedor</th>
                <th className="px-4 py-3">Fecha</th>
                <th className="px-4 py-3">Marcas</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtradas.map((s) => (
                <tr key={s.id} className="transition-colors hover:bg-muted">
                  <td className="px-4 py-3">
                    <Link
                      to="/solicitud/$id"
                      params={{ id: s.id }}
                      className="font-mono font-semibold text-petroleo hover:underline"
                    >
                      {s.codigo}
                    </Link>
                  </td>
                  <td className="px-4 py-3">{s.contactos?.nombre ?? "Sin nombre"}</td>
                  <td className="px-4 py-3">{telefonoBonito(s.contactos?.telefono)}</td>
                  <td className="px-4 py-3">
                    {nombreServicio(s.servicio_codigo)}
                    {s.equipo_codigo ? ` (${nombreServicio(s.equipo_codigo)})` : ""}
                  </td>
                  <td className="px-4 py-3">{s.contactos?.municipio ?? "—"}</td>
                  <td className="px-4 py-3">
                    <EtapaBadge etapa={s.etapa} />
                  </td>
                  <td className="px-4 py-3">{nombreVendedor(s.vendedor_id)}</td>
                  <td className="px-4 py-3">{fecha(s.creada_en)}</td>
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
              {filtradas.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-muted-foreground">
                    No hay solicitudes que coincidan con los filtros.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
