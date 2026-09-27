import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { EncabezadoPagina } from "@/components/AppLayout";
import { Tabla, Celda } from "@/components/Tabla";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { claves, traerUsuarios, type UsuarioPerfil } from "@/lib/datos";
import { crearUsuario } from "@/lib/usuarios.functions";
import { cabeza } from "@/lib/cabeza";

export const Route = createFileRoute("/_authenticated/usuarios")({
  head: () => cabeza("Usuarios", "Usuarios con acceso al panel y vendedores."),
  component: Pagina,
});

function Pagina() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: claves.usuarios, queryFn: traerUsuarios });
  const crear = useServerFn(crearUsuario);
  const [f, setF] = useState({ correo: "", contrasena: "", nombre: "", whatsapp: "", es_vendedor: true });
  const [enviando, setEnviando] = useState(false);

  async function alta() {
    setEnviando(true);
    try {
      await crear({ data: f });
      toast.success("Usuario creado");
      setF({ correo: "", contrasena: "", nombre: "", whatsapp: "", es_vendedor: true });
      qc.invalidateQueries({ queryKey: claves.usuarios });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo crear");
    } finally {
      setEnviando(false);
    }
  }

  async function actualizar(id: string, cambios: Partial<UsuarioPerfil>) {
    const { error } = await supabase.from("usuarios_perfil").update(cambios).eq("id", id);
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: claves.usuarios });
  }

  return (
    <div>
      <EncabezadoPagina titulo="Usuarios" descripcion="Todos los usuarios tienen acceso completo al panel." />
      <div className="grid gap-8 p-8 lg:grid-cols-[340px_1fr]">
        <div className="space-y-3 rounded-md border border-border bg-card p-5">
          <h2 className="text-base">Nuevo usuario</h2>
          <div><Label>Nombre</Label><Input value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} /></div>
          <div><Label>Correo</Label><Input type="email" value={f.correo} onChange={(e) => setF({ ...f, correo: e.target.value })} /></div>
          <div><Label>Contraseña (mín. 8)</Label><Input type="password" value={f.contrasena} onChange={(e) => setF({ ...f, contrasena: e.target.value })} /></div>
          <div><Label>WhatsApp (10 dígitos)</Label><Input value={f.whatsapp} onChange={(e) => setF({ ...f, whatsapp: e.target.value })} /></div>
          <div className="flex items-center gap-2"><Switch checked={f.es_vendedor} onCheckedChange={(v) => setF({ ...f, es_vendedor: v })} /><Label>Es vendedor</Label></div>
          <Button className="w-full" disabled={enviando} onClick={alta}>Crear usuario</Button>
        </div>
        <Tabla encabezados={["Nombre", "WhatsApp", "Vendedor", "Resumen semanal", "Activo"]}>
          {(q.data ?? []).map((u) => (
            <tr key={u.id}>
              <Celda><Input defaultValue={u.nombre} onBlur={(e) => e.target.value !== u.nombre && actualizar(u.id, { nombre: e.target.value })} /></Celda>
              <Celda><Input defaultValue={u.whatsapp ?? ""} onBlur={(e) => actualizar(u.id, { whatsapp: e.target.value || null })} /></Celda>
              <Celda><Switch checked={u.es_vendedor} onCheckedChange={(v) => actualizar(u.id, { es_vendedor: v })} /></Celda>
              <Celda><Switch checked={u.recibe_resumen_semanal} onCheckedChange={(v) => actualizar(u.id, { recibe_resumen_semanal: v })} /></Celda>
              <Celda><Switch checked={u.activo} onCheckedChange={(v) => actualizar(u.id, { activo: v })} /></Celda>
            </tr>
          ))}
        </Tabla>
      </div>
    </div>
  );
}
