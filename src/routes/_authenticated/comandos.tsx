import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, FileText, ImageIcon, Lock, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { EncabezadoPagina } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { fechaHora } from "@/lib/afpam";
import { cabeza } from "@/lib/cabeza";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/comandos")({
  head: () => cabeza("Comandos", "Menú de comandos del bot para vendedores y material de venta."),
  component: Pagina,
});

type Archivo = { url: string; tipo: "imagen" | "documento"; nombre?: string };
type Material = {
  id: string;
  titulo: string;
  descripcion: string | null;
  texto: string | null;
  archivos: Archivo[];
  solo_admin: boolean;
  activo: boolean;
  orden: number;
  usos: number;
  ultimo_uso: string | null;
};
type Borrador = Omit<Material, "id" | "usos" | "ultimo_uso" | "orden"> & { id?: string };

const VACIO: Borrador = { titulo: "", descripcion: "", texto: "", archivos: [], solo_admin: false, activo: true };
const CLAVE = ["material_venta"];

/** Las opciones fijas del menú, como las ve el vendedor. */
const FIJAS = [
  { seccion: "Mis prospectos", titulo: "Ver mis prospectos" },
  { seccion: "Mis prospectos", titulo: "Registrar resultado" },
  { seccion: "Mis prospectos", titulo: "Prospectos sin vendedor" },
  { seccion: "Mis ventas", titulo: "Ventas y comisión" },
];

