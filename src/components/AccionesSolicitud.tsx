import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { etapaInfo } from "@/lib/afpam";
import { claves, traerUsuarios, type Solicitud } from "@/lib/datos";

type Cambios = {
  etapa?: number;
  vendedor_id?: string | null;
  monto_venta?: number | null;
  notas?: string | null;
};

/** Recuerda la última solicitud mostrada para que el título no se vacíe mientras el diálogo se cierra. */
function useUltima<T>(valor: T | null): T | null {
  const [ultima, setUltima] = useState(valor);
  useEffect(() => {
    if (valor) setUltima(valor);
  }, [valor]);
  return valor ?? ultima;
}

/** Guarda cambios de una solicitud y refresca las listas. */
export function useActualizarSolicitud() {
  const qc = useQueryClient();
  return async (id: string, cambios: Cambios, mensaje?: string) => {
    // Cambio inmediato en pantalla; se confirma al recargar.
    qc.setQueryData<Solicitud[]>(claves.solicitudes, (lista) =>
      lista?.map((s) => (s.id === id ? { ...s, ...cambios } : s)),
    );
    const extra = cambios.vendedor_id ? { tomada_en: new Date().toISOString() } : {};
    const { error } = await supabase.from("solicitudes").update({ ...cambios, ...extra }).eq("id", id);
    if (error) {
      toast.error(`No se pudo guardar: ${error.message}`);
    } else if (mensaje) {
      toast.success(mensaje);
    }
    qc.invalidateQueries({ queryKey: claves.solicitudes });
    qc.invalidateQueries({ queryKey: ["solicitud", id] });
    qc.invalidateQueries({ queryKey: claves.contactos });
    return !error;
  };
}

/** Vendedores activos para asignar. */
function useVendedores() {
  const q = useQuery({ queryKey: claves.usuarios, queryFn: traerUsuarios });
  return (q.data ?? []).filter((u) => u.activo && u.es_vendedor);
}

function SelectorVendedor({ valor, onCambiar, id }: { valor: string; onCambiar: (v: string) => void; id: string }) {
  const vendedores = useVendedores();
  return (
    <select
      id={id}
      value={valor}
      onChange={(e) => onCambiar(e.target.value)}
      className="h-9 w-full rounded-md border border-input bg-card px-3 text-sm"
    >
      <option value="">Elija un vendedor…</option>
      {vendedores.map((u) => (
        <option key={u.id} value={u.id}>
          {u.nombre}
        </option>
      ))}
    </select>
  );
}

