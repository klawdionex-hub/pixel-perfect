// Manuales técnicos en el bot del vendedor: COMANDOS → Manuales técnicos → tipo → equipo → procedimiento.
// Llegan los pasos que la IA encontró y el usuario revisó; si se pide, la página del manual o el PDF completo.
import type { SupabaseClient } from "@supabase/supabase-js";
import { PDFDocument } from "pdf-lib";
import type { Database } from "@/integrations/supabase/types";
import { TIPOS_MANUAL, nombreManual } from "@/lib/manuales/datos";
import type { Canal } from "./motor.server";
import type { Opcion } from "./salida";
import { otraAccion, responder, type Vendedor } from "./vendedores.server";

type DB = SupabaseClient<Database>;
type Manual = Database["public"]["Tables"]["manuales"]["Row"];
type Procedimiento = Database["public"]["Tables"]["manual_procedimientos"]["Row"];

async function publicados(db: DB): Promise<Manual[]> {
  const { data, error } = await db.from("manuales").select("*").eq("estado", "publicado");
  if (error) return [];
  return (data ?? []).sort((a, b) => nombreManual(a).localeCompare(nombreManual(b)));
}

const indiceTipo = (t: string) => {
  const i = (TIPOS_MANUAL as readonly string[]).indexOf(t);
  return i >= 0 ? i : TIPOS_MANUAL.length - 1;
};

/** Paso 1: tipos de equipo con manuales publicados. */
export async function enviarTiposManual(db: DB, canal: Canal, v: Vendedor): Promise<void> {
  const manuales = await publicados(db);
  if (!manuales.length) {
    await responder(canal, v, { tipo: "texto", texto: "Todavía no hay manuales publicados. Se suben en el panel, en la pestaña Manuales técnicos." });
    return otraAccion(db, canal, v);
  }
  const usados = TIPOS_MANUAL.map((t, i) => ({ t, i, n: manuales.filter((m) => indiceTipo(m.tipo) === i).length })).filter((x) => x.n);
  if (usados.length === 1) return enviarManualesDeTipo(db, canal, v, usados[0]!.i);
  return responder(canal, v, {
    tipo: "lista",
    texto: '*Manuales técnicos.* ¿De qué tipo de equipo?\n\nTambién puede escribir, por ejemplo: *manual modelo 300*',
    boton: "Ver tipos",
    opciones: usados.map(({ t, i, n }): Opcion => ({ id: `man:t:${i}`, titulo: t, descripcion: `${n} manual(es)` })),
  });
}

/** Paso 2: equipos (manuales) de un tipo. */
export async function enviarManualesDeTipo(db: DB, canal: Canal, v: Vendedor, tipo: number): Promise<void> {
  const lista = (await publicados(db)).filter((m) => indiceTipo(m.tipo) === tipo);
  if (!lista.length) return enviarTiposManual(db, canal, v);
  return enviarListaManuales(canal, v, lista, `${TIPOS_MANUAL[tipo]}: elija el equipo.`);
}

function enviarListaManuales(canal: Canal, v: Vendedor, lista: Manual[], texto: string) {
  return responder(canal, v, {
    tipo: "lista",
    texto,
    boton: "Ver equipos",
    opciones: [
      ...lista.slice(0, 9).map((m): Opcion => ({ id: `man:m:${m.id}`, titulo: nombreManual(m).slice(0, 24), descripcion: [m.tipo, m.frecuencia].filter(Boolean).join(" · ") })),
      { id: "cmd:manuales", titulo: "Otro tipo de equipo" },
    ],
  });
}

