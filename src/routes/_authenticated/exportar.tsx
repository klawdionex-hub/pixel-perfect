import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { EncabezadoPagina } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { traerContactos, traerSolicitudes, traerUsuarios, traerServicios } from "@/lib/datos";
import { ETAPAS } from "@/lib/afpam";
import { cabeza } from "@/lib/cabeza";

export const Route = createFileRoute("/_authenticated/exportar")({
  head: () => cabeza("Exportar", "Descarga de solicitudes y contactos en Excel."),
  component: Pagina,
});

function Pagina() {
  const [cargando, setCargando] = useState(false);

  async function exportar() {
    setCargando(true);
    try {
      const [sol, con, usu, ser] = await Promise.all([traerSolicitudes(), traerContactos(), traerUsuarios(), traerServicios()]);
      const nomUsu = new Map(usu.map((u) => [u.id, u.nombre]));
      const nomSer = new Map(ser.map((s) => [s.codigo, s.nombre]));
      const etapas = ETAPAS as unknown as Record<number, { nombre?: string } | string>;
      const nomEtapa = (n: number) => {
        const e = etapas[n];
        return typeof e === "string" ? e : (e?.nombre ?? String(n));
      };
      const libro = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(libro, XLSX.utils.json_to_sheet(sol.map((s) => ({
        Código: s.codigo, Fecha: s.creada_en, Cliente: s.contactos?.nombre_mostrado ?? "", Teléfono: s.contactos?.telefono ?? "",
        Municipio: s.contactos?.municipio ?? "", Servicio: nomSer.get(s.servicio_codigo) ?? s.servicio_codigo,
        Etapa: nomEtapa(s.etapa), Vendedor: s.vendedor_id ? nomUsu.get(s.vendedor_id) ?? "" : "",
        "Monto venta": s.monto_venta ?? "", Comisión: s.comision ?? "", Urgente: s.urgente ? "Sí" : "No",
        "Fuera de zona": s.fuera_de_zona ? "Sí" : "No", Notas: s.notas ?? "",
      }))), "Solicitudes");
      XLSX.utils.book_append_sheet(libro, XLSX.utils.json_to_sheet(con.map((c) => ({
        Teléfono: c.telefono, Nombre: c.nombre_mostrado ?? c.nombre ?? "", Municipio: c.municipio ?? "",
        "Es cliente": c.es_cliente ? "Sí" : "No", "Acepta publicidad": c.acepta_publicidad ? "Sí" : "No",
        Interés: c.nivel_interes, "Primer contacto": c.primer_contacto,
      }))), "Contactos");
      XLSX.writeFile(libro, `afpam_${new Date().toISOString().slice(0, 10)}.xlsx`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al exportar");
    } finally {
      setCargando(false);
    }
  }

  return (
    <div>
      <EncabezadoPagina titulo="Exportar" descripcion="Descargue toda la información en un archivo de Excel." />
      <div className="p-8">
        <div className="max-w-md rounded-md border border-border bg-card p-6">
          <p className="text-sm text-muted-foreground">Incluye una hoja de solicitudes y otra de contactos.</p>
          <Button className="mt-4" onClick={exportar} disabled={cargando}>{cargando ? "Generando..." : "Descargar Excel"}</Button>
        </div>
      </div>
    </div>
  );
}
