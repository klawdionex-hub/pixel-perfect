import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  ArrowLeft,
  Archive,
  CheckCircle2,
  Copy,
  Flag,
  Image as ImagenIcono,
  MessageCircle,
  UserCheck,
  XCircle,
} from "lucide-react";
import { EncabezadoPagina } from "@/components/AppLayout";
import { DialogoAsignar, DialogoPerdido, DialogoVenta, useActualizarSolicitud, useMoverEtapa } from "@/components/AccionesSolicitud";
import { EtapaBadge, Marca } from "@/components/EtapaBadge";
import { useDescribirCodigo } from "@/components/Folio";
import { Vacio } from "@/components/Vacio";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { claves, traerArchivos, traerMensajes, traerServicios, traerSolicitud, traerUsuarios, type Solicitud } from "@/lib/datos";
import { ETAPAS, ETIQUETAS_DATOS, enlaceWhatsApp, fechaHora, haceTiempo, moneda, telefonoBonito } from "@/lib/afpam";
import { cabeza } from "@/lib/cabeza";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/solicitud/$id")({
  head: () => cabeza("Detalle de solicitud", "Datos, conversación con el bot y seguimiento de la solicitud."),
  component: PaginaSolicitud,
});

const PASOS = [1, 2, 3, 4];

function PaginaSolicitud() {
  const { id } = Route.useParams();
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
  const actualizar = useActualizarSolicitud();
  const describir = useDescribirCodigo();

  const [venta, setVenta] = useState<Solicitud | null>(null);
  const [perdido, setPerdido] = useState<Solicitud | null>(null);
  const [pedirVendedor, setPedirVendedor] = useState<{ s: Solicitud; etapa: number } | null>(null);
  const mover = useMoverEtapa(setVenta, setPerdido, (s, etapa) => setPedirVendedor({ s, etapa }));
  const [notas, setNotas] = useState("");
  const [avanzado, setAvanzado] = useState(false);
  const [etapaManual, setEtapaManual] = useState("1");
  const [montoManual, setMontoManual] = useState("");

  useEffect(() => {
    const s = solicitud.data;
    if (!s) return;
    setNotas(s.notas ?? "");
    setEtapaManual(String(s.etapa));
    setMontoManual(s.monto_venta ? String(s.monto_venta) : "");
  }, [solicitud.data]);

  const s = solicitud.data;
  if (solicitud.isLoading) {
    return (
      <>
        <EncabezadoPagina titulo="Solicitud" />
        <p className="p-8 text-sm text-muted-foreground">Cargando información…</p>
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
  const vendedor = usuarios.data?.find((u) => u.id === s.vendedor_id);
  const datos = Object.entries(s.datos ?? {}).filter(([, v]) => v !== null && v !== "");
  const d = describir(s.codigo);
  const refrescar = () => solicitud.refetch();

  async function asignar(vendedorId: string) {
    await actualizar(s!.id, { vendedor_id: vendedorId || null }, vendedorId ? "Vendedor asignado" : "Se quitó el vendedor");
    refrescar();
  }

  const copiarTelefono = () =>
    navigator.clipboard.writeText(s.contactos?.telefono ?? "").then(() => toast.success("Teléfono copiado"));

  return (
    <>
      <EncabezadoPagina
        titulo={s.codigo ?? "Solicitud"}
        descripcion={`${d?.servicio ?? servicio?.nombre ?? "Sin servicio"} · ${s.contactos?.municipio ?? "Sin municipio"} · llegó ${haceTiempo(s.creada_en)}`}
        acciones={
          <div className="flex items-center gap-2">
            <Link to="/solicitudes">
              <Button variant="outline">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Volver
              </Button>
            </Link>
            <a href={enlaceWhatsApp(s.contactos?.telefono)} target="_blank" rel="noreferrer">
              <Button className="bg-[#25D366] text-white hover:bg-[#1ebe5b]">
                <MessageCircle className="mr-2 h-4 w-4" />
                Abrir WhatsApp del cliente
              </Button>
            </a>
          </div>
        }
      />

      <div className="space-y-6 p-8">
        {/* Barra de etapa y acciones */}
        <section className="panel p-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-1 items-center gap-1">
              {PASOS.map((etapa, i) => {
                const hecho = s.etapa !== 0 && s.etapa !== 5 && s.etapa >= etapa;
                const actual = s.etapa === etapa;
                return (
                  <div key={etapa} className="flex flex-1 items-center gap-1">
                    <button
                      onClick={() => mover(s, etapa)}
                      disabled={actual}
                      className={cn(
                        "flex-1 rounded-md px-3 py-2 text-center text-sm font-semibold transition-colors",
                        actual
                          ? "bg-primary text-primary-foreground"
                          : hecho
                            ? "bg-primary/20 text-foreground hover:bg-primary/30"
                            : "bg-muted text-muted-foreground hover:bg-muted/70 hover:text-foreground",
                      )}
                      title={`Mover a ${ETAPAS.find((e) => e.valor === etapa)?.nombre}`}
                    >
                      {ETAPAS.find((e) => e.valor === etapa)?.nombre}
                    </button>
                    {i < PASOS.length - 1 ? <span className="text-muted-foreground">›</span> : null}
                  </div>
                );
              })}
            </div>
            {s.etapa === 0 || s.etapa === 5 ? <EtapaBadge etapa={s.etapa} className="text-sm" /> : null}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-border pt-4">
            <div className="flex items-center gap-2">
              <UserCheck className="h-4 w-4 text-muted-foreground" />
              <select
                value={s.vendedor_id ?? ""}
                onChange={(e) => asignar(e.target.value)}
                className="h-9 rounded-md border border-input bg-card px-3 text-sm font-medium"
              >
                <option value="">Sin vendedor asignado</option>
                {(usuarios.data ?? []).map((u) => (
                  <option key={u.id} value={u.id}>
                    Asignado a {u.nombre}
                  </option>
                ))}
              </select>
            </div>
            <div className="ml-auto flex flex-wrap gap-2">
              <Button className="bg-etapa-cliente text-white hover:bg-etapa-cliente/90" onClick={() => setVenta(s)}>
                <CheckCircle2 className="mr-2 h-4 w-4" />
                {s.etapa === 4 ? "Corregir monto" : "Marcar vendido"}
              </Button>
              {s.etapa !== 0 ? (
                <Button variant="outline" className="border-destructive/40 text-destructive hover:bg-destructive/10" onClick={() => setPerdido(s)}>
                  <XCircle className="mr-2 h-4 w-4" />
                  Marcar perdido
                </Button>
              ) : null}
            </div>
          </div>
        </section>

        <div className="grid gap-6 xl:grid-cols-3">
          <div className="space-y-6 xl:col-span-2">
            <div className="grid gap-6 md:grid-cols-2">
              <section className="panel p-5">
                <h2 className="text-base text-card-foreground">Cliente</h2>
                <div className="mt-3 font-display text-lg font-bold">{s.contactos?.nombre ?? "Sin nombre"}</div>
                <div className="mt-1 flex items-center gap-2 text-sm">
                  <span>{telefonoBonito(s.contactos?.telefono)}</span>
                  <button onClick={copiarTelefono} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground" title="Copiar teléfono">
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                </div>
                <dl className="mt-3 space-y-1.5 text-sm">
                  <Fila etiqueta="Municipio" valor={s.contactos?.municipio ?? "—"} />
                  <Fila etiqueta="Origen" valor={s.contactos?.origen ?? "—"} />
                  <Fila etiqueta="Nivel de interés" valor={s.contactos?.nivel_interes ?? "—"} />
                </dl>
              </section>

              <section className="panel p-5">
                <div className="flex items-start justify-between gap-2">
                  <h2 className="text-base text-card-foreground">Lo que pidió</h2>
                  <div className="flex flex-wrap justify-end gap-1">
                    {s.urgente ? <Marca texto="Urgente" tono="rojo" /> : null}
                    {s.fuera_de_horario ? <Marca texto="Fuera de horario" tono="gris" /> : null}
                    {s.fuera_de_zona ? <Marca texto="Fuera de zona" tono="rojo" /> : null}
                    {!s.completa ? <Marca texto="Incompleta" tono="ambar" /> : null}
                  </div>
                </div>
                <div className="mt-3 font-semibold text-petroleo">
                  {servicio?.nombre ?? "Sin servicio"}
                  {equipo ? ` · ${equipo.nombre}` : ""}
                </div>
                {datos.length === 0 ? (
                  <p className="mt-2 text-sm text-muted-foreground">El bot no alcanzó a recolectar más datos.</p>
                ) : (
                  <dl className="mt-2 space-y-1.5 text-sm">
                    {datos.map(([clave, valor]) => (
                      <Fila key={clave} etiqueta={ETIQUETAS_DATOS[clave] ?? clave} valor={typeof valor === "boolean" ? (valor ? "Sí" : "No") : String(valor)} />
                    ))}
                  </dl>
                )}
              </section>
            </div>

            <section className="panel p-5">
              <h2 className="text-base text-card-foreground">Fotos y videos</h2>
              {(archivos.data ?? []).length === 0 ? (
                <Vacio icono={ImagenIcono} titulo="Sin archivos" texto="Si el cliente envía fotos del portón, aparecerán aquí." />
              ) : (
                <div className="mt-3 grid grid-cols-3 gap-3 md:grid-cols-4">
                  {(archivos.data ?? []).map((a) => {
                    const esImagen = a.tipo === "image" || /\.(jpe?g|png|webp)$/i.test(a.url);
                    return (
                      <a key={a.id} href={a.url} target="_blank" rel="noreferrer" className="group block overflow-hidden rounded-md border border-border">
                        {esImagen ? (
                          <img src={a.url} alt="Foto enviada por el cliente" className="aspect-square w-full object-cover transition-transform group-hover:scale-105" />
                        ) : (
                          <div className="flex aspect-square items-center justify-center bg-muted text-xs text-muted-foreground">{a.tipo ?? "Archivo"}</div>
                        )}
                      </a>
                    );
                  })}
                </div>
              )}
            </section>

            <section className="panel overflow-hidden">
              <div className="flex items-center justify-between border-b border-border px-5 py-4">
                <h2 className="text-base text-card-foreground">Conversación con el bot</h2>
                <span className="text-xs text-muted-foreground">{(mensajes.data ?? []).length} mensajes</span>
              </div>
              {(mensajes.data ?? []).length === 0 ? (
                <Vacio icono={MessageCircle} titulo="Sin mensajes registrados" />
              ) : (
                <div className="max-h-[520px] space-y-2 overflow-y-auto bg-[#efeae2] p-4">
                  {(mensajes.data ?? []).map((m) => {
                    const saliente = m.direccion === "saliente";
                    return (
                      <div key={m.id} className={cn("flex", saliente ? "justify-end" : "justify-start")}>
                        <div
                          className={cn(
                            "max-w-[75%] rounded-lg px-3 py-2 text-sm shadow-sm",
                            saliente ? "rounded-tr-none bg-[#d9fdd3] text-[#111b21]" : "rounded-tl-none bg-white text-[#111b21]",
                          )}
                        >
                          {m.media_url ? (
                            <a href={m.media_url} target="_blank" rel="noreferrer" className="mb-1 block text-xs font-semibold text-petroleo underline">
                              Ver archivo
                            </a>
                          ) : null}
                          <p className="whitespace-pre-wrap">{m.contenido ?? `[${m.tipo}]`}</p>
                          <div className="mt-1 text-right text-[10px] text-[#667781]">
                            {saliente ? (m.autor === "bot" ? "Bot · " : `${m.autor} · `) : ""}
                            {fechaHora(m.creado_en)}
                            {saliente && m.estado ? ` · ${m.estado}` : ""}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </div>

          <div className="space-y-6">
            <section className="panel p-5">
              <h2 className="text-base text-card-foreground">Línea de tiempo</h2>
              <ol className="relative mt-4 space-y-5 border-l-2 border-border pl-5">
                <Evento icono={Flag} titulo="Llegó la solicitud" fecha={s.creada_en} activo />
                <Evento
                  icono={UserCheck}
                  titulo={s.tomada_en ? `Tomada por ${vendedor?.nombre ?? "un vendedor"}` : "Sin tomar todavía"}
                  fecha={s.tomada_en}
                  activo={!!s.tomada_en}
                />
                {s.etapa === 4 ? (
                  <Evento icono={CheckCircle2} titulo={`Vendida por ${moneda(s.monto_venta)}`} fecha={s.resultado_en} activo tono="verde" />
                ) : s.etapa === 0 ? (
                  <Evento icono={XCircle} titulo="Se perdió" fecha={s.resultado_en} activo tono="rojo" />
                ) : s.etapa === 5 ? (
                  <Evento icono={Archive} titulo="Archivada (nadie la tomó)" fecha={s.archivada_en} activo />
                ) : (
                  <Evento icono={CheckCircle2} titulo={`En proceso: ${ETAPAS.find((e) => e.valor === s.etapa)?.nombre}`} fecha={null} activo={false} />
                )}
              </ol>
            </section>

            {s.etapa === 4 ? (
              <section className="panel border-etapa-cliente/40 bg-etapa-cliente/5 p-5">
                <h2 className="text-base text-card-foreground">Venta</h2>
                <div className="mt-2 font-display text-2xl font-bold text-etapa-cliente">{moneda(s.monto_venta)}</div>
                <div className="text-sm text-muted-foreground">
                  Comisión {moneda(s.comision)} ({servicio?.porcentaje_comision ?? 3}%) para {vendedor?.nombre ?? "—"}
                </div>
              </section>
            ) : null}

            <section className="panel p-5">
              <h2 className="text-base text-card-foreground">Notas</h2>
              <Textarea className="mt-3" rows={5} value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Acuerdos con el cliente, fecha de visita, etc." />
              <Button
                className="mt-3 w-full"
                variant="outline"
                disabled={notas === (s.notas ?? "")}
                onClick={async () => {
                  await actualizar(s.id, { notas: notas || null }, "Notas guardadas");
                  refrescar();
                }}
              >
                Guardar notas
              </Button>
            </section>

            <section className="panel p-5">
              <button onClick={() => setAvanzado(!avanzado)} className="flex w-full items-center justify-between text-sm font-semibold text-muted-foreground hover:text-foreground">
                Corrección manual
                <span>{avanzado ? "−" : "+"}</span>
              </button>
              {avanzado ? (
                <div className="mt-4 space-y-3">
                  <div className="space-y-1.5">
                    <Label>Etapa</Label>
                    <select value={etapaManual} onChange={(e) => setEtapaManual(e.target.value)} className="h-9 w-full rounded-md border border-input bg-card px-3 text-sm">
                      {ETAPAS.map((e) => (
                        <option key={e.valor} value={e.valor}>
                          {e.nombre}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="monto-manual">Monto (MXN)</Label>
                    <Input id="monto-manual" type="number" min="0" step="0.01" value={montoManual} onChange={(e) => setMontoManual(e.target.value)} />
                  </div>
                  <Button
                    className="w-full"
                    variant="outline"
                    onClick={async () => {
                      await actualizar(s.id, { etapa: Number(etapaManual), monto_venta: montoManual === "" ? null : Number(montoManual) }, "Cambios guardados");
                      refrescar();
                    }}
                  >
                    Guardar corrección
                  </Button>
                  <p className="text-xs text-muted-foreground">El código se recalcula solo al cambiar la etapa.</p>
                </div>
              ) : null}
            </section>
          </div>
        </div>
      </div>

      <DialogoVenta
        solicitud={venta}
        abierto={!!venta}
        onCerrar={() => {
          setVenta(null);
          refrescar();
        }}
      />
      <DialogoAsignar
        solicitud={pedirVendedor?.s ?? null}
        etapa={pedirVendedor?.etapa}
        onCerrar={() => {
          setPedirVendedor(null);
          refrescar();
        }}
      />
      <DialogoPerdido
        solicitud={perdido}
        abierto={!!perdido}
        onCerrar={() => {
          setPerdido(null);
          refrescar();
        }}
      />
    </>
  );
}

function Evento({
  icono: Icono,
  titulo,
  fecha,
  activo,
  tono,
}: {
  icono: typeof Flag;
  titulo: string;
  fecha: string | null;
  activo: boolean;
  tono?: "verde" | "rojo";
}) {
  return (
    <li className="relative">
      <span
        className={cn(
          "absolute -left-[31px] flex h-6 w-6 items-center justify-center rounded-full border-2 border-card",
          !activo ? "bg-muted text-muted-foreground" : tono === "verde" ? "bg-etapa-cliente text-white" : tono === "rojo" ? "bg-destructive text-white" : "bg-primary text-primary-foreground",
        )}
      >
        <Icono className="h-3 w-3" />
      </span>
      <div className={cn("text-sm font-semibold", activo ? "text-foreground" : "text-muted-foreground")}>{titulo}</div>
      {fecha ? (
        <div className="text-xs text-muted-foreground">
          {fechaHora(fecha)} · {haceTiempo(fecha)}
        </div>
      ) : null}
    </li>
  );
}

function Fila({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="text-muted-foreground">{etiqueta}</dt>
      <dd className="text-right font-medium text-foreground">{valor}</dd>
    </div>
  );
}

