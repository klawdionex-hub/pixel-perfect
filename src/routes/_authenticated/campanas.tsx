import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { EncabezadoPagina } from "@/components/AppLayout";
import { Tabla, Celda } from "@/components/Tabla";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { claves, traerCampanas, traerPlantillas } from "@/lib/datos";
import { fecha } from "@/lib/afpam";
import { cabeza } from "@/lib/cabeza";

export const Route = createFileRoute("/_authenticated/campanas")({
  head: () => cabeza("Campañas", "Campañas de WhatsApp: programación y resultados."),
  component: Pagina,
});

const ESTADOS = ["borrador", "activa", "pausada", "terminada"];

function Pagina() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: claves.campanas, queryFn: traerCampanas });
  const pl = useQuery({ queryKey: claves.plantillas, queryFn: traerPlantillas });
  const [nombre, setNombre] = useState("");
  const [plantilla, setPlantilla] = useState("");
  const [inicio, setInicio] = useState("");
  const [dias, setDias] = useState(5);
  const [max, setMax] = useState(50);

  async function crear() {
    if (!nombre) { toast.error("Capture el nombre."); return; }
    const { error } = await supabase.from("campanas").insert({
      nombre, plantilla_id: plantilla || null, fecha_inicio: inicio || null, dias_reparto: dias, max_por_dia: max,
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Campaña creada");
    setNombre("");
    qc.invalidateQueries({ queryKey: claves.campanas });
  }

  async function cambiarEstado(id: string, estado: string) {
    const { error } = await supabase.from("campanas").update({ estado }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: claves.campanas });
  }

  const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "—");

  return (
    <div>
      <EncabezadoPagina titulo="Campañas" descripcion="Envíos programados a contactos que aceptan publicidad." />
      <div className="space-y-8 p-8">
        <div className="grid gap-3 rounded-md border border-border bg-card p-5 md:grid-cols-6 md:items-end">
          <div className="md:col-span-2"><Label>Nombre</Label><Input value={nombre} onChange={(e) => setNombre(e.target.value)} /></div>
          <div>
            <Label>Plantilla</Label>
            <select className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm" value={plantilla} onChange={(e) => setPlantilla(e.target.value)}>
              <option value="">Sin plantilla</option>
              {(pl.data ?? []).map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
          </div>
          <div><Label>Inicio</Label><Input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label>Días</Label><Input type="number" value={dias} onChange={(e) => setDias(+e.target.value)} /></div>
            <div><Label>Máx/día</Label><Input type="number" value={max} onChange={(e) => setMax(+e.target.value)} /></div>
          </div>
          <Button onClick={crear}>Crear campaña</Button>
        </div>
        <Tabla encabezados={["Campaña", "Plantilla", "Inicio", "Enviados", "Entregados", "Leídos", "Me interesa", "Bajas", "Estado"]}>
          {(q.data ?? []).map((c) => (
            <tr key={c.id}>
              <Celda className="font-medium">{c.nombre}</Celda>
              <Celda>{c.plantillas?.nombre ?? "—"}</Celda>
              <Celda>{c.fecha_inicio ? fecha(c.fecha_inicio) : "—"}</Celda>
              <Celda>{c.enviados}</Celda>
              <Celda>{c.entregados} ({pct(c.entregados, c.enviados)})</Celda>
              <Celda>{c.leidos} ({pct(c.leidos, c.enviados)})</Celda>
              <Celda>{c.me_interesa}</Celda>
              <Celda>{c.bajas}</Celda>
              <Celda>
                <select className="h-8 rounded-md border border-input bg-background px-2 text-sm" value={c.estado} onChange={(e) => cambiarEstado(c.id, e.target.value)}>
                  {ESTADOS.map((e) => <option key={e} value={e}>{e}</option>)}
                </select>
              </Celda>
            </tr>
          ))}
        </Tabla>
      </div>
    </div>
  );
}
