// Panel: precio del dólar, factores y tabla de precios en dólares de los portones elevadizos.
// Se guarda en configuracion.textos_extra (claves elev_*), que usan el bot y el formulario de cotización.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronDown } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { dolarDelDia } from "@/lib/bot.functions";
import { ALTOS_PIES, ANCHOS_PIES, calcularElevadizo, diasDelDolar, formulaDe, piesAMetros, type PrecioElevadizo } from "@/lib/cotizaciones/elevadizos";
import { pesos } from "@/lib/cotizaciones/datos";
import { claves, traerConfiguracion } from "@/lib/datos";
import { cn } from "@/lib/utils";

export function FormulaElevadizos() {
  const qc = useQueryClient();
  const config = useQuery({ queryKey: claves.configuracion, queryFn: traerConfiguracion });
  const f = formulaDe(config.data);
  const [abierto, setAbierto] = useState(false);
  const [dolar, setDolar] = useState("");
  const [incremento, setIncremento] = useState("");
  const [iva, setIva] = useState("");
  const [holgura, setHolgura] = useState("");
  const [tabla, setTabla] = useState<Record<string, string>>({});
  const [guardando, setGuardando] = useState(false);
  const [manual, setManual] = useState(false);
  const [consultando, setConsultando] = useState(false);
  const consultarFn = useServerFn(dolarDelDia);
  const extraActual = (config.data?.["textos_extra"] ?? {}) as Record<string, string>;

  async function consultar(forzar: boolean) {
    setConsultando(true);
    try {
      const r = await consultarFn({ data: { forzar } });
      if (!r.ok) toast.error("No se pudo consultar el precio del dólar. Intente más tarde o fije un precio.");
      await qc.invalidateQueries({ queryKey: claves.configuracion });
    } finally {
      setConsultando(false);
    }
  }

  // Al abrir la página se renueva el dólar automático si tiene más de 12 horas.
  useEffect(() => {
    void consultar(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!config.data) return;
    setManual(f.dolarModo === "manual");
    setDolar(extraActual["elev_dolar"] ?? "");
    setIncremento(String(f.incremento));
    setIva(String(f.iva));
    setHolgura(String(Math.round(f.holgura * 100)));
    setTabla(Object.fromEntries(f.tabla.map((x) => [`${x.ancho}x${x.alto}`, String(x.usd)])));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.data]);

  async function guardar() {
    const n = (t: string) => Number(t.replace(/[$,\s]/g, ""));
    if (manual && !(n(dolar) > 0)) return void toast.error("Escriba el precio fijo del dólar, por ejemplo 18.50.");
    const filas: PrecioElevadizo[] = [];
    for (const a of ANCHOS_PIES) for (const h of ALTOS_PIES) {
      const v = n(tabla[`${a}x${h}`] ?? "");
      if (v > 0) filas.push({ ancho: a, alto: h, usd: v });
    }
    const extra = { ...((config.data?.["textos_extra"] ?? {}) as Record<string, string>) };
    extra["elev_dolar_modo"] = manual ? "manual" : "auto";
    if (manual) {
      const anterior = extra["elev_dolar"];
      extra["elev_dolar"] = String(n(dolar));
      if (anterior !== extra["elev_dolar"] || !extra["elev_dolar_fecha"]) extra["elev_dolar_fecha"] = new Date().toISOString();
    }
    extra["elev_incremento"] = String(n(incremento) || 1.2);
    extra["elev_iva"] = String(n(iva) || 1.16);
    extra["elev_holgura_cm"] = String(n(holgura) >= 0 ? n(holgura) : 3);
    extra["elev_tabla"] = JSON.stringify(filas);
    setGuardando(true);
    const { error } = await supabase.from("configuracion").update({ textos_extra: extra } as never).eq("id", true);
    setGuardando(false);
    if (error) return void toast.error(error.message);
    toast.success("Fórmula de elevadizos guardada");
    qc.invalidateQueries({ queryKey: claves.configuracion });
  }

  const dias = diasDelDolar(f);
  const ejemplo = calcularElevadizo(f, 2.9, 2.1);

  return (
    <div className="rounded-md border border-border bg-card">
      <button onClick={() => setAbierto(!abierto)} className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left">
        <div>
          <p className="font-semibold text-card-foreground">Fórmula de elevadizos</p>
          <p className={cn("text-xs", f.dolar && (f.dolarModo === "auto" || (dias ?? 0) <= 7) ? "text-muted-foreground" : "text-destructive")}>
            {f.dolar
              ? f.dolarModo === "auto"
                ? `Dólar automático: ${pesos(f.dolar)}${f.dolarFecha ? ` · consultado ${new Date(f.dolarFecha).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" })}` : ""}`
                : `Dólar fijo: ${pesos(f.dolar)}${dias != null ? ` · capturado hace ${dias} día(s)` : ""}${(dias ?? 0) > 7 ? " · conviene actualizarlo" : ""}`
              : consultando
                ? "Consultando el precio del dólar…"
                : "No se pudo consultar el precio del dólar. Intente de nuevo o fije un precio."}
          </p>
        </div>
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", abierto && "rotate-180")} />
      </button>
      {abierto ? (
        <div className="space-y-4 border-t border-border px-4 py-4">
          <p className="text-sm text-muted-foreground">
            Precio al cliente = USD de la tabla × incremento × IVA × precio del dólar. El dólar se consulta solo cada día; si
            prefiere, fije un precio a mano. La medida del cliente se lleva a la medida de panel igual o mayor; si queda más justa
            que la holgura, se toma la siguiente.
          </p>
          <div className="flex flex-wrap items-center gap-4 rounded-md bg-muted/50 p-3 text-sm">
            <span>
              Automático: <b>{extraActual["elev_dolar_auto"] ? pesos(Number(extraActual["elev_dolar_auto"])) : "—"}</b>
              {extraActual["elev_dolar_fuente"] ? <span className="text-muted-foreground"> · {extraActual["elev_dolar_fuente"]}</span> : null}
            </span>
            <Button size="sm" variant="outline" disabled={consultando} onClick={() => void consultar(true)}>
              {consultando ? "Consultando…" : "Consultar ahora"}
            </Button>
            <label className="flex items-center gap-2">
              <Switch checked={manual} onCheckedChange={setManual} /> Usar un precio fijo en lugar del automático
            </label>
          </div>
          <div className="grid gap-4 md:grid-cols-4">
            <div>
              <Label>Precio fijo del dólar (MXN)</Label>
              <Input inputMode="decimal" value={dolar} placeholder="18.50" disabled={!manual} onChange={(e) => setDolar(e.target.value)} />
            </div>
            <div>
              <Label>Incremento</Label>
              <Input inputMode="decimal" value={incremento} onChange={(e) => setIncremento(e.target.value)} />
            </div>
            <div>
              <Label>IVA</Label>
              <Input inputMode="decimal" value={iva} onChange={(e) => setIva(e.target.value)} />
            </div>
            <div>
              <Label>Holgura (cm)</Label>
              <Input inputMode="numeric" value={holgura} onChange={(e) => setHolgura(e.target.value)} />
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="pb-1 pr-4 font-medium">Ancho</th>
                  {ALTOS_PIES.map((h) => (
                    <th key={h} className="pb-1 pr-4 font-medium">
                      Alto {h} pies ({piesAMetros(h).toFixed(2)} m) · USD
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ANCHOS_PIES.map((a) => (
                  <tr key={a}>
                    <td className="py-1 pr-4">
                      {a} pies ({piesAMetros(a).toFixed(2)} m)
                    </td>
                    {ALTOS_PIES.map((h) => (
                      <td key={h} className="py-1 pr-4">
                        <Input
                          className="h-8 w-28"
                          inputMode="decimal"
                          value={tabla[`${a}x${h}`] ?? ""}
                          onChange={(e) => setTabla({ ...tabla, [`${a}x${h}`]: e.target.value })}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {ejemplo.ok ? (
            <p className="text-xs text-muted-foreground">
              Ejemplo con lo guardado: portería de 2.90 × 2.10 m → {ejemplo.anchoPies} × {ejemplo.altoPies} pies → {pesos(ejemplo.precio)}.
            </p>
          ) : null}
          <Button disabled={guardando} onClick={() => void guardar()}>
            {guardando ? "Guardando…" : "Guardar fórmula"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
