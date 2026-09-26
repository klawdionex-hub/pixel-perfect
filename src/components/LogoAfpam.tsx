import { cn } from "@/lib/utils";

/**
 * Espacio reservado para el logo de AFPAM. Cuando se suba el archivo del logo,
 * basta con reemplazar el contenido interno por la imagen.
 */
export function LogoAfpam({
  className,
  variante = "oscuro",
}: {
  className?: string;
  variante?: "oscuro" | "claro";
}) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <div
        className={cn(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-md font-display text-sm font-extrabold",
          variante === "oscuro"
            ? "bg-primary text-primary-foreground"
            : "bg-carbon text-primary",
        )}
      >
        AF
      </div>
      <div className="leading-tight">
        <div
          className={cn(
            "font-display text-base font-extrabold tracking-tight",
            variante === "oscuro" ? "text-sidebar-foreground" : "text-foreground",
          )}
        >
          AFPAM Bot
        </div>
        <div className="text-[11px] text-muted-foreground">Puertas Automáticas</div>
      </div>
    </div>
  );
}
