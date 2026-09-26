import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { EncabezadoPagina } from "@/components/AppLayout";
import { EtapaBadge, Marca } from "@/components/EtapaBadge";
import {
  claves,
  traerCampanas,
  traerServicios,
  traerSolicitudes,
  traerUsuarios,
} from "@/lib/datos";
import { antiguedad, inicioSemana, mesActualRango, moneda, telefonoBonito } from "@/lib/afpam";

export const Route = createFileRoute("/_authenticated/panel")({
  head: () => ({
    meta: [
      { title: "Inicio — AFPAM Bot" },
      {
        name: "description",
        content: "Resumen de prospectos sin tomar, ventas, comisiones y campañas de AFPAM Texcoco.",
      },
      { property: "og:title", content: "Inicio — AFPAM Bot" },
      {
        property: "og:description",
        content: "Resumen de prospectos sin tomar, ventas, comisiones y campañas de AFPAM Texcoco.",
      },
    ],
  }),
  component: PaginaInicio,
});

function Tarjeta({
  titulo,
  valor,
  detalle,
}: {
  titulo: string;
  valor: string;
  detalle?: string;
}) {
  return (
    <div className="panel p-5">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {titulo}
      </div>
      <div className="mt-2 font-display text-2xl font-bold text-card-foreground">{valor}</div>
      {detalle ? <div className="mt-1 text-xs text-muted-foreground">{detalle}</div> : null}
    </div>
  );
}

