// Pruebas del bot con base de datos falsa. Ejecutar:  npm run prueba:bot
import { pasarContactoAVendedores, procesarMensajeCliente, procesarRecordatorios, type Canal } from "@/lib/bot/motor.server";
import { procesarMensajeVendedor, nombreTarjeta, tareasVendedores } from "@/lib/bot/vendedores.server";
import { textoDeSalida, type Salida } from "@/lib/bot/salida";
import { PDFDocument } from "pdf-lib";
import { crearBD } from "./bd-falsa";

const servicios = ["Abatible hacia afuera", "Abatible hacia adentro", "Elevadizo con paneles tipo americano", "Corredizo", "Plegadizas", "De maroma", "Cortina eléctrica", "Reparación", "Mantenimiento", "Compra de equipo"].map(
  (nombre, i) => ({ codigo: i + 1, nombre, activo: true, catalogo_url: null, porcentaje_comision: 3 }),
);
const { db, tablas, reloj } = crearBD({
  servicios,
  usuarios_perfil: [
    { id: "v1", nombre: "Carlos", whatsapp: "5959544763", activo: true, es_vendedor: true, ultimo_mensaje_wa: null, estado_bot: {} },
    { id: "v2", nombre: "Ana", whatsapp: "5511112222", activo: true, es_vendedor: true, ultimo_mensaje_wa: null, estado_bot: {} },
  ],
  configuracion: [
    {
      id: true, nombre_negocio: "AFPAM Texcoco", horario: "L-V 8-17", cobertura: "Estado de México", latitud: 19.51, longitud: -98.88,
      horas_recordatorio_cliente_1: 2, horas_recordatorio_cliente_2: 20, horas_incompleto: 24,
      horas_recordatorio_vendedor: 2, max_recordatorios_vendedor_dia: 2, horas_seguimiento_resultado: 24, dias_seguimiento_repetido: 3,
      textos_extra: {},
    },
  ],
});

const log: string[] = [];
const archivos: Record<string, Uint8Array> = {};
const canal: Canal = {
  cliente: async (_t, s: Salida) => { log.push("BOT> " + textoDeSalida(s).replace(/\n/g, " | ")); return null; },
  vendedor: async (t, n, s) => { log.push(`VENDEDOR ${n} (${t})> ` + textoDeSalida(s).replace(/\n/g, " | ")); },
  guardarArchivo: async (ruta, bytes) => { archivos[ruta] = bytes; return `https://archivos/${ruta}`; },
  consultarDolar: false,
};
const cliente = async (tel: string, texto?: string, opcionId?: string) => {
  log.push(`CLIENTE ${tel}> ${texto ?? ""}${opcionId ? ` [${opcionId}]` : ""}`);
  await procesarMensajeCliente({ db, canal, telefono: tel, ahora: reloj.ahora, entrada: { texto, opcionId, tipo: "text" } });
};
const vendedor = async (id: string, texto?: string, opcionId?: string) => {
  const v = tablas["usuarios_perfil"]!.find((u) => u.id === id)!;
  log.push(`VENDEDOR-ESCRIBE ${v.nombre}> ${texto ?? ""}${opcionId ? ` [${opcionId}]` : ""}`);
  await procesarMensajeVendedor(db, canal, v as never, { texto, opcionId }, reloj.ahora);
};
let fallos = 0;
const afirmar = (cond: unknown, msg: string) => {
  if (cond) console.log("OK    " + msg);
  else { fallos++; console.log("FALLO " + msg); }
};
const solDe = (tel: string) => tablas["solicitudes"]!.filter((s) => s.contacto_id === tablas["contactos"]!.find((c) => c.telefono === tel)?.id).at(-1);
const config = tablas["configuracion"]![0]!;

// --- Flujo completo de instalación
const A = "+525511111111";
for (const t of ["Hola", "juan pérez", "1", "Texcoco, San Lorenzo", "elevadizo", "Sí, ya lo tengo", "4 x 2.4 m", "omitir", "tarde"]) await cliente(A, t);
const sA = solDe(A);
afirmar(sA?.codigo === "3-1-0001" && sA.completa && !sA.datos.material && sA.datos.medidas === "4 x 2.4 m", `instalación crea folio ${sA?.codigo}`);
afirmar(log.some((l) => l.includes("folio 3-1-0001")), "cierre con folio");
const avisos = log.filter((l) => l.startsWith("VENDEDOR") && l.includes("afpam_solicitud_recibida"));
afirmar(avisos.length === 2 && avisos.every((l) => !l.includes("Juan") && !l.includes("551 111")), "aviso a 2 vendedores sin datos de contacto");

afirmar(log.some((l) => l.includes("le haré 6 preguntas breves")), "aviso de cuántas preguntas antes de empezar");
afirmar(log.some((l) => l.includes("Pregunta 1 de 6")) && log.some((l) => l.includes("Pregunta 6 de 6")), "contador en cada pregunta");
if (process.env["VER_CONVERSACION"]) console.log(log.filter((l) => !l.startsWith("VENDEDOR")).slice(0, 30).join("\n"));

// --- Lo tomo y venta
tablas["usuarios_perfil"]![0]!.ultimo_mensaje_wa = reloj.ahora.toISOString();
await vendedor("v1", "Lo tomo", `tomar:${sA!.id}`);
afirmar(sA!.vendedor_id === "v1" && log.some((l) => l.includes("[Contacto] Juan Pérez · Texcoco, San Lorenzo")), "Lo tomo asigna y manda tarjeta");
await vendedor("v2", "0001 vendido 9000");
afirmar(sA!.etapa === 1 && log.at(-1)!.includes("asignado a Carlos"), "otro vendedor no puede cerrar prospecto ajeno");
await vendedor("v1", "0001 vendido 12500");
afirmar(sA!.etapa === 4 && sA!.comision === 375, `venta con comisión ${sA!.comision}`);

// --- Palabra asesor
const C = "+525533333333";
for (const t of ["hola", "Luis", "quiero un asesor"]) await cliente(C, t);
afirmar(solDe(C) && !solDe(C)!.completa, "asesor crea solicitud incompleta");

// --- Recordatorios al cliente
const B = "+525522222222";
await cliente(B, "hola");
await cliente(B, "Ana");
reloj.ahora = new Date(reloj.ahora.getTime() + 3 * 3600000);
const r = await procesarRecordatorios(db, canal, reloj.ahora);
afirmar(r.recordatorio1 === 1, "recordatorio al cliente a las 2 h");

// --- Bienvenida con foto y ubicación
config.textos_extra = { bienvenida_imagen_url: "https://x/local.jpg", bienvenida_ubicacion: "si" };
const J = "+525599999999";
let marca = log.length;
await cliente(J, "Buenas tardes");
const b = log.slice(marca + 1);
afirmar(b[0]?.startsWith("BOT> [Imagen]") && b[1]?.startsWith("BOT> [Ubicación]") && b[2]?.includes("¿Podría indicarme su *nombre*"), `bienvenida: foto, ubicación y saludo (${b.length} mensajes)`);
marca = log.length;
await cliente(J, "Mario");
afirmar(!log.slice(marca).some((l) => l.includes("[Imagen]")), "la foto solo se manda al saludar");
await cliente(A, "Buenas");
afirmar(!log.slice(-2).some((l) => l.includes("[Imagen]")), "cliente que regresa no recibe la bienvenida otra vez");
config.textos_extra = { bienvenida_ubicacion: "no" };
const K = "+525598888888";
marca = log.length;
await cliente(K, "Hola");
afirmar(log.slice(marca + 1).length === 1, "sin foto ni ubicación configuradas solo va el saludo");

// --- Ubicación: por defecto se envía; sin coordenadas se toman del enlace de Maps
config.textos_extra = {};
config.latitud = null; config.longitud = null;
config.ubicacion_maps_url = "https://www.google.com/maps/place/AFPAM/@19.5123,-98.8812,17z";
marca = log.length;
await cliente("+525597777777", "Hola");
afirmar(log.slice(marca).some((l) => l.startsWith("BOT> [Ubicación]")), "pin de ubicación desde el enlace de Google Maps");
config.latitud = 19.51; config.longitud = -98.88;

// --- Invitación a reseña al cerrar
config.link_resena_google = "https://g.page/r/afpam/review";
const R = "+525596666666";
for (const t of ["Hola", "Rosa", "1", "Texcoco", "elevadizo", "Sí, ya lo tengo", "4 x 2.4 m", "omitir", "tarde"]) await cliente(R, t);
afirmar(log.some((l) => l.includes("califique en Google: https://g.page/r/afpam/review")), "invitación a calificar en Google al cerrar");


