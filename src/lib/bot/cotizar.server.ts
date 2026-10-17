// "Hacer cotización" desde el chat del vendedor (COMANDOS → Hacer cotización).
// El vendedor elige el cliente, los equipos del catálogo, los servicios y los conceptos a mano;
// el bot arma el PDF con la plantilla de AFPAM y se lo envía solo al vendedor para que lo revise.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/integrations/supabase/types";
import { costoDe, empresaDe, leerPrecio, pesos, totalDe, type Iva, type Partida } from "@/lib/cotizaciones/datos";
import { generarPdfCotizacion } from "@/lib/cotizaciones/pdf";
import { CATEGORIAS_EQUIPO, CATEGORIA_SERVICIOS, indiceCategoria } from "./equipos";
import type { Canal } from "./motor.server";
import { normalizarTelefono, type Opcion } from "./salida";
import { folio, otraAccion, responder, type Vendedor } from "./vendedores.server";

type DB = SupabaseClient<Database>;
type Equipo = Database["public"]["Tables"]["equipos_catalogo"]["Row"];

type Pendiente = { equipo_id?: string | null; concepto: string; costo?: number | null; sugerido?: number | null };

/** Borrador guardado en usuarios_perfil.estado_bot.cot mientras el vendedor contesta. */
export type BorradorCot = {
  paso: "cliente" | "buscar" | "nombre" | "telefono" | "municipio" | "concepto" | "precio" | "menu";
  desde: string;
  solicitud_id?: string | null;
  /** Contacto del programa (prospecto o cliente existente); null si es un cliente nuevo. */
  contacto_id?: string | null;
  /** "nuevo": captura completa; "corregir": corrige los datos de un contacto existente. */
  captura?: "nuevo" | "corregir" | null;
  /** Servicio del prospecto que se creará si el cliente no tiene uno abierto. */
  servicio?: number | null;
  necesitaServicio?: boolean;
  cliente: { nombre: string; telefono?: string | null; municipio?: string | null; proyecto?: string | null };
  partidas: Partida[];
  principal_id?: string | null;
  pendiente?: Pendiente | null;
  iva?: Iva;
};

const VIGENCIA_HORAS = 3;

function borradorDe(v: Vendedor, ahora: Date): BorradorCot | null {
  const b = ((v.estado_bot ?? {}) as { cot?: BorradorCot }).cot;
  if (!b) return null;
  if (ahora.getTime() - new Date(b.desde).getTime() > VIGENCIA_HORAS * 3600000) return null;
  return b;
}

async function guardar(db: DB, v: Vendedor, b: BorradorCot | null) {
  const estado = { ...((v.estado_bot ?? {}) as Record<string, unknown>) };
  if (b) estado["cot"] = b;
  else delete estado["cot"];
  v.estado_bot = estado as Json;
  await db.from("usuarios_perfil").update({ estado_bot: estado as Json }).eq("id", v.id);
}

async function catalogo(db: DB): Promise<Equipo[]> {
  const { data, error } = await db.from("equipos_catalogo").select("*").eq("activo", true).order("orden", { ascending: true });
  return error ? [] : (data ?? []);
}

const resumenCorto = (b: BorradorCot) =>
  b.partidas.length
    ? b.partidas.map((p) => `• ${p.concepto} · ${p.cantidad} × ${pesos(p.precio)}`).join("\n") + `\nTotal: *${pesos(totalDe(b.partidas))}*`
    : "Todavía no hay conceptos.";

// ---------------------------------------------------------------- pasos

export async function iniciarCotizacion(db: DB, canal: Canal, v: Vendedor, ahora: Date) {
  const b: BorradorCot = { paso: "cliente", desde: ahora.toISOString(), cliente: { nombre: "" }, partidas: [] };
  await guardar(db, v, b);
  return responder(canal, v, {
    tipo: "botones",
    texto: '*Nueva cotización.* ¿Para quién es?\n\nPuede escribir "cancelar" en cualquier momento.',
    opciones: [
      { id: "cot:mis", titulo: "Mis prospectos" },
      { id: "cot:existente", titulo: "Cliente existente" },
      { id: "cot:nuevo", titulo: "Cliente nuevo" },
    ],
  });
}

