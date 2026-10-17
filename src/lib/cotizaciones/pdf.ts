// PDF de la cotización con el diseño de la plantilla de AFPAM (tamaño carta). Usa pdf-lib, que funciona
// tanto en el servidor (Cloudflare) como en el navegador.
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import { importe, pesos, textoIva, totalDe, type Empresa, type Iva, type Partida } from "./datos";
import { LOGO_PNG_BASE64 } from "./logo";

export type EquipoFicha = {
  clave: string;
  nombre: string;
  marca?: string | null;
  modelo?: string | null;
  capacidad?: string | null;
  dimensiones?: string | null;
  peso?: string | null;
  alimentacion?: string | null;
  consumo?: string | null;
  incluye?: string | null;
};

export type DatosPdf = {
  folio: string;
  fecha: Date;
  empresa: Empresa;
  atiende: string;
  cliente: { nombre: string; atencion?: string | null; proyecto?: string | null; telefono?: string | null; correo?: string | null };
  equipo?: EquipoFicha | null;
  /** Bytes de la foto del equipo principal (JPG o PNG). */
  foto?: Uint8Array | null;
  partidas: Partida[];
  conMarca: boolean;
  iva: Iva;
};

const AZUL = rgb(0.106, 0.165, 0.227);
const NARANJA = rgb(0.941, 0.541, 0.141);
const CREMA = rgb(0.965, 0.953, 0.933);
const BLANCO = rgb(1, 1, 1);
const TEXTO = rgb(0.122, 0.161, 0.2);
const GRIS = rgb(0.42, 0.45, 0.5);
const LINEA = rgb(0.86, 0.85, 0.83);
const GRIS_CLARO = rgb(0.72, 0.75, 0.79);

const ANCHO = 612;
const ALTO = 792;
const MARGEN = 36;

/** Las fuentes estándar del PDF solo aceptan Latin-1 (más algunos signos): se quita lo que no se pueda imprimir. */
function limpiar(t: string | null | undefined): string {
  return (t ?? "")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\t/g, " ")
    .replace(/[^\n -ÿ–—•…€]/g, "");
}

function partir(texto: string, fuente: PDFFont, tam: number, ancho: number): string[] {
  const lineas: string[] = [];
  for (const parrafo of limpiar(texto).split("\n")) {
    let actual = "";
    for (const palabra of parrafo.split(/\s+/).filter(Boolean)) {
      const prueba = actual ? `${actual} ${palabra}` : palabra;
      if (fuente.widthOfTextAtSize(prueba, tam) <= ancho) actual = prueba;
      else {
        if (actual) lineas.push(actual);
        actual = palabra;
      }
    }
    lineas.push(actual);
  }
  return lineas;
}

function esImagenSoportada(b: Uint8Array) {
  const png = b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
  const jpg = b[0] === 0xff && b[1] === 0xd8;
  return png ? "png" : jpg ? "jpg" : null;
}

