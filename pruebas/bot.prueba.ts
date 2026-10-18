// Pruebas del bot con base de datos falsa. Ejecutar:  npm run prueba:bot
import { pasarContactoAVendedores, procesarMensajeCliente, procesarRecordatorios, type Canal } from "@/lib/bot/motor.server";
import { procesarMensajeVendedor, tareasVendedores } from "@/lib/bot/vendedores.server";
import { textoDeSalida, type Salida } from "@/lib/bot/salida";
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
afirmar(sA!.vendedor_id === "v1" && log.some((l) => l.includes(`${sA!.codigo} Juan`) && l.includes("[Contacto] ")), "Lo tomo asigna y manda tarjeta");
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
afirmar(menuAna.includes("Ver mis prospectos") && menuAna.includes("Ventas y comisión") && menuAna.includes("Garantía") && !menuAna.includes("Cuenta bancaria"), "COMANDOS abre el menú (sin material solo de administrador)");
marca = log.length;
await vendedor("v1", "COMANDOS");
afirmar(log.slice(marca).some((l) => l.includes("Cuenta bancaria")), "el administrador ve también el material solo para administradores");
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
afirmar(log.slice(marca).some((l) => l.includes(suya.codigo)), "Ver mis prospectos lista los suyos");
marca = log.length;
await vendedor("v2", suya.codigo, `ficha:${suya.id}`);
afirmar(log.slice(marca).some((l) => l.includes("Registrar resultado")), "la ficha trae el botón Registrar resultado");

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
afirmar(log.at(-1)!.includes(suyaCot.codigo), "Mis prospectos lista los del vendedor");
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

// --- Otra acción, Ver mis prospectos sin resultados y "No le interesó"
const tres = tablas["solicitudes"]!.filter((x) => !x.vendedor_id && x.etapa === 1).slice(0, 3);
for (const x of tres) x.vendedor_id = "v2";
const [pA, pB, pC] = tres;
marca = log.length;
await vendedor("v2", `${pA!.numero} cotizado`);
afirmar(log.at(-1)!.includes("¿Desea hacer alguna otra acción?") && log.at(-1)!.includes("Ver mis prospectos"), "después de registrar un resultado se ofrece el menú");
marca = log.length;
await vendedor("v2", "Ver mis prospectos", "cmd:mis");
const listaMis = log.slice(marca).join(" ");
afirmar(!listaMis.includes(pA!.codigo) && listaMis.includes(pB!.codigo), "Ver mis prospectos ya no muestra los que tienen resultado");
marca = log.length;
await vendedor("v2", "Registrar resultado", "cmd:resultado");
afirmar(log.slice(marca).join(" ").includes(pA!.codigo), "Registrar resultado sigue mostrando los cotizados");
await vendedor("v2", pB!.codigo, `seg:${pB!.id}`);
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
afirmar(log.at(-1)!.includes("Continuar cotización"), "el menú ofrece continuar la cotización a medias");
marca = log.length;
await vendedor("v2", "hola");
afirmar(!log.slice(marca).some((l) => l.includes("Escriba el precio")), "con la cotización en pausa, lo escrito no se toma como concepto");
await vendedor("v2", "Continuar cotización", "cot:seguir");
afirmar(log.at(-1) === preguntaPendiente, "Continuar cotización repite la última pregunta");
await vendedor("v2", "Visita técnica");
afirmar(log.at(-1)!.includes("Visita técnica") && log.at(-1)!.includes("precio unitario"), "la cotización sigue donde se quedó");
await vendedor("v2", "cancelar");

// --- Horario con "Por la mañana"
const H = "+525590000001";
for (const t of ["Hola", "Teresa", "1", "Texcoco", "corredizo", "Sí, ya lo tengo", "3 x 2", "omitir"]) await cliente(H, t);
afirmar(log.at(-1)!.includes("Por la mañana") && log.at(-1)!.includes("Por la tarde"), "horario: Por la mañana / Por la tarde");
await cliente(H, "mañana");
afirmar(solDe(H)?.datos.horario_preferido === "Por la mañana", "escribir mañana elige Por la mañana");

console.log(fallos ? `\n${fallos} PRUEBA(S) FALLARON` : "\nTODAS LAS PRUEBAS PASARON");
if (fallos) process.exitCode = 1;