async function listarMisProspectos(db: DB, canal: Canal, v: Vendedor) {
  const { data } = await db
    .from("solicitudes")
    .select("id, codigo, creada_en, contactos(nombre, municipio)")
    .eq("vendedor_id", v.id)
    .in("etapa", [1, 2, 3])
    .order("creada_en", { ascending: false })
    .limit(9);
  if (!data?.length) {
    return responder(canal, v, {
      tipo: "botones",
      texto: "No tiene prospectos abiertos. Puede cotizar a un cliente existente o a uno nuevo.",
      opciones: [
        { id: "cot:existente", titulo: "Cliente existente" },
        { id: "cot:nuevo", titulo: "Cliente nuevo" },
      ],
    });
  }
  return responder(canal, v, {
    tipo: "lista",
    texto: "Elija el prospecto.",
    boton: "Ver prospectos",
    opciones: data.map((s): Opcion => {
      const c = s.contactos as { nombre: string | null; municipio: string | null } | null;
      return { id: `cot:sol:${s.id}`, titulo: folio(s), descripcion: `${c?.nombre ?? "Sin nombre"} · ${c?.municipio ?? ""}`.trim() };
    }),
  });
}

const sinAcentos = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

/** Busca en todos los contactos por nombre o por los últimos dígitos del teléfono. */
async function buscarClientes(db: DB, canal: Canal, v: Vendedor, b: BorradorCot, consulta: string) {
  const { data } = await db.from("contactos").select("id, nombre, telefono, municipio, es_cliente, es_ejemplo, primer_contacto");
  const digitos = consulta.replace(/\D/g, "");
  const q = sinAcentos(consulta);
  const encontrados = (data ?? [])
    .filter((c) => !c.es_ejemplo && !c.telefono.startsWith("sim-"))
    .filter((c) => (digitos.length >= 4 ? c.telefono.replace(/\D/g, "").endsWith(digitos) : q.length >= 2 && sinAcentos(c.nombre ?? "").includes(q)))
    .slice(0, 9);
  if (!encontrados.length) {
    b.paso = "buscar";
    await guardar(db, v, b);
    return responder(canal, v, {
      tipo: "botones",
      texto: `No encontré clientes con "${consulta}". Escriba otro nombre o los últimos 4 dígitos del teléfono, o regístrelo como cliente nuevo.`,
      opciones: [{ id: "cot:nuevo", titulo: "Cliente nuevo" }],
    });
  }
  const fecha = (iso: string) => new Intl.DateTimeFormat("es-MX", { day: "2-digit", month: "2-digit", year: "2-digit", timeZone: "America/Mexico_City" }).format(new Date(iso));
  return responder(canal, v, {
    tipo: "lista",
    texto: "Elija al cliente.",
    boton: "Ver clientes",
    opciones: [
      ...encontrados.map((c): Opcion => ({
        id: `cot:con:${c.id}`,
        titulo: (c.nombre ?? "Sin nombre").slice(0, 24),
        descripcion: [c.municipio, `…${c.telefono.replace(/\D/g, "").slice(-4)}`, c.es_cliente ? `cliente desde ${fecha(c.primer_contacto)}` : null].filter(Boolean).join(" · "),
      })),
      { id: "cot:existente", titulo: "Buscar otra vez" },
    ],
  });
}

/** Nombres que la gente escribe para no darlo: "no", "x", "no quiero", una letra, solo números… */
function nombreSospechoso(n: string | null | undefined) {
  const t = sinAcentos(n ?? "");
  if (t.length < 3 || /^\d+$/.test(t) || /^(.)\1*$/.test(t)) return true;
  return /^(no|na|n\/a|ninguno|nadie|anonimo|cliente|sin nombre|no quiero|no gracias|prefiero no|no doy|xxx?)\b/.test(t) || /no (quiero|doy|deseo)/.test(t);
}

/** Muestra los datos del cliente y pregunta si continuar o corregirlos. */
async function confirmarDatos(db: DB, canal: Canal, v: Vendedor, b: BorradorCot) {
  b.paso = "menu";
  await guardar(db, v, b);
  const aviso = nombreSospechoso(b.cliente.nombre)
    ? `\n\nEl nombre registrado parece no ser válido ("${b.cliente.nombre || "sin nombre"}"). Le recomiendo corregirlo antes de cotizar.`
    : "";
  return responder(canal, v, {
    tipo: "botones",
    texto: `*Datos del cliente*\nNombre: ${b.cliente.nombre || "—"}\nTeléfono: ${b.cliente.telefono ?? "—"}\nMunicipio: ${b.cliente.municipio ?? "—"}${aviso}`,
    opciones: [
      { id: "cot:ok", titulo: "Continuar" },
      { id: "cot:datos", titulo: "Corregir datos" },
    ],
  });
}

