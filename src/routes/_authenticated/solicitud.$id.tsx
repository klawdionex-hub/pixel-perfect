import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { EncabezadoPagina } from "@/components/AppLayout";
import { EtapaBadge, Marca } from "@/components/EtapaBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import {
  claves,
  traerArchivos,
  traerMensajes,
  traerServicios,
  traerSolicitud,
  traerUsuarios,
} from "@/lib/datos";
import {
  ETAPAS,
  ETIQUETAS_DATOS,
  enlaceWhatsApp,
  fechaHora,
  moneda,
  telefonoBonito,
} from "@/lib/afpam";

export const Route = createFileRoute("/_authenticated/solicitud/$id")({
  head: () => ({
    meta: [
      { title: "Detalle de solicitud — AFPAM Bot" },
      {
        name: "description",
        content: "Datos recolectados, conversación con el bot y seguimiento de la solicitud.",
      },
      { property: "og:title", content: "Detalle de solicitud — AFPAM Bot" },
      {
        property: "og:description",
        content: "Datos recolectados, conversación con el bot y seguimiento de la solicitud.",
      },
    ],
  }),
  component: PaginaSolicitud,
});

function PaginaSolicitud() {
  const { id } = Route.useParams();
  const queryClient = useQueryClient();
  const solicitud = useQuery({ queryKey: ["solicitud", id], queryFn: () => traerSolicitud(id) });
  const servicios = useQuery({ queryKey: claves.servicios, queryFn: traerServicios });
  const usuarios = useQuery({ queryKey: claves.usuarios, queryFn: traerUsuarios });
  const contactoId = solicitud.data?.contacto_id ?? "";
  const mensajes = useQuery({
    queryKey: ["mensajes", id, contactoId],
    queryFn: () => traerMensajes(id, contactoId),
    enabled: Boolean(contactoId),
  });
  const archivos = useQuery({ queryKey: ["archivos", id], queryFn: () => traerArchivos(id) });

  const [etapa, setEtapa] = useState("1");
  const [vendedor, setVendedor] = useState("");
  const [monto, setMonto] = useState("");
  const [notas, setNotas] = useState("");

  useEffect(() => {
    const s = solicitud.data;
    if (!s) return;
    setEtapa(String(s.etapa));
    setVendedor(s.vendedor_id ?? "");
    setMonto(s.monto_venta ? String(s.monto_venta) : "");
    setNotas(s.notas ?? "");
  }, [solicitud.data]);

  const guardar = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("solicitudes")
        .update({
          etapa: Number(etapa),
          vendedor_id: vendedor || null,
          monto_venta: monto === "" ? null : Number(monto),
          notas: notas || null,
        })
        .eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Solicitud actualizada");
      queryClient.invalidateQueries({ queryKey: ["solicitud", id] });
      queryClient.invalidateQueries({ queryKey: claves.solicitudes });
      queryClient.invalidateQueries({ queryKey: claves.contactos });
    },
    onError: () => toast.error("No se pudo guardar la solicitud"),
  });

  const s = solicitud.data;
  if (solicitud.isLoading) {
    return (
      <>
        <EncabezadoPagina titulo="Solicitud" />
        <p className="p-8 text-sm text-muted-foreground">Cargando información.</p>
      </>
    );
  }
  if (!s) {
    return (
      <>
        <EncabezadoPagina titulo="Solicitud" />
        <p className="p-8 text-sm text-muted-foreground">No se encontró la solicitud.</p>
      </>
    );
  }

  const servicio = servicios.data?.find((sv) => sv.codigo === s.servicio_codigo);
  const equipo = servicios.data?.find((sv) => sv.codigo === s.equipo_codigo);
  const datos = Object.entries(s.datos ?? {});

  return (
    <>
      <EncabezadoPagina
        titulo={s.codigo ?? "Solicitud"}
        descripcion={`${servicio?.nombre ?? ""}${equipo ? ` · Equipo: ${equipo.nombre}` : ""}`}
        acciones={
          <div className="flex items-center gap-2">
            <Link to="/solicitudes">
              <Button variant="outline">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Volver
              </Button>
            </Link>
            <a href={enlaceWhatsApp(s.contactos?.telefono)} target="_blank" rel="noreferrer">
              <Button>
                Abrir en WhatsApp
                <ExternalLink className="ml-2 h-4 w-4" />
              </Button>
            </a>
          </div>
        }
      />
      <div className="grid gap-6 p-8 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <div className="panel p-5">
            <h2 className="text-base text-card-foreground">Datos del contacto</h2>
            <dl className="mt-3 grid gap-3 sm:grid-cols-2">
              <Dato etiqueta="Nombre" valor={s.contactos?.nombre ?? "Sin nombre"} />
              <Dato etiqueta="Nombre mostrado" valor={s.contactos?.nombre_mostrado ?? "—"} />
              <Dato etiqueta="Teléfono" valor={telefonoBonito(s.contactos?.telefono)} />
              <Dato etiqueta="Municipio" valor={s.contactos?.municipio ?? "—"} />
              <Dato etiqueta="Origen" valor={s.contactos?.origen ?? "—"} />
              <Dato etiqueta="Nivel de interés" valor={s.contactos?.nivel_interes ?? "—"} />
            </dl>
          </div>

          <div className="panel p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-base text-card-foreground">Información recolectada</h2>
              <div className="flex flex-wrap gap-1">
                {s.urgente ? <Marca texto="Urgente" tono="rojo" /> : null}
                {s.fuera_de_horario ? <Marca texto="Fuera de horario" tono="gris" /> : null}
                {s.fuera_de_zona ? <Marca texto="Fuera de zona" tono="rojo" /> : null}
                {!s.completa ? <Marca texto="Incompleta" tono="ambar" /> : null}
              </div>
            </div>
            <dl className="mt-3 grid gap-3 sm:grid-cols-2">
              {datos.length === 0 ? (
                <p className="text-sm text-muted-foreground">El bot aún no recolectó datos.</p>
              ) : (
                datos.map(([clave, valor]) => (
                  <Dato
                    key={clave}
                    etiqueta={ETIQUETAS_DATOS[clave] ?? clave}
                    valor={typeof valor === "boolean" ? (valor ? "Sí" : "No") : String(valor)}
                  />
                ))
              )}
            </dl>
          </div>

          <div className="panel p-5">
            <h2 className="text-base text-card-foreground">Fotografías y videos</h2>
            {(archivos.data ?? []).length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">
                No hay archivos asociados a esta solicitud.
              </p>
            ) : (
              <ul className="mt-3 space-y-2 text-sm">
                {(archivos.data ?? []).map((a) => (
                  <li key={a.id}>
                    <a
                      href={a.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-petroleo hover:underline"
                    >
                      {a.tipo ?? "Archivo"} · {fechaHora(a.creado_en)}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="panel p-5">
            <h2 className="text-base text-card-foreground">Conversación con el bot</h2>
            {(mensajes.data ?? []).length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">
                Aún no hay mensajes registrados. Se llenará al conectar WhatsApp.
              </p>
            ) : (
              <ul className="mt-4 space-y-3">
                {(mensajes.data ?? []).map((m) => (
                  <li
                    key={m.id}
                    className={
                      m.direccion === "saliente"
                        ? "ml-auto max-w-[80%] rounded-lg bg-primary/15 px-3 py-2"
                        : "max-w-[80%] rounded-lg bg-muted px-3 py-2"
                    }
                  >
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">
                      {m.autor} · {fechaHora(m.creado_en)}
                    </div>
                    <div className="mt-1 text-sm">{m.contenido}</div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="space-y-6">
          <div className="panel p-5">
            <h2 className="text-base text-card-foreground">Seguimiento</h2>
            <div className="mt-4 space-y-4">
              <div className="space-y-1.5">
                <Label>Etapa</Label>
                <select
                  value={etapa}
                  onChange={(e) => setEtapa(e.target.value)}
                  className="h-9 w-full rounded-md border border-input bg-card px-3 text-sm"
                >
                  {ETAPAS.map((e) => (
                    <option key={e.valor} value={e.valor}>
                      {e.nombre}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground">
                  El código se recalcula automáticamente al cambiar la etapa.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label>Vendedor</Label>
                <select
                  value={vendedor}
                  onChange={(e) => setVendedor(e.target.value)}
                  className="h-9 w-full rounded-md border border-input bg-card px-3 text-sm"
                >
                  <option value="">Sin tomar</option>
                  {(usuarios.data ?? []).map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.nombre}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="monto">Monto de venta (MXN)</Label>
                <Input
                  id="monto"
                  type="number"
                  min="0"
                  step="0.01"
                  value={monto}
                  onChange={(e) => setMonto(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Comisión calculada al {servicio?.porcentaje_comision ?? 3}%:{" "}
                  {moneda(s.comision)}
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="notas">Notas</Label>
                <Textarea
                  id="notas"
                  rows={4}
                  value={notas}
                  onChange={(e) => setNotas(e.target.value)}
                />
              </div>
              <Button
                className="w-full"
                onClick={() => guardar.mutate()}
                disabled={guardar.isPending}
              >
                {guardar.isPending ? "Guardando" : "Guardar cambios"}
              </Button>
            </div>
          </div>

          <div className="panel p-5">
            <h2 className="text-base text-card-foreground">Estado actual</h2>
            <div className="mt-3 space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Etapa</span>
                <EtapaBadge etapa={s.etapa} />
              </div>
              <Fila etiqueta="Creada" valor={fechaHora(s.creada_en)} />
              <Fila etiqueta="Tomada" valor={fechaHora(s.tomada_en)} />
              <Fila etiqueta="Resultado" valor={fechaHora(s.resultado_en)} />
              <Fila etiqueta="Archivada" valor={fechaHora(s.archivada_en)} />
              <Fila etiqueta="Monto" valor={moneda(s.monto_venta)} />
              <Fila etiqueta="Comisión" valor={moneda(s.comision)} />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{etiqueta}</dt>
      <dd className="mt-0.5 text-sm text-foreground">{valor}</dd>
    </div>
  );
}

function Fila({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{etiqueta}</span>
      <span className="font-medium">{valor}</span>
    </div>
  );
}
