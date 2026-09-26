import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { EncabezadoPagina } from "@/components/AppLayout";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { claves, traerSolicitudes, traerUsuarios } from "@/lib/datos";
import { moneda } from "@/lib/afpam";

export const Route = createFileRoute("/_authenticated/vendedores")({
  head: () => ({
    meta: [
      { title: "Vendedores y comisiones — AFPAM Bot" },
      {
        name: "description",
        content: "Desempeño por vendedor: tomados, vendidos, cierre, monto y comisiones.",
      },
      { property: "og:title", content: "Vendedores y comisiones — AFPAM Bot" },
      {
        property: "og:description",
        content: "Desempeño por vendedor: tomados, vendidos, cierre, monto y comisiones.",
      },
    ],
  }),
  component: PaginaVendedores,
});

function PaginaVendedores() {
  const solicitudes = useQuery({ queryKey: claves.solicitudes, queryFn: traerSolicitudes });
  const usuarios = useQuery({ queryKey: claves.usuarios, queryFn: traerUsuarios });

  const ahora = new Date();
  const [mes, setMes] = useState(
    `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, "0")}`,
  );

  const enMes = (valor: string | null) => (valor ? valor.slice(0, 7) === mes : false);

  const filas = (usuarios.data ?? []).map((u) => {
    const suyas = (solicitudes.data ?? []).filter(
      (s) => s.vendedor_id === u.id && enMes(s.tomada_en),
    );
    const vendidos = suyas.filter((s) => s.etapa === 4);
    const cotizados = suyas.filter((s) => s.etapa === 2);
    const perdidos = suyas.filter((s) => s.etapa === 0);
    const totalVendido = vendidos.reduce((t, s) => t + Number(s.monto_venta ?? 0), 0);
    const comision = vendidos.reduce((t, s) => t + Number(s.comision ?? 0), 0);
    const tiempos = suyas
      .filter((s) => s.tomada_en)
      .map((s) => new Date(s.tomada_en!).getTime() - new Date(s.creada_en).getTime());
    const promedioHoras = tiempos.length
      ? tiempos.reduce((a, b) => a + b, 0) / tiempos.length / 3600000
      : null;

    return {
      id: u.id,
      nombre: u.nombre || "Sin nombre",
      tomados: suyas.length,
      cotizados: cotizados.length,
      vendidos: vendidos.length,
      perdidos: perdidos.length,
      cierre: suyas.length ? (vendidos.length / suyas.length) * 100 : 0,
      totalVendido,
      comision,
      promedioHoras,
    };
  });

  return (
    <>
      <EncabezadoPagina
        titulo="Vendedores y comisiones"
        descripcion="Resultados del mes seleccionado, con base en la fecha en que se tomó el prospecto."
        acciones={
          <div className="space-y-1.5">
            <Label htmlFor="mes">Mes</Label>
            <Input id="mes" type="month" value={mes} onChange={(e) => setMes(e.target.value)} />
          </div>
        }
      />
      <div className="p-8">
        <div className="panel overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-carbon text-left text-xs uppercase tracking-wide text-sidebar-foreground">
              <tr>
                <th className="px-4 py-3">Vendedor</th>
                <th className="px-4 py-3">Tomados</th>
                <th className="px-4 py-3">Cotizados</th>
                <th className="px-4 py-3">Vendidos</th>
                <th className="px-4 py-3">Perdidos</th>
                <th className="px-4 py-3">Cierre</th>
                <th className="px-4 py-3">Total vendido</th>
                <th className="px-4 py-3">Comisión</th>
                <th className="px-4 py-3">Tiempo en tomar</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filas.map((f) => (
                <tr key={f.id}>
                  <td className="px-4 py-3 font-medium">{f.nombre}</td>
                  <td className="px-4 py-3">{f.tomados}</td>
                  <td className="px-4 py-3">{f.cotizados}</td>
                  <td className="px-4 py-3">{f.vendidos}</td>
                  <td className="px-4 py-3">{f.perdidos}</td>
                  <td className="px-4 py-3">{f.cierre.toFixed(0)}%</td>
                  <td className="px-4 py-3">{moneda(f.totalVendido)}</td>
                  <td className="px-4 py-3">{moneda(f.comision)}</td>
                  <td className="px-4 py-3">
                    {f.promedioHoras === null ? "—" : `${f.promedioHoras.toFixed(1)} h`}
                  </td>
                </tr>
              ))}
              {filas.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-muted-foreground">
                    Aún no hay usuarios dados de alta.
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