/** Búsqueda escrita: "manual modelo 300", "manual marca x". */
export async function buscarManual(db: DB, canal: Canal, v: Vendedor, consulta: string): Promise<void> {
  const q = consulta.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  const lista = (await publicados(db)).filter((m) =>
    [m.marca, m.modelo, m.pdf_nombre, m.tipo].some((x) => (x ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().includes(q)),
  );
  if (!lista.length) {
    await responder(canal, v, { tipo: "texto", texto: `No encontré manuales con "${consulta}".` });
    return enviarTiposManual(db, canal, v);
  }
  if (lista.length === 1) return enviarProcedimientos(db, canal, v, lista[0]!.id);
  return enviarListaManuales(canal, v, lista, `Encontré ${lista.length} manuales. Elija el equipo.`);
}

/** Paso 3: procedimientos del manual + páginas y PDF completo. */
export async function enviarProcedimientos(db: DB, canal: Canal, v: Vendedor, manualId: string): Promise<void> {
  const { data: m } = await db.from("manuales").select("*").eq("id", manualId).maybeSingle();
  if (!m || m.estado !== "publicado") {
    await responder(canal, v, { tipo: "texto", texto: "Ese manual ya no está disponible." });
    return enviarTiposManual(db, canal, v);
  }
  const { data } = await db.from("manual_procedimientos").select("*").eq("manual_id", m.id).eq("activo", true).order("orden", { ascending: true });
  const procs = (data ?? []) as Procedimiento[];
  await db.from("manuales").update({ usos: (m.usos ?? 0) + 1 }).eq("id", m.id);
  const datos = [m.frecuencia ? `Frecuencia: ${m.frecuencia}` : null, m.tipo_codigo ? `Código: ${m.tipo_codigo}` : null].filter(Boolean).join(" · ");
  return responder(canal, v, {
    tipo: "lista",
    texto: `*${nombreManual(m)}*${datos ? `\n${datos}` : ""}\n¿Qué necesita?`,
    boton: "Ver opciones",
    opciones: [
      ...procs.slice(0, 8).map((p): Opcion => ({
        id: `man:p:${p.id}`,
        titulo: p.titulo.slice(0, 24),
        ...(p.pagina_inicio ? { descripcion: `Página ${p.pagina_inicio}${p.pagina_fin && p.pagina_fin !== p.pagina_inicio ? `–${p.pagina_fin}` : ""}` } : {}),
      })),
      { id: `man:pdf:${m.id}`, titulo: "PDF completo", descripcion: m.paginas ? `${m.paginas} páginas` : "Manual completo" },
    ],
  });
}

/** Paso 4: los pasos de un procedimiento. */
export async function enviarProcedimiento(db: DB, canal: Canal, v: Vendedor, procId: string): Promise<void> {
  const { data: p } = await db.from("manual_procedimientos").select("*").eq("id", procId).maybeSingle();
  const { data: m } = p ? await db.from("manuales").select("*").eq("id", p.manual_id).maybeSingle() : { data: null };
  if (!p || !m || m.estado !== "publicado") {
    await responder(canal, v, { tipo: "texto", texto: "Ese procedimiento ya no está disponible." });
    return enviarTiposManual(db, canal, v);
  }
  await db.from("manual_procedimientos").update({ usos: (p.usos ?? 0) + 1 }).eq("id", p.id);
  const pasos = p.pasos.split("\n").map((x) => x.trim()).filter(Boolean);
  const extra = [m.frecuencia ? `Frecuencia: ${m.frecuencia}` : null, m.tipo_codigo ? `Código: ${m.tipo_codigo}` : null].filter(Boolean).join(" · ");
  const pagina = p.pagina_inicio ? `Página ${p.pagina_inicio}${p.pagina_fin && p.pagina_fin !== p.pagina_inicio ? `–${p.pagina_fin}` : ""} del manual.` : "";
  let texto = `*${p.titulo} – ${nombreManual(m)}*\n\n${pasos.map((x, i) => `${i + 1}. ${x}`).join("\n")}${extra ? `\n\n${extra}` : ""}${pagina ? `\n${pagina}` : ""}`;
  // WhatsApp admite unos 4,000 caracteres por mensaje.
  while (texto.length > 3800) {
    const corte = texto.lastIndexOf("\n", 3800);
    await responder(canal, v, { tipo: "texto", texto: texto.slice(0, corte > 0 ? corte : 3800) });
    texto = texto.slice(corte > 0 ? corte + 1 : 3800);
  }
  await responder(canal, v, { tipo: "texto", texto });
  return otraAccion(db, canal, v, [
    ...(p.pagina_inicio ? [{ id: `man:pag:${p.id}`, titulo: "Ver página del manual" }] : []),
    { id: `man:m:${m.id}`, titulo: "Otro procedimiento" },
    { id: `man:pdf:${m.id}`, titulo: "PDF completo" },
  ]);
}

/** Solo las páginas del procedimiento, como PDF pequeño (se genera una vez y se guarda). */
export async function enviarPaginas(db: DB, canal: Canal, v: Vendedor, procId: string): Promise<void> {
  const { data: p } = await db.from("manual_procedimientos").select("*").eq("id", procId).maybeSingle();
  const { data: m } = p ? await db.from("manuales").select("*").eq("id", p.manual_id).maybeSingle() : { data: null };
  if (!p || !m || !p.pagina_inicio) return enviarTiposManual(db, canal, v);
  const ini = p.pagina_inicio;
  const fin = p.pagina_fin && p.pagina_fin >= ini ? p.pagina_fin : ini;
  let url = p.paginas_url;
  if (!url && canal.guardarArchivo) {
    try {
      const r = await fetch(m.pdf_url, { signal: AbortSignal.timeout(20000) });
      if (!r.ok) throw new Error(String(r.status));
      const original = await PDFDocument.load(new Uint8Array(await r.arrayBuffer()), { ignoreEncryption: true });
      const total = original.getPageCount();
      const indices = Array.from({ length: Math.min(fin, total) - ini + 1 }, (_, i) => ini - 1 + i).filter((i) => i >= 0 && i < total);
      const nuevo = await PDFDocument.create();
      for (const pag of await nuevo.copyPages(original, indices)) nuevo.addPage(pag);
      url = await canal.guardarArchivo(`manuales/paginas/${p.id}.pdf`, await nuevo.save(), "application/pdf");
      await db.from("manual_procedimientos").update({ paginas_url: url }).eq("id", p.id);
    } catch (e) {
      console.error("[manuales] No se pudieron recortar las páginas", e);
      url = null;
    }
  }
  const rango = fin !== ini ? `${ini}-${fin}` : String(ini);
  if (url) await responder(canal, v, { tipo: "documento", url, nombre: `${nombreManual(m)} pag ${rango}.pdf`.replace(/[^\p{L}\p{N} .-]/gu, "") });
  else await responder(canal, v, { tipo: "documento", url: m.pdf_url, nombre: `${nombreManual(m)}.pdf`, texto: `Vea la página ${rango}.` });
  return otraAccion(db, canal, v, [
    { id: `man:m:${m.id}`, titulo: "Otro procedimiento" },
    { id: "cmd:manuales", titulo: "Otro equipo" },
  ]);
}

/** El PDF completo del manual. */
export async function enviarPdfManual(db: DB, canal: Canal, v: Vendedor, manualId: string): Promise<void> {
  const { data: m } = await db.from("manuales").select("*").eq("id", manualId).maybeSingle();
  if (!m || m.estado !== "publicado") return enviarTiposManual(db, canal, v);
  await responder(canal, v, { tipo: "documento", url: m.pdf_url, nombre: m.pdf_nombre || `${nombreManual(m)}.pdf` });
  return otraAccion(db, canal, v, [
    { id: `man:m:${m.id}`, titulo: "Ver procedimientos" },
    { id: "cmd:manuales", titulo: "Otro equipo" },
  ]);
}