function Pagina() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: CLAVE,
    queryFn: async () => {
      const { data, error } = await supabase.from("material_venta").select("*").order("orden").order("creado_en");
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as Material[];
    },
    retry: false,
  });
  const [f, setF] = useState<Borrador>(VACIO);
  const [subiendo, setSubiendo] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const lista = q.data ?? [];
  const recargar = () => qc.invalidateQueries({ queryKey: CLAVE });

  async function subir(archivos: FileList) {
    setSubiendo(true);
    const nuevos: Archivo[] = [];
    for (const a of Array.from(archivos)) {
      const esImagen = a.type.startsWith("image/");
      const esPdf = a.type === "application/pdf";
      if (!esImagen && !esPdf) {
        toast.error(`${a.name}: solo se aceptan imágenes (JPG o PNG) y PDF.`);
        continue;
      }
      // Límites de WhatsApp: 5 MB por imagen y 100 MB por documento.
      if (a.size > (esImagen ? 5 : 100) * 1024 * 1024) {
        toast.error(`${a.name}: pesa demasiado (máximo ${esImagen ? "5 MB por imagen" : "100 MB por PDF"}).`);
        continue;
      }
      const ext = a.name.split(".").pop()?.toLowerCase() ?? (esPdf ? "pdf" : "jpg");
      const ruta = `material/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from("media").upload(ruta, a, { contentType: a.type });
      if (error) {
        toast.error(`${a.name}: ${error.message}`);
        continue;
      }
      const url = supabase.storage.from("media").getPublicUrl(ruta).data.publicUrl;
      nuevos.push({ url, tipo: esImagen ? "imagen" : "documento", nombre: a.name.replace(/\.[^.]+$/, "") });
    }
    setF((x) => ({ ...x, archivos: [...x.archivos, ...nuevos] }));
    setSubiendo(false);
  }

  async function guardar() {
    if (!f.titulo.trim()) { toast.error("Escriba el nombre de la opción."); return; }
    if (!f.texto?.trim() && !f.archivos.length) { toast.error("Agregue un texto, fotos o un PDF."); return; }
    setGuardando(true);
    const datos = {
      titulo: f.titulo.trim(),
      descripcion: f.descripcion?.trim() || null,
      texto: f.texto?.trim() || null,
      archivos: f.archivos as unknown as Json,
      solo_admin: f.solo_admin,
      activo: f.activo,
    };
    const { error } = f.id
      ? await supabase.from("material_venta").update(datos).eq("id", f.id)
      : await supabase.from("material_venta").insert({ ...datos, orden: (lista.at(-1)?.orden ?? 0) + 1 });
    setGuardando(false);
    if (error) { toast.error(error.message); return; }
    toast.success(f.id ? "Material actualizado" : "Material agregado al menú");
    setF(VACIO);
    recargar();
  }

  async function borrar(m: Material) {
    if (!confirm(`¿Quitar "${m.titulo}" del menú? Esta acción no se puede deshacer.`)) return;
    const { error } = await supabase.from("material_venta").delete().eq("id", m.id);
    if (error) { toast.error(error.message); return; }
    if (f.id === m.id) setF(VACIO);
    recargar();
  }

  async function mover(i: number, dir: -1 | 1) {
    const a = lista[i];
    const b = lista[i + dir];
    if (!a || !b) return;
    await supabase.from("material_venta").update({ orden: b.orden }).eq("id", a.id);
    await supabase.from("material_venta").update({ orden: a.orden }).eq("id", b.id);
    recargar();
  }

  async function alternar(m: Material) {
    const { error } = await supabase.from("material_venta").update({ activo: !m.activo }).eq("id", m.id);
    if (error) { toast.error(error.message); return; }
    recargar();
  }

  const faltaTabla = q.error && /material_venta|relation|schema cache/i.test(q.error.message);
  const activos = lista.filter((m) => m.activo);
  const enPrimera = activos.length > 6 ? 5 : 6;

  return (
    <div>
      <EncabezadoPagina
        titulo="Comandos"
        descripcion='Lo que ve un vendedor cuando le escribe al bot. Cualquier mensaje, o la palabra "comandos", abre este menú.'
      />
      <div className="grid gap-8 p-8 xl:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          {faltaTabla ? (
            <p className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm">
              Falta crear la tabla del material de venta. Pegue el SQL de la migración <b>20261019120000_material_venta</b> en
              Lovable → Cloud → Database → SQL editor.
            </p>
          ) : null}

          {/* Formulario */}
          <div className="space-y-4 rounded-md border border-border bg-card p-5">
            <h2 className="text-base">{f.id ? `Editar "${f.titulo}"` : "Agregar material de venta"}</h2>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <Label>Nombre de la opción en el menú</Label>
                <Input maxLength={24} value={f.titulo} placeholder="Garantía" onChange={(e) => setF({ ...f, titulo: e.target.value })} />
                <p className="mt-1 text-xs text-muted-foreground">{f.titulo.length}/24 caracteres (límite de WhatsApp).</p>
              </div>
              <div>
                <Label>Descripción corta (opcional)</Label>
                <Input maxLength={72} value={f.descripcion ?? ""} placeholder="Condiciones de garantía" onChange={(e) => setF({ ...f, descripcion: e.target.value })} />
              </div>
            </div>
            <div>
              <Label>Texto que recibe el vendedor (opcional)</Label>
              <Textarea rows={4} value={f.texto ?? ""} onChange={(e) => setF({ ...f, texto: e.target.value })} />
              <p className="mt-1 text-xs text-muted-foreground">Puede usar *negritas*. Recuerde: nada de marcas ni modelos si el vendedor lo va a reenviar al cliente.</p>
            </div>
            <div className="space-y-2">
              <Label>Fotos o PDF (opcional)</Label>
              {f.archivos.length ? (
                <ul className="space-y-1">
                  {f.archivos.map((a, i) => (
                    <li key={a.url} className="flex items-center gap-2 text-sm">
                      {a.tipo === "imagen" ? <ImageIcon className="h-4 w-4 text-muted-foreground" /> : <FileText className="h-4 w-4 text-muted-foreground" />}
                      <a href={a.url} target="_blank" rel="noreferrer" className="truncate text-petroleo underline">
                        {a.nombre ?? (a.tipo === "imagen" ? "Foto" : "Documento")}
                      </a>
                      <button
                        className="ml-auto text-xs text-destructive underline"
                        onClick={() => setF({ ...f, archivos: f.archivos.filter((_, j) => j !== i) })}
                      >
                        Quitar
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
              <label className="flex cursor-pointer items-center justify-center rounded-md border-2 border-dashed border-border p-4 text-sm text-muted-foreground hover:bg-muted">
                {subiendo ? "Subiendo…" : "Haga clic para subir fotos (JPG, PNG) o un PDF"}
                <input
                  type="file"
                  multiple
                  accept="image/*,application/pdf"
                  className="hidden"
                  onChange={(e) => e.target.files && void subir(e.target.files)}
                />
              </label>
            </div>
            <div className="flex flex-wrap gap-6">
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={f.solo_admin} onCheckedChange={(v) => setF({ ...f, solo_admin: v })} /> Solo para administradores
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={f.activo} onCheckedChange={(v) => setF({ ...f, activo: v })} /> Visible en el menú
              </label>
            </div>
            <div className="flex gap-2">
              <Button disabled={guardando || subiendo} onClick={guardar}>
                {guardando ? "Guardando…" : f.id ? "Guardar cambios" : "Agregar al menú"}
              </Button>
              {f.id ? (
                <Button variant="outline" onClick={() => setF(VACIO)}>
                  Cancelar
                </Button>
              ) : null}
            </div>
          </div>

          {/* Lista */}
          <div className="overflow-hidden rounded-md border border-border bg-card">
            <div className="border-b border-border px-4 py-3">
              <h2 className="text-base">Material de venta</h2>
              <p className="text-xs text-muted-foreground">El orden de esta lista es el orden del menú.</p>
            </div>
            {lista.length === 0 ? <p className="p-4 text-sm text-muted-foreground">Todavía no hay material. Agregue el primero arriba.</p> : null}
            {lista.map((m, i) => (
              <div key={m.id} className={cn("flex flex-wrap items-center gap-3 border-b border-border px-4 py-3 last:border-0", !m.activo && "opacity-60")}>
                <div className="flex flex-col">
                  <button disabled={i === 0} onClick={() => void mover(i, -1)} className="text-muted-foreground disabled:opacity-30" aria-label="Subir">
                    <ArrowUp className="h-4 w-4" />
                  </button>
                  <button disabled={i === lista.length - 1} onClick={() => void mover(i, 1)} className="text-muted-foreground disabled:opacity-30" aria-label="Bajar">
                    <ArrowDown className="h-4 w-4" />
                  </button>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 font-semibold text-card-foreground">
                    {m.titulo}
                    {m.solo_admin ? <Lock className="h-3.5 w-3.5 text-muted-foreground" aria-label="Solo administradores" /> : null}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {[m.texto ? "Texto" : null, m.archivos.filter((a) => a.tipo === "imagen").length ? `${m.archivos.filter((a) => a.tipo === "imagen").length} foto(s)` : null, m.archivos.some((a) => a.tipo === "documento") ? "PDF" : null]
                      .filter(Boolean)
                      .join(" · ")}
                    {" · "}Usado {m.usos} {m.usos === 1 ? "vez" : "veces"}
                    {m.ultimo_uso ? `, la última el ${fechaHora(m.ultimo_uso)}` : ""}
                  </p>
                </div>
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Switch checked={m.activo} onCheckedChange={() => void alternar(m)} /> Visible
                </label>
                <Button variant="outline" size="sm" onClick={() => setF({ ...m, descripcion: m.descripcion ?? "", texto: m.texto ?? "" })}>
                  Editar
                </Button>
                <button onClick={() => void borrar(m)} className="text-destructive" aria-label="Quitar">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Vista previa del menú */}
        <div className="space-y-3">
          <h2 className="text-base">Así lo ve el vendedor</h2>
          <div className="rounded-md border border-border bg-[#efeae2] p-3">
            <div className="rounded-lg bg-white p-3 text-sm text-[#111b21] shadow-sm">
              <p>
                Luis, ¿qué desea hacer? Elija una opción del menú.
                <br />
                <br />
                Puede abrir este menú cuando quiera escribiendo <b>comandos</b>.
              </p>
              <p className="mt-2 border-t border-[#e9edef] pt-2 text-center font-semibold text-[#00a884]">Ver menú</p>
            </div>
            <div className="mt-3 rounded-lg bg-white p-3 text-sm shadow-sm">
              {[
                ...FIJAS,
                ...activos.slice(0, enPrimera).map((m) => ({ seccion: "Material de venta", titulo: m.titulo, admin: m.solo_admin })),
                ...(activos.length > enPrimera ? [{ seccion: "Material de venta", titulo: "Más material…" }] : []),
              ].map((o, i, arr) => (
                <div key={`${o.titulo}-${i}`}>
                  {i === 0 || arr[i - 1]!.seccion !== o.seccion ? (
                    <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-[#008069] first:mt-0">{o.seccion}</p>
                  ) : null}
                  <p className="flex items-center gap-1.5 border-b border-[#f0f2f5] py-1.5 text-[#111b21]">
                    {o.titulo}
                    {"admin" in o && o.admin ? <Lock className="h-3 w-3 text-[#667781]" /> : null}
                  </p>
                </div>
              ))}
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            El candado indica material que solo ven los administradores. Los vendedores también pueden escribir atajos como{" "}
            <code>0045 vendido 12500</code>.
          </p>
        </div>
      </div>
    </div>
  );
}