// --- Respuestas automáticas de un vendedor con WhatsApp Business: sin ciclo
reloj.ahora = new Date(reloj.ahora.getTime() + 3600000);
marca = log.length;
await vendedor("v2", "Gracias por escribir, en breve te atendemos");
await vendedor("v2", "Gracias por escribir, en breve te atendemos");
await vendedor("v2", "Gracias por escribir, en breve te atendemos");
const respuestasAna = log.slice(marca).filter((l) => l.startsWith("VENDEDOR Ana"));
afirmar(respuestasAna.length === 1, `respuesta automática del vendedor no arma ciclo (${respuestasAna.length} respuesta)`);
await vendedor("v2", "0004 cotizado");
afirmar(log.at(-1)!.startsWith("VENDEDOR Ana"), "los comandos siguen funcionando aunque haya pausa de ayuda");
reloj.ahora = new Date(reloj.ahora.getTime() + 11 * 60000);
marca = log.length;
await vendedor("v2", "hola");
afirmar(log.slice(marca).some((l) => l.startsWith("VENDEDOR Ana")), "después de 10 minutos vuelve a recibir la lista");

// --- Asignar desde WhatsApp (solo administradores)
const sR = solDe(R)!;
await vendedor("v2", "asigna el último prospecto a Carlos");
afirmar(!sR.vendedor_id && log.at(-1)!.includes("Solo un administrador"), "un vendedor sin permiso no puede asignar");
config.textos_extra = { ...(config.textos_extra as object), administradores: "v1" };
marca = log.length;
await vendedor("v1", "Asigna el último prospecto a ana");
afirmar(sR.vendedor_id === "v2", `el administrador asigna el último prospecto (${sR.codigo}) a Ana`);
afirmar(log.slice(marca).some((l) => l.startsWith("VENDEDOR Ana") && l.includes("[Contacto]")), "Ana recibe la tarjeta del cliente");
afirmar(log.at(-1)!.includes("quedó asignado a Ana"), "el administrador recibe la confirmación");
await vendedor("v1", `asigna ${sR.numero} a 5959544763`);
afirmar(sR.vendedor_id === "v1" && log.at(-1)!.includes("antes lo tenía Ana"), "reasignar por número de prospecto y teléfono del vendedor");
await vendedor("v1", "asigna el ultimo a Pedro");
afirmar(log.at(-1)!.includes("No encontré al vendedor"), "vendedor inexistente");
const ana = tablas["usuarios_perfil"]!.find((u) => u.id === "v2")!;
afirmar((ana.estado_bot as { ultimo_aviso?: { ok: boolean } }).ultimo_aviso?.ok === true, "se registra el último aviso enviado al vendedor");

// --- Renovar la ventana de 24 h del vendedor

const carlos = tablas["usuarios_perfil"]!.find((x) => x.id === "v1")!;
reloj.ahora = new Date("2026-10-15T18:00:00Z"); // 12:00 en Ciudad de México
carlos.ultimo_mensaje_wa = new Date(reloj.ahora.getTime() - 21 * 3600000).toISOString();
marca = log.length;
await tareasVendedores(db, canal, reloj.ahora);
afirmar(log.slice(marca).some((l) => l.startsWith("VENDEDOR Carlos") && l.includes("Seguir recibiendo")), "pide renovar la ventana antes de que venza");
marca = log.length;
await tareasVendedores(db, canal, new Date(reloj.ahora.getTime() + 10 * 60000));
afirmar(!log.slice(marca).some((l) => l.includes("Seguir recibiendo")), "solo un aviso de renovación por ventana");
await vendedor("v1", "Seguir recibiendo", "renovar");
afirmar(log.at(-1)!.includes("seguirá recibiendo") && carlos.ultimo_mensaje_wa === reloj.ahora.toISOString(), "al pulsar el botón se renueva la ventana");

// --- Pasar desde el panel a un contacto que no terminó la encuesta
const sinTerminarTel = "+525595555555";
await cliente(sinTerminarTel, "Hola");
const contactoST = tablas["contactos"]!.find((c) => c.telefono === sinTerminarTel)!;
marca = log.length;
const pasado = await pasarContactoAVendedores(db, canal, contactoST.id as string, reloj.ahora);
afirmar(!pasado.yaExistia && solDe(sinTerminarTel)?.completa === false, `contacto sin encuesta pasa a vendedores (${pasado.codigo})`);
afirmar(log.slice(marca).filter((l) => l.startsWith("VENDEDOR") && l.includes("Incompleta")).length >= 2, "los vendedores reciben el aviso como incompleta");
afirmar((await pasarContactoAVendedores(db, canal, contactoST.id as string, reloj.ahora)).yaExistia, "no se duplica el prospecto");

// --- De noche no se escribe a clientes; se retoma a las 8:00
const N = "+525594444444";
reloj.ahora = new Date("2026-10-16T04:00:00Z"); // jueves 22:00 CDMX
await cliente(N, "Hola");
marca = log.length;
await procesarRecordatorios(db, canal, new Date("2026-10-16T07:30:00Z")); // 1:30
afirmar(!log.slice(marca).some((l) => l.startsWith("BOT>")), "de noche no se mandan recordatorios a clientes");
marca = log.length;
await procesarRecordatorios(db, canal, new Date("2026-10-16T14:30:00Z")); // 8:30
afirmar(log.slice(marca).some((l) => l.startsWith("BOT>")), "a las 8:00 se retoman los recordatorios");

// --- Resumen del día a las 17:00
reloj.ahora = new Date("2026-10-16T23:10:00Z"); // viernes 17:10 CDMX
marca = log.length;
await tareasVendedores(db, canal, reloj.ahora);
afirmar(log.slice(marca).some((l) => l.startsWith("VENDEDOR") && /esumen del d|pendientes_del_dia/.test(l)), "resumen del día a los vendedores");
marca = log.length;
await tareasVendedores(db, canal, new Date(reloj.ahora.getTime() + 600000));
afirmar(!log.slice(marca).some((l) => /esumen del d|pendientes_del_dia/.test(l)), "el resumen se manda una sola vez al día");
await vendedor("v1", "Ver la lista", "pendientes");
afirmar(log.at(-1)!.includes("sin vendedor"), "el botón Ver la lista muestra los prospectos sin vendedor");

// --- Compra de equipo
reloj.ahora = new Date("2026-10-19T17:00:00Z"); // lunes 11:00 CDMX
const CE = "+525593333333";
marca = log.length;
for (const t of ["Hola", "Pedro", "Compra de equipo", "Motor de cremallera", "Chalco"]) await cliente(CE, t);
const sCE = solDe(CE);
afirmar(sCE?.codigo?.startsWith("10-1-") && sCE.datos.equipo_compra === "Motor de cremallera" && sCE.completa, `compra de equipo crea folio ${sCE?.codigo}`);
afirmar(log.slice(marca).some((l) => l.includes("Pregunta 2 de 2")), "compra de equipo: 2 preguntas con contador");
afirmar(log.slice(marca).some((l) => l.startsWith("VENDEDOR") && l.includes("Compra de equipo: Motor de cremallera")), "el vendedor recibe el equipo solicitado");
afirmar(log.slice(marca).some((l) => l.startsWith("VENDEDOR") && l.includes("19/10/26 · 10-1-")), "el folio para vendedores lleva la fecha");

// --- Zona deducida del municipio
const Z1 = "+525592222222";
for (const t of ["Hola", "Lucía", "1", "Iztapalapa, CDMX"]) await cliente(Z1, t);
afirmar(log.at(-2)!.includes("Estado de México") && tablas["contactos"]!.find((c) => c.telefono === Z1)!.en_estado_de_mexico === false, "municipio de CDMX se marca fuera de zona sin preguntar");
const Z2 = "+525591111111";
for (const t of ["Hola", "Marta", "1", "Rancho El Mirador"]) await cliente(Z2, t);
const estZ2 = tablas["estado_conversacion"]!.find((e) => e.contacto_id === tablas["contactos"]!.find((c) => c.telefono === Z2)!.id)!;
afirmar((estZ2.datos as { respuestas?: { zona?: string } }).respuestas?.zona === "Por confirmar", "municipio no reconocido queda como zona por confirmar");

// --- Se registra en qué pregunta se quedó
reloj.ahora = new Date(reloj.ahora.getTime() + 30 * 3600000);
await procesarRecordatorios(db, canal, reloj.ahora);
afirmar(solDe(Z2)?.datos.abandono_en === "Tipo de portón", `se guarda dónde abandonó (${String(solDe(Z2)?.datos.abandono_en)})`);

