import { etapaInfo } from "@/lib/afpam";
import { cn } from "@/lib/utils";

export function EtapaBadge({ etapa, className }: { etapa: number; className?: string }) {
  const info = etapaInfo(etapa);
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold",
        info.clase,
        className,
      )}
    >
      {info.nombre}
    </span>
  );
}

export function Marca({ texto, tono }: { texto: string; tono: "rojo" | "ambar" | "gris" }) {
  const clases = {
    rojo: "border-destructive/40 bg-destructive/10 text-destructive",
    ambar: "border-primary/50 bg-primary/15 text-foreground",
    gris: "border-border bg-muted text-muted-foreground",
  }[tono];
  return (
    <span
      className={cn(
        "inline-flex items-center rounded border px-1.5 py-0.5 text-[11px] font-medium",
        clases,
      )}
    >
      {texto}
    </span>
  );
}
