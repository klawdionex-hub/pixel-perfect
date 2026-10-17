import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { FileDown, Plus } from "lucide-react";
import { useState } from "react";
import { EncabezadoPagina } from "@/components/AppLayout";
import { FormularioCotizacion } from "@/components/FormularioCotizacion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { fechaHora } from "@/lib/afpam";
import { cabeza } from "@/lib/cabeza";
import { pesos, type Partida } from "@/lib/cotizaciones/datos";
import { claves, traerUsuarios } from "@/lib/datos";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/cotizaciones")({
  head: () => cabeza("Cotizaciones", "Cotizaciones en PDF hechas desde el bot o desde el panel."),
  validateSearch: (s: Record<string, unknown>): { nueva?: boolean | undefined; solicitud?: string | undefined } => ({
    nueva: s["nueva"] === true || s["nueva"] === "true" || s["nueva"] === 1 ? true : undefined,
    solicitud: typeof s["solicitud"] === "string" ? s["solicitud"] : undefined,
  }),
  component: Pagina,
});

type Cotizacion = {
  id: string;
  folio: string;
  solicitud_id: string | null;
  vendedor_id: string | null;
  cliente_nombre: string;
  cliente_telefono: string | null;
  proyecto: string | null;
  partidas: Partida[];
  con_marca: boolean;
  iva: string | null;
  total: number;
  pdf_url: string | null;
  creada_en: string;
  solicitudes: { codigo: string | null } | null;
};