// --- Menú de comandos del vendedor
tablas["material_venta"] = [
  { id: "m1", titulo: "Garantía", descripcion: "Condiciones", texto: "Garantía de 1 año en instalación.", archivos: [], solo_admin: false, activo: true, orden: 1, usos: 0 },
  { id: "m2", titulo: "Trabajos", descripcion: null, texto: null, archivos: [{ url: "https://x/t1.jpg", tipo: "imagen" }, { url: "https://x/cat.pdf", tipo: "documento", nombre: "Catálogo" }], solo_admin: false, activo: true, orden: 2, usos: 0 },
  { id: "m3", titulo: "Cuenta bancaria", descripcion: null, texto: "Datos de depósito", archivos: [], solo_admin: true, activo: true, orden: 3, usos: 0 },
];
reloj.ahora = new Date(reloj.ahora.getTime() + 3600000);
marca = log.length;
await vendedor("v2", "comandos");
const menuAna = log.slice(marca).find((l) => l.startsWith("VENDEDOR Ana")) ?? "";
afirmar(menuAna.includes("Mis prospectos") && menuAna.includes("Mis cotizados") && menuAna.includes("Registrar resultado") && menuAna.includes("Ventas y comisión") && menuAna.includes("Garantía") && !menuAna.includes("Cuenta bancaria"), "COMANDOS abre el menú (sin material solo de administrador)");
marca = log.length;
await vendedor("v1", "COMANDOS");
await vendedor("v1", "Más material", "cmd:mas");
afirmar(log.slice(marca).some((l) => l.includes("Más material")) && log.slice(marca).some((l) => l.includes("Cuenta bancaria")), "el administrador ve también el material solo para administradores (en Más material)");
marca = log.length;
await vendedor("v2", "Trabajos", "mat:m2");
const envio = log.slice(marca).filter((l) => l.startsWith("VENDEDOR Ana"));
afirmar(envio.some((l) => l.includes("[Imagen]")) && envio.some((l) => l.includes("[Documento: Catálogo]")), "el material manda fotos y PDF");
afirmar(tablas["material_venta"]![1]!.usos === 1 && (tablas["material_uso"] ?? []).length === 1, "se registra el uso del material");
await vendedor("v2", "Cuenta bancaria", "mat:m3");
afirmar(log.at(-1)!.includes("ya no está disponible"), "un vendedor no puede pedir material solo de administrador");

// Ver mis prospectos → ficha
const deAna = tablas["solicitudes"]!.find((x) => x.vendedor_id === "v2" && [1, 2, 3].includes(x.etapa));
if (!deAna) {
  const libre = tablas["solicitudes"]!.find((x) => !x.vendedor_id && x.etapa === 1)!;
  libre.vendedor_id = "v2";
}
const suya = tablas["solicitudes"]!.find((x) => x.vendedor_id === "v2" && [1, 2, 3].includes(x.etapa))!;
marca = log.length;
await vendedor("v2", "Ver mis prospectos", "cmd:mis");
afirmar(log.slice(marca).some((l) => l.includes(`Núm. ${String(suya.numero).padStart(4, "0")}`)), "Ver mis prospectos lista los suyos");
marca = log.length;
await vendedor("v2", suya.codigo, `ficha:${suya.id}`);
afirmar(log.at(-1)!.includes("Hacer cotización") && log.at(-1)!.includes("Ver todo del cliente") && log.at(-1)!.includes("Cotizado") && log.at(-1)!.includes("Ver otro prospecto") && log.at(-1)!.includes("Menú"), "el prospecto sin cotizar trae sus opciones");

// Ventas del mes
await vendedor("v2", `${suya.numero} vendido 8000`);
marca = log.length;
await vendedor("v2", "Ventas y comisión", "cmd:ventas");
const ventasAna = log.slice(marca).find((l) => l.startsWith("VENDEDOR Ana")) ?? "";
afirmar(ventasAna.includes("Ventas cerradas: 1") && ventasAna.includes("$8,000") && ventasAna.includes("$240"), "ventas y comisión del mes");

// Cualquier otro texto abre el menú
reloj.ahora = new Date(reloj.ahora.getTime() + 11 * 60000);
marca = log.length;
await vendedor("v2", "buenas tardes");
afirmar(log.slice(marca).some((l) => l.includes("escriba *comandos*")) && !log.slice(marca).some((l) => l.includes("¿qué desea hacer?")), "otro mensaje solo recuerda escribir comandos");

// Reasignar avisa al vendedor anterior
const otraSuya = tablas["solicitudes"]!.find((x) => !x.vendedor_id && x.etapa === 1)!;
otraSuya.vendedor_id = "v2";
marca = log.length;
await vendedor("v1", `asigna ${otraSuya.numero} a Carlos`);
if (process.env["DEPURAR"]) console.log(log.slice(marca).join("\n"));
afirmar(log.slice(marca).some((l) => l.startsWith("VENDEDOR Ana") && l.includes("que tenía asignado fue reasignado")), "al reasignar se avisa al vendedor anterior");

// --- Catálogo de equipos
tablas["equipos_catalogo"] = [
  { id: "e1", clave: "AFPAM C-600", nombre: "Motor para portón corredizo hasta 600 kg", categoria: "Motor de cremallera", descripcion: "Instalación incluida.", fotos: [{ url: "https://x/c600a.jpg" }, { url: "https://x/c600b.jpg" }], notas_internas: "Marca X modelo Y", activo: true, orden: 1, usos: 0 },
  { id: "e2", clave: "AFPAM P-300", nombre: "Pistones para portón abatible", categoria: "Pistones", descripcion: null, fotos: [{ url: "https://x/p300.jpg" }], notas_internas: "Marca Z", activo: true, orden: 2, usos: 0 },
];
marca = log.length;
await vendedor("v2", "COMANDOS");
afirmar(log.slice(marca).some((l) => l.includes("Catálogo de equipos")), "el menú trae Catálogo de equipos");
marca = log.length;
await vendedor("v2", "Catálogo de equipos", "cmd:catalogo");
afirmar(log.slice(marca).some((l) => l.includes("Motor de cremallera") && l.includes("Pistones")), "el catálogo muestra las categorías");
marca = log.length;
await vendedor("v2", "Motor de cremallera", "cat:2");
afirmar(log.slice(marca).some((l) => l.includes("AFPAM C-600")), "la categoría lista sus equipos por clave");
marca = log.length;
await vendedor("v2", "AFPAM C-600", "eq:e1");
const fotosEq = log.slice(marca).filter((l) => l.startsWith("VENDEDOR Ana"));
afirmar(fotosEq.filter((l) => l.includes("[Imagen]")).length === 2 && fotosEq[0]!.includes("AFPAM C-600") && fotosEq[0]!.includes("600 kg"), "se mandan las fotos con pie de foto");
afirmar(!fotosEq.some((l) => l.includes("Marca X")), "las notas internas nunca se envían");
afirmar(tablas["equipos_catalogo"]![0]!.usos === 1, "se cuenta el uso del equipo");

