import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { LogoAfpam } from "@/components/LogoAfpam";
import { cabeza } from "@/lib/cabeza";

export const Route = createFileRoute("/.lovable/oauth/consent")({
  ssr: false,
  head: () => cabeza("Conectar agente", "Autorice a un agente a consultar AFPAM Bot con los permisos de su cuenta."),
  validateSearch: (s: Record<string, unknown>) => ({ authorization_id: typeof s.authorization_id === "string" ? s.authorization_id : "" }),
  beforeLoad: async ({ search, location }) => {
    if (!search.authorization_id) throw new Error("Falta la solicitud de autorización. Inicie de nuevo la conexión desde su agente.");
    const { data, error } = await supabase.auth.getSession();
    if (error) throw new Error("No se pudo verificar su sesión. Intente de nuevo.");
    if (!data.session) throw redirect({ to: "/auth", search: { next: location.pathname + location.searchStr + location.hash } });
  },
  loader: async ({ location }) => {
    const id = new URLSearchParams(location.searchStr).get("authorization_id");
    if (!id) throw new Error("La solicitud de autorización no es válida.");
    const { data, error } = await supabase.auth.oauth.getAuthorizationDetails(id);
    if (error) throw new Error("La autorización venció, no es válida o no pudo cargarse. Inicie de nuevo la conexión desde su agente.");
    if (data && "redirect_url" in data && data.redirect_url) throw redirect({ href: data.redirect_url });
    if (!data || !("client" in data)) throw new Error("No se pudo identificar al agente solicitante.");
    const { data: session } = await supabase.auth.getSession();
    return { details: data, email: session.session?.user.email ?? "" };
  },
  pendingComponent: () => <main className="p-8 text-foreground">Cargando autorización…</main>,
  errorComponent: ({ error }) => <main className="mx-auto max-w-lg space-y-4 p-8"><LogoAfpam /><h1>Conexión no disponible</h1><p role="alert">{error.message}</p></main>,
  component: Consentimiento,
});

function Consentimiento() {
  const { details, email } = Route.useLoaderData();
  const { authorization_id } = Route.useSearch();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const client = details.client.name || "el agente";
  const scopes = details.scope.split(" ").filter(Boolean);

  async function decidir(approve: boolean) {
    setBusy(true);
    setError("");
    try {
      const result = approve
        ? await supabase.auth.oauth.approveAuthorization(authorization_id)
        : await supabase.auth.oauth.denyAuthorization(authorization_id);
      if (result.error) throw new Error("No se pudo guardar su decisión. Intente de nuevo.");
      const target = result.data?.redirect_url;
      if (!target) throw new Error("No se recibió un destino para volver al agente. Inicie de nuevo la conexión.");
      window.location.assign(target);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo completar la conexión.");
      setBusy(false);
    }
  }

  return <main className="mx-auto max-w-lg space-y-6 px-6 py-12">
    <LogoAfpam />
    <h1 className="text-xl">Conectar {client} a AFPAM Bot</h1>
    <p className="text-sm text-muted-foreground">Cuenta: {email}</p>
    <p>Esto permite a {client} consultar solicitudes, sus importes y el catálogo de servicios como usted.</p>
    <p className="break-all text-sm text-muted-foreground">Destino: {details.redirect_uri}</p>
    <ul className="list-disc space-y-2 pl-5 text-sm">{scopes.map(scope => <li key={scope}>{scope === "openid" || scope === "profile" ? "Compartir su perfil básico" : scope === "email" ? "Compartir su correo electrónico" : `Permiso adicional solicitado: ${scope}`}</li>)}</ul>
    <p className="text-sm text-muted-foreground">Solo consultas. No permite enviar mensajes, eliminar registros ni cambiar datos. Los permisos de AFPAM siguen aplicándose.</p>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <div className="flex flex-wrap gap-3"><Button disabled={busy} onClick={() => decidir(true)}>Permitir conexión</Button><Button variant="outline" disabled={busy} onClick={() => decidir(false)}>Cancelar conexión</Button></div>
  </main>;
}