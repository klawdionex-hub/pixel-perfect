import { useQueryClient } from "@tanstack/react-query";
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
import { claves, type Solicitud } from "@/lib/datos";

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

/** Pide el monto antes de marcar como vendido. */
export function DialogoVenta({
  solicitud,
  abierto,
  onCerrar,
}: {
  solicitud: Pick<Solicitud, "id" | "codigo" | "monto_venta"> | null;
  abierto: boolean;
  onCerrar: () => void;
}) {
  const actualizar = useActualizarSolicitud();
  const visible = useUltima(solicitud);
  const [monto, setMonto] = useState("");
  const [guardando, setGuardando] = useState(false);

  async function confirmar() {
    const n = Number(monto.replace(/[$,\s]/g, ""));
    if (!solicitud || !Number.isFinite(n) || n <= 0) {
      toast.error("Escriba un monto válido, por ejemplo 12500.");
      return;
    }
    setGuardando(true);
    const ok = await actualizar(solicitud.id, { etapa: 4, monto_venta: n }, `Venta registrada en ${solicitud.codigo}`);
    setGuardando(false);
    if (ok) {
      setMonto("");
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
export function useMoverEtapa(abrirVenta: (s: Solicitud) => void, abrirPerdido: (s: Solicitud) => void) {
  const actualizar = useActualizarSolicitud();
  return (s: Solicitud, etapa: number) => {
    if (s.etapa === etapa) return;
    if (etapa === 4) return abrirVenta(s);
    if (etapa === 0) return abrirPerdido(s);
    void actualizar(s.id, { etapa }, `${s.codigo} movido a ${etapaInfo(etapa).nombre}`);
  };
}
