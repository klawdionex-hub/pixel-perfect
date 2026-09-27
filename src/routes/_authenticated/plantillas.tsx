import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { EncabezadoPagina } from "@/components/AppLayout";
import { Tabla, Celda } from "@/components/Tabla";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { claves, traerPlantillas } from "@/lib/datos";
import { cabeza } from "@/lib/cabeza";

export const Route = createFileRoute("/_authenticated/plantillas")({
  head: () => cabeza("Plantillas", "Plantillas de mensajes de WhatsApp para campañas."),
  component: Pagina,
});

function Pagina() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: claves.plantillas, queryFn: traerPlantillas });
  const [nombre, setNombre] = useState("");
  const [nombreMeta, setNombreMeta] = useState("");
  const [texto, setTexto] = useState("");
  const [botones, setBotones] = useState("Me interesa, No gracias");

  async function guardar() {
    if (!nombre || !texto) return toast.error("Capture nombre y texto.");
    const { error } = await supabase.from("plantillas").insert({
      nombre,
      nombre_meta: nombreMeta || null,
      texto,
      botones: botones.split(",").map((b) => b.trim()).filter(Boolean).slice(0, 3),
    });
    if (error) return toast.error(error.message);
    toast.success("Plantilla guardada");
    setNombre(""); setNombreMeta(""); setTexto("");
    qc.invalidateQueries({ queryKey: claves.plantillas });
  }

  async function borrar(id: string) {
    const { error } = await supabase.from("plantillas").delete().eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: claves.plantillas });
  }

  return (
    <div>
      <EncabezadoPagina titulo="Plantillas" descripcion="Mensajes aprobados por Meta para escribir a clientes fuera de la ventana de 24 horas." />
      <div className="grid gap-8 p-8 lg:grid-cols-[360px_1fr]">
        <div className="space-y-3 rounded-md border border-border bg-card p-5">
          <h2 className="text-base">Nueva plantilla</h2>
          <div><Label>Nombre interno</Label><Input value={nombre} onChange={(e) => setNombre(e.target.value)} /></div>
          <div><Label>Nombre en Meta</Label><Input value={nombreMeta} onChange={(e) => setNombreMeta(e.target.value)} placeholder="promo_mantenimiento" /></div>
          <div><Label>Texto</Label><Textarea rows={6} value={texto} onChange={(e) => setTexto(e.target.value)} /></div>
          <div><Label>Botones (máx. 3, separados por coma)</Label><Input value={botones} onChange={(e) => setBotones(e.target.value)} /></div>
          <Button onClick={guardar} className="w-full">Guardar</Button>
        </div>
        <Tabla encabezados={["Nombre", "Nombre Meta", "Texto", "Estado Meta", "Usos", ""]}>
          {(q.data ?? []).map((p) => (
            <tr key={p.id}>
              <Celda className="font-medium">{p.nombre}</Celda>
              <Celda>{p.nombre_meta ?? "—"}</Celda>
              <Celda className="max-w-md text-muted-foreground">{p.texto}</Celda>
              <Celda>{p.estado_meta}</Celda>
              <Celda>{p.veces_usada}</Celda>
              <Celda><Button variant="ghost" size="sm" onClick={() => borrar(p.id)}>Eliminar</Button></Celda>
            </tr>
          ))}
        </Tabla>
      </div>
    </div>
  );
}
