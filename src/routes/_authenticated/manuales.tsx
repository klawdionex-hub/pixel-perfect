import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowDown, ArrowUp, FileText, Plus, RefreshCw, Trash2, Upload } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { EncabezadoPagina } from "@/components/AppLayout";
import { descargarPdf } from "@/components/FormularioCotizacion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { fechaHora } from "@/lib/afpam";
import { analizarManual } from "@/lib/bot.functions";
import { cabeza } from "@/lib/cabeza";
import { PROCEDIMIENTOS, TIPOS_MANUAL, nombreManual } from "@/lib/manuales/datos";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/manuales")({
  head: () => cabeza("Manuales técnicos", "Manuales de los equipos: la IA encuentra los procedimientos y los vendedores los piden desde el bot."),
  component: Pagina,
});

type Manual = {
  id: string;
  tipo: string;
  marca: string | null;
  modelo: string | null;
  frecuencia: string | null;
  tipo_codigo: string | null;
  pdf_url: string;
  pdf_nombre: string | null;
  paginas: number | null;
  estado: string;
  error: string | null;
  usos: number;
  actualizado_en: string;
};
type Proc = {
  id?: string;
  clave: string | null;
  titulo: string;
  pasos: string;
  pagina_inicio: number | null;
  pagina_fin: number | null;
  activo: boolean;
  orden: number;
  usos?: number;
};

const CLAVE = ["manuales"];

/** Extrae el texto de cada página del PDF en el navegador (pdf.js). */
async function extraerTexto(datos: ArrayBuffer, alAvanzar: (pagina: number, total: number) => void): Promise<string[]> {
  const pdfjs = await import("pdfjs-dist");
  const worker = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = worker;
  const doc = await pdfjs.getDocument({ data: new Uint8Array(datos) }).promise;
  const paginas: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    alAvanzar(i, doc.numPages);
    const pag = await doc.getPage(i);
    const contenido = await pag.getTextContent();
    paginas.push(
      contenido.items
        .map((x) => ("str" in x ? x.str : ""))
        .join(" ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 19000),
    );
  }
  return paginas;
}

const ETIQUETA_ESTADO: Record<string, { texto: string; clase: string }> = {
  leyendo: { texto: "Leyendo con IA…", clase: "bg-primary/20 text-foreground" },
  borrador: { texto: "Por revisar", clase: "bg-etapa-negociando/20 text-foreground" },
  publicado: { texto: "Publicado en el bot", clase: "bg-etapa-cliente text-white" },
  error: { texto: "Error al leer", clase: "bg-destructive/15 text-destructive" },
};