async function nombreDeServicio(db: DB, codigo: number | null | undefined) {
  if (codigo == null) return null;
  const { data } = await db.from("servicios").select("nombre").eq("codigo", codigo).maybeSingle();
  return data?.nombre ?? null;
}

/** Después de los datos: el servicio (si hay que crear el prospecto) y luego los equipos. */
async function continuar(db: DB, canal: Canal, v: Vendedor, b: BorradorCot) {
  if (b.necesitaServicio && b.servicio == null) {
    b.paso = "menu";
    await guardar(db, v, b);
    const { data } = await db.from("servicios").select("codigo, nombre, activo").eq("activo", true).order("codigo");
    return responder(canal, v, {
      tipo: "lista",
      texto: "¿Qué servicio va a cotizar? Con esto se registra el prospecto a su nombre.",
      boton: "Ver servicios",
      opciones: (data ?? []).slice(0, 10).map((x): Opcion => ({ id: `cot:srv:${x.codigo}`, titulo: x.nombre.slice(0, 24), ...(x.nombre.length > 24 ? { descripcion: x.nombre } : {}) })),
    });
  }
  b.cliente.proyecto = [await nombreDeServicio(db, b.servicio), b.cliente.municipio].filter(Boolean).join(" – ") || null;
  return preguntarEquipo(db, canal, v, b);
}

/** Pide el teléfono (o lo ofrece conservar) durante la captura. */
async function pedirTelefono(db: DB, canal: Canal, v: Vendedor, b: BorradorCot) {
  if (b.captura === "corregir" && b.cliente.telefono) {
    b.paso = "menu";
    await guardar(db, v, b);
    return responder(canal, v, {
      tipo: "botones",
      texto: `Teléfono: ${b.cliente.telefono}`,
      opciones: [
        { id: "cot:tel:mismo", titulo: "Usar el mismo" },
        { id: "cot:tel:cambiar", titulo: "Cambiar" },
      ],
    });
  }
  b.paso = "telefono";
  await guardar(db, v, b);
  return responder(canal, v, { tipo: "texto", texto: 'Escriba el teléfono del cliente a 10 dígitos, o "omitir".' });
}

async function pedirMunicipio(db: DB, canal: Canal, v: Vendedor, b: BorradorCot) {
  if (b.captura === "corregir" && b.cliente.municipio) {
    b.paso = "menu";
    await guardar(db, v, b);
    return responder(canal, v, {
      tipo: "botones",
      texto: `Municipio: ${b.cliente.municipio}`,
      opciones: [
        { id: "cot:mun:mismo", titulo: "Usar el mismo" },
        { id: "cot:mun:cambiar", titulo: "Cambiar" },
      ],
    });
  }
  b.paso = "municipio";
  await guardar(db, v, b);
  return responder(canal, v, { tipo: "texto", texto: 'Escriba el municipio o la colonia, o "omitir".' });
}

/** Termina la captura: guarda nombre y municipio corregidos en el contacto y sigue. */
async function terminarCaptura(db: DB, canal: Canal, v: Vendedor, b: BorradorCot) {
  if (b.contacto_id) {
    await db
      .from("contactos")
      .update({ nombre: b.cliente.nombre, ...(b.cliente.municipio ? { municipio: b.cliente.municipio } : {}) })
      .eq("id", b.contacto_id);
  }
  b.captura = null;
  return continuar(db, canal, v, b);
}

async function preguntarEquipo(db: DB, canal: Canal, v: Vendedor, b: BorradorCot) {
  b.paso = "menu";
  await guardar(db, v, b);
  const equipos = (await catalogo(db)).filter((e) => e.categoria !== CATEGORIA_SERVICIOS);
  const usadas = CATEGORIAS_EQUIPO.map((c, i) => ({ c, i, n: equipos.filter((e) => indiceCategoria(e.categoria) === i).length })).filter((x) => x.n);
  return responder(canal, v, {
    tipo: "lista",
    texto: `Cliente: *${b.cliente.nombre}*.\n¿Qué equipo va a cotizar?`,
    boton: "Elegir equipo",
    opciones: [
      ...usadas.map(({ c, i, n }): Opcion => ({ id: `cot:cat:${i}`, titulo: c, descripcion: `${n} equipo(s)` })),
      { id: "cot:libre", titulo: "Concepto a mano", descripcion: "Algo que no está en el catálogo" },
    ],
  });
}