// --- Cotización desde el bot
tablas["equipos_catalogo"]!.push(
  { id: "e3", clave: "AFPAM CR-800", nombre: "Motor de cremallera hasta 800 kg", categoria: "Motor de cremallera", descripcion: null, fotos: [], notas_internas: null, activo: true, orden: 3, usos: 0, precio: 8500, costo: 6000, marca: "MarcaQ", modelo: "Q800", capacidad: "800 kg", incluye: "2 controles", unidad: "pieza" },
  { id: "s1", clave: "INST", nombre: "Instalación", categoria: "Servicios y extras", descripcion: null, fotos: [], notas_internas: null, activo: true, orden: 4, usos: 0, precio: 2500, costo: 800, unidad: "servicio" },
);
const suyaCot = tablas["solicitudes"]!.find((x) => x.vendedor_id === "v2" && x.etapa === 1) ?? (() => {
  const libre = tablas["solicitudes"]!.find((x) => !x.vendedor_id && x.etapa === 1)!;
  libre.vendedor_id = "v2";
  return libre;
})();
marca = log.length;
await vendedor("v2", "COMANDOS");
afirmar(log.slice(marca).some((l) => l.includes("Hacer cotización")), "el menú trae Hacer cotización");
await vendedor("v2", "Hacer cotización", "cmd:cotizar");
afirmar(log.at(-1)!.includes("Nueva cotización") && log.at(-1)!.includes("Mis prospectos") && log.at(-1)!.includes("Cliente existente") && log.at(-1)!.includes("Cliente nuevo"), "la cotización pregunta el tipo de cliente");
await vendedor("v2", "Mis prospectos", "cot:mis");
afirmar(log.at(-1)!.includes(`Núm. ${String(suyaCot.numero).padStart(4, "0")}`), "Mis prospectos lista los del vendedor");
await vendedor("v2", suyaCot.codigo, `cot:sol:${suyaCot.id}`);
afirmar(log.at(-1)!.includes("Datos del cliente") && log.at(-1)!.includes("Corregir datos"), "muestra los datos del cliente antes de cotizar");
await vendedor("v2", "Continuar", "cot:ok");
afirmar(log.at(-1)!.includes("¿Qué equipo va a cotizar?") && log.at(-1)!.includes("Motor de cremallera") && !log.at(-1)!.includes("Servicios y extras"), "pregunta el equipo por categoría (sin servicios)");
await vendedor("v2", "Motor de cremallera", "cot:cat:2");
await vendedor("v2", "AFPAM CR-800", "cot:eq:e3");
afirmar(log.at(-1)!.includes("$8,500"), "ofrece el precio del catálogo");
await vendedor("v2", "Usar este precio", "cot:usar");
afirmar(log.at(-1)!.includes("¿Cuántas unidades?"), "después del precio pregunta la cantidad");
await vendedor("v2", "1", "cot:cant:1");
await vendedor("v2", "Servicios y extras", "cot:serv");
await vendedor("v2", "Instalación", "cot:eq:s1");
await vendedor("v2", "Otro precio", "cot:otro");
await vendedor("v2", "3000");
await vendedor("v2", "1", "cot:cant:1");
await vendedor("v2", "Concepto a mano", "cot:libre");
await vendedor("v2", "Fabricación de portón elevadizo 3 x 2.4 m");
await vendedor("v2", "abc");
afirmar(log.at(-1)!.includes("No entendí el precio"), "precio no válido se vuelve a pedir");
await vendedor("v2", "18,000");
await vendedor("v2", "1", "cot:cant:1");
await vendedor("v2", "Controles", "cot:serv");
await vendedor("v2", "Instalación", "cot:eq:s1");
await vendedor("v2", "Otro precio", "cot:otro");
await vendedor("v2", "2 x 350");
afirmar(log.at(-1)!.includes("Total: *$30,200.00*"), `suma bien las partidas (${log.at(-1)!.slice(-60)})`);
await vendedor("v2", "Quitar", "cot:quitar");
await vendedor("v2", "Quitar 4", "cot:q:3");
afirmar(log.at(-1)!.includes("Total: *$29,500.00*"), "quitar un concepto");
await vendedor("v2", "Terminar", "cot:fin");
await vendedor("v2", "Más IVA", "cot:iva:mas");
afirmar(log.at(-1)!.includes("Resumen de la cotización") && log.at(-1)!.includes("Precios más IVA"), "resumen final con IVA");
marca = log.length;
await vendedor("v2", "PDF con marca", "cot:pdf:si");
const cotizacion = (tablas["cotizaciones"] ?? []).at(-1);
afirmar(cotizacion && cotizacion.total === 29500 && cotizacion.con_marca && cotizacion.equipo_principal_id === "e3", "se guarda la cotización");
afirmar(Object.keys(archivos).some((r) => r.startsWith("cotizaciones/")) && Object.values(archivos).some((b) => b.length > 10000), "se genera el PDF");
afirmar(log.slice(marca).some((l) => l.startsWith("VENDEDOR Ana") && l.includes("[Documento:")), "el PDF le llega solo al vendedor");
afirmar(log.slice(marca).some((l) => l.includes("ganancia aproximada")) && log.slice(marca).some((l) => l.includes("Revísela antes de reenviarla")), "aviso de revisar y la ganancia");
if (process.env["GUARDAR_PDF"]) for (const [r, b] of Object.entries(archivos)) if (r.endsWith(".pdf")) (await import("node:fs")).writeFileSync(process.env["GUARDAR_PDF"], b);
afirmar(suyaCot.etapa === 2, "el prospecto pasa a Cotizado");
afirmar(!(tablas["usuarios_perfil"]!.find((u) => u.id === "v2")!.estado_bot as { cot?: unknown }).cot, "el borrador se borra al terminar");
await vendedor("v2", "Hacer cotización", "cmd:cotizar");
await vendedor("v2", "cancelar");
afirmar(log.slice(-2)[0]!.includes("Cotización cancelada") && log.at(-1)!.includes("¿Desea hacer alguna otra acción?"), "cancelar una cotización y ofrecer el menú");
marca = log.length;
await vendedor("v2", "Ver la cotización", `vcot:${suyaCot.id}`);
afirmar(log.slice(marca).some((l) => l.includes("[Documento:")) && log.at(-1)!.includes("$29,500"), "Ver la cotización reenvía el PDF");
const cotsAntes = (tablas["cotizaciones"] ?? []).length;
await vendedor("v2", "Volver a cotizar", `cmd:recotizar:${suyaCot.id}`);
afirmar(log.slice(-2)[0]!.includes("Se cargaron los conceptos") && log.at(-1)!.includes("Total: *$29,500.00*"), "Volver a cotizar carga los conceptos anteriores");
await vendedor("v2", "Terminar", "cot:fin");
await vendedor("v2", "Más IVA", "cot:iva:mas");
marca = log.length;
await vendedor("v2", "PDF sin marca", "cot:pdf:no");
const recot = (tablas["cotizaciones"] ?? []).at(-1)!;
afirmar((tablas["cotizaciones"] ?? []).length === cotsAntes + 1 && recot.total === 29500 && recot.solicitud_id === suyaCot.id && recot.folio !== cotizacion!.folio, "la nueva cotización sale con folio nuevo");
afirmar(log.at(-1)!.includes("Corregir y rehacer"), "después de generar ofrece Corregir y rehacer");

// --- Otra acción, Ver mis prospectos sin resultados y "No le interesó"
const tres = tablas["solicitudes"]!.filter((x) => !x.vendedor_id && x.etapa === 1).slice(0, 3);
for (const x of tres) x.vendedor_id = "v2";
const [pA, pB, pC] = tres;
marca = log.length;
await vendedor("v2", `${pA!.numero} cotizado`);
afirmar(log.at(-1)!.includes("¿Desea hacer alguna otra acción?") && log.at(-1)!.includes("Mis cotizados"), "después de registrar un resultado se ofrece el menú");
afirmar(log.slice(marca).some((l) => l.includes("Ahora aparece en *Mis cotizados*")), "al cotizar avisa que pasa a Mis cotizados");
marca = log.length;
await vendedor("v2", "Mis cotizados", "cmd:cotizados");
afirmar(log.slice(marca).join(" ").includes(`Núm. ${String(pA!.numero).padStart(4, "0")}`) && log.at(-1)!.includes("Mis cotizados"), "Mis cotizados muestra al cotizado");
marca = log.length;
await vendedor("v2", "Ver mis prospectos", "cmd:mis");
const listaMis = log.slice(marca).join(" ");
afirmar(!listaMis.includes(`Núm. ${String(pA!.numero).padStart(4, "0")}`) && listaMis.includes(`Núm. ${String(pB!.numero).padStart(4, "0")}`), "Ver mis prospectos ya no muestra los que tienen resultado");
marca = log.length;
await vendedor("v2", "Registrar resultado", "cmd:resultado");
afirmar(log.slice(marca).join(" ").includes(`Núm. ${String(pA!.numero).padStart(4, "0")}`), "Registrar resultado sigue mostrando los cotizados");
await vendedor("v2", pB!.codigo, `seg:${pB!.id}`);
afirmar(log.at(-1)!.includes("Cotizado") && log.at(-1)!.includes("Perdido"), "Registrar resultado de un prospecto sin cotizar permite marcarlo Cotizado");
afirmar(log.at(-1)!.includes("No le interesó"), "el resultado No le interesó aparece en la lista");
marca = log.length;
await vendedor("v2", "No le interesó", `res:n:${pB!.id}`);
const contactoB = tablas["contactos"]!.find((c) => c.id === pB!.contacto_id)!;
afirmar(pB!.etapa === 0 && contactoB.nivel_interes === "no le interesó", "No le interesó cierra el prospecto y marca el contacto");
afirmar(log.slice(marca).some((l) => l.includes("quedó guardado en Contactos")), "avisa que el número quedó guardado");
await vendedor("v2", `${pC!.numero} no le interesó`);
afirmar(pC!.etapa === 0 && tablas["contactos"]!.find((c) => c.id === pC!.contacto_id)!.nivel_interes === "no le interesó", "comando escrito 0045 no le interesó");
marca = log.length;
await vendedor("v2", "Ventas y comisión", "cmd:ventas");
afirmar(log.at(-1)!.includes("¿Desea hacer alguna otra acción?"), "ventas termina con el menú");

