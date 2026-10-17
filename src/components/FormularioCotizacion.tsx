// Formulario para hacer una cotización desde el panel. Genera el mismo PDF que el bot (pdf-lib en el navegador),
// lo sube a Storage y lo guarda en la tabla cotizaciones.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Lock, Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { CATEGORIA_SERVICIOS } from "@/lib/bot/equipos";
import { costoDe, empresaDe, importe, pesos, totalDe, type Iva, type Partida } from "@/lib/cotizaciones/datos";
import { generarPdfCotizacion } from "@/lib/cotizaciones/pdf";
import { claves, traerConfiguracion, traerServicios, traerSolicitudes, traerUsuarios } from "@/lib/datos";

type Equipo = {
  id: string;
  clave: string;
  nombre: string;
  categoria: string;
  fotos: Array<{ url: string }>;
  precio: number | null;
  costo: number | null;
  marca: string | null;
  modelo: string | null;
  capacidad: string | null;
  dimensiones: string | null;
  peso: string | null;
  alimentacion: string | null;
  consumo: string | null;
  incluye: string | null;
};

type Fila = { clave: string; equipo_id: string | null; concepto: string; cantidad: string; precio: string; costo: number | null };

/** Descarga un PDF sin abrir pestañas nuevas (algunos navegadores, como Brave, bloquean las pestañas con archivos). */
export function descargarPdf(bytes: Uint8Array | Blob, nombre: string) {
  const blob = bytes instanceof Blob ? bytes : new Blob([bytes as BlobPart], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre.endsWith(".pdf") ? nombre : `${nombre}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

const filaVacia = (): Fila => ({ clave: crypto.randomUUID(), equipo_id: null, concepto: "", cantidad: "1", precio: "", costo: null });
const num = (t: string) => {
  const n = Number(t.replace(/[$,\s]/g, ""));
  return t.trim() && Number.isFinite(n) ? n : null;
};

export function FormularioCotizacion({ solicitudInicial, alTerminar }: { solicitudInicial?: string | undefined; alTerminar: () => void }) {
  const qc = useQueryClient();
  const equiposQ = useQuery({
    queryKey: ["equipos_catalogo"],
    queryFn: async () => {
      const { data, error } = await supabase.from("equipos_catalogo").select("*").eq("activo", true).order("orden");
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as Equipo[];
    },
  });
  const solicitudes = useQuery({ queryKey: claves.solicitudes, queryFn: traerSolicitudes });
  const usuarios = useQuery({ queryKey: claves.usuarios, queryFn: traerUsuarios });
  const config = useQuery({ queryKey: claves.configuracion, queryFn: traerConfiguracion });
  const servicios = useQuery({ queryKey: claves.servicios, queryFn: traerServicios });
  const yo = useQuery({ queryKey: ["yo"], queryFn: async () => (await supabase.auth.getUser()).data.user?.id ?? null });

  const [solicitudId, setSolicitudId] = useState<string>(solicitudInicial ?? "");
  const [cliente, setCliente] = useState({ nombre: "", telefono: "", atencion: "", correo: "", proyecto: "" });
  const [vendedorId, setVendedorId] = useState<string>("");
  const [filas, setFilas] = useState<Fila[]>([filaVacia()]);
  const [principalId, setPrincipalId] = useState<string | null>(null);
  const [iva, setIva] = useState<Iva>(null);
  const [conMarca, setConMarca] = useState(false);
  const [generando, setGenerando] = useState(false);
  const [resultado, setResultado] = useState<{ folio: string; url: string; aviso: string | null; bytes: Uint8Array } | null>(null);
  const [previa, setPrevia] = useState<{ url: string; bytes: Uint8Array } | null>(null);
  const nombreArchivo = (folio: string) => `${folio} ${cliente.nombre}`.replace(/[^\p{L}\p{N} -]/gu, "").trim();

  const equipos = equiposQ.data ?? [];
  const abiertas = (solicitudes.data ?? []).filter((s) => [1, 2, 3].includes(s.etapa) && !s.es_ejemplo);

  // Vendedor por defecto: el usuario actual (o el asignado al prospecto).
  useEffect(() => {
    if (!vendedorId && yo.data) setVendedorId(yo.data);
  }, [yo.data, vendedorId]);

  // Al elegir un prospecto se llenan los datos del cliente.
  useEffect(() => {
    const s = (solicitudes.data ?? []).find((x) => x.id === solicitudId);
    if (!s) return;
    const srv = servicios.data?.find((x) => x.codigo === s.servicio_codigo)?.nombre;
    setCliente((c) => ({
      ...c,
      nombre: s.contactos?.nombre ?? c.nombre,
      telefono: s.contactos?.telefono && !s.contactos.telefono.startsWith("sim-") ? s.contactos.telefono : c.telefono,
      proyecto: [srv, s.contactos?.municipio].filter(Boolean).join(" – ") || c.proyecto,
    }));
    if (s.vendedor_id) setVendedorId(s.vendedor_id);
  }, [solicitudId, solicitudes.data, servicios.data]);

  const partidas: Partida[] = filas
    .map((f) => ({ equipo_id: f.equipo_id, concepto: f.concepto.trim(), cantidad: num(f.cantidad) ?? 0, precio: num(f.precio) ?? 0, costo: f.costo }))
    .filter((p) => p.concepto && p.cantidad > 0);
  const total = totalDe(partidas);
  const conCosto = partidas.filter((p) => p.costo != null);
  const ganancia = conCosto.length ? totalDe(conCosto) - (costoDe(conCosto) ?? 0) : null;

  // El equipo principal es el primero del catálogo que no sea servicio (o el que elija).
  const candidatos = useMemo(
    () => filas.map((f) => equipos.find((e) => e.id === f.equipo_id)).filter((e): e is Equipo => !!e && e.categoria !== CATEGORIA_SERVICIOS),
    [filas, equipos],
  );
  const principal = candidatos.find((e) => e.id === principalId) ?? candidatos[0] ?? null;

  function elegirDelCatalogo(i: number, id: string) {
    const e = equipos.find((x) => x.id === id);
    setFilas((fs) =>
      fs.map((f, j) =>
        j !== i
          ? f
          : e
            ? {
                ...f,
                equipo_id: e.id,
                concepto: e.categoria === CATEGORIA_SERVICIOS ? e.nombre : `${e.clave} · ${e.nombre}`,
                precio: e.precio != null ? String(e.precio) : f.precio,
                costo: e.costo != null ? Number(e.costo) : null,
              }
            : { ...f, equipo_id: null, costo: null },
      ),
    );
  }

  async function armarPdf(folio: string) {
    const empresa = { ...empresaDe(config.data ?? {}), servicios: (servicios.data ?? []).filter((s) => s.activo).map((s) => s.nombre) };
    let foto: Uint8Array | null = null;
    const url = principal?.fotos?.[0]?.url;
    if (url) {
      try {
        const r = await fetch(url);
        if (r.ok) foto = new Uint8Array(await r.arrayBuffer());
      } catch {
        foto = null;
      }
    }
    return generarPdfCotizacion({
      folio,
      fecha: new Date(),
      empresa,
      atiende: usuarios.data?.find((u) => u.id === vendedorId)?.nombre ?? "",
      cliente: {
        nombre: cliente.nombre.trim(),
        atencion: cliente.atencion.trim() || null,
        proyecto: cliente.proyecto.trim() || null,
        telefono: cliente.telefono.trim() || null,
        correo: cliente.correo.trim() || null,
      },
      equipo: principal,
      foto,
      partidas,
      conMarca,
      iva,
    });
  }

  function validar() {
    if (!cliente.nombre.trim()) return "Escriba el nombre del cliente.";
    if (!vendedorId) return "Elija quién atiende.";
    if (!partidas.length) return "Agregue al menos un concepto con cantidad.";
    if (filas.some((f) => f.concepto.trim() && num(f.precio) == null)) return "Escriba el precio de todos los conceptos.";
    return null;
  }

  async function vistaPrevia() {
    const error = validar();
    if (error) return void toast.error(error);
    try {
      const bytes = await armarPdf("COT-BORRADOR");
      if (previa) URL.revokeObjectURL(previa.url);
      setPrevia({ url: URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/pdf" })), bytes });
    } catch (e) {
      toast.error(`No se pudo armar la vista previa: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  async function generar() {
    const error = validar();
    if (error) return void toast.error(error);
    setGenerando(true);
    try {
      const { data: cot, error: e1 } = await supabase
        .from("cotizaciones")
        .insert({
          solicitud_id: solicitudId || null,
          vendedor_id: vendedorId,
          cliente_nombre: cliente.nombre.trim(),
          cliente_telefono: cliente.telefono.trim() || null,
          atencion: cliente.atencion.trim() || null,
          correo: cliente.correo.trim() || null,
          proyecto: cliente.proyecto.trim() || null,
          equipo_principal_id: principal?.id ?? null,
          partidas: partidas as unknown as Json,
          con_marca: conMarca,
          iva,
          total,
          costo_total: costoDe(partidas),
        })
        .select("id, folio")
        .single();
      if (e1 || !cot) throw new Error(e1?.message ?? "No se pudo guardar.");
      const bytes = await armarPdf(cot.folio);
      const ruta = `cotizaciones/${cot.folio}-${crypto.randomUUID().slice(0, 8)}.pdf`;
      const { error: e2 } = await supabase.storage.from("media").upload(ruta, bytes, { contentType: "application/pdf" });
      if (e2) throw new Error(e2.message);
      const url = supabase.storage.from("media").getPublicUrl(ruta).data.publicUrl;
      await supabase.from("cotizaciones").update({ pdf_url: url }).eq("id", cot.id);
      if (solicitudId) await supabase.from("solicitudes").update({ etapa: 2 }).eq("id", solicitudId).eq("etapa", 1);
      const sinCosto = partidas.filter((p) => p.costo == null).length;
      setResultado({
        folio: cot.folio,
        url,
        bytes,
        aviso:
          ganancia != null
            ? `Ganancia aproximada ${pesos(ganancia)}${sinCosto ? ` (sin contar ${sinCosto} concepto(s) sin costo registrado)` : ""}. No aparece en el PDF.`
            : null,
      });
      qc.invalidateQueries({ queryKey: ["cotizaciones"] });
      qc.invalidateQueries({ queryKey: claves.solicitudes });
      toast.success(`Cotización ${cot.folio} lista`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo generar la cotización.");
    } finally {
      setGenerando(false);
    }
  }

  if (resultado) {
    return (
      <div className="space-y-3 rounded-md border border-border bg-card p-5">
        <h2 className="text-base">Cotización {resultado.folio} lista</h2>
        <p className="text-sm text-muted-foreground">Revísela antes de enviarla al cliente.</p>
        {resultado.aviso ? (
          <p className="flex items-center gap-1.5 rounded-md bg-muted p-3 text-sm">
            <Lock className="h-4 w-4 shrink-0" /> {resultado.aviso}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => descargarPdf(resultado.bytes, nombreArchivo(resultado.folio))}>Descargar PDF</Button>
          <Button variant="outline" onClick={alTerminar}>
            Cerrar
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 rounded-md border border-border bg-card p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-base">Nueva cotización</h2>
        <Button variant="ghost" size="sm" onClick={alTerminar}>
          Cancelar
        </Button>
      </div>

      {/* Cliente */}
      <div className="grid gap-4 md:grid-cols-3">
        <div className="md:col-span-2">
          <Label>Prospecto (opcional)</Label>
          <select className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm" value={solicitudId} onChange={(e) => setSolicitudId(e.target.value)}>
            <option value="">Cliente sin prospecto</option>
            {abiertas.map((s) => (
              <option key={s.id} value={s.id}>
                {s.codigo} · {s.contactos?.nombre ?? "Sin nombre"} · {s.contactos?.municipio ?? ""}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label>Atiende</Label>
          <select className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm" value={vendedorId} onChange={(e) => setVendedorId(e.target.value)}>
            <option value="">Elegir…</option>
            {(usuarios.data ?? []).filter((u) => u.activo).map((u) => (
              <option key={u.id} value={u.id}>
                {u.nombre}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label>Cliente / empresa</Label>
          <Input value={cliente.nombre} onChange={(e) => setCliente({ ...cliente, nombre: e.target.value })} />
        </div>
        <div>
          <Label>Teléfono</Label>
          <Input value={cliente.telefono} onChange={(e) => setCliente({ ...cliente, telefono: e.target.value })} />
        </div>
        <div>
          <Label>Atención a (opcional)</Label>
          <Input value={cliente.atencion} onChange={(e) => setCliente({ ...cliente, atencion: e.target.value })} />
        </div>
        <div className="md:col-span-2">
          <Label>Proyecto</Label>
          <Input value={cliente.proyecto} placeholder="Instalación de portón corredizo – Texcoco" onChange={(e) => setCliente({ ...cliente, proyecto: e.target.value })} />
        </div>
        <div>
          <Label>Correo (opcional)</Label>
          <Input value={cliente.correo} onChange={(e) => setCliente({ ...cliente, correo: e.target.value })} />
        </div>
      </div>

      {/* Conceptos */}
      <div className="space-y-2">
        <Label>Conceptos</Label>
        <div className="hidden grid-cols-[14rem_1fr_5rem_8rem_8rem_2rem] gap-2 text-xs text-muted-foreground md:grid">
          <span>Del catálogo</span>
          <span>Concepto</span>
          <span>Cant.</span>
          <span>P. unitario</span>
          <span className="text-right">Importe</span>
          <span />
        </div>
        {filas.map((f, i) => {
          const p = { cantidad: num(f.cantidad) ?? 0, precio: num(f.precio) ?? 0, concepto: f.concepto };
          return (
            <div key={f.clave} className="grid gap-2 md:grid-cols-[14rem_1fr_5rem_8rem_8rem_2rem] md:items-center">
              <select
                className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                value={f.equipo_id ?? ""}
                onChange={(e) => elegirDelCatalogo(i, e.target.value)}
              >
                <option value="">Concepto a mano</option>
                <optgroup label="Equipos">
                  {equipos.filter((e) => e.categoria !== CATEGORIA_SERVICIOS).map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.clave} · {e.nombre}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Servicios y extras">
                  {equipos.filter((e) => e.categoria === CATEGORIA_SERVICIOS).map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.nombre}
                    </option>
                  ))}
                </optgroup>
              </select>
              <Input value={f.concepto} placeholder="Fabricación de portón elevadizo 3 x 2.4 m" onChange={(e) => setFilas((fs) => fs.map((x, j) => (j === i ? { ...x, concepto: e.target.value } : x)))} />
              <Input inputMode="numeric" value={f.cantidad} onChange={(e) => setFilas((fs) => fs.map((x, j) => (j === i ? { ...x, cantidad: e.target.value } : x)))} />
              <Input inputMode="decimal" value={f.precio} placeholder="0" onChange={(e) => setFilas((fs) => fs.map((x, j) => (j === i ? { ...x, precio: e.target.value } : x)))} />
              <span className="text-right text-sm tabular-nums">{pesos(importe(p))}</span>
              <button className="text-destructive disabled:opacity-30" disabled={filas.length === 1} onClick={() => setFilas((fs) => fs.filter((_, j) => j !== i))} aria-label="Quitar">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          );
        })}
        <Button variant="outline" size="sm" onClick={() => setFilas((fs) => [...fs, filaVacia()])}>
          <Plus className="mr-1 h-4 w-4" /> Agregar concepto
        </Button>
      </div>

      {/* Opciones */}
      <div className="grid gap-4 md:grid-cols-3">
        <div>
          <Label>Equipo con foto y ficha técnica</Label>
          <select
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={principal?.id ?? ""}
            onChange={(e) => setPrincipalId(e.target.value || null)}
            disabled={!candidatos.length}
          >
            {candidatos.length ? null : <option value="">Sin equipo del catálogo</option>}
            {candidatos.map((e) => (
              <option key={e.id} value={e.id}>
                {e.clave}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label>IVA</Label>
          <select
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={iva ?? ""}
            onChange={(e) => setIva(e.target.value === "incluye" ? "incluye" : e.target.value === "mas" ? "mas" : null)}
          >
            <option value="">No mencionar</option>
            <option value="incluye">Precios con IVA incluido</option>
            <option value="mas">Precios más IVA</option>
          </select>
        </div>
        <label className="flex items-center gap-2 self-end pb-2 text-sm">
          <Switch checked={conMarca} onCheckedChange={setConMarca} /> Con marca y modelo (al cerrar la venta)
        </label>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        <div>
          <p className="text-lg font-semibold">Total: {pesos(total)}</p>
          {ganancia != null ? (
            <p className="flex items-center gap-1 text-xs text-muted-foreground">
              <Lock className="h-3.5 w-3.5" /> Ganancia aproximada {pesos(ganancia)} (no aparece en el PDF)
            </p>
          ) : null}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" disabled={generando} onClick={() => void vistaPrevia()}>
            Vista previa
          </Button>
          <Button disabled={generando} onClick={() => void generar()}>
            {generando ? "Generando…" : "Guardar y generar PDF"}
          </Button>
        </div>
      </div>

      {previa ? (
        <div className="space-y-2 border-t border-border pt-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">Vista previa (todavía no se guarda)</p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => descargarPdf(previa.bytes, nombreArchivo("Vista previa"))}>
                Descargar
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setPrevia(null)}>
                Cerrar
              </Button>
            </div>
          </div>
          <iframe title="Vista previa de la cotización" src={previa.url} className="h-[75vh] w-full rounded-md border border-border bg-white" />
          <p className="text-xs text-muted-foreground">Si no se ve aquí, use Descargar: algunos navegadores no muestran PDF dentro de la página.</p>
        </div>
      ) : null}
    </div>
  );
}
