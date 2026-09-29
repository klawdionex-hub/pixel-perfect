import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, type ReactNode } from "react";
import { toast } from "sonner";
import {
  LayoutDashboard,
  ClipboardList,
  Users,
  BadgeDollarSign,
  Megaphone,
  FileText,
  MessageCircleQuestion,
  Settings,
  UserCog,
  Download,
  LogOut,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { LogoAfpam } from "@/components/LogoAfpam";
import { haceTiempo } from "@/lib/afpam";
import { claves, traerSolicitudes } from "@/lib/datos";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/panel", texto: "Inicio", icono: LayoutDashboard },
  { to: "/solicitudes", texto: "Solicitudes", icono: ClipboardList },
  { to: "/contactos", texto: "Contactos", icono: Users },
  { to: "/vendedores", texto: "Vendedores y comisiones", icono: BadgeDollarSign },
  { to: "/campanas", texto: "Campañas", icono: Megaphone },
  { to: "/plantillas", texto: "Plantillas", icono: FileText },
  { to: "/preguntas", texto: "Preguntas frecuentes", icono: MessageCircleQuestion },
  { to: "/configuracion", texto: "Configuración del bot", icono: Settings },
  { to: "/usuarios", texto: "Usuarios", icono: UserCog },
  { to: "/exportar", texto: "Exportar", icono: Download },
] as const;

/** Sonido corto de aviso (dos tonos), sin archivos de audio. */
function sonarAviso() {
  try {
    const ctx = new AudioContext();
    [880, 1320].forEach((frecuencia, i) => {
      const osc = ctx.createOscillator();
      const vol = ctx.createGain();
      osc.frequency.value = frecuencia;
      vol.gain.setValueAtTime(0.15, ctx.currentTime + i * 0.18);
      vol.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.18 + 0.16);
      osc.connect(vol).connect(ctx.destination);
      osc.start(ctx.currentTime + i * 0.18);
      osc.stop(ctx.currentTime + i * 0.18 + 0.17);
    });
  } catch {
    // El navegador bloquea el sonido hasta que el usuario interactúa con la página.
  }
}

/**
 * Revisa cada 30 segundos si llegaron prospectos nuevos: muestra un aviso con sonido
 * y devuelve cuántos siguen sin tomar (para el contador del menú).
 */
function useAvisoProspectosNuevos() {
  const navigate = useNavigate();
  // Sigue revisando aunque la pestaña esté en segundo plano: justo ahí es cuando sirve el aviso.
  const q = useQuery({
    queryKey: claves.solicitudes,
    queryFn: traerSolicitudes,
    refetchInterval: 30000,
    refetchIntervalInBackground: true,
  });
  const conocidas = useRef<Set<string> | null>(null);

  useEffect(() => {
    if (!q.data) return;
    const ids = new Set(q.data.map((s) => s.id));
    if (conocidas.current) {
      const nuevas = q.data.filter(
        (s) => !conocidas.current!.has(s.id) && !(s.contactos?.telefono ?? "").startsWith("sim-"),
      );
      if (nuevas.length) {
        sonarAviso();
        for (const s of nuevas.slice(0, 3)) {
          toast(`Nuevo prospecto ${s.codigo ?? ""}`, {
            description: `${s.contactos?.municipio ?? "Sin municipio"} · ${s.urgente ? "Urgente · " : ""}${haceTiempo(s.creada_en)}`,
            action: { label: "Ver", onClick: () => navigate({ to: "/solicitud/$id", params: { id: s.id } }) },
            duration: 15000,
          });
        }
      }
    }
    conocidas.current = ids;
  }, [q.data, navigate]);

  return (q.data ?? []).filter((s) => s.etapa === 1 && !s.vendedor_id).length;
}

export function AppLayout({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const sinTomar = useAvisoProspectosNuevos();

  async function cerrarSesion() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="sticky top-0 flex h-screen w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar">
        <div className="border-b border-sidebar-border px-5 py-5">
          <LogoAfpam />
        </div>
        <nav className="flex-1 overflow-y-auto px-3 py-4">
          <ul className="space-y-1">
            {NAV.map((item) => {
              const activo = pathname === item.to || pathname.startsWith(item.to + "/");
              const Icono = item.icono;
              return (
                <li key={item.to}>
                  <Link
                    to={item.to}
                    className={cn(
                      "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                      activo
                        ? "bg-primary text-primary-foreground"
                        : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                    )}
                  >
                    <Icono className="h-4 w-4 shrink-0" />
                    <span className="truncate">{item.texto}</span>
                    {item.to === "/solicitudes" && sinTomar > 0 ? (
                      <span
                        className={cn(
                          "ml-auto rounded-full px-2 py-0.5 text-[11px] font-bold",
                          activo ? "bg-carbon text-primary" : "bg-primary text-primary-foreground",
                        )}
                        title="Prospectos sin tomar"
                      >
                        {sinTomar}
                      </span>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <div className="border-t border-sidebar-border p-3">
          <button
            onClick={cerrarSesion}
            className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          >
            <LogOut className="h-4 w-4" />
            Cerrar sesión
          </button>
        </div>
      </aside>
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}

export function EncabezadoPagina({
  titulo,
  descripcion,
  acciones,
}: {
  titulo: string;
  descripcion?: string;
  acciones?: ReactNode;
}) {
  return (
    <header className="border-b border-border bg-card px-8 py-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl text-card-foreground">{titulo}</h1>
          {descripcion ? (
            <p className="mt-1 text-sm text-muted-foreground">{descripcion}</p>
          ) : null}
        </div>
        {acciones}
      </div>
    </header>
  );
}