// --- Cotización a cliente nuevo: crea contacto y prospecto
const solicitudesAntes = tablas["solicitudes"]!.length;
await vendedor("v2", "Hacer cotización", "cmd:cotizar");
await vendedor("v2", "Cliente nuevo", "cot:nuevo");
await vendedor("v2", "no");
afirmar(log.at(-1)!.includes("nombre completo"), "rechaza un nombre que no es nombre");
await vendedor("v2", "roberto gómez");
await vendedor("v2", "123");
afirmar(log.at(-1)!.includes("10 dígitos"), "valida el teléfono");
await vendedor("v2", "1111111111");
afirmar(log.at(-1)!.includes("no empiezan con 0 ni con 1"), "rechaza teléfonos que empiezan con 1");
await vendedor("v2", "5555555555");
afirmar(log.at(-1)!.includes("no parece real"), "rechaza teléfonos de un solo dígito repetido");
await vendedor("v2", "55 4444 3333");
await vendedor("v2", "Chalco");
afirmar(log.at(-1)!.includes("¿Qué servicio va a cotizar?"), "cliente nuevo: pregunta el servicio");
await vendedor("v2", "Corredizo", "cot:srv:4");
afirmar(log.at(-1)!.includes("¿Qué equipo va a cotizar?") && log.at(-1)!.includes("Roberto Gómez"), "cliente nuevo: sigue con los equipos");
await vendedor("v2", "Concepto a mano", "cot:libre");
await vendedor("v2", "Portón corredizo 4 x 2 m");
await vendedor("v2", "15000");
await vendedor("v2", "1", "cot:cant:1");
await vendedor("v2", "Terminar", "cot:fin");
await vendedor("v2", "No mencionar", "cot:iva:no");
marca = log.length;
await vendedor("v2", "PDF sin marca", "cot:pdf:no");
const nuevoContacto = tablas["contactos"]!.find((c) => c.telefono === "+525544443333");
const nuevaSol = tablas["solicitudes"]!.at(-1)!;
afirmar(nuevoContacto?.nombre === "Roberto Gómez" && nuevoContacto.municipio === "Chalco", "se registra el contacto nuevo");
afirmar(tablas["solicitudes"]!.length === solicitudesAntes + 1 && nuevaSol.contacto_id === nuevoContacto?.id && nuevaSol.vendedor_id === "v2" && nuevaSol.etapa === 2 && nuevaSol.servicio_codigo === 4, `se registra el prospecto ${nuevaSol.codigo} a nombre del vendedor`);
afirmar(log.slice(marca).some((l) => l.includes("Se registró el prospecto")), "avisa del prospecto nuevo");
afirmar((tablas["cotizaciones"] ?? []).at(-1)!.solicitud_id === nuevaSol.id, "la cotización queda ligada al prospecto nuevo");
// El cliente cotizado escribe al bot: su mensaje va a su vendedor y no se crea otro prospecto
const antesDeEscribir = tablas["solicitudes"]!.length;
marca = log.length;
await cliente("+525544443333", "Hola, ¿ya tienen mi cotización?");
afirmar(tablas["solicitudes"]!.length === antesDeEscribir, "el cliente cotizado que escribe no genera un prospecto duplicado");
afirmar(log.slice(marca).some((l) => l.startsWith("VENDEDOR Ana") && l.includes("ya tienen mi cotización")) && !log.slice(marca).some((l) => l.includes("indicarme su *nombre*")), "su mensaje le llega al vendedor que cotizó, sin encuesta");

// --- Cliente existente: búsqueda por teléfono y corrección del nombre
const existente = tablas["contactos"]!.find((c) => c.telefono === "+525511111111")!;
existente.nombre = "no";
await vendedor("v2", "Hacer cotización", "cmd:cotizar");
await vendedor("v2", "Cliente existente", "cot:existente");
await vendedor("v2", "1111");
afirmar(log.at(-1)!.includes("Elija al cliente") && log.at(-1)!.includes("1) no"), "busca clientes por los últimos dígitos");
await vendedor("v2", "no", `cot:con:${existente.id}`);
afirmar(log.at(-1)!.includes("parece no ser válido"), "avisa cuando el nombre registrado es sospechoso");
await vendedor("v2", "Corregir datos", "cot:datos");
await vendedor("v2", "Juan Pérez López");
await vendedor("v2", "Usar el mismo", "cot:tel:mismo");
await vendedor("v2", "Usar el mismo", "cot:mun:mismo");
afirmar(existente.nombre === "Juan Pérez López", "el nombre corregido se guarda en el contacto");
const tieneAbierto = tablas["solicitudes"]!.some((x) => x.contacto_id === existente.id && x.vendedor_id === "v2" && [1, 2, 3].includes(x.etapa));
afirmar(log.at(-1)!.includes(tieneAbierto ? "¿Qué equipo va a cotizar?" : "¿Qué servicio va a cotizar?"), `cliente existente: ${tieneAbierto ? "usa su prospecto abierto" : "pregunta el servicio para crear el prospecto"}`);
await vendedor("v2", "Juan", "cot:con:xx");
await vendedor("v2", "cancelar");
marca = log.length;
await vendedor("v2", "Hacer cotización", "cmd:cotizar");
await vendedor("v2", "Cliente existente", "cot:existente");
await vendedor("v2", "pérez");
afirmar(log.at(-1)!.includes("Juan Pérez López"), "busca clientes por nombre sin importar acentos");
await vendedor("v2", "cancelar");
const lucia = tablas["contactos"]!.find((c) => c.telefono === "+525592222222")!;
const antesLucia = tablas["solicitudes"]!.length;
await vendedor("v2", "Hacer cotización", "cmd:cotizar");
await vendedor("v2", "Cliente existente", "cot:existente");
await vendedor("v2", "lucia");
await vendedor("v2", "Lucía", `cot:con:${lucia.id}`);
await vendedor("v2", "Continuar", "cot:ok");
afirmar(log.at(-1)!.includes("¿Qué servicio va a cotizar?"), "cliente existente sin prospecto abierto: pregunta el servicio");
await vendedor("v2", "Mantenimiento", "cot:srv:9");
await vendedor("v2", "Concepto a mano", "cot:libre");
await vendedor("v2", "Mantenimiento preventivo");
await vendedor("v2", "1200");
await vendedor("v2", "1", "cot:cant:1");
await vendedor("v2", "Terminar", "cot:fin");
await vendedor("v2", "No mencionar", "cot:iva:no");
await vendedor("v2", "PDF sin marca", "cot:pdf:no");
const solLucia = tablas["solicitudes"]!.at(-1)!;
afirmar(tablas["solicitudes"]!.length === antesLucia + 1 && solLucia.contacto_id === lucia.id && solLucia.servicio_codigo === 9 && solLucia.vendedor_id === "v2", "cliente existente: se crea su prospecto nuevo");

// --- Cantidad, precio en cero y por debajo del costo
await vendedor("v2", "Hacer cotización", "cmd:cotizar");
await vendedor("v2", "Cliente existente", "cot:existente");
await vendedor("v2", "lucia");
await vendedor("v2", "Lucía", `cot:con:${tablas["contactos"]!.find((c) => c.telefono === "+525592222222")!.id}`);
await vendedor("v2", "Continuar", "cot:ok");
await vendedor("v2", "Motor de cremallera", "cot:cat:2");
await vendedor("v2", "AFPAM CR-800", "cot:eq:e3");
await vendedor("v2", "Otro precio", "cot:otro");
await vendedor("v2", "3");
afirmar(log.at(-1)!.includes("menor que el costo"), "avisa si el precio es menor que el costo");
await vendedor("v2", "Corregir precio", "cot:otro");
await vendedor("v2", "9000");
await vendedor("v2", "Otra cantidad", "cot:cant:otra");
await vendedor("v2", "tres");
afirmar(log.at(-1)!.includes("solo la cantidad"), "la cantidad debe ser un número");
await vendedor("v2", "3");
afirmar(log.at(-1)!.includes("AFPAM CR-800") && log.at(-1)!.includes("3 × $9,000.00"), "agrega la partida con la cantidad elegida");
await vendedor("v2", "Concepto a mano", "cot:libre");
await vendedor("v2", "Cableado incluido");
await vendedor("v2", "0");
afirmar(log.at(-1)!.includes("quedó en *$0.00*"), "avisa si el precio es cero");
await vendedor("v2", "Sí, es correcto", "cot:pok");
await vendedor("v2", "1", "cot:cant:1");