function Pagina() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: CLAVE,
    queryFn: async () => {
      const { data, error } = await supabase.from("manuales").select("*").order("actualizado_en", { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as Manual[];
    },
    retry: false,
  });
  const conteos = useQuery({
    queryKey: ["manual_procedimientos", "conteo"],
    queryFn: async () => {
      const { data } = await supabase.from("manual_procedimientos").select("manual_id, activo");
      const m = new Map<string, number>();
      for (const p of data ?? []) if (p.activo) m.set(p.manual_id, (m.get(p.manual_id) ?? 0) + 1);
      return m;
    },
  });
  const analizar = useServerFn(analizarManual);
  const [abierto, setAbierto] = useState<string | null>(null);
  const [progreso, setProgreso] = useState<string | null>(null);
  const recargar = () => {
    void qc.invalidateQueries({ queryKey: CLAVE });
    void qc.invalidateQueries({ queryKey: ["manual_procedimientos"] });
  };

  /** Lee el PDF con la IA y deja los procedimientos como borrador. */
  async function leer(manualId: string, datos: ArrayBuffer) {
    setProgreso("Leyendo el PDF…");
    try {
      const paginas = await extraerTexto(datos, (i, n) => setProgreso(`Leyendo la página ${i} de ${n}…`));
      if (paginas.join("").length < 300) {
        await supabase.from("manuales").update({ estado: "error", error: "El PDF casi no tiene texto (¿es escaneado?). Por ahora solo se leen PDF digitales." }).eq("id", manualId);
        toast.error("El PDF casi no tiene texto. Por ahora solo se leen PDF digitales.");
        return;
      }
      setProgreso("La inteligencia artificial está buscando los procedimientos… (puede tardar un minuto)");
      const r = await analizar({ data: { manualId, paginas } });
      if (r.ok) toast.success(`Listo: se encontraron ${r.procedimientos} procedimiento(s). Revíselos y publique.`);
      else toast.error(r.error, { duration: 12000 });
      setAbierto(manualId);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo leer el manual.");
    } finally {
      setProgreso(null);
      recargar();
    }
  }

  async function subir(archivo: File) {
    if (archivo.type !== "application/pdf") return void toast.error("Suba el manual en PDF.");
    if (archivo.size > 100 * 1024 * 1024) return void toast.error("El PDF debe pesar menos de 100 MB (límite de WhatsApp).");
    setProgreso("Subiendo el PDF…");
    const ruta = `manuales/${crypto.randomUUID()}.pdf`;
    const { error } = await supabase.storage.from("media").upload(ruta, archivo, { contentType: "application/pdf" });
    if (error) {
      setProgreso(null);
      return void toast.error(error.message);
    }
    const url = supabase.storage.from("media").getPublicUrl(ruta).data.publicUrl;
    const { data: m, error: e2 } = await supabase
      .from("manuales")
      .insert({ pdf_url: url, pdf_nombre: archivo.name, estado: "leyendo" })
      .select("id")
      .single();
    if (e2 || !m) {
      setProgreso(null);
      return void toast.error(e2?.message ?? "No se pudo guardar el manual.");
    }
    recargar();
    await leer(m.id, await archivo.arrayBuffer());
  }

  const faltaTabla = q.error && /manuales|relation|schema cache/i.test(q.error.message);
  const lista = q.data ?? [];

  return (
    <div>
      <EncabezadoPagina
        titulo="Manuales técnicos"
        descripcion="Suba el PDF: la IA encuentra los procedimientos, usted los revisa y al publicarlo los vendedores los piden desde el bot."
      />
      <div className="space-y-6 p-8">
        {faltaTabla ? (
          <p className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm">
            Falta crear las tablas de manuales. Pegue el SQL de la migración <b>20261025120000_manuales</b> en el SQL editor.
          </p>
        ) : null}

        <label
          className={cn(
            "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed border-border bg-card p-8 text-center hover:bg-muted",
            progreso && "pointer-events-none opacity-70",
          )}
        >
          <Upload className="h-6 w-6 text-muted-foreground" />
          <span className="font-semibold">{progreso ?? "Haga clic para subir el manual en PDF"}</span>
          <span className="text-xs text-muted-foreground">PDF digital, hasta 100 MB. La IA lo lee y propone los procedimientos.</span>
          <input type="file" accept="application/pdf" className="hidden" disabled={!!progreso} onChange={(e) => e.target.files?.[0] && void subir(e.target.files[0])} />
        </label>

        <div className="overflow-hidden rounded-md border border-border bg-card">
          {lista.length === 0 ? <p className="p-6 text-sm text-muted-foreground">Todavía no hay manuales.</p> : null}
          {lista.map((m) => {
            const est = ETIQUETA_ESTADO[m.estado] ?? ETIQUETA_ESTADO["borrador"]!;
            return (
              <div key={m.id} className="border-b border-border last:border-0">
                <button
                  onClick={() => setAbierto(abierto === m.id ? null : m.id)}
                  className={cn("flex w-full flex-wrap items-center gap-3 px-4 py-3 text-left hover:bg-muted/60", abierto === m.id && "bg-muted/60")}
                >
                  <FileText className="h-5 w-5 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{nombreManual(m)}</span>
                    <span className="block text-xs text-muted-foreground">
                      {m.tipo} · {conteos.data?.get(m.id) ?? 0} procedimiento(s) · consultado {m.usos} {m.usos === 1 ? "vez" : "veces"} · {fechaHora(m.actualizado_en)}
                    </span>
                  </span>
                  <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold", est.clase)}>{est.texto}</span>
                </button>
                {abierto === m.id ? (
                  <Editor
                    manual={m}
                    ocupado={!!progreso}
                    alReleer={async () => {
                      const r = await fetch(m.pdf_url);
                      await leer(m.id, await r.arrayBuffer());
                    }}
                    alCambiar={recargar}
                    alBorrar={() => {
                      setAbierto(null);
                      recargar();
                    }}
                  />
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Editor({
  manual,
  ocupado,
  alReleer,
  alCambiar,
  alBorrar,
}: {
  manual: Manual;
  ocupado: boolean;
  alReleer: () => Promise<void>;
  alCambiar: () => void;
  alBorrar: () => void;
}) {
  const procsQ = useQuery({
    queryKey: ["manual_procedimientos", manual.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("manual_procedimientos").select("*").eq("manual_id", manual.id).order("orden");
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as Proc[];
    },
  });
  const [datos, setDatos] = useState({ tipo: manual.tipo, marca: manual.marca ?? "", modelo: manual.modelo ?? "", frecuencia: manual.frecuencia ?? "", tipo_codigo: manual.tipo_codigo ?? "" });
  const [procs, setProcs] = useState<Proc[]>([]);
  const [borrados, setBorrados] = useState<string[]>([]);
  const [guardando, setGuardando] = useState(false);
  useEffect(() => {
    if (procsQ.data) {
      setProcs(procsQ.data);
      setBorrados([]);
    }
  }, [procsQ.data]);
  useEffect(() => {
    setDatos({ tipo: manual.tipo, marca: manual.marca ?? "", modelo: manual.modelo ?? "", frecuencia: manual.frecuencia ?? "", tipo_codigo: manual.tipo_codigo ?? "" });
  }, [manual]);

  const cambiar = (i: number, c: Partial<Proc>) => setProcs((ps) => ps.map((p, j) => (j === i ? { ...p, ...c } : p)));
  const mover = (i: number, d: -1 | 1) =>
    setProcs((ps) => {
      const n = [...ps];
      const [x] = n.splice(i, 1);
      n.splice(i + d, 0, x!);
      return n;
    });

  async function guardar(estado?: string) {
    setGuardando(true);
    const limpio = (t: string) => t.trim() || null;
    const { error } = await supabase
      .from("manuales")
      .update({
        tipo: datos.tipo,
        marca: limpio(datos.marca),
        modelo: limpio(datos.modelo),
        frecuencia: limpio(datos.frecuencia),
        tipo_codigo: limpio(datos.tipo_codigo),
        ...(estado ? { estado } : {}),
        actualizado_en: new Date().toISOString(),
      })
      .eq("id", manual.id);
    if (!error && borrados.length) await supabase.from("manual_procedimientos").delete().in("id", borrados);
    for (const [i, p] of procs.entries()) {
      const fila = {
        manual_id: manual.id,
        clave: p.clave,
        titulo: p.titulo.trim() || "Procedimiento",
        pasos: p.pasos.trim(),
        pagina_inicio: p.pagina_inicio,
        pagina_fin: p.pagina_fin,
        activo: p.activo,
        orden: i + 1,
        // Si cambian las páginas, el recorte se vuelve a generar.
        paginas_url: null,
      };
      if (p.id) await supabase.from("manual_procedimientos").update(fila).eq("id", p.id);
      else await supabase.from("manual_procedimientos").insert(fila);
    }
    setGuardando(false);
    if (error) return void toast.error(error.message);
    toast.success(estado === "publicado" ? "Publicado: los vendedores ya lo ven en el bot" : estado === "borrador" ? "Quitado del bot" : "Cambios guardados");
    alCambiar();
    void procsQ.refetch();
  }

  async function borrar() {
    if (!confirm(`¿Borrar el manual "${nombreManual(manual)}" y sus procedimientos? Esta acción no se puede deshacer.`)) return;
    const { error } = await supabase.from("manuales").delete().eq("id", manual.id);
    if (error) return void toast.error(error.message);
    toast.success("Manual borrado");
    alBorrar();
  }

  const numero = (t: string) => (t.trim() && Number.isFinite(Number(t)) ? Math.max(1, Math.round(Number(t))) : null);

  return (
    <div className="space-y-5 border-t border-border bg-background px-4 py-5">
      {manual.estado === "error" && manual.error ? <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{manual.error}</p> : null}
      {manual.estado === "leyendo" ? <p className="text-sm text-muted-foreground">La inteligencia artificial está leyendo el manual…</p> : null}

      <div className="grid gap-4 md:grid-cols-5">
        <div>
          <Label>Tipo de equipo</Label>
          <select className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm" value={datos.tipo} onChange={(e) => setDatos({ ...datos, tipo: e.target.value })}>
            {TIPOS_MANUAL.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </div>
        <div>
          <Label>Marca</Label>
          <Input value={datos.marca} onChange={(e) => setDatos({ ...datos, marca: e.target.value })} />
        </div>
        <div>
          <Label>Modelo</Label>
          <Input value={datos.modelo} onChange={(e) => setDatos({ ...datos, modelo: e.target.value })} />
        </div>
        <div>
          <Label>Frecuencia</Label>
          <Input value={datos.frecuencia} placeholder="433.92 MHz" onChange={(e) => setDatos({ ...datos, frecuencia: e.target.value })} />
        </div>
        <div>
          <Label>Tipo de código</Label>
          <Input value={datos.tipo_codigo} placeholder="Código variable" onChange={(e) => setDatos({ ...datos, tipo_codigo: e.target.value })} />
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Procedimientos que verá el vendedor</h3>
          <span className="text-xs text-muted-foreground">Un paso por renglón. Apague los que no quiera mostrar.</span>
        </div>
        {procs.length === 0 && !procsQ.isLoading ? <p className="text-sm text-muted-foreground">No hay procedimientos. Agregue uno o vuelva a leer con IA.</p> : null}
        {procs.map((p, i) => (
          <div key={p.id ?? `nuevo-${i}`} className={cn("space-y-2 rounded-md border border-border bg-card p-3", !p.activo && "opacity-60")}>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex flex-col">
                <button disabled={i === 0} onClick={() => mover(i, -1)} className="text-muted-foreground disabled:opacity-30" aria-label="Subir">
                  <ArrowUp className="h-4 w-4" />
                </button>
                <button disabled={i === procs.length - 1} onClick={() => mover(i, 1)} className="text-muted-foreground disabled:opacity-30" aria-label="Bajar">
                  <ArrowDown className="h-4 w-4" />
                </button>
              </div>
              <Input className="max-w-xs font-semibold" maxLength={24} value={p.titulo} onChange={(e) => cambiar(i, { titulo: e.target.value })} />
              <Label className="ml-2 text-xs">Página</Label>
              <Input className="w-16" inputMode="numeric" value={p.pagina_inicio ?? ""} onChange={(e) => cambiar(i, { pagina_inicio: numero(e.target.value) })} />
              <span className="text-xs">a</span>
              <Input className="w-16" inputMode="numeric" value={p.pagina_fin ?? ""} onChange={(e) => cambiar(i, { pagina_fin: numero(e.target.value) })} />
              <label className="ml-auto flex items-center gap-2 text-xs">
                <Switch checked={p.activo} onCheckedChange={(v) => cambiar(i, { activo: v })} /> En el bot
              </label>
              <button
                onClick={() => {
                  if (p.id) setBorrados((b) => [...b, p.id!]);
                  setProcs((ps) => ps.filter((_, j) => j !== i));
                }}
                className="text-destructive"
                aria-label="Quitar"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
            <Textarea rows={Math.min(10, Math.max(3, p.pasos.split("\n").length + 1))} value={p.pasos} onChange={(e) => cambiar(i, { pasos: e.target.value })} />
            {p.usos ? <p className="text-xs text-muted-foreground">Consultado {p.usos} {p.usos === 1 ? "vez" : "veces"}</p> : null}
          </div>
        ))}
        <div className="flex flex-wrap items-center gap-2">
          <select
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            value=""
            onChange={(e) => {
              const def = PROCEDIMIENTOS.find((d) => d.clave === e.target.value);
              setProcs((ps) => [...ps, { clave: def?.clave ?? null, titulo: def?.titulo ?? "Otro procedimiento", pasos: "", pagina_inicio: null, pagina_fin: null, activo: true, orden: ps.length + 1 }]);
            }}
          >
            <option value="">+ Agregar procedimiento…</option>
            {PROCEDIMIENTOS.map((d) => (
              <option key={d.clave} value={d.clave}>
                {d.titulo}
              </option>
            ))}
            <option value="otro">Otro</option>
          </select>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 border-t border-border pt-4">
        <Button disabled={guardando || ocupado} onClick={() => void guardar()}>
          {guardando ? "Guardando…" : "Guardar cambios"}
        </Button>
        {manual.estado === "publicado" ? (
          <Button variant="outline" disabled={guardando || ocupado} onClick={() => void guardar("borrador")}>
            Quitar del bot
          </Button>
        ) : (
          <Button variant="outline" className="border-etapa-cliente text-etapa-cliente" disabled={guardando || ocupado || !procs.some((p) => p.activo)} onClick={() => void guardar("publicado")}>
            <Plus className="mr-1 h-4 w-4" /> Publicar en el bot
          </Button>
        )}
        <Button variant="outline" disabled={ocupado} onClick={() => void alReleer()}>
          <RefreshCw className="mr-1 h-4 w-4" /> Volver a leer con IA
        </Button>
        <Button
          variant="ghost"
          onClick={async () => {
            const r = await fetch(manual.pdf_url);
            descargarPdf(await r.blob(), manual.pdf_nombre ?? "manual.pdf");
          }}
        >
          Descargar PDF
        </Button>
        <Button variant="ghost" className="ml-auto text-destructive" onClick={() => void borrar()}>
          Borrar manual
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        "Volver a leer con IA" reemplaza los procedimientos por una lectura nueva. Lo que publique es exactamente lo que verá el
        vendedor; revise tiempos, botones y valores con el PDF.
      </p>
    </div>
  );
}
