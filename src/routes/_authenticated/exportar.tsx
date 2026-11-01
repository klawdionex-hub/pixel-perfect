import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { EncabezadoPagina } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { traerContactos, traerSolicitudes, traerUsuarios, traerServicios } from "@/lib/datos";
import { ETAPAS } from "@/lib/afpam";
import { cabeza } from "@/lib/cabeza";
import { respaldoCompleto } from "@/lib/respaldo.functions";

export const Route = createFileRoute("/_authenticated/exportar")({
  head: () => cabeza("Exportar", "Descarga de solicitudes y contactos en Excel."),
  component: Pagina,
});

function Pagina() {
  const [cargando, setCargando] = useState(false);
  const [respaldando, setRespaldando] = useState(false);
  const respaldar = useServerFn(respaldoCompleto);

  async function descargarRespaldo() {
    setRespaldando(true);
    try {
      const r = await respaldar();
      const blob = new Blob([JSON.stringify(r)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `afpam_respaldo_completo_${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
      const filas = Object.values(r.cuantos).reduce((n, x) => n + x, 0);
      toast.success(`Respaldo descargado: ${filas} registros, ${r.archivos.length} archivos y ${r.usuarios.length} usuarios.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo hacer el respaldo");
    } finally {
      setRespaldando(false);
    }
  }

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
        <div className="mt-6 max-w-md rounded-md border border-border bg-card p-6">
          <h2 className="text-base">Respaldo completo</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Todo lo del programa en un solo archivo, para poder pasarlo a otro servidor: clientes, conversaciones, prospectos, cotizaciones,
            catálogo, manuales, configuración del bot y la lista de fotos y PDF. Las contraseñas no se incluyen. Guárdelo en un lugar seguro:
            trae los datos de todos los clientes. Solo para administradores.
          </p>
          <Button className="mt-4" variant="outline" onClick={descargarRespaldo} disabled={respaldando}>
            {respaldando ? "Preparando respaldo..." : "Descargar respaldo completo"}
          </Button>
        </div>
      </div>
    </div>
  );
}