// --- Un prospecto se atraviesa: pausa y Continuar cotización
await vendedor("v2", "Concepto a mano", "cot:libre");
const preguntaPendiente = log.at(-1)!;
await vendedor("v2", "Ver detalles", `ver:${tablas["solicitudes"]!.find((x) => !x.vendedor_id)?.id ?? "x"}`);
await vendedor("v2", "comandos");
if (process.env["DEPURAR"]) console.log(log.slice(-6).join("\n"));
afirmar(log.at(-1)!.includes("Continuar cotización"), "el menú ofrece continuar la cotización a medias");
marca = log.length;
await vendedor("v2", "hola");
afirmar(!log.slice(marca).some((l) => l.includes("Escriba el precio")), "con la cotización en pausa, lo escrito no se toma como concepto");
await vendedor("v2", "Continuar cotización", "cot:seguir");
afirmar(log.at(-1) === preguntaPendiente, "Continuar cotización repite la última pregunta");
await vendedor("v2", "Visita técnica");
afirmar(log.at(-1)!.includes("Visita técnica") && log.at(-1)!.includes("precio unitario"), "la cotización sigue donde se quedó");
await vendedor("v2", "cancelar");

// --- Cliente nuevo sin datos (Omitir) y producto a mano desde la lista de equipos
await vendedor("v2", "Hacer cotización", "cmd:cotizar");
await vendedor("v2", "Cliente nuevo", "cot:nuevo");
afirmar(log.at(-1)!.includes("Omitir"), "el nombre se puede omitir");
await vendedor("v2", "Omitir", "cot:omitir:nombre");
afirmar(log.at(-1)!.includes("teléfono") && log.at(-1)!.includes("Omitir"), "luego pide el teléfono con Omitir");
await vendedor("v2", "omitir");
afirmar(log.at(-1)!.includes("municipio") && log.at(-1)!.includes("Omitir"), "luego el municipio con Omitir");
await vendedor("v2", "Omitir", "cot:omitir:mun");
await vendedor("v2", "Corredizo", "cot:srv:4");
afirmar(log.at(-1)!.includes("Cliente sin nombre"), "sigue sin nombre");
await vendedor("v2", "Motor de cremallera", "cot:cat:2");
afirmar(log.at(-1)!.includes("Producto/servicio a mano") && log.at(-1)!.includes("AFPAM CR-800"), "la lista de equipos trae Producto/servicio a mano");
await vendedor("v2", "Producto/servicio a mano", "cot:libre");
afirmar(log.at(-1)!.includes("nombre del producto o servicio"), "pide el nombre del producto");
await vendedor("v2", "Reja de herrería");
afirmar(log.at(-1)!.includes("precio unitario"), "luego el precio");
await vendedor("v2", "5000");
afirmar(log.at(-1)!.includes("¿Cuántas unidades?"), "luego la cantidad");
await vendedor("v2", "1", "cot:cant:1");
await vendedor("v2", "Terminar", "cot:fin");
await vendedor("v2", "No mencionar", "cot:iva:no");
await vendedor("v2", "PDF sin marca", "cot:pdf:no");
const sinNombre = (tablas["cotizaciones"] ?? []).at(-1)!;
afirmar(sinNombre.cliente_nombre === "Sin nombre" && sinNombre.total === 5000 && (sinNombre.partidas as Array<{ concepto: string }>)[0]!.concepto === "Reja de herrería", "cotización sin datos del cliente con el producto a mano");

// --- Horario con "Por la mañana"
const H = "+525590000001";
for (const t of ["Hola", "Teresa", "1", "Texcoco", "corredizo", "Sí, ya lo tengo", "3 x 2", "omitir"]) await cliente(H, t);
afirmar(log.at(-1)!.includes("Por la mañana") && log.at(-1)!.includes("Por la tarde"), "horario: Por la mañana / Por la tarde");
await cliente(H, "mañana");
afirmar(solDe(H)?.datos.horario_preferido === "Por la mañana", "escribir mañana elige Por la mañana");

// --- Varios a la vez y Ver datos desde el seguimiento
const libres = tablas["solicitudes"]!.filter((x) => !x.vendedor_id && x.etapa === 1).slice(0, 3);
for (const x of libres) x.vendedor_id = "v1";
reloj.ahora = new Date(reloj.ahora.getTime() + 3600000);
tablas["usuarios_perfil"]![0]!.ultimo_mensaje_wa = reloj.ahora.toISOString();
await vendedor("v1", "Registrar resultado", "cmd:resultado");
afirmar(log.at(-1)!.includes("Varios a la vez"), "Registrar resultado ofrece Varios a la vez");
await vendedor("v1", "Varios a la vez", "varios:");
const numerados = ((tablas["usuarios_perfil"]![0]!.estado_bot as { numerados?: string[] }).numerados ?? []);
afirmar(log.at(-1)!.includes("1)") && numerados.length >= 3, "muestra los prospectos numerados");
await vendedor("v1", "hola");
afirmar(log.at(-1)!.includes("solo los números"), "pide solo números");
const elegir3 = libres.map((x) => numerados.indexOf(x.id) + 1);
await vendedor("v1", elegir3.join(", "));
afirmar(log.at(-1)!.includes("Eligió 3 prospecto(s)") && !log.at(-1)!.includes("Vendido"), "pregunta el resultado para los elegidos (sin Vendido)");
await vendedor("v1", "Cotizado", "resv:2");
afirmar(libres.every((x) => x.etapa === 2) && log.slice(-2)[0]!.includes("en 3 prospecto(s)"), "registra el mismo resultado en varios");
afirmar(log.at(-1)!.includes("Mis prospectos") && log.at(-1)!.includes("Mis cotizados") && log.at(-1)!.includes("Menú"), "después ofrece Mis prospectos y Mis cotizados");
await vendedor("v1", libres[0]!.codigo, `seg:${libres[0]!.id}`);
afirmar(log.at(-1)!.includes("Vendido") && log.at(-1)!.includes("Volver a cotizar") && !log.at(-1)!.includes("Hacer cotización"), "el seguimiento de un cotizado trae sus propias opciones");
marca = log.length;
await vendedor("v1", "Mis prospectos", "cmd:mis");
afirmar(!log.slice(marca).join(" ").includes(`Núm. ${String(libres[0]!.numero).padStart(4, "0")}`), "el cotizado ya no está en Mis prospectos");
await vendedor("v1", "Mis cotizados", "cmd:cotizados");
afirmar(log.at(-1)!.includes(`Núm. ${String(libres[0]!.numero).padStart(4, "0")}`) && log.at(-1)!.includes("Varios a la vez"), "Mis cotizados lo muestra");
await vendedor("v1", "x", `ficha:${libres[0]!.id}`);
afirmar(log.at(-1)!.includes("Teléfono:") && log.at(-1)!.includes("Ver la cotización") && log.at(-1)!.includes("Ver otro cotizado"), "el cotizado muestra sus datos y opciones");
await vendedor("v1", "Ver la cotización", `vcot:${libres[0]!.id}`);
afirmar(log.at(-1)!.includes("no tiene una cotización hecha en el bot"), "cotizado por fuera: avisa que no hay PDF");
marca = log.length;
await vendedor("v1", "Ver todo del cliente", `todo:${libres[0]!.id}`);
afirmar(log.slice(marca).some((l) => l.includes("[Contacto]")) && log.slice(marca).some((l) => l.includes("Conversación con el bot")), "Ver todo manda tarjeta, datos y conversación");
marca = log.length;
await vendedor("v1", String(libres[0]!.numero).padStart(4, "0"));
afirmar(log.slice(marca).some((l) => l.includes("Le envío toda la información")) && log.slice(marca).some((l) => l.includes("[Contacto]")), "escribir el número del prospecto manda toda su información");
marca = log.length;
await vendedor("v2", String(libres[0]!.numero));
afirmar(log.at(-1)!.includes("asignado a Carlos") && !log.slice(marca).some((l) => l.includes("[Contacto]")), "el número de un prospecto ajeno no manda sus datos");
await vendedor("v1", "Varios a la vez", "varios:cotizados");
await vendedor("v1", "1");
afirmar(log.at(-1)!.includes("Negociando") && !log.at(-1)!.includes("Cotizado"), "varios a la vez de cotizados: sus propios resultados");
await vendedor("v1", "cancelar");
await vendedor("v1", "Material", "cmd:material");
afirmar(log.at(-1)!.includes("Elija el material"), "Otro material abre la lista de material");