function base64ABytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function generarPdfCotizacion(d: DatosPdf): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Cotización ${d.folio}`);
  doc.setAuthor(d.empresa.razon_social);
  const normal = await doc.embedFont(StandardFonts.Helvetica);
  const negrita = await doc.embedFont(StandardFonts.HelveticaBold);
  const mono = await doc.embedFont(StandardFonts.Courier);
  const monoNegrita = await doc.embedFont(StandardFonts.CourierBold);
  const logo = await doc.embedPng(base64ABytes(LOGO_PNG_BASE64));
  let foto: PDFImage | null = null;
  if (d.foto) {
    const tipo = esImagenSoportada(d.foto);
    try {
      if (tipo === "png") foto = await doc.embedPng(d.foto);
      if (tipo === "jpg") foto = await doc.embedJpg(d.foto);
    } catch {
      foto = null;
    }
  }

  let pagina: PDFPage = doc.addPage([ANCHO, ALTO]);
  let y = ALTO;
  const fondo = (p: PDFPage) => p.drawRectangle({ x: 0, y: 0, width: ANCHO, height: ALTO, color: CREMA });
  fondo(pagina);

  const texto = (t: string, x: number, yy: number, tam: number, fuente: PDFFont, color = TEXTO) =>
    pagina.drawText(limpiar(t), { x, y: yy, size: tam, font: fuente, color });
  const derecha = (t: string, xDer: number, yy: number, tam: number, fuente: PDFFont, color = TEXTO) =>
    texto(t, xDer - fuente.widthOfTextAtSize(limpiar(t), tam), yy, tam, fuente, color);
  /** Etiqueta oscura tipo pestaña ("DATOS DE LA EMPRESA"). */
  const etiqueta = (t: string, x: number, yy: number, colorFondo = AZUL, colorTexto = BLANCO) => {
    const w = mono.widthOfTextAtSize(t, 7.5) + 14;
    pagina.drawRectangle({ x, y: yy - 4, width: w, height: 13, color: colorFondo });
    texto(t, x + 7, yy, 7.5, mono, colorTexto);
  };
  const tituloSeccion = (num: string, t: string) => {
    pagina.drawRectangle({ x: MARGEN, y: y - 4, width: 14, height: 2.5, color: NARANJA });
    texto(num, MARGEN + 20, y - 7, 9, mono, GRIS);
    texto(t, MARGEN + 40, y - 8, 11, negrita, TEXTO);
    y -= 26;
  };
  const nuevaPagina = () => {
    pagina = doc.addPage([ANCHO, ALTO]);
    fondo(pagina);
    y = ALTO - MARGEN;
  };
  const asegurar = (alto: number) => {
    if (y - alto < MARGEN) nuevaPagina();
  };

  // ------------------------------------------------ encabezado
  const altoEnc = 104;
  pagina.drawRectangle({ x: 0, y: ALTO - altoEnc, width: ANCHO, height: altoEnc, color: AZUL });
  pagina.drawRectangle({ x: 0, y: ALTO - altoEnc - 4, width: ANCHO, height: 4, color: NARANJA });
  pagina.drawImage(logo, { x: MARGEN + 4, y: ALTO - 86, width: 64, height: 64 * (logo.height / logo.width) });
  texto("AFPAM TEXCOCO", MARGEN + 84, ALTO - 52, 22, negrita, BLANCO);
  texto("Puertas automáticas", MARGEN + 84, ALTO - 70, 10, mono, GRIS_CLARO);
  const numero = d.folio.replace(/^COT-/, "");
  const wNum = monoNegrita.widthOfTextAtSize(numero, 11) + 14;
  const xDer = ANCHO - MARGEN;
  pagina.drawRectangle({ x: xDer - wNum, y: ALTO - 46, width: wNum, height: 20, color: NARANJA });
  texto(numero, xDer - wNum + 7, ALTO - 40, 11, monoNegrita, AZUL);
  derecha("COTIZACIÓN N°", xDer - wNum - 6, ALTO - 40, 9, mono, GRIS_CLARO);
  const fecha = new Intl.DateTimeFormat("es-MX", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "America/Mexico_City" }).format(d.fecha);
  derecha(`FECHA: ${fecha}`, xDer, ALTO - 62, 9, mono, BLANCO);
  derecha(`VIGENCIA: ${d.empresa.vigencia}`, xDer, ALTO - 78, 9, mono, BLANCO);
  y = ALTO - altoEnc - 4 - 26;

  // ------------------------------------------------ empresa y cliente
  const anchoCol = (ANCHO - MARGEN * 2 - 16) / 2;
  const filasEmpresa: Array<[string, string]> = [
    ["Razón social", d.empresa.razon_social],
    ["RFC", d.empresa.rfc],
    ["Atiende", d.atiende],
    ["Teléfono", d.empresa.telefono],
    ["Correo", d.empresa.correo],
  ];
  const filasCliente: Array<[string, string]> = [
    ["Cliente / empresa", d.cliente.nombre],
    ...(d.cliente.atencion ? ([["Atención a", d.cliente.atencion]] as Array<[string, string]>) : []),
    ...(d.cliente.proyecto ? ([["Proyecto", d.cliente.proyecto]] as Array<[string, string]>) : []),
    ...(d.cliente.telefono ? ([["Teléfono", d.cliente.telefono]] as Array<[string, string]>) : []),
    ...(d.cliente.correo ? ([["Correo", d.cliente.correo]] as Array<[string, string]>) : []),
  ];
  // Cada valor puede ocupar varias líneas (alineadas a la derecha).
  const lineasDe = (filas: Array<[string, string]>) => filas.map(([, v]) => partir(v, mono, 8.5, anchoCol * 0.6));
  const altoCaja = (filas: Array<[string, string]>) => 26 + lineasDe(filas).reduce((t, l) => t + 12 + l.length * 10.5, 0);
  const altoCajas = Math.max(altoCaja(filasEmpresa), altoCaja(filasCliente));
  const caja = (x: number, titulo: string, filas: Array<[string, string]>, acento: typeof AZUL) => {
    pagina.drawRectangle({ x, y: y - altoCajas, width: anchoCol, height: altoCajas, color: BLANCO, borderColor: LINEA, borderWidth: 0.8 });
    pagina.drawRectangle({ x, y: y - 1.5, width: anchoCol, height: 2, color: acento });
    etiqueta(titulo, x + 10, y - 4);
    const lineas = lineasDe(filas);
    let yy = y - 26;
    for (const [i, [k]] of filas.entries()) {
      texto(k, x + 12, yy, 8.5, normal, GRIS);
      let yv = yy;
      for (const l of lineas[i]!) {
        derecha(l, x + anchoCol - 12, yv, 8.5, mono, TEXTO);
        yv -= 10.5;
      }
      const siguiente = yy - 12 - lineas[i]!.length * 10.5 + 10.5;
      if (i < filas.length - 1) pagina.drawLine({ start: { x: x + 12, y: siguiente + 4 }, end: { x: x + anchoCol - 12, y: siguiente + 4 }, thickness: 0.4, color: LINEA });
      yy = siguiente - 10;
    }
  };
  caja(MARGEN, "DATOS DE LA EMPRESA", filasEmpresa, AZUL);
  caja(MARGEN + anchoCol + 16, "DATOS DEL CLIENTE", filasCliente, NARANJA);
  y -= altoCajas + 26;

  // ------------------------------------------------ 01 equipo cotizado
  if (d.equipo) {
    const e = d.equipo;
    tituloSeccion("01", "EQUIPO COTIZADO");
    const filasFicha = [d.conMarca && e.marca, d.conMarca && e.modelo, e.capacidad, e.dimensiones, e.peso, e.alimentacion, e.consumo].filter((v) => typeof v === "string" && v.trim()).length;
    const altoBloque = Math.max(180, 92 + filasFicha * 19);
    // Foto
    pagina.drawRectangle({ x: MARGEN, y: y - altoBloque, width: anchoCol, height: altoBloque, color: BLANCO, borderColor: NARANJA, borderWidth: 0.8 });
    etiqueta("IMAGEN DEL EQUIPO", MARGEN + 10, y - 4);
    if (foto) {
      const maxW = anchoCol - 20;
      const maxH = altoBloque - 28;
      const esc = Math.min(maxW / foto.width, maxH / foto.height);
      const w = foto.width * esc;
      const h = foto.height * esc;
      pagina.drawImage(foto, { x: MARGEN + (anchoCol - w) / 2, y: y - altoBloque + 8 + (maxH - h) / 2, width: w, height: h });
    } else {
      texto("Sin foto", MARGEN + anchoCol / 2 - 18, y - altoBloque / 2, 9, mono, GRIS);
    }
    // Ficha técnica
    const xF = MARGEN + anchoCol + 16;
    pagina.drawRectangle({ x: xF, y: y - altoBloque, width: anchoCol, height: altoBloque, color: AZUL });
    etiqueta("FICHA TÉCNICA", xF + 10, y - 4, NARANJA, AZUL);
    let yy = y - 30;
    for (const l of partir(e.clave, negrita, 13, anchoCol - 28).slice(0, 1)) {
      texto(l, xF + 14, yy, 13, negrita, BLANCO);
      yy -= 15;
    }
    for (const l of partir(e.nombre, normal, 9, anchoCol - 28).slice(0, 2)) {
      texto(l, xF + 14, yy, 9, normal, GRIS_CLARO);
      yy -= 11;
    }
    pagina.drawLine({ start: { x: xF + 14, y: yy + 2 }, end: { x: xF + anchoCol - 14, y: yy + 2 }, thickness: 0.5, color: GRIS });
    yy -= 14;
    const ficha: Array<[string, string | null | undefined]> = [
      ...(d.conMarca ? ([["MARCA", e.marca], ["MODELO", e.modelo]] as Array<[string, string | null | undefined]>) : []),
      ["CAPACIDAD", e.capacidad],
      ["DIMENSIONES", e.dimensiones],
      ["PESO", e.peso],
      ["ALIMENTACIÓN", e.alimentacion],
      ["CONSUMO", e.consumo],
    ];
    for (const [k, v] of ficha.filter(([, v]) => v?.trim())) {
      if (yy < y - altoBloque + 12) break;
      texto(k, xF + 14, yy, 7.5, mono, GRIS_CLARO);
      derecha(partir(v ?? "", normal, 8.5, anchoCol * 0.55)[0] ?? "", xF + anchoCol - 14, yy, 8.5, normal, BLANCO);
      pagina.drawLine({ start: { x: xF + 14, y: yy - 6 }, end: { x: xF + anchoCol - 14, y: yy - 6 }, thickness: 0.3, color: GRIS });
      yy -= 19;
    }
    y -= altoBloque + 18;

    if (e.incluye?.trim()) {
      const lineas = partir(e.incluye, normal, 9, ANCHO - MARGEN * 2 - 32);
      const alto = 26 + lineas.length * 12;
      asegurar(alto);
      pagina.drawRectangle({ x: MARGEN, y: y - alto, width: ANCHO - MARGEN * 2, height: alto, color: BLANCO, borderColor: LINEA, borderWidth: 0.8 });
      etiqueta("QUÉ INCLUYE EL EQUIPO", MARGEN + 10, y - 4);
      let yi = y - 24;
      for (const l of lineas) {
        texto(l, MARGEN + 16, yi, 9, normal, TEXTO);
        yi -= 12;
      }
      y -= alto + 24;
    }
  }

  // ------------------------------------------------ 02 desglose de precio
  asegurar(110);
  tituloSeccion(d.equipo ? "02" : "01", "DESGLOSE DE PRECIO");
  const anchoTabla = ANCHO - MARGEN * 2;
  const cols = { concepto: MARGEN + 12, cant: MARGEN + anchoTabla * 0.55, unitario: MARGEN + anchoTabla * 0.66, importe: MARGEN + anchoTabla - 12 };
  const encabezado = () => {
    pagina.drawRectangle({ x: MARGEN, y: y - 20, width: anchoTabla, height: 22, color: AZUL });
    texto("CONCEPTO", cols.concepto, y - 13, 8, normal, BLANCO);
    texto("CANT.", cols.cant, y - 13, 8, normal, BLANCO);
    texto("P. UNITARIO", cols.unitario, y - 13, 8, normal, BLANCO);
    derecha("IMPORTE", cols.importe, y - 13, 8, normal, BLANCO);
    y -= 22;
  };
  encabezado();
  for (const p of d.partidas) {
    const lineas = partir(p.concepto, normal, 9, cols.cant - cols.concepto - 10);
    const alto = Math.max(24, 10 + lineas.length * 11);
    if (y - alto < MARGEN) {
      nuevaPagina();
      encabezado();
    }
    pagina.drawRectangle({ x: MARGEN, y: y - alto, width: anchoTabla, height: alto, color: BLANCO, borderColor: LINEA, borderWidth: 0.5 });
    let yl = y - 15;
    for (const l of lineas) {
      texto(l, cols.concepto, yl, 9, normal, TEXTO);
      yl -= 11;
    }
    texto(String(p.cantidad), cols.cant, y - 15, 9, normal, TEXTO);
    texto(pesos(p.precio), cols.unitario, y - 15, 9, normal, TEXTO);
    derecha(pesos(importe(p)), cols.importe, y - 15, 9, normal, TEXTO);
    y -= alto;
  }
  // Total (con su nota, siempre juntos)
  if (y - 48 < MARGEN) {
    nuevaPagina();
    encabezado();
  }
  pagina.drawRectangle({ x: MARGEN, y: y - 28, width: anchoTabla, height: 28, color: rgb(0.99, 0.96, 0.92), borderColor: LINEA, borderWidth: 0.5 });
  texto("TOTAL", cols.concepto, y - 18, 12, negrita, NARANJA);
  derecha(pesos(totalDe(d.partidas)), cols.importe, y - 18, 12, negrita, NARANJA);
  y -= 28;
  const notas = [textoIva(d.iva), d.empresa.nota_precios].filter(Boolean).join(" ");
  pagina.drawRectangle({ x: MARGEN, y: y - 20, width: anchoTabla, height: 20, color: BLANCO, borderColor: LINEA, borderWidth: 0.5 });
  texto(notas, cols.concepto, y - 13, 7.5, normal, GRIS);
  y -= 40;

  // ------------------------------------------------ 03 términos y garantías
  const anchoTexto = anchoCol - 28;
  const bloquesGarantia: Array<{ t: string; f: PDFFont; c: typeof TEXTO; tam: number; vineta?: boolean; espacio?: number }> = [
    { t: `Duración: ${d.empresa.garantia_duracion}`, f: normal, c: TEXTO, tam: 8.5, espacio: 6 },
    { t: "LA GARANTÍA NO PROCEDE SI:", f: monoNegrita, c: NARANJA, tam: 7.5 },
    ...d.empresa.garantia_no_procede.map((t) => ({ t, f: normal, c: TEXTO, tam: 8, vineta: true })),
    { t: "GARANTÍA LIMITADA DEL MOTOR — NO CUBRE:", f: monoNegrita, c: NARANJA, tam: 7.5 },
    ...d.empresa.garantia_motor_no_cubre.map((t) => ({ t, f: normal, c: TEXTO, tam: 8, vineta: true })),
    { t: d.empresa.garantia_nota, f: normal, c: TEXTO, tam: 8, espacio: 6 },
  ];
  const altoGarantia =
    bloquesGarantia.reduce((t, b) => t + partir(b.t, b.f, b.tam, anchoTexto - (b.vineta ? 10 : 0)).length * (b.tam + 3) + (b.espacio ?? 4), 0) + 80;
  asegurar(altoGarantia + 40);
  tituloSeccion(d.equipo ? "03" : "02", "TÉRMINOS Y GARANTÍAS");
  const altoTerminos = Math.max(altoGarantia, 140);
  // Términos
  pagina.drawRectangle({ x: MARGEN, y: y - altoTerminos, width: anchoCol, height: altoTerminos, color: BLANCO, borderColor: LINEA, borderWidth: 0.8 });
  etiqueta("TÉRMINOS COMERCIALES", MARGEN + 10, y - 4);
  let yt = y - 28;
  texto("TÉRMINOS", MARGEN + 14, yt, 10, negrita, TEXTO);
  yt -= 18;
  for (const [k, v] of [
    ["Forma de pago: ", d.empresa.forma_pago],
    ["Vigencia de la cotización: ", d.empresa.vigencia_texto],
  ] as const) {
    const lineas = partir(`${k}${v}`, normal, 8.5, anchoTexto);
    for (const [i, l] of lineas.entries()) {
      if (i === 0) {
        texto(k, MARGEN + 14, yt, 8.5, negrita, TEXTO);
        texto(l.slice(k.length), MARGEN + 14 + negrita.widthOfTextAtSize(k, 8.5), yt, 8.5, normal, TEXTO);
      } else texto(l, MARGEN + 14, yt, 8.5, normal, TEXTO);
      yt -= 12;
    }
    yt -= 8;
  }
  // Garantías
  const xG = MARGEN + anchoCol + 16;
  pagina.drawRectangle({ x: xG, y: y - altoTerminos, width: anchoCol, height: altoTerminos, color: BLANCO, borderColor: LINEA, borderWidth: 0.8 });
  etiqueta("GARANTÍA DEL SERVICIO", xG + 10, y - 4);
  let yg = y - 28;
  texto("GARANTÍAS", xG + 14, yg, 10, negrita, TEXTO);
  yg -= 18;
  for (const b of bloquesGarantia) {
    const lineas = partir(b.t, b.f, b.tam, anchoTexto - (b.vineta ? 10 : 0));
    for (const [i, l] of lineas.entries()) {
      if (b.vineta && i === 0) texto("•", xG + 16, yg, b.tam, normal, TEXTO);
      texto(l, xG + 14 + (b.vineta ? 10 : 0), yg, b.tam, b.f, b.c);
      yg -= b.tam + 3;
    }
    yg -= b.espacio ?? 4;
  }
  pagina.drawRectangle({ x: xG + 12, y: yg - 8, width: anchoCol - 24, height: 20, color: rgb(0.99, 0.94, 0.88) });
  pagina.drawRectangle({ x: xG + 12, y: yg - 8, width: 2, height: 20, color: NARANJA });
  texto(`¿Problemas con su equipo? Llame al ${d.empresa.telefono_garantia}`, xG + 20, yg - 1, 8.5, negrita, NARANJA);
  y -= altoTerminos + 24;

  // ------------------------------------------------ pie: ubicación y servicios
  const servicios = d.empresa.servicios?.length ? d.empresa.servicios.join(", ") : "Instalación, reparación y mantenimiento de portones automáticos y cortinas eléctricas.";
  const ubicacion = [d.empresa.direccion, d.empresa.ubicacion].filter(Boolean).join("\n") || "Texcoco, Estado de México";
  const lineasU = partir(ubicacion, mono, 7.5, anchoCol - 24);
  const lineasS = partir(servicios, mono, 7.5, anchoCol - 24);
  const altoPie = 40 + Math.max(lineasU.length, lineasS.length) * 10;
  asegurar(altoPie + 10);
  y = altoPie + 8; // el pie va al fondo de la última página
  pagina.drawRectangle({ x: 0, y: y - altoPie, width: ANCHO, height: altoPie + 8, color: AZUL });
  pagina.drawRectangle({ x: 0, y: y + 8, width: ANCHO, height: 3, color: NARANJA });
  etiqueta("UBICACIÓN", MARGEN + 10, y - 8, NARANJA, AZUL);
  etiqueta("SERVICIOS QUE OFRECEMOS", xG + 10, y - 8, NARANJA, AZUL);
  let yu = y - 28;
  for (const l of lineasU) {
    texto(l, MARGEN + 12, yu, 7.5, mono, GRIS_CLARO);
    yu -= 10;
  }
  let ys = y - 28;
  for (const l of lineasS) {
    texto(l, xG + 12, ys, 7.5, mono, GRIS_CLARO);
    ys -= 10;
  }

  return doc.save();
}
