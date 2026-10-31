import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LogoAfpam } from "@/components/LogoAfpam";
import { oauthReturnPath } from "@/lib/oauth-return-path";

export const Route = createFileRoute("/auth")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>) => ({ next: oauthReturnPath(s["next"]) }),
  head: () => ({
    meta: [
      { title: "Inicio de sesión — AFPAM Bot" },
      {
        name: "description",
        content: "Acceso al panel de AFPAM Texcoco, Puertas Automáticas.",
      },
      { property: "og:title", content: "Inicio de sesión — AFPAM Bot" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      {
        property: "og:description",
        content: "Acceso al panel de AFPAM Texcoco, Puertas Automáticas.",
      },
    ],
  }),
  component: PaginaAuth,
});

/** Motivo en español de un error al entrar, para saber qué revisar. */
function motivoDeError(mensaje: string) {
  if (/invalid login credentials/i.test(mensaje)) return "El correo o la contraseña no coinciden. Revise que no tenga mayúsculas o espacios de más.";
  if (/not confirmed/i.test(mensaje)) return "Esta cuenta aún no está confirmada. El administrador debe confirmarla en Lovable Cloud → Users.";
  if (/banned|disabled/i.test(mensaje)) return "Esta cuenta está bloqueada. El administrador debe desbloquearla en Lovable Cloud → Users.";
  if (/rate|too many/i.test(mensaje)) return "Demasiados intentos seguidos. Espere unos minutos y vuelva a intentar.";
  if (/fetch|network|failed to/i.test(mensaje)) return "No hay conexión con el servidor. Revise su internet e intente de nuevo.";
  return `No pudimos iniciar sesión (${mensaje}).`;
}

function PaginaAuth() {
  const navigate = useNavigate();
  const { next } = Route.useSearch();
  const [modo, setModo] = useState<"entrar" | "olvide">("entrar");
  const [correo, setCorreo] = useState("");
  const [password, setPassword] = useState("");
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enviado, setEnviado] = useState(false);

  async function iniciarSesion(e: React.FormEvent) {
    e.preventDefault();
    setCargando(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email: correo, password });
    setCargando(false);
    if (error) {
      setError(motivoDeError(error.message));
      return;
    }
    if (next !== "/") window.location.assign(next);
    else navigate({ to: "/panel", replace: true });
  }

  async function pedirEnlace(e: React.FormEvent) {
    e.preventDefault();
    setCargando(true);
    setError(null);
    const { error } = await supabase.auth.resetPasswordForEmail(correo.trim(), {
      redirectTo: `${window.location.origin}/restablecer`,
    });
    setCargando(false);
    if (error && /rate|too many|seconds/i.test(error.message)) {
      setError("Ya se envió un enlace hace poco. Espere un minuto antes de pedir otro.");
      return;
    }
    // El sistema no dice si el correo existe; un error aquí es una falla del envío.
    if (error) {
      setError(`No se pudo enviar el correo (${error.message}). Pida al administrador que cambie su contraseña desde Lovable Cloud → Users.`);
      return;
    }
    setEnviado(true);
  }

  function cambiarModo(m: "entrar" | "olvide") {
    setModo(m);
    setError(null);
    setEnviado(false);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-carbon px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center">
          <LogoAfpam variante="oscuro" grande />
        </div>
        {modo === "entrar" ? (
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
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Contraseña</Label>
                <button
                  type="button"
                  className="text-xs font-semibold text-petroleo hover:underline"
                  onClick={() => cambiarModo("olvide")}
                >
                  ¿Olvidó su contraseña?
                </button>
              </div>
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
        ) : (
          <form onSubmit={pedirEnlace} className="panel space-y-5 p-6">
            <div>
              <h1 className="text-lg text-card-foreground">Recuperar contraseña</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Escriba el correo con el que entra al panel. Le enviaremos un enlace para crear una
                contraseña nueva.
              </p>
            </div>
            {enviado ? (
              <p className="rounded-md border border-border bg-muted p-3 text-sm">
                Si el correo está registrado, en unos minutos recibirá el enlace. Revise también la
                carpeta de correo no deseado. El enlace vence en una hora.
              </p>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="correo-recuperar">Correo electrónico</Label>
                <Input
                  id="correo-recuperar"
                  type="email"
                  autoComplete="email"
                  required
                  value={correo}
                  onChange={(e) => setCorreo(e.target.value)}
                />
              </div>
            )}
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            {enviado ? null : (
              <Button type="submit" className="w-full" disabled={cargando}>
                {cargando ? "Enviando" : "Enviar enlace"}
              </Button>
            )}
            <button
              type="button"
              className="w-full text-center text-sm font-semibold text-petroleo hover:underline"
              onClick={() => cambiarModo("entrar")}
            >
              Volver a iniciar sesión
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