async function preguntarMas(db: DB, canal: Canal, v: Vendedor, b: BorradorCot) {
  b.paso = "menu";
  b.pendiente = null;
  await guardar(db, v, b);
  const opciones: Opcion[] = [
    { id: "cot:cats", titulo: "Equipo del catálogo" },
    { id: "cot:serv", titulo: "Servicios y extras", descripcion: "Instalación, controles, cableado…" },
    { id: "cot:libre", titulo: "Concepto a mano", descripcion: "Por ejemplo, fabricación de portón" },
  ];
  if (b.partidas.length) opciones.push({ id: "cot:quitar", titulo: "Quitar un concepto" }, { id: "cot:fin", titulo: "Terminar", descripcion: "Revisar y generar el PDF" });
  return responder(canal, v, {
    tipo: "lista",
    texto: `${resumenCorto(b)}\n\n¿Qué desea agregar?`,
    boton: "Ver opciones",
    opciones,
  });
}

async function preguntarPrecio(db: DB, canal: Canal, v: Vendedor, b: BorradorCot, p: Pendiente) {
  b.pendiente = p;
  if (p.sugerido != null) {
    b.paso = "menu";
    await guardar(db, v, b);
    return responder(canal, v, {
      tipo: "botones",
      texto: `${p.concepto}\nPrecio del catálogo: *${pesos(p.sugerido)}*.`,
      opciones: [
        { id: "cot:usar", titulo: "Usar este precio" },
        { id: "cot:otro", titulo: "Otro precio" },
      ],
    });
  }
  b.paso = "precio";
  await guardar(db, v, b);
  return responder(canal, v, {
    tipo: "texto",
    texto: `${p.concepto}\nEscriba el precio, por ejemplo *18000*. Si son varias piezas, escriba cantidad por precio: *2 x 350*.`,
  });
}

async function resumenFinal(db: DB, canal: Canal, v: Vendedor, b: BorradorCot) {
  b.paso = "menu";
  await guardar(db, v, b);
  return responder(canal, v, {
    tipo: "botones",
    texto: `*Resumen de la cotización*\nCliente: ${b.cliente.nombre}\n${resumenCorto(b)}${b.iva === "incluye" ? "\nPrecios con IVA incluido." : b.iva === "mas" ? "\nPrecios más IVA." : ""}`,
    opciones: [
      { id: "cot:pdf:no", titulo: "PDF sin marca" },
      { id: "cot:pdf:si", titulo: "PDF con marca" },
      { id: "cot:corregir", titulo: "Corregir" },
    ],
  });
}

// ---------------------------------------------------------------- generar

