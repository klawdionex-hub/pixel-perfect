import { useQuery } from "@tanstack/react-query";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { etapaInfo } from "@/lib/afpam";
import { claves, traerServicios } from "@/lib/datos";
import { cn } from "@/lib/utils";

/** Explica un código como 8.7-2-0013 en palabras. */
export function useDescribirCodigo() {
  const servicios = useQuery({ queryKey: claves.servicios, queryFn: traerServicios });
  return (codigo: string | null | undefined) => {
    if (!codigo) return null;
    const m = /^(\d+)(?:\.(\d+))?-(\d)-(\d+)$/.exec(codigo);
    if (!m) return null;
    const nombre = (c: string | undefined) => servicios.data?.find((s) => String(s.codigo) === c)?.nombre;
    const servicio = nombre(m[1]) ?? (m[1] === "0" ? "Sin servicio" : `Servicio ${m[1]}`);
    const equipo = m[2] ? nombre(m[2]) : null;
    return {
      servicio: equipo ? `${servicio} de ${equipo.toLowerCase()}` : servicio,
      etapa: etapaInfo(Number(m[3])).nombre,
      folio: Number(m[4]),
    };
  };
}

/** Código de solicitud con explicación al pasar el mouse. */
export function Folio({ codigo, className }: { codigo: string | null | undefined; className?: string }) {
  const describir = useDescribirCodigo();
  const d = describir(codigo);
  const etiqueta = <span className={cn("font-mono font-semibold text-petroleo", className)}>{codigo ?? "—"}</span>;
  if (!d) return etiqueta;
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="cursor-help underline decoration-dotted decoration-petroleo/40 underline-offset-4">{etiqueta}</span>
        </TooltipTrigger>
        <TooltipContent className="max-w-64">
          <div className="text-xs">
            <div className="font-semibold">{d.servicio}</div>
            <div>
              Etapa: {d.etapa} · Folio {d.folio}
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
