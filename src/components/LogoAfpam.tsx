import { cn } from "@/lib/utils";

/** Logo de AFPAM Texcoco con el nombre del sistema. */
export function LogoAfpam({
  className,
  variante = "oscuro",
  grande = false,
}: {
  className?: string;
  /** oscuro = sobre el menú negro; claro = sobre fondo blanco. */
  variante?: "oscuro" | "claro";
  grande?: boolean;
}) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <img
        src="/logo-afpam.png"
        alt="AFPAM Texcoco, Puertas Automáticas"
        className={cn("shrink-0 rounded-full", grande ? "h-16 w-16" : "h-11 w-11")}
      />
      <div className="leading-tight">
        <div
          className={cn(
            "font-display font-extrabold tracking-tight",
            grande ? "text-xl" : "text-base",
            variante === "oscuro" ? "text-sidebar-foreground" : "text-foreground",
          )}
        >
          AFPAM Bot
        </div>
        <div className={cn("text-primary", grande ? "text-sm" : "text-[11px]")}>Puertas Automáticas</div>
      </div>
    </div>
  );
}