// --- Portón elevadizo con la fórmula
const extraConf = config.textos_extra as Record<string, string>;
delete extraConf["elev_dolar"];
extraConf["elev_dolar_modo"] = "manual";
await vendedor("v2", "Hacer cotización", "cmd:cotizar");
await vendedor("v2", "Cliente existente", "cot:existente");
await vendedor("v2", "lucia");
await vendedor("v2", "Lucía", `cot:con:${tablas["contactos"]!.find((c) => c.telefono === "+525592222222")!.id}`);
await vendedor("v2", "Continuar", "cot:ok");
afirmar(log.at(-1)!.includes("Portón elevadizo"), "la cotización ofrece Portón elevadizo");
await vendedor("v2", "Portón elevadizo", "cot:elev");
await vendedor("v2", "2.90");
await vendedor("v2", "2.10");
afirmar(log.at(-1)!.includes("Falta el precio fijo del dólar"), "dólar fijo sin capturar: avisa");
config.textos_extra = { ...extraConf, elev_dolar_modo: "auto", elev_dolar_auto: "18.5", elev_dolar_auto_fecha: reloj.ahora.toISOString() };
await vendedor("v2", "Portón elevadizo", "cot:elev");
await vendedor("v2", "2,90");
await vendedor("v2", "210 cm");
afirmar(log.at(-1)!.includes("10 × 7 pies") && log.at(-1)!.includes("$31,211.42"), `2.90 × 2.10 m → 10 × 7 pies a $31,211.42 (${log.at(-1)!.slice(0, 160)})`);
await vendedor("v2", "Medida mayor", "cot:emayor");
afirmar(log.at(-1)!.includes("12 × 7 pies") && log.at(-1)!.includes("$37,597.92") && log.at(-1)!.includes("Medida menor"), "Medida mayor sube a 12 × 7");
await vendedor("v2", "Usar este precio", "cot:usar");
await vendedor("v2", "1", "cot:cant:1");
afirmar(log.at(-1)!.includes("Portón elevadizo de paneles tipo americano 12 × 7 pies"), "agrega la partida del elevadizo");
await vendedor("v2", "Portón elevadizo", "cot:elev");
await vendedor("v2", "3.03");
await vendedor("v2", "2.40");
afirmar(log.at(-1)!.includes("12 × 8 pies") && log.at(-1)!.includes("muy justa"), "si la medida exacta queda muy justa toma la siguiente");
await vendedor("v2", "Medida menor", "cot:emenor");
afirmar(log.at(-1)!.includes("10 × 8 pies"), "Medida menor regresa a la exacta");
await vendedor("v2", "Portón elevadizo", "cot:elev");
await vendedor("v2", "7");
await vendedor("v2", "2.2");
afirmar(log.at(-1)!.includes("se cotiza a mano"), "más grande que la tabla: a mano");
await vendedor("v2", "cancelar");

// --- Vendido y Perdido se registran aunque no contesten monto o motivo; listas viejas
const tresMas = tablas["solicitudes"]!.filter((x) => !x.vendedor_id && x.etapa === 1).slice(0, 3);
for (const x of tresMas) x.vendedor_id = "v1";
const [pv, pp, px] = tresMas;
await vendedor("v1", "Vendido", `res:4:${pv!.id}`);
afirmar(pv!.etapa === 4 && log.at(-1)!.includes("Lo pongo después"), "Vendido se registra de inmediato y pide el monto");
await vendedor("v1", "Lo pongo después", `montodespues:${pv!.id}`);
afirmar(pv!.etapa === 4 && log.slice(-2)[0]!.includes("ya quedó registrada"), "Lo pongo después deja la venta registrada");
await vendedor("v1", "Perdido", `res:0:${pp!.id}`);
afirmar(pp!.etapa === 0, "Perdido se registra de inmediato");
await vendedor("v1", "el cliente compró en otro lado");
afirmar(String(pp!.notas).includes("compró en otro lado") && log.slice(-2)[0]!.includes("Motivo guardado"), "el motivo se agrega después");
marca = log.length;
await vendedor("v1", "Cotizado", `res:2:${pv!.id}`);
afirmar(pv!.etapa === 4 && log.slice(marca).some((l) => l.includes("ya tiene resultado final")), "una lista vieja no reabre un prospecto vendido");
await vendedor("v1", "x", `seg:${pp!.id}`);
afirmar(log.slice(-2).some((l) => l.includes("ya tiene resultado final")) || log.at(-1)!.includes("Registrar resultado") || log.at(-1)!.includes("prospecto"), "elegir un prospecto cerrado en una lista vieja avisa");
marca = log.length;
await vendedor("v1", "Lo tomo", `tomar:${tablas["solicitudes"]!.find((x) => !x.vendedor_id && x.etapa === 1)?.id ?? px!.id}`);
afirmar(log.slice(marca).some((l) => l.startsWith("VENDEDOR Carlos") && l.includes("Hacer cotización") && l.includes("Menú")), "después de Lo tomo llega el botón de Menú");

// --- Prospecto sin tomar: ficha resumida sin fotos; las fotos llegan una sola vez al tomarlo
const sinTomarConFoto = { id: "st1", contacto_id: tablas["contactos"]![0]!.id, etapa: 1, vendedor_id: null, tomada_en: null, servicio_codigo: 3, codigo: "3-1-0999", numero: 999, datos: { medidas: "3 x 2.4 m" }, completa: true, urgente: false, fuera_de_zona: false, fuera_de_horario: false, notas: null, control_bot: {}, es_ejemplo: false, creada_en: reloj.ahora.toISOString() };
tablas["solicitudes"]!.push(sinTomarConFoto);
tablas["archivos"]!.push({ id: "f1", solicitud_id: sinTomarConFoto.id, url: "https://x/porton.jpg", tipo: "image" });
marca = log.length;
await vendedor("v2", "Ver detalles", `ver:${sinTomarConFoto.id}`);
const vistos = log.slice(marca).filter((l) => l.startsWith("VENDEDOR Ana"));
afirmar(vistos.length === 1 && vistos[0]!.includes("Lo tomo") && vistos[0]!.includes("Fotos del cliente: 1") && !vistos.some((l) => l.includes("[Imagen]")), "sin tomar: un solo mensaje resumido, sin fotos");
marca = log.length;
await vendedor("v2", "Lo tomo", `tomar:${sinTomarConFoto.id}`);
afirmar(log.slice(marca).filter((l) => l.startsWith("VENDEDOR Ana") && l.includes("[Imagen]")).length === 1, "al tomarlo llegan las fotos una sola vez");

// --- Nombre con saludo y menú con instrucción
const NN = "+525590000002";
await cliente(NN, "Hola");
await cliente(NN, "Hola Soy Juan Carlos Carrara");
afirmar(tablas["contactos"]!.find((c) => c.telefono === NN)!.nombre === "Juan Carlos Carrara", "quita el saludo del nombre");
afirmar(log.at(-1)!.includes("Gracias, Juan Carlos Carrara") && log.at(-1)!.includes("Elegir una opción"), "el menú pide elegir una opción");
const NN2 = "+525590000003";
await cliente(NN2, "Buenas tardes");
await cliente(NN2, "buenas tardes, me llamo ana lópez.");
afirmar(tablas["contactos"]!.find((c) => c.telefono === NN2)!.nombre === "Ana López", "quita buenas tardes y me llamo");

// --- Reconocer lo que pide el cliente cuando escribe en lugar de elegir
const estadoDe = (tel: string) => tablas["estado_conversacion"]!.find((x) => x.contacto_id === tablas["contactos"]!.find((c) => c.telefono === tel)!.id)!;
// Caso real: escribe su pregunta en lugar del nombre
const R1 = "+525590000011";
await cliente(R1, "¡Hola! Quiero más información.");
await cliente(R1, "Cuánto me salen los motores tipo pistón que habrán la puerta de dos hojas hacia adentro");
afirmar(!tablas["contactos"]!.find((c) => c.telefono === R1)!.nombre && log.at(-1)!.includes("los pistones para su portón") && log.at(-1)!.includes("*nombre*"), "la pregunta no se guarda como nombre y se vuelve a pedir el nombre");
await cliente(R1, "Pedro Ramírez");
const e1 = estadoDe(R1);
afirmar(tablas["contactos"]!.find((c) => c.telefono === R1)!.nombre === "Pedro Ramírez", "luego guarda el nombre real");
afirmar(e1.paso_actual === "municipio" && (e1.datos as { servicio?: number }).servicio === 2 && log.at(-1)!.includes("Pregunta 1 de 5"), "va directo a instalación, abatible hacia adentro, sin la pregunta del tipo");
afirmar((e1.datos as { respuestas?: { pedido_cliente?: string } }).respuestas?.pedido_cliente?.includes("pistón"), "guarda lo que escribió para el vendedor");
// En el menú escribe en lugar de tocar
const R2 = "+525590000012";
await cliente(R2, "Hola");
await cliente(R2, "Laura");
await cliente(R2, "mi portón no abre, creo que se descompuso el motor");
afirmar(estadoDe(R2).paso_actual === "municipio" && (estadoDe(R2).datos as { flujo?: string }).flujo === "reparacion", "texto libre en el menú: reparación");
const R3 = "+525590000013";
await cliente(R3, "Hola");
await cliente(R3, "Sofía");
marca = log.length;
await cliente(R3, "¿dónde están ubicados?");
afirmar(log.slice(marca).some((l) => l.includes("Horario de atención")) && estadoDe(R3).paso_actual === "menu", "texto libre en el menú: ubicación y vuelve al menú");
await cliente(R3, "asdf qwer");
afirmar(log.slice(-2)[0]!.includes("no logré identificar"), "si no se reconoce nada, pide elegir como antes");
await cliente(R3, "quiero cotizar un portón elevadizo");
afirmar((estadoDe(R3).datos as { servicio?: number }).servicio === 3 && estadoDe(R3).paso_actual === "municipio", "texto libre en el menú: instalación de elevadizo");
// El primer mensaje ya dice lo que quiere
const R4 = "+525590000014";
await cliente(R4, "Buenas, ¿cuánto cuesta un portón corredizo automático?");
await cliente(R4, "Mario");
afirmar((estadoDe(R4).datos as { servicio?: number }).servicio === 4 && estadoDe(R4).paso_actual === "municipio", "si el primer mensaje dice qué quiere, al dar el nombre va directo");
// Un nombre normal largo se sigue tomando como nombre
const R5 = "+525590000015";
await cliente(R5, "Hola");
await cliente(R5, "Juan Carlos Carrara López");
afirmar(tablas["contactos"]!.find((c) => c.telefono === R5)!.nombre === "Juan Carlos Carrara López" && estadoDe(R5).paso_actual === "menu", "un nombre de 4 palabras se guarda normal");