function PaginaInicio() {
  const solicitudes = useQuery({ queryKey: claves.solicitudes, queryFn: traerSolicitudes });
  const servicios = useQuery({ queryKey: claves.servicios, queryFn: traerServicios });
  const usuarios = useQuery({ queryKey: claves.usuarios, queryFn: traerUsuarios });
  const campanas = useQuery({ queryKey: claves.campanas, queryFn: traerCampanas });

  const lista = solicitudes.data ?? [];
  const semana = inicioSemana();
  const { inicio: inicioMes } = mesActualRango();

  const sinTomar = lista
    .filter((s) => !s.vendedor_id && s.etapa === 1)
    .sort((a, b) => a.creada_en.localeCompare(b.creada_en));
  const deLaSemana = lista.filter((s) => s.creada_en >= semana);
  const ventasMes = lista.filter((s) => s.etapa === 4 && (s.resultado_en ?? s.creada_en) >= inicioMes);
  const totalVendido = ventasMes.reduce((t, s) => t + Number(s.monto_venta ?? 0), 0);
  const totalComision = ventasMes.reduce((t, s) => t + Number(s.comision ?? 0), 0);

  const porVendedor = (usuarios.data ?? []).map((u) => {
    const suyas = ventasMes.filter((s) => s.vendedor_id === u.id);
    return {
      nombre: u.nombre || "Sin nombre",
      vendido: suyas.reduce((t, s) => t + Number(s.monto_venta ?? 0), 0),
      comision: suyas.reduce((t, s) => t + Number(s.comision ?? 0), 0),
    };
  });

  const datosGrafica = (servicios.data ?? []).map((sv) => ({
    servicio: `${sv.codigo}`,
    nombre: sv.nombre,
    prospectos: deLaSemana.filter((s) => s.servicio_codigo === sv.codigo).length,
  }));

  const campanaActiva = (campanas.data ?? []).find(
    (c) => c.estado === "enviando" || c.estado === "programada",
  );

  return (
    <>
      <EncabezadoPagina
        titulo="Inicio"
        descripcion="Panorama de la operación de AFPAM Texcoco, Puertas Automáticas."
      />
      <div className="space-y-6 p-8">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Tarjeta
            titulo="Prospectos sin tomar"
            valor={String(sinTomar.length)}
            detalle={
              sinTomar[0] ? `El más antiguo lleva ${antiguedad(sinTomar[0].creada_en)}` : undefined
            }
          />
          <Tarjeta titulo="Prospectos de la semana" valor={String(deLaSemana.length)} />
          <Tarjeta
            titulo="Ventas del mes"
            valor={moneda(totalVendido)}
            detalle={`${ventasMes.length} solicitudes cerradas`}
          />
          <Tarjeta titulo="Comisiones del mes" valor={moneda(totalComision)} />
        </div>

        <div className="grid gap-6 xl:grid-cols-3">
          <div className="panel xl:col-span-2">
            <div className="border-b border-border px-5 py-4">
              <h2 className="text-base text-card-foreground">Prospectos nuevos sin tomar</h2>
            </div>
            <div className="divide-y divide-border">
              {sinTomar.length === 0 ? (
                <p className="px-5 py-6 text-sm text-muted-foreground">
                  No hay prospectos pendientes de tomar.
                </p>
              ) : (
                sinTomar.slice(0, 8).map((s) => (
                  <Link
                    key={s.id}
                    to="/solicitud/$id"
                    params={{ id: s.id }}
                    className="flex items-center justify-between gap-4 px-5 py-3 transition-colors hover:bg-muted"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm font-semibold text-petroleo">
                          {s.codigo}
                        </span>
                        {s.urgente ? <Marca texto="Urgente" tono="rojo" /> : null}
                        {!s.completa ? <Marca texto="Incompleta" tono="ambar" /> : null}
                      </div>
                      <div className="truncate text-sm text-muted-foreground">
                        {s.contactos?.nombre ?? "Sin nombre"} ·{" "}
                        {telefonoBonito(s.contactos?.telefono)} ·{" "}
                        {s.contactos?.municipio ?? "Sin municipio"}
                      </div>
                    </div>
                    <span className="shrink-0 text-sm font-medium text-foreground">
                      {antiguedad(s.creada_en)}
                    </span>
                  </Link>
                ))
              )}
            </div>
          </div>

          <div className="space-y-6">
            <div className="panel p-5">
              <h2 className="text-base text-card-foreground">Ventas por vendedor este mes</h2>
              <ul className="mt-3 space-y-2">
                {porVendedor.length === 0 ? (
                  <li className="text-sm text-muted-foreground">Aún no hay usuarios dados de alta.</li>
                ) : (
                  porVendedor.map((v) => (
                    <li key={v.nombre} className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">{v.nombre}</span>
                      <span className="font-medium">
                        {moneda(v.vendido)} · {moneda(v.comision)}
                      </span>
                    </li>
                  ))
                )}
              </ul>
            </div>

            <div className="panel p-5">
              <h2 className="text-base text-card-foreground">Campaña activa</h2>
              {campanaActiva ? (
                <div className="mt-3 space-y-2 text-sm">
                  <div className="font-medium">{campanaActiva.nombre}</div>
                  <div className="text-muted-foreground">
                    Enviados {campanaActiva.enviados} · Leídos {campanaActiva.leidos} · Me interesa{" "}
                    {campanaActiva.me_interesa}
                  </div>
                </div>
              ) : (
                <p className="mt-3 text-sm text-muted-foreground">
                  No hay campañas programadas o en envío.
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="panel p-5">
          <h2 className="text-base text-card-foreground">Prospectos por servicio de la semana</h2>
          <div className="mt-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={datosGrafica}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="servicio" stroke="var(--muted-foreground)" fontSize={12} />
                <YAxis allowDecimals={false} stroke="var(--muted-foreground)" fontSize={12} />
                <Tooltip
                  formatter={(v) => [String(v), "Prospectos"]}
                  labelFormatter={(l) =>
                    datosGrafica.find((d) => d.servicio === l)?.nombre ?? String(l)
                  }
                />
                <Bar dataKey="prospectos" fill="var(--petroleo)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            El número corresponde al código de servicio del catálogo.
          </p>
        </div>

        <div className="panel">
          <div className="border-b border-border px-5 py-4">
            <h2 className="text-base text-card-foreground">Últimas solicitudes de la semana</h2>
          </div>
          <div className="divide-y divide-border">
            {deLaSemana.slice(0, 6).map((s) => (
              <div key={s.id} className="flex items-center justify-between px-5 py-3 text-sm">
                <span className="font-mono font-semibold text-petroleo">{s.codigo}</span>
                <span className="text-muted-foreground">{s.contactos?.nombre}</span>
                <EtapaBadge etapa={s.etapa} />
              </div>
            ))}
            {deLaSemana.length === 0 ? (
              <p className="px-5 py-6 text-sm text-muted-foreground">
                Sin solicitudes en la semana en curso.
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </>
  );
}
