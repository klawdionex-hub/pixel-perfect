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

/** Contraseña aleatoria de 16 caracteres con mayúsculas, minúsculas, números y símbolos. */
function generarContrasena() {
  const grupos = ["ABCDEFGHJKLMNPQRSTUVWXYZ", "abcdefghijkmnpqrstuvwxyz", "23456789", "!#$%*?-_"];
  const todos = grupos.join("");
  const azar = (n: number) => crypto.getRandomValues(new Uint32Array(1))[0]! % n;
  const letras = grupos.map((g) => g[azar(g.length)]!);
  while (letras.length < 16) letras.push(todos[azar(todos.length)]!);
  for (let i = letras.length - 1; i > 0; i--) {
    const j = azar(i + 1);
    [letras[i], letras[j]] = [letras[j]!, letras[i]!];
  }
  return letras.join("");
}

/** Mensajes del sistema de acceso, en español. */
function traducirError(m: string) {
  if (/weak|easy to guess|pwned|leaked/i.test(m)) {
    return "La contraseña es muy fácil de adivinar o apareció en filtraciones de internet. Use al menos 12 caracteres con mayúsculas, minúsculas, números y un símbolo, o presione \"Generar contraseña segura\".";
  }
  if (/should be at least|at least \d+ characters/i.test(m)) return "La contraseña es muy corta. Use al menos 12 caracteres.";
  if (/should contain|must contain/i.test(m)) return "La contraseña debe incluir mayúsculas, minúsculas, números y un símbolo.";
  if (/already (been )?registered|already exists/i.test(m)) return "Ya existe un usuario con ese correo.";
  if (/invalid email|email address/i.test(m)) return "El correo no es válido.";
  return m || "No se pudo crear el usuario.";
}

function Pagina() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: claves.usuarios, queryFn: traerUsuarios });
  const crear = useServerFn(crearUsuario);
  const [f, setF] = useState({ correo: "", contrasena: "", nombre: "", whatsapp: "", es_vendedor: true });
  const [enviando, setEnviando] = useState(false);
  const [verContrasena, setVerContrasena] = useState(false);

  async function alta() {
    setEnviando(true);
    try {
      await crear({ data: f });
      toast.success("Usuario creado");
      setF({ correo: "", contrasena: "", nombre: "", whatsapp: "", es_vendedor: true });
      qc.invalidateQueries({ queryKey: claves.usuarios });
    } catch (e) {
      toast.error(traducirError(e instanceof Error ? e.message : ""), { duration: 10000 });
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
          <div>
            <Label>Contraseña</Label>
            <div className="flex gap-2">
              <Input type={verContrasena ? "text" : "password"} value={f.contrasena} onChange={(e) => setF({ ...f, contrasena: e.target.value })} />
              <Button type="button" variant="outline" size="sm" className="h-9 shrink-0" onClick={() => setVerContrasena(!verContrasena)}>
                {verContrasena ? "Ocultar" : "Ver"}
              </Button>
            </div>
            <button
              type="button"
              className="mt-1.5 text-xs font-semibold text-petroleo underline"
              onClick={() => {
                setF({ ...f, contrasena: generarContrasena() });
                setVerContrasena(true);
              }}
            >
              Generar contraseña segura
            </button>
            <p className="mt-1 text-xs text-muted-foreground">
              Mínimo 12 caracteres, con mayúsculas, minúsculas, números y un símbolo. Anótela antes de crear el usuario y entréguela en persona.
            </p>
          </div>
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