// --- Mensajes fuera de la encuesta, urgencia, interés y conversación para el vendedor
reloj.ahora = new Date("2026-10-26T16:00:00Z"); // lunes 10:00 CDMX
const U1 = "+525590000021";
await cliente(U1, "Hola");
await cliente(U1, "Necesito que vengan, se quedó trabado mi portón y no puedo salir");
const U2 = "+525590000022";
await cliente(U2, "Hola");
reloj.ahora = new Date(reloj.ahora.getTime() + 26 * 3600000);
await procesarRecordatorios(db, canal, reloj.ahora);
const solU1 = solDe(U1)!;
const solU2 = solDe(U2)!;
afirmar(solU1 && String(solU1.datos.fuera_encuesta).includes("no puedo salir") && solU1.urgente, "lo escrito fuera de la encuesta se guarda y marca urgente");
afirmar(tablas["contactos"]!.find((c) => c.telefono === U1)!.nivel_interes === "medio" && tablas["contactos"]!.find((c) => c.telefono === U2)!.nivel_interes === "bajo", "interés: medio si escribió algo, bajo si solo saludó");
marca = log.length;
await vendedor("v2", "Ver detalles", `ver:${solU1.id}`);
const resumenU1 = log.slice(marca).join(" ");
afirmar(resumenU1.includes("Mensajes fuera de la encuesta: 1") && !resumenU1.includes("no puedo salir") && resumenU1.includes("Interés: Medio"), "antes de tomarlo: solo el conteo, sin el contenido");
marca = log.length;
await vendedor("v2", "Lo tomo", `tomar:${solU1.id}`);
const tomaU1 = log.slice(marca).filter((l) => l.startsWith("VENDEDOR Ana"));
afirmar(tomaU1.some((l) => l.includes("Conversación con el bot") && l.includes("Escribió fuera de la encuesta") && l.includes("no puedo salir")), "al tomarlo llega la conversación con lo escrito fuera de la encuesta");
afirmar(tomaU1.at(-1)!.includes("Ver conversación") && tomaU1.at(-1)!.includes("Hacer cotización"), "después de tomarlo se ofrecen Hacer cotización y Ver conversación");
await vendedor("v2", "Hacer cotización", `cmd:cotizar:${solU1.id}`);
afirmar(log.at(-1)!.includes("Datos del cliente") && log.at(-1)!.includes("Continuar"), "Hacer cotización desde el prospecto empieza con ese cliente");
await vendedor("v2", "cancelar");
marca = log.length;
await vendedor("v2", "Ver conversación", `conv:${solU1.id}`);
afirmar(log.slice(marca).some((l) => l.includes("*Cliente*") && l.includes("Necesito que vengan")), "Ver conversación manda la conversación");

// --- Nombre de la tarjeta de contacto
afirmar(nombreTarjeta({ numero: 45, codigo: "3-1-0045", contactos: { nombre: "Juan Pérez", municipio: "Texcoco, San Lorenzo" } }) === "Juan Pérez · Texcoco, San Lorenzo", "tarjeta: nombre y colonia");
afirmar(nombreTarjeta({ numero: 45, codigo: "3-1-0045", contactos: { nombre: "no", municipio: "Chalco" } }) === "Cliente 0045 · Chalco", "tarjeta sin nombre válido: Cliente y número");
afirmar(nombreTarjeta({ numero: 7, codigo: "3-1-0007", contactos: { nombre: null, municipio: null } }) === "Cliente 0007", "tarjeta sin nombre ni colonia");

// --- Manuales técnicos
{
  const pdf = await PDFDocument.create();
  for (let i = 0; i < 3; i++) pdf.addPage([200, 200]);
  const pdfUrl = `data:application/pdf;base64,${Buffer.from(await pdf.save()).toString("base64")}`;
  tablas["manuales"] = [
    { id: "man1", tipo: "Pistones", marca: "Marca X", modelo: "Modelo 300", frecuencia: "433.92 MHz", tipo_codigo: "código variable", pdf_url: pdfUrl, pdf_nombre: "manual-300.pdf", paginas: 3, estado: "publicado", usos: 0 },
    { id: "man2", tipo: "Pistones", marca: "Marca Y", modelo: "Borrador", pdf_url: pdfUrl, estado: "borrador", usos: 0 },
  ];
  tablas["manual_procedimientos"] = [
    { id: "pr1", manual_id: "man1", clave: "programar_controles", titulo: "Programar controles", pasos: "Abra la tapa\nPresione LEARN 2 segundos\nPresione el botón del control", pagina_inicio: 2, pagina_fin: 3, paginas_url: null, activo: true, orden: 1, usos: 0 },
    { id: "pr2", manual_id: "man1", clave: "codigos_error", titulo: "Códigos de error", pasos: "1 parpadeo: fotocelda", pagina_inicio: 3, pagina_fin: 3, activo: false, orden: 2, usos: 0 },
  ];
  marca = log.length;
  await vendedor("v2", "COMANDOS");
  afirmar(log.slice(marca).some((l) => l.includes("Manuales técnicos")), "el menú trae Manuales técnicos");
  await vendedor("v2", "Manuales técnicos", "cmd:manuales");
  afirmar(log.at(-1)!.includes("Marca X · Modelo 300") && !log.at(-1)!.includes("Borrador"), "solo aparecen los manuales publicados");
  await vendedor("v2", "Marca X · Modelo 300", "man:m:man1");
  afirmar(log.at(-1)!.includes("Programar controles") && !log.at(-1)!.includes("Códigos de error") && log.at(-1)!.includes("PDF completo") && log.at(-1)!.includes("433.92 MHz"), "procedimientos activos, frecuencia y PDF completo");
  await vendedor("v2", "Programar controles", "man:p:pr1");
  afirmar(log.some((l) => l.includes("1. Abra la tapa") && l.includes("2. Presione LEARN 2 segundos") && l.includes("Página 2–3")), "manda los pasos numerados con la página");
  afirmar(log.at(-1)!.includes("Ver página del manual") && log.at(-1)!.includes("Otro procedimiento"), "ofrece ver la página y otro procedimiento");
  marca = log.length;
  await vendedor("v2", "Ver página del manual", "man:pag:pr1");
  const recorte = Object.entries(archivos).find(([r]) => r === "manuales/paginas/pr1.pdf");
  const paginasRecorte = recorte ? (await PDFDocument.load(recorte[1])).getPageCount() : 0;
  afirmar(paginasRecorte === 2 && log.slice(marca).some((l) => l.includes("[Documento: Marca X  Modelo 300 pag 2-3.pdf]") || l.includes("pag 2-3")), `manda solo las páginas del procedimiento (${paginasRecorte})`);
  await vendedor("v2", "PDF completo", "man:pdf:man1");
  afirmar(log.slice(-2)[0]!.includes("[Documento: manual-300.pdf]"), "manda el PDF completo");
  await vendedor("v2", "manual modelo 300");
  afirmar(log.at(-1)!.includes("Programar controles"), "búsqueda escrita: manual modelo 300");
}

console.log(fallos ? `\n${fallos} PRUEBA(S) FALLARON` : "\nTODAS LAS PRUEBAS PASARON");
if (fallos) process.exitCode = 1;