/** Pide el vendedor antes de avanzar una solicitud que nadie ha tomado. */
export function DialogoAsignar({
  solicitud,
  etapa,
  onCerrar,
}: {
  solicitud: Pick<Solicitud, "id" | "codigo"> | null;
  /** Etapa a la que se mueve después de asignar (opcional). */
  etapa?: number | null | undefined;
  onCerrar: () => void;
}) {
  const actualizar = useActualizarSolicitud();
  const visible = useUltima(solicitud);
  const [vendedor, setVendedor] = useState("");
  const [guardando, setGuardando] = useState(false);

  async function confirmar() {
    if (!solicitud || !vendedor) {
      toast.error("Elija quién atiende esta solicitud.");
      return;
    }
    setGuardando(true);
    const cambios = etapa != null ? { vendedor_id: vendedor, etapa } : { vendedor_id: vendedor };
    const ok = await actualizar(
      solicitud.id,
      cambios,
      etapa != null ? `${solicitud.codigo} asignado y movido a ${etapaInfo(etapa).nombre}` : `${solicitud.codigo} asignado`,
    );
    setGuardando(false);
    if (ok) {
      setVendedor("");
      onCerrar();
    }
  }

  return (
    <Dialog open={!!solicitud} onOpenChange={(v) => !v && onCerrar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>¿Quién atiende {visible?.codigo}?</DialogTitle>
          <DialogDescription>
            {etapa != null
              ? `Para pasarla a ${etapaInfo(etapa).nombre} debe tener un vendedor asignado. Así la venta y la comisión quedan a su nombre.`
              : "El vendedor asignado recibe los mensajes del cliente y la comisión si se vende."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="vendedor-asignar">Vendedor</Label>
          <SelectorVendedor id="vendedor-asignar" valor={vendedor} onCambiar={setVendedor} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button disabled={guardando || !vendedor} onClick={confirmar}>
            Asignar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Pide el monto antes de marcar como vendido. */
export function DialogoVenta({
  solicitud,
  abierto,
  onCerrar,
}: {
  solicitud: Pick<Solicitud, "id" | "codigo" | "monto_venta" | "vendedor_id"> | null;
  abierto: boolean;
  onCerrar: () => void;
}) {
  const actualizar = useActualizarSolicitud();
  const visible = useUltima(solicitud);
  const [monto, setMonto] = useState("");
  const [vendedor, setVendedor] = useState("");
  const [guardando, setGuardando] = useState(false);
  const faltaVendedor = !visible?.vendedor_id;

  async function confirmar() {
    const n = Number(monto.replace(/[$,\s]/g, ""));
    if (!solicitud || !Number.isFinite(n) || n <= 0) {
      toast.error("Escriba un monto válido, por ejemplo 12500.");
      return;
    }
    if (faltaVendedor && !vendedor) {
      toast.error("Elija qué vendedor cerró la venta, para asignarle la comisión.");
      return;
    }
    setGuardando(true);
    const ok = await actualizar(
      solicitud.id,
      faltaVendedor ? { etapa: 4, monto_venta: n, vendedor_id: vendedor } : { etapa: 4, monto_venta: n },
      `Venta registrada en ${solicitud.codigo}`,
    );
    setGuardando(false);
    if (ok) {
      setMonto("");
      setVendedor("");
      onCerrar();
    }
  }

  return (
    <Dialog open={abierto} onOpenChange={(v) => !v && onCerrar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Marcar {visible?.codigo} como vendido</DialogTitle>
          <DialogDescription>La comisión se calcula automáticamente con el porcentaje del servicio.</DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="monto-venta">Monto final de la venta (MXN)</Label>
          <Input
            id="monto-venta"
            autoFocus
            inputMode="decimal"
            placeholder="12500"
            value={monto}
            onChange={(e) => setMonto(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && confirmar()}
          />
        </div>
        {faltaVendedor ? (
          <div className="space-y-1.5">
            <Label htmlFor="vendedor-venta">Vendedor que cerró la venta</Label>
            <SelectorVendedor id="vendedor-venta" valor={vendedor} onCambiar={setVendedor} />
            <p className="text-xs text-muted-foreground">Esta solicitud no tenía vendedor. La comisión queda a nombre de quien elija.</p>
          </div>
        ) : null}
        <DialogFooter>
          <Button variant="outline" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button disabled={guardando} onClick={confirmar}>
            Registrar venta
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Pide un motivo (opcional) antes de marcar como perdido. */
export function DialogoPerdido({
  solicitud,
  abierto,
  onCerrar,
}: {
  solicitud: Pick<Solicitud, "id" | "codigo" | "notas"> | null;
  abierto: boolean;
  onCerrar: () => void;
}) {
  const actualizar = useActualizarSolicitud();
  const visible = useUltima(solicitud);
  const [motivo, setMotivo] = useState("");
  const [guardando, setGuardando] = useState(false);

  async function confirmar() {
    if (!solicitud) return;
    setGuardando(true);
    const notas = motivo.trim()
      ? [solicitud.notas, `Motivo de pérdida: ${motivo.trim()}`].filter(Boolean).join("\n")
      : solicitud.notas;
    const ok = await actualizar(solicitud.id, { etapa: 0, notas }, `${solicitud.codigo} marcado como perdido`);
    setGuardando(false);
    if (ok) {
      setMotivo("");
      onCerrar();
    }
  }

  return (
    <Dialog open={abierto} onOpenChange={(v) => !v && onCerrar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Marcar {visible?.codigo} como perdido</DialogTitle>
          <DialogDescription>El motivo se guarda en las notas y ayuda a entender por qué no se cerró.</DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="motivo">Motivo (opcional)</Label>
          <Textarea id="motivo" rows={3} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button variant="destructive" disabled={guardando} onClick={confirmar}>
            Marcar como perdido
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Mueve a una etapa; si es venta o pérdida abre el diálogo correspondiente. */
export function useMoverEtapa(
  abrirVenta: (s: Solicitud) => void,
  abrirPerdido: (s: Solicitud) => void,
  abrirAsignar: (s: Solicitud, etapa: number) => void,
) {
  const actualizar = useActualizarSolicitud();
  return (s: Solicitud, etapa: number) => {
    if (s.etapa === etapa) return;
    if (etapa === 4) return abrirVenta(s);
    if (etapa === 0) return abrirPerdido(s);
    if ((etapa === 2 || etapa === 3) && !s.vendedor_id) return abrirAsignar(s, etapa);
    void actualizar(s.id, { etapa }, `${s.codigo} movido a ${etapaInfo(etapa).nombre}`);
  };
}
