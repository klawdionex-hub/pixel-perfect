import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
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

export function AppLayout({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

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
