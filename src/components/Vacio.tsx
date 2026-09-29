import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

/** Mensaje amable cuando no hay datos que mostrar. */
export function Vacio({
  icono: Icono,
  titulo,
  texto,
  accion,
}: {
  icono: LucideIcon;
  titulo: string;
  texto?: string;
  accion?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-10 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
        <Icono className="h-6 w-6 text-muted-foreground" />
      </div>
      <p className="font-display text-sm font-bold text-foreground">{titulo}</p>
      {texto ? <p className="max-w-sm text-sm text-muted-foreground">{texto}</p> : null}
      {accion}
    </div>
  );
}