function Pagina() {
  const busquedaUrl = Route.useSearch();
  const navigate = useNavigate();
  const nueva = !!busquedaUrl.nueva || !!busquedaUrl.solicitud;
  const abrirNueva = (v: boolean) => navigate({ to: "/cotizaciones", search: v ? { nueva: true } : {} });
  const q = useQuery({
    queryKey: ["cotizaciones"],
    queryFn: async () => {
      const { data, error } = await supabase.from("cotizaciones").select("*, solicitudes(codigo)").order("creada_en", { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as Cotizacion[];
    },
    retry: false,
  });
  const usuarios = useQuery({ queryKey: claves.usuarios, queryFn: traerUsuarios });
  const [busqueda, setBusqueda] = useState("");
  const [vendedor, setVendedor] = useState("todos");
  const [abierta, setAbierta] = useState<string | null>(null);
  const nombre = (id: string | null) => usuarios.data?.find((u) => u.id === id)?.nombre ?? "—";

  const lista = (q.data ?? []).filter((c) => {
    if (vendedor !== "todos" && c.vendedor_id !== vendedor) return false;
    if (!busqueda) return true;
    const t = busqueda.toLowerCase();
    return c.folio.toLowerCase().includes(t) || c.cliente_nombre.toLowerCase().includes(t) || (c.solicitudes?.codigo ?? "").includes(busqueda);
  });
  const totalLista = lista.reduce((t, c) => t + Number(c.total), 0);
  const faltaTabla = q.error && /cotizaciones|relation|schema cache/i.test(q.error.message);
  const vendedores = (usuarios.data ?? []).filter((u) => u.es_vendedor);

  return (
    <div>
      <EncabezadoPagina
        titulo="Cotizaciones"
        descripcion='Se hacen aquí con "Nueva cotización" o desde el bot (comandos → Hacer cotización). Revise el PDF antes de enviarlo al cliente.'
        acciones={
          <div className="flex items-center gap-2">
            <Input placeholder="Buscar folio, cliente o prospecto" className="w-72" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
            {nueva ? null : (
              <Button onClick={() => abrirNueva(true)}>
                <Plus className="mr-1 h-4 w-4" /> Nueva cotización
              </Button>
            )}
          </div>
        }
      />
      <div className="space-y-4 p-8">
        {faltaTabla ? (
          <p className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm">
            Falta crear la tabla de cotizaciones. Pegue el SQL de la migración <b>20261020120000_cotizaciones</b> en Lovable → Cloud →
            Database → SQL editor.
          </p>
        ) : null}
        {nueva ? <FormularioCotizacion solicitudInicial={busquedaUrl.solicitud} alTerminar={() => abrirNueva(false)} /> : null}

        <div className="flex flex-wrap items-center gap-2">
          {[{ id: "todos", nombre: "Todos" }, ...vendedores].map((u) => (
            <button
              key={u.id}
              onClick={() => setVendedor(u.id)}
              className={cn("rounded-full border px-3 py-1 text-sm", vendedor === u.id ? "border-petroleo bg-petroleo text-white" : "border-border bg-card hover:bg-muted")}
            >
              {u.nombre}
            </button>
          ))}
          <span className="ml-auto text-sm text-muted-foreground">
            {lista.length} cotización(es) · {pesos(totalLista)} cotizado
          </span>
        </div>

        <div className="overflow-hidden rounded-md border border-border bg-card">
          <div className="hidden grid-cols-[7rem_1.5fr_1fr_8rem_7rem_6rem] gap-3 border-b border-border bg-muted/50 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground md:grid">
            <span>Folio</span>
            <span>Cliente</span>
            <span>Vendedor</span>
            <span className="text-right">Total</span>
            <span>Fecha</span>
            <span />
          </div>
          {lista.length === 0 ? <p className="p-6 text-sm text-muted-foreground">Todavía no hay cotizaciones.</p> : null}
          {lista.map((c) => (
            <div key={c.id} className="border-b border-border last:border-0">
              <button
                onClick={() => setAbierta(abierta === c.id ? null : c.id)}
                className="grid w-full grid-cols-[1fr_auto] items-center gap-3 px-4 py-3 text-left hover:bg-muted/60 md:grid-cols-[7rem_1.5fr_1fr_8rem_7rem_6rem]"
              >
                <span className="font-mono text-sm font-semibold text-petroleo">{c.folio}</span>
                <span className="min-w-0">
                  <span className="block truncate font-semibold text-card-foreground">{c.cliente_nombre}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {c.proyecto ?? "Sin proyecto"}
                    {c.con_marca ? " · con marca" : ""}
                  </span>
                </span>
                <span className="hidden text-sm md:block">{nombre(c.vendedor_id)}</span>
                <span className="hidden text-right font-semibold tabular-nums md:block">{pesos(Number(c.total))}</span>
                <span className="hidden text-xs text-muted-foreground md:block">{fechaHora(c.creada_en)}</span>
                <span className="hidden justify-end md:flex">
                  {c.pdf_url ? (
                    <a
                      href={c.pdf_url}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex items-center gap-1 text-sm font-semibold text-petroleo hover:underline"
                    >
                      <FileDown className="h-4 w-4" /> PDF
                    </a>
                  ) : null}
                </span>
              </button>
              {abierta === c.id ? (
                <div className="space-y-3 border-t border-border bg-background px-4 py-4">
                  <table className="w-full text-sm">
                    <thead className="text-left text-xs text-muted-foreground">
                      <tr>
                        <th className="pb-1 font-medium">Concepto</th>
                        <th className="pb-1 text-right font-medium">Cant.</th>
                        <th className="pb-1 text-right font-medium">P. unitario</th>
                        <th className="pb-1 text-right font-medium">Importe</th>
                      </tr>
                    </thead>
                    <tbody>
                      {c.partidas.map((p, i) => (
                        <tr key={i} className="border-t border-border">
                          <td className="py-1.5">{p.concepto}</td>
                          <td className="py-1.5 text-right">{p.cantidad}</td>
                          <td className="py-1.5 text-right">{pesos(p.precio)}</td>
                          <td className="py-1.5 text-right">{pesos(p.cantidad * p.precio)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="flex flex-wrap items-center gap-4 text-sm">
                    <span>
                      Total: <b>{pesos(Number(c.total))}</b>
                      {c.iva === "incluye" ? " (IVA incluido)" : c.iva === "mas" ? " (más IVA)" : ""}
                    </span>
                    {c.cliente_telefono ? <span className="text-muted-foreground">Tel. {c.cliente_telefono}</span> : null}
                    {c.solicitud_id ? (
                      <Link to="/solicitud/$id" params={{ id: c.solicitud_id }} className="font-semibold text-petroleo hover:underline">
                        Ver prospecto {c.solicitudes?.codigo ?? ""}
                      </Link>
                    ) : null}
                    {c.pdf_url ? (
                      <a href={c.pdf_url} target="_blank" rel="noreferrer" className="font-semibold text-petroleo hover:underline md:hidden">
                        Descargar PDF
                      </a>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
