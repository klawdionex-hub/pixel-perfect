// Precio del dólar automático para la fórmula de elevadizos.
// Se consulta en servicios públicos gratuitos (sin clave) y se guarda en configuracion.textos_extra
// (elev_dolar_auto, elev_dolar_auto_fecha, elev_dolar_fuente). Se renueva si tiene más de 12 horas.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type DB = SupabaseClient<Database>;

const FUENTES: Array<{ nombre: string; url: string; leer: (j: unknown) => number | undefined }> = [
  {
    nombre: "Frankfurter (Banco Central Europeo)",
    url: "https://api.frankfurter.app/latest?from=USD&to=MXN",
    leer: (j) => (j as { rates?: { MXN?: number } }).rates?.MXN,
  },
  {
    nombre: "ExchangeRate-API",
    url: "https://open.er-api.com/v6/latest/USD",
    leer: (j) => (j as { rates?: { MXN?: number } }).rates?.MXN,
  },
];

async function consultar(): Promise<{ dolar: number; fuente: string } | null> {
  for (const f of FUENTES) {
    try {
      const r = await fetch(f.url, { signal: AbortSignal.timeout(6000) });
      if (!r.ok) continue;
      const n = Number(f.leer(await r.json()));
      if (Number.isFinite(n) && n > 5 && n < 100) return { dolar: Math.round(n * 10000) / 10000, fuente: f.nombre };
    } catch {
      // se intenta con la siguiente fuente
    }
  }
  return null;
}

/** Renueva el dólar automático si hace falta. Devuelve false si no se pudo consultar. */
export async function actualizarDolar(db: DB, ahora = new Date(), forzar = false): Promise<boolean> {
  const { data } = await db.from("configuracion").select("textos_extra").eq("id", true).maybeSingle();
  const extra = { ...((data?.textos_extra ?? {}) as Record<string, string>) };
  const fecha = extra["elev_dolar_auto_fecha"];
  const vigente = fecha && ahora.getTime() - new Date(fecha).getTime() < 12 * 3600000 && Number(extra["elev_dolar_auto"]) > 0;
  if (vigente && !forzar) return true;
  const r = await consultar();
  if (!r) return !!extra["elev_dolar_auto"];
  extra["elev_dolar_auto"] = String(r.dolar);
  extra["elev_dolar_auto_fecha"] = ahora.toISOString();
  extra["elev_dolar_fuente"] = r.fuente;
  await db.from("configuracion").update({ textos_extra: extra } as never).eq("id", true);
  return true;
}
