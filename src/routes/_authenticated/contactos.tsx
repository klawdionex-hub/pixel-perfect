import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { EncabezadoPagina } from "@/components/AppLayout";
import { EtapaBadge } from "@/components/EtapaBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { claves, traerContactos, traerSolicitudes } from "@/lib/datos";
import { fechaHora, telefonoBonito } from "@/lib/afpam";

export const Route = createFileRoute("/_authenticated/contactos")({
  head: () => ({
    meta: [
      { title: "Contactos — AFPAM Bot" },
      {
        name: "description",
        content: "Directorio de contactos con historial de solicitudes y nivel de interés.",
      },
      { property: "og:title", content: "Contactos — AFPAM Bot" },
      {
        property: "og:description",
        content: "Directorio de contactos con historial de solicitudes y nivel de interés.",
      },
    ],
  }),
  component: PaginaContactos,
});

function PaginaContactos() {
  const queryClient = useQueryClient();
  const contactos = useQuery({ queryKey: claves.contactos, queryFn: traerContactos });
  const solicitudes = useQuery({ queryKey: claves.solicitudes, queryFn: traerSolicitudes });
  const [busqueda, setBusqueda] = useState("");

  const publicidad = useMutation({
    mutationFn: async ({ id, alta }: { id: string; alta: boolean }) => {
      const { error } = await supabase
        .from("contactos")
        .update({
          acepta_publicidad: alta,
          fecha_baja_publicidad: alta ? null : new Date().toISOString(),
        })
        .eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Preferencia de publicidad actualizada");
      queryClient.invalidateQueries({ queryKey: claves.contactos });
    },
    onError: () => toast.error("No se pudo actualizar la preferencia"),
  });

  const lista = (contactos.data ?? []).filter((c) => {
    if (!busqueda) return true;
    const t = busqueda.toLowerCase();
    return (
      (c.nombre ?? "").toLowerCase().includes(t) ||
      (c.municipio ?? "").toLowerCase().includes(t) ||
      c.telefono.includes(busqueda.replace(/\D/g, ""))
    );
  });

  return (
    <>
      <EncabezadoPagina
        titulo="Contactos"
        descripcion={`${lista.length} contactos registrados.`}
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
        {lista.map((c) => {
          const suyas = (solicitudes.data ?? []).filter((s) => s.contacto_id === c.id);
          return (
            <div key={c.id} className="panel p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base text-card-foreground">
                      {c.nombre ?? "Sin nombre"}
                    </h2>
                    {c.es_cliente ? (
                      <span className="rounded-full bg-etapa-cliente px-2 py-0.5 text-xs font-semibold text-white">
                        Cliente
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {telefonoBonito(c.telefono)} · {c.municipio ?? "Sin municipio"} ·{" "}
                    {c.en_estado_de_mexico ? "Estado de México" : "Fuera de cobertura"}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Nombre mostrado: {c.nombre_mostrado ?? "—"} · Interés: {c.nivel_interes} ·
                    Origen: {c.origen ?? "—"} · Último mensaje: {fechaHora(c.ultimo_mensaje)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">
                    {c.acepta_publicidad
                      ? "Acepta publicidad"
                      : `Baja de publicidad el ${fechaHora(c.fecha_baja_publicidad)}`}
                  </p>
                  <Button
                    variant="outline"
                    className="mt-2"
                    onClick={() => publicidad.mutate({ id: c.id, alta: !c.acepta_publicidad })}
                  >
                    {c.acepta_publicidad ? "Dar de baja de publicidad" : "Dar de alta en publicidad"}
                  </Button>
                </div>
              </div>

              <div className="mt-4 border-t border-border pt-3">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Historial de solicitudes
                </h3>
                <ul className="mt-2 space-y-1.5">
                  {suyas.length === 0 ? (
                    <li className="text-sm text-muted-foreground">Sin solicitudes.</li>
                  ) : (
                    suyas.map((s) => (
                      <li key={s.id} className="flex items-center gap-3 text-sm">
                        <Link
                          to="/solicitud/$id"
                          params={{ id: s.id }}
                          className="font-mono font-semibold text-petroleo hover:underline"
                        >
                          {s.codigo}
                        </Link>
                        <EtapaBadge etapa={s.etapa} />
                        <span className="text-muted-foreground">{fechaHora(s.creada_en)}</span>
                      </li>
                    ))
                  )}
                </ul>
              </div>
            </div>
          );
        })}
        {lista.length === 0 ? (
          <p className="panel p-6 text-sm text-muted-foreground">No hay contactos que coincidan.</p>
        ) : null}
      </div>
    </>
  );
}