async function generar(db: DB, canal: Canal, v: Vendedor, b: BorradorCot, conMarca: boolean, ahora: Date) {
  if (!canal.guardarArchivo) return responder(canal, v, { tipo: "texto", texto: "No se pudo generar el PDF en este momento." });
  await responder(canal, v, { tipo: "texto", texto: "Generando la cotización, un momento…" });
  const [{ data: config }, { data: servicios }, equipos] = await Promise.all([
    db.from("configuracion").select("*").eq("id", true).maybeSingle(),
    db.from("servicios").select("nombre, activo, codigo").order("codigo"),
    catalogo(db),
  ]);
  const empresa = { ...empresaDe((config ?? {}) as Record<string, unknown>), servicios: (servicios ?? []).filter((s) => s.activo).map((s) => s.nombre) };
  const principal = equipos.find((e) => e.id === b.principal_id) ?? null;
  const total = totalDe(b.partidas);
  const costo = costoDe(b.partidas);

  // Cliente nuevo o existente sin prospecto abierto: se registra un prospecto a nombre del vendedor.
  let aviso = "";
  if (!b.solicitud_id && b.servicio != null) {
    let contactoId = b.contacto_id ?? null;
    if (!contactoId && b.cliente.telefono) {
      const { data: existe } = await db.from("contactos").select("id").eq("telefono", b.cliente.telefono).maybeSingle();
      contactoId = existe?.id ?? null;
      if (!contactoId) {
        const { data: nuevo } = await db
          .from("contactos")
          .insert({ telefono: b.cliente.telefono, nombre: b.cliente.nombre, municipio: b.cliente.municipio ?? null, origen: "cotización" })
          .select("id")
          .single();
        contactoId = nuevo?.id ?? null;
      }
    }
    if (contactoId) {
      const { data: sol } = await db
        .from("solicitudes")
        .insert({
          contacto_id: contactoId,
          servicio_codigo: b.servicio,
          etapa: 2,
          completa: true,
          vendedor_id: v.id,
          tomada_en: ahora.toISOString(),
          datos: { origen: `Cotización de ${v.nombre}` } as unknown as Json,
        })
        .select("id, codigo")
        .single();
      if (sol) {
        b.solicitud_id = sol.id;
        aviso = `\nSe registró el prospecto *${sol.codigo}* a su nombre.`;
      }
    } else {
      aviso = "\nComo no hay teléfono, la cotización no quedó ligada a un prospecto.";
    }
  }

  const { data: cot, error } = await db
    .from("cotizaciones")
    .insert({
      solicitud_id: b.solicitud_id ?? null,
      vendedor_id: v.id,
      cliente_nombre: b.cliente.nombre,
      cliente_telefono: b.cliente.telefono ?? null,
      proyecto: b.cliente.proyecto ?? null,
      equipo_principal_id: principal?.id ?? null,
      partidas: b.partidas as unknown as Json,
      con_marca: conMarca,
      iva: b.iva ?? null,
      total,
      costo_total: costo,
      creada_en: ahora.toISOString(),
    })
    .select("id, folio")
    .single();
  if (error || !cot) {
    console.error("[cotizar] No se pudo guardar", error);
    return responder(canal, v, { tipo: "texto", texto: "No se pudo guardar la cotización. Intente de nuevo en unos minutos." });
  }

  let foto: Uint8Array | null = null;
  const urlFoto = ((principal?.fotos ?? []) as Array<{ url?: string }>)[0]?.url;
  if (urlFoto) {
    try {
      const r = await fetch(urlFoto, { signal: AbortSignal.timeout(8000) });
      if (r.ok) foto = new Uint8Array(await r.arrayBuffer());
    } catch {
      foto = null;
    }
  }
  const bytes = await generarPdfCotizacion({
    folio: cot.folio,
    fecha: ahora,
    empresa,
    atiende: v.nombre,
    cliente: { nombre: b.cliente.nombre, telefono: b.cliente.telefono ?? null, proyecto: b.cliente.proyecto ?? null },
    equipo: principal,
    foto,
    partidas: b.partidas,
    conMarca,
    iva: b.iva ?? null,
  });
  const nombreArchivo = `${cot.folio} ${b.cliente.nombre}`.replace(/[^\p{L}\p{N} -]/gu, "").trim();
  const url = await canal.guardarArchivo(`cotizaciones/${cot.folio}-${crypto.randomUUID().slice(0, 8)}.pdf`, bytes, "application/pdf");
  await db.from("cotizaciones").update({ pdf_url: url }).eq("id", cot.id);

  // El prospecto pasa a "Cotizado" si estaba como nuevo.
  if (b.solicitud_id) await db.from("solicitudes").update({ etapa: 2 }).eq("id", b.solicitud_id).eq("etapa", 1);
  await guardar(db, v, null);

  await responder(canal, v, { tipo: "documento", url, nombre: `${nombreArchivo}.pdf` });
  await responder(canal, v, {
    tipo: "texto",
    texto: `Listo: cotización *${cot.folio}* por *${pesos(total)}*${conMarca ? " (con marca y modelo)" : ""}.${aviso}\n\nRevísela antes de reenviarla al cliente. Si necesita cambios, escriba *comandos* y haga una nueva.`,
  });
  // Ganancia: con los conceptos que tienen costo en el catálogo; los demás se mencionan aparte.
  const conCosto = b.partidas.filter((p) => p.costo != null);
  if (conCosto.length) {
    const venta = totalDe(conCosto);
    const costoConocido = costoDe(conCosto) ?? 0;
    const ganancia = venta - costoConocido;
    const sinCosto = b.partidas.filter((p) => p.costo == null).map((p) => p.concepto);
    await responder(canal, v, {
      tipo: "texto",
      texto: [
        `Solo para usted (no aparece en el PDF): costo aproximado ${pesos(costoConocido)}, ganancia aproximada *${pesos(ganancia)}*${venta ? ` (${Math.round((ganancia / venta) * 100)}%)` : ""}.`,
        sinCosto.length ? `Sin costo registrado, no incluidos en el cálculo: ${sinCosto.join("; ")}.` : "",
      ]
        .filter(Boolean)
        .join("\n"),
    });
  }
  await otraAccion(db, canal, v);
}

