import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LogoAfpam } from "@/components/LogoAfpam";

export const Route = createFileRoute("/auth")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Inicio de sesión — AFPAM Bot" },
      {
        name: "description",
        content: "Acceso al panel de AFPAM Texcoco, Puertas Automáticas.",
      },
      { property: "og:title", content: "Inicio de sesión — AFPAM Bot" },
      {
        property: "og:description",
        content: "Acceso al panel de AFPAM Texcoco, Puertas Automáticas.",
      },
    ],
  }),
  component: PaginaAuth,
});

function PaginaAuth() {
  const navigate = useNavigate();
  const [correo, setCorreo] = useState("");
  const [password, setPassword] = useState("");
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function iniciarSesion(e: React.FormEvent) {
    e.preventDefault();
    setCargando(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email: correo, password });
    setCargando(false);
    if (error) {
      setError("No pudimos iniciar sesión. Verifique su correo y contraseña.");
      return;
    }
    navigate({ to: "/panel", replace: true });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-carbon px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center">
          <LogoAfpam variante="oscuro" grande />
        </div>
        <form onSubmit={iniciarSesion} className="panel space-y-5 p-6">
          <div>
            <h1 className="text-lg text-card-foreground">Iniciar sesión</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Acceso exclusivo para el personal de AFPAM Texcoco.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="correo">Correo electrónico</Label>
            <Input
              id="correo"
              type="email"
              autoComplete="email"
              required
              value={correo}
              onChange={(e) => setCorreo(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Contraseña</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <Button type="submit" className="w-full" disabled={cargando}>
            {cargando ? "Verificando" : "Entrar"}
          </Button>
          <p className="text-xs text-muted-foreground">
            No hay registro público. Las cuentas las crea un administrador desde el panel de
            usuarios.
          </p>
        </form>
      </div>
    </div>
  );
}
