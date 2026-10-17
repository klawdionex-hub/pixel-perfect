import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Lock, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { EncabezadoPagina } from "@/components/AppLayout";
import { TextoWhatsApp } from "@/components/TextoWhatsApp";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { fechaHora } from "@/lib/afpam";
import { CATEGORIAS_EQUIPO, pieDeFoto } from "@/lib/bot/equipos";
import { cabeza } from "@/lib/cabeza";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/equipos")({
  head: () => cabeza("Catálogo de equipos", "Equipos con clave propia y fotos para que los vendedores las envíen al cliente."),
  component: Pagina,
});

type Equipo = {
  id: string;
  clave: string;
  nombre: string;
  categoria: string;
  descripcion: string | null;
  fotos: Array<{ url: string }>;
  notas_internas: string | null;
  activo: boolean;
  orden: number;
  usos: number;
  ultimo_uso: string | null;
};
type Borrador = Omit<Equipo, "id" | "orden" | "usos" | "ultimo_uso"> & { id?: string };

const VACIO: Borrador = { clave: "", nombre: "", categoria: CATEGORIAS_EQUIPO[0], descripcion: "", fotos: [], notas_internas: "", activo: true };
const CLAVE_QUERY = ["equipos_catalogo"];

function Pagina() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: CLAVE_QUERY,
    queryFn: async () => {
      const { data, error } = await supabase.from("equipos_catalogo").select("*").order("orden").order("clave");
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as Equipo[];
    },
    retry: false,
  });
  const [f, setF] = useState<Borrador>(VACIO);
  const [subiendo, setSubiendo] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [filtro, setFiltro] = useState<string>("todas");
  const lista = q.data ?? [];
  const recargar = () => qc.invalidateQueries({ queryKey: CLAVE_QUERY });

  async function subir(archivos: FileList) {
    setSubiendo(true);
    const nuevas: Array<{ url: string }> = [];
    for (const a of Array.from(archivos)) {
      if (!a.type.startsWith("image/")) {
        toast.error(`${a.name}: suba una imagen (JPG o PNG).`);
        continue;
      }
      if (a.size > 5 * 1024 * 1024) {
        toast.error(`${a.name}: la foto debe pesar menos de 5 MB.`);
        continue;
      }
      const ext = a.name.split(".").pop()?.toLowerCase() ?? "jpg";
      const ruta = `equipos/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from("media").upload(ruta, a, { contentType: a.type });
      if (error) {
        toast.error(`${a.name}: ${error.message}`);
        continue;
      }
      nuevas.push({ url: supabase.storage.from("media").getPublicUrl(ruta).data.publicUrl });
    }
    setF((x) => ({ ...x, fotos: [...x.fotos, ...nuevas].slice(0, 6) }));
    setSubiendo(false);
  }

  async function guardar() {
    if (!f.clave.trim() || !f.nombre.trim()) {
      toast.error("Escriba la clave y el nombre para el cliente.");
      return;
    }
    const repetida = lista.find((e) => e.clave.trim().toUpperCase() === f.clave.trim().toUpperCase() && e.id !== f.id);
    if (repetida) {
      toast.error(`La clave ${repetida.clave} ya existe.`);
      return;
    }
    setGuardando(true);
    const datos = {
      clave: f.clave.trim().toUpperCase(),
      nombre: f.nombre.trim(),
      categoria: f.categoria,
      descripcion: f.descripcion?.trim() || null,
      fotos: f.fotos as unknown as Json,
      notas_internas: f.notas_internas?.trim() || null,
      activo: f.activo,
    };
    const { error } = f.id
      ? await supabase.from("equipos_catalogo").update(datos).eq("id", f.id)
      : await supabase.from("equipos_catalogo").insert({ ...datos, orden: (lista.at(-1)?.orden ?? 0) + 1 });
    setGuardando(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(f.id ? "Equipo actualizado" : "Equipo agregado al catálogo");
    setF(VACIO);
    recargar();
  }

  async function borrar(e: Equipo) {
    if (!confirm(`¿Quitar ${e.clave} del catálogo? Esta acción no se puede deshacer.`)) return;
    const { error } = await supabase.from("equipos_catalogo").delete().eq("id", e.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    if (f.id === e.id) setF(VACIO);
    recargar();
  }

  async function mover(visibles: Equipo[], i: number, dir: -1 | 1) {
    const a = visibles[i];
    const b = visibles[i + dir];
    if (!a || !b) return;
    await supabase.from("equipos_catalogo").update({ orden: b.orden }).eq("id", a.id);
    await supabase.from("equipos_catalogo").update({ orden: a.orden }).eq("id", b.id);
    recargar();
  }

  async function alternar(e: Equipo) {
    const { error } = await supabase.from("equipos_catalogo").update({ activo: !e.activo }).eq("id", e.id);
    if (error) toast.error(error.message);
    recargar();
  }

  const faltaTabla = q.error && /equipos_catalogo|relation|schema cache/i.test(q.error.message);
  const visibles = filtro === "todas" ? lista : lista.filter((e) => e.categoria === filtro);

  return (
    <div>
      <EncabezadoPagina
        titulo="Catálogo de equipos"
        descripcion="Los vendedores piden estas fotos desde el bot (comandos → Catálogo de equipos) para reenviarlas al cliente."
      />
      <div className="grid gap-8 p-8 xl:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          {faltaTabla ? (
            <p className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm">
              Falta crear la tabla del catálogo. Pegue el SQL de la migración <b>20261019180000_catalogo_equipos</b> en Lovable →
              Cloud → Database → SQL editor.
            </p>
          ) : null}

          <div className="space-y-4 rounded-md border border-border bg-card p-5">
            <h2 className="text-base">{f.id ? `Editar ${f.clave}` : "Agregar equipo"}</h2>
            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <Label>Clave AFPAM</Label>
                <Input maxLength={24} value={f.clave} placeholder="AFPAM C-600" onChange={(e) => setF({ ...f, clave: e.target.value })} />
              </div>
              <div className="md:col-span-2">
                <Label>Categoría</Label>
                <select
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={f.categoria}
                  onChange={(e) => setF({ ...f, categoria: e.target.value })}
                >
                  {CATEGORIAS_EQUIPO.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <Label>Nombre para el cliente</Label>
              <Input maxLength={72} value={f.nombre} placeholder="Motor para portón corredizo de hasta 600 kg" onChange={(e) => setF({ ...f, nombre: e.target.value })} />
              <p className="mt-1 text-xs text-muted-foreground">Describa lo que hace, sin marca ni modelo.</p>
            </div>
            <div>
              <Label>Descripción para el cliente (opcional)</Label>
              <Textarea rows={3} value={f.descripcion ?? ""} placeholder="Instalación incluida. Garantía de 1 año." onChange={(e) => setF({ ...f, descripcion: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Fotos (hasta 6)</Label>
              {f.fotos.length ? (
                <div className="flex flex-wrap gap-2">
                  {f.fotos.map((foto, i) => (
                    <div key={foto.url} className="relative">
                      <img src={foto.url} alt="" className="h-20 w-20 rounded-md border border-border object-cover" />
                      <button
                        className="absolute -right-1.5 -top-1.5 rounded-full bg-destructive px-1.5 text-xs text-white"
                        onClick={() => setF({ ...f, fotos: f.fotos.filter((_, j) => j !== i) })}
                        aria-label="Quitar foto"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}
              {f.fotos.length < 6 ? (
                <label className="flex cursor-pointer items-center justify-center rounded-md border-2 border-dashed border-border p-4 text-sm text-muted-foreground hover:bg-muted">
                  {subiendo ? "Subiendo…" : "Haga clic para subir fotos del equipo instalado (sin logos de marca)"}
                  <input type="file" multiple accept="image/*" className="hidden" onChange={(e) => e.target.files && void subir(e.target.files)} />
                </label>
              ) : null}
            </div>
            <div>
              <Label className="flex items-center gap-1.5">
                <Lock className="h-3.5 w-3.5" /> Notas internas (marca, modelo, costo)
              </Label>
              <Textarea rows={2} value={f.notas_internas ?? ""} onChange={(e) => setF({ ...f, notas_internas: e.target.value })} />
              <p className="mt-1 text-xs text-muted-foreground">Solo se ven aquí en el panel. Nunca se envían por WhatsApp.</p>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={f.activo} onCheckedChange={(v) => setF({ ...f, activo: v })} /> Visible en el bot
            </label>
            <div className="flex gap-2">
              <Button disabled={guardando || subiendo} onClick={guardar}>
                {guardando ? "Guardando…" : f.id ? "Guardar cambios" : "Agregar al catálogo"}
              </Button>
              {f.id ? (
                <Button variant="outline" onClick={() => setF(VACIO)}>
                  Cancelar
                </Button>
              ) : null}
            </div>
          </div>

          <div className="overflow-hidden rounded-md border border-border bg-card">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
              <h2 className="text-base">Equipos ({lista.length})</h2>
              <div className="flex flex-wrap gap-1.5">
                {["todas", ...CATEGORIAS_EQUIPO].map((c) => (
                  <button
                    key={c}
                    onClick={() => setFiltro(c)}
                    className={cn("rounded-full border px-2.5 py-0.5 text-xs", filtro === c ? "border-petroleo bg-petroleo text-white" : "border-border hover:bg-muted")}
                  >
                    {c === "todas" ? "Todas" : c}
                  </button>
                ))}
              </div>
            </div>
            {visibles.length === 0 ? <p className="p-4 text-sm text-muted-foreground">No hay equipos en esta categoría.</p> : null}
            {visibles.map((e, i) => (
              <div key={e.id} className={cn("flex flex-wrap items-center gap-3 border-b border-border px-4 py-3 last:border-0", !e.activo && "opacity-60")}>
                <div className="flex flex-col">
                  <button disabled={i === 0} onClick={() => void mover(visibles, i, -1)} className="text-muted-foreground disabled:opacity-30" aria-label="Subir">
                    <ArrowUp className="h-4 w-4" />
                  </button>
                  <button disabled={i === visibles.length - 1} onClick={() => void mover(visibles, i, 1)} className="text-muted-foreground disabled:opacity-30" aria-label="Bajar">
                    <ArrowDown className="h-4 w-4" />
                  </button>
                </div>
                {e.fotos[0] ? (
                  <img src={e.fotos[0].url} alt="" className="h-12 w-12 rounded border border-border object-cover" />
                ) : (
                  <div className="h-12 w-12 rounded border border-dashed border-border" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-sm font-semibold text-card-foreground">{e.clave}</p>
                  <p className="truncate text-sm">{e.nombre}</p>
                  <p className="text-xs text-muted-foreground">
                    {e.categoria} · {e.fotos.length} foto(s) · Enviado {e.usos} {e.usos === 1 ? "vez" : "veces"}
                    {e.ultimo_uso ? `, la última el ${fechaHora(e.ultimo_uso)}` : ""}
                  </p>
                </div>
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Switch checked={e.activo} onCheckedChange={() => void alternar(e)} /> Visible
                </label>
                <Button variant="outline" size="sm" onClick={() => setF({ ...e, descripcion: e.descripcion ?? "", notas_internas: e.notas_internas ?? "" })}>
                  Editar
                </Button>
                <button onClick={() => void borrar(e)} className="text-destructive" aria-label="Quitar">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          <h2 className="text-base">Así le llega al vendedor</h2>
          <div className="rounded-md border border-border bg-[#efeae2] p-3">
            <div className="overflow-hidden rounded-lg bg-white text-sm text-[#111b21] shadow-sm">
              {f.fotos[0] ? (
                <img src={f.fotos[0].url} alt="" className="h-48 w-full object-cover" />
              ) : (
                <div className="flex h-48 items-center justify-center bg-[#f0f2f5] text-xs text-[#667781]">Foto del equipo</div>
              )}
              <p className="whitespace-pre-wrap p-3">
                <TextoWhatsApp
                  texto={pieDeFoto({
                    clave: f.clave.trim().toUpperCase() || "AFPAM C-600",
                    nombre: f.nombre.trim() || "Motor para portón corredizo de hasta 600 kg",
                    descripcion: f.descripcion,
                  })}
                />
              </p>
            </div>
            {f.fotos.length > 1 ? <p className="mt-2 text-xs text-[#667781]">y {f.fotos.length - 1} foto(s) más</p> : null}
          </div>
          <p className="text-xs text-muted-foreground">
            El vendedor la reenvía al cliente tal cual. Use fotos de trabajos instalados y evite que se vean logos o etiquetas
            del fabricante.
          </p>
        </div>
      </div>
    </div>
  );
}
