import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LogoAfpam } from "@/components/LogoAfpam";
import { cabeza } from "@/lib/cabeza";

// Página a la que llega el enlace de "¿Olvidó su contraseña?". El cliente de Supabase
// lee el enlace y abre una sesión temporal con la que se guarda la contraseña nueva.
export const Route = createFileRoute("/restablecer")({
  ssr: false,
  head: () => cabeza("Contraseña nueva", "Cree una contraseña nueva para el panel de AFPAM Texcoco."),
  component: PaginaRestablecer,
});

function PaginaRestablecer() {
  const navigate = useNavigate();
  const [estado, setEstado] = useState<"revisando" | "listo" | "invalido">("revisando");
  const [password, setPassword] = useState("");
  const [repetir, setRepetir] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((evento, sesion) => {
      if (evento === "PASSWORD_RECOVERY" || (sesion && evento === "SIGNED_IN")) setEstado("listo");
    });
    // Si el enlace ya se procesó, la sesión existe; si no aparece en unos segundos, el enlace no sirve.
    void supabase.auth.getSession().then(({ data: d }) => {
      if (d.session) setEstado("listo");
    });
    const espera = setTimeout(() => setEstado((e) => (e === "revisando" ? "invalido" : e)), 6000);
    return () => {
      data.subscription.unsubscribe();
      clearTimeout(espera);
    };
  }, []);

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 12) return setError("Use al menos 12 caracteres.");
    if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password)) {
      return setError("Incluya mayúsculas, minúsculas y números.");
    }
    if (password !== repetir) return setError("Las dos contraseñas no coinciden.");
    setGuardando(true);
    const { error } = await supabase.auth.updateUser({ password });
    setGuardando(false);
    if (error) {
      setError(
        /weak|pwned|leaked|easy/i.test(error.message)
          ? "Esa contraseña es muy fácil de adivinar o apareció en filtraciones de internet. Elija otra."
          : /same|different/i.test(error.message)
            ? "La contraseña nueva debe ser distinta de la anterior."
            : "No se pudo guardar la contraseña. Pida un enlace nuevo e intente otra vez.",
      );
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
        <div className="panel space-y-5 p-6">
          <h1 className="text-lg text-card-foreground">Contraseña nueva</h1>
          {estado === "revisando" ? <p className="text-sm text-muted-foreground">Verificando el enlace…</p> : null}
          {estado === "invalido" ? (
            <>
              <p className="text-sm text-muted-foreground">
                El enlace no es válido o ya venció. Pida uno nuevo desde la página de inicio de sesión.
              </p>
              <Button className="w-full" onClick={() => navigate({ to: "/auth" })}>
                Ir a iniciar sesión
              </Button>
            </>
          ) : null}
          {estado === "listo" ? (
            <form onSubmit={guardar} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="nueva">Contraseña nueva</Label>
                <Input id="nueva" type="password" autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
                <p className="text-xs text-muted-foreground">Mínimo 12 caracteres, con mayúsculas, minúsculas y números.</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="repetir">Repita la contraseña</Label>
                <Input id="repetir" type="password" autoComplete="new-password" required value={repetir} onChange={(e) => setRepetir(e.target.value)} />
              </div>
              {error ? <p className="text-sm text-destructive">{error}</p> : null}
              <Button type="submit" className="w-full" disabled={guardando}>
                {guardando ? "Guardando" : "Guardar y entrar"}
              </Button>
            </form>
          ) : null}
        </div>
      </div>
    </div>
  );
}