// ---------------------------------------------------------------- entrada

/**
 * Atiende lo que escribe o elige el vendedor mientras arma una cotización.
 * Devuelve true si el mensaje era parte de la cotización.
 */
export async function atenderCotizacion(
  db: DB,
  canal: Canal,
  v: Vendedor,
  entrada: { texto?: string | undefined; opcionId?: string | undefined },
  ahora: Date,
): Promise<boolean> {
  const id = entrada.opcionId ?? "";
  const texto = (entrada.texto ?? "").trim();
  if (id === "cmd:cotizar") {
    await iniciarCotizacion(db, canal, v, ahora);
    return true;
  }
  const b = borradorDe(v, ahora);
  if (!b) {
    if (id.startsWith("cot:")) {
      await responder(canal, v, { tipo: "texto", texto: "Esa cotización ya venció. Escriba *comandos* y elija Hacer cotización para empezar otra." });
      return true;
    }
    return false;
  }
  if (!id && /^cancelar$/i.test(texto)) {
    await guardar(db, v, null);
    await responder(canal, v, { tipo: "texto", texto: "Cotización cancelada." });
    await otraAccion(db, canal, v);
    return true;
  }

  // Respuestas escritas
  if (!id.startsWith("cot:")) {
    if (!texto || id) return false;
    if (b.paso === "buscar") {
      await buscarClientes(db, canal, v, b, texto.slice(0, 60));
      return true;
    }
    if (b.paso === "nombre") {
      if (nombreSospechoso(texto)) {
        await responder(canal, v, { tipo: "texto", texto: "Escriba el nombre completo del cliente, por ejemplo *Juan Pérez*." });
        return true;
      }
      b.cliente.nombre = texto.slice(0, 80).toLowerCase().replace(/(^|\s)\p{L}/gu, (m) => m.toUpperCase());
      await pedirTelefono(db, canal, v, b);
      return true;
    }
    if (b.paso === "telefono") {
      if (!/^omitir$/i.test(texto)) {
        const d = texto.replace(/\D/g, "");
        if (d.length < 10) {
          await responder(canal, v, { tipo: "texto", texto: 'El teléfono debe tener 10 dígitos, por ejemplo *5512345678*. O escriba "omitir".' });
          return true;
        }
        b.cliente.telefono = normalizarTelefono(d);
      }
      await pedirMunicipio(db, canal, v, b);
      return true;
    }
    if (b.paso === "municipio") {
      if (!/^omitir$/i.test(texto)) b.cliente.municipio = texto.slice(0, 120);
      await terminarCaptura(db, canal, v, b);
      return true;
    }
    if (b.paso === "concepto") {
      await preguntarPrecio(db, canal, v, b, { concepto: texto.slice(0, 160) });
      return true;
    }
    if (b.paso === "precio" && b.pendiente) {
      const lp = leerPrecio(texto);
      if (!lp) {
        await responder(canal, v, { tipo: "texto", texto: 'No entendí el precio. Escriba solo números, por ejemplo *8500*, o *2 x 350*. Para salir escriba "cancelar".' });
        return true;
      }
      b.partidas.push({ equipo_id: b.pendiente.equipo_id ?? null, concepto: b.pendiente.concepto, cantidad: lp.cantidad, precio: lp.precio, costo: b.pendiente.costo ?? null });
      await preguntarMas(db, canal, v, b);
      return true;
    }
    return false;
  }

  const [, accion, a] = id.split(":");
  if (accion === "mis") {
    await listarMisProspectos(db, canal, v);
    return true;
  }
  if (accion === "existente") {
    b.paso = "buscar";
    await guardar(db, v, b);
    await responder(canal, v, { tipo: "texto", texto: "Escriba el nombre o los últimos 4 dígitos del teléfono del cliente." });
    return true;
  }
  if (accion === "sol" && a) {
    const { data: s } = await db.from("solicitudes").select("id, servicio_codigo, contacto_id, contactos(nombre, telefono, municipio)").eq("id", a).maybeSingle();
    const c = s?.contactos as { nombre: string | null; telefono: string; municipio: string | null } | null;
    b.solicitud_id = a;
    b.contacto_id = s?.contacto_id ?? null;
    b.servicio = s?.servicio_codigo ?? null;
    b.necesitaServicio = false;
    b.cliente = {
      nombre: c?.nombre ?? "",
      telefono: c?.telefono && !c.telefono.startsWith("sim-") ? c.telefono : null,
      municipio: c?.municipio ?? null,
    };
    await confirmarDatos(db, canal, v, b);
    return true;
  }
  if (accion === "con" && a) {
    const { data: c } = await db.from("contactos").select("id, nombre, telefono, municipio").eq("id", a).maybeSingle();
    if (!c) {
      await responder(canal, v, { tipo: "texto", texto: "No encontré a ese cliente." });
      return true;
    }
    // Si tiene un prospecto abierto con este vendedor, la cotización se liga a ese; si no, se crea uno nuevo.
    const { data: abierta } = await db
      .from("solicitudes")
      .select("id, servicio_codigo")
      .eq("contacto_id", c.id)
      .eq("vendedor_id", v.id)
      .in("etapa", [1, 2, 3])
      .order("creada_en", { ascending: false })
      .limit(1)
      .maybeSingle();
    b.contacto_id = c.id;
    b.solicitud_id = abierta?.id ?? null;
    b.servicio = abierta?.servicio_codigo ?? null;
    b.necesitaServicio = !abierta;
    b.cliente = { nombre: c.nombre ?? "", telefono: c.telefono.startsWith("sim-") ? null : c.telefono, municipio: c.municipio };
    await confirmarDatos(db, canal, v, b);
    return true;
  }
  if (accion === "nuevo") {
    b.solicitud_id = null;
    b.contacto_id = null;
    b.servicio = null;
    b.necesitaServicio = true;
    b.captura = "nuevo";
    b.cliente = { nombre: "" };
    b.paso = "nombre";
    await guardar(db, v, b);
    await responder(canal, v, { tipo: "texto", texto: "Escriba el nombre completo del cliente." });
    return true;
  }
  if (accion === "ok") {
    await continuar(db, canal, v, b);
    return true;
  }
  if (accion === "datos") {
    b.captura = "corregir";
    b.paso = "nombre";
    await guardar(db, v, b);
    await responder(canal, v, { tipo: "texto", texto: "Escriba el nombre completo del cliente." });
    return true;
  }
  if (accion === "tel") {
    if (a === "cambiar") {
      b.paso = "telefono";
      await guardar(db, v, b);
      await responder(canal, v, { tipo: "texto", texto: "Escriba el teléfono del cliente a 10 dígitos." });
    } else await pedirMunicipio(db, canal, v, b);
    return true;
  }
  if (accion === "mun") {
    if (a === "cambiar") {
      b.paso = "municipio";
      await guardar(db, v, b);
      await responder(canal, v, { tipo: "texto", texto: "Escriba el municipio o la colonia." });
    } else await terminarCaptura(db, canal, v, b);
    return true;
  }
  if (accion === "srv" && a) {
    b.servicio = Number(a);
    await continuar(db, canal, v, b);
    return true;
  }
  if (accion === "cats") {
    const equipos = (await catalogo(db)).filter((e) => e.categoria !== CATEGORIA_SERVICIOS);
    const usadas = CATEGORIAS_EQUIPO.map((c, i) => ({ c, i, n: equipos.filter((e) => indiceCategoria(e.categoria) === i).length })).filter((x) => x.n);
    await responder(canal, v, {
      tipo: "lista",
      texto: "Elija la categoría del equipo.",
      boton: "Ver categorías",
      opciones: [...usadas.map(({ c, i, n }): Opcion => ({ id: `cot:cat:${i}`, titulo: c, descripcion: `${n} equipo(s)` })), { id: "cot:mas", titulo: "Regresar" }],
    });
    return true;
  }
  if (accion === "cat" || accion === "serv") {
    const lista = (await catalogo(db)).filter((e) =>
      accion === "serv" ? e.categoria === CATEGORIA_SERVICIOS : e.categoria !== CATEGORIA_SERVICIOS && indiceCategoria(e.categoria) === Number(a),
    );
    if (!lista.length) {
      await responder(canal, v, { tipo: "texto", texto: accion === "serv" ? "Todavía no hay servicios y extras en el catálogo." : "No hay equipos en esa categoría." });
      await preguntarMas(db, canal, v, b);
      return true;
    }
    await responder(canal, v, {
      tipo: "lista",
      texto: accion === "serv" ? "Elija el servicio o extra." : "Elija el equipo.",
      boton: "Ver opciones",
      opciones: [
        ...lista.slice(0, 9).map((e): Opcion => ({
          id: `cot:eq:${e.id}`,
          titulo: accion === "serv" ? e.nombre : e.clave,
          descripcion: accion === "serv" ? (e.precio != null ? pesos(Number(e.precio)) : "Precio a mano") : e.nombre,
        })),
        { id: "cot:mas", titulo: "Regresar" },
      ],
    });
    return true;
  }
  if (accion === "eq" && a) {
    const e = (await catalogo(db)).find((x) => x.id === a);
    if (!e) return (await preguntarMas(db, canal, v, b), true);
    const esServicio = e.categoria === CATEGORIA_SERVICIOS;
    if (!esServicio && !b.principal_id) b.principal_id = e.id;
    await preguntarPrecio(db, canal, v, b, {
      equipo_id: e.id,
      concepto: esServicio ? e.nombre : `${e.clave} · ${e.nombre}`,
      costo: e.costo != null ? Number(e.costo) : null,
      sugerido: e.precio != null ? Number(e.precio) : null,
    });
    return true;
  }
  if (accion === "usar" && b.pendiente?.sugerido != null) {
    b.partidas.push({ equipo_id: b.pendiente.equipo_id ?? null, concepto: b.pendiente.concepto, cantidad: 1, precio: b.pendiente.sugerido, costo: b.pendiente.costo ?? null });
    await preguntarMas(db, canal, v, b);
    return true;
  }
  if (accion === "otro" && b.pendiente) {
    b.paso = "precio";
    await guardar(db, v, b);
    await responder(canal, v, { tipo: "texto", texto: "Escriba el precio, por ejemplo *8500*, o cantidad por precio: *2 x 350*." });
    return true;
  }
  if (accion === "libre") {
    b.paso = "concepto";
    await guardar(db, v, b);
    await responder(canal, v, { tipo: "texto", texto: "Escriba el concepto, por ejemplo: *Fabricación de portón elevadizo 3 x 2.4 m en lámina*." });
    return true;
  }
  if (accion === "mas") {
    if (!b.partidas.length && !b.principal_id) await preguntarEquipo(db, canal, v, b);
    else await preguntarMas(db, canal, v, b);
    return true;
  }
  if (accion === "quitar" || accion === "corregir") {
    await responder(canal, v, {
      tipo: "lista",
      texto: accion === "corregir" ? "¿Qué desea corregir? Elija un concepto para quitarlo, o agregue otro." : "Elija el concepto que desea quitar.",
      boton: "Ver conceptos",
      opciones: [
        ...b.partidas.slice(0, 8).map((p, i): Opcion => ({ id: `cot:q:${i}`, titulo: `Quitar ${i + 1}`, descripcion: `${p.concepto} · ${pesos(p.precio)}`.slice(0, 72) })),
        { id: "cot:mas", titulo: "Agregar concepto" },
        { id: "cot:fin", titulo: "Volver al resumen" },
      ],
    });
    return true;
  }
  if (accion === "q" && a) {
    const [quitada] = b.partidas.splice(Number(a), 1);
    if (quitada?.equipo_id && quitada.equipo_id === b.principal_id) {
      // El siguiente equipo del catálogo (no servicio) pasa a ser el principal.
      const equipos = await catalogo(db);
      b.principal_id = b.partidas.map((p) => equipos.find((e) => e.id === p.equipo_id)).find((e) => e && e.categoria !== CATEGORIA_SERVICIOS)?.id ?? null;
    }
    await preguntarMas(db, canal, v, b);
    return true;
  }
  if (accion === "fin") {
    if (!b.partidas.length) return (await preguntarMas(db, canal, v, b), true);
    b.paso = "menu";
    await guardar(db, v, b);
    await responder(canal, v, {
      tipo: "botones",
      texto: "¿El precio incluye IVA?",
      opciones: [
        { id: "cot:iva:incluye", titulo: "Incluye IVA" },
        { id: "cot:iva:mas", titulo: "Más IVA" },
        { id: "cot:iva:no", titulo: "No mencionar" },
      ],
    });
    return true;
  }
  if (accion === "iva") {
    b.iva = a === "incluye" ? "incluye" : a === "mas" ? "mas" : null;
    await resumenFinal(db, canal, v, b);
    return true;
  }
  if (accion === "pdf") {
    await generar(db, canal, v, b, a === "si", ahora);
    return true;
  }
  return false;
}
