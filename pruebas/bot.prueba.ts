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
const canal: Canal = {
  cliente: async (_t, s: Salida) => { log.push("BOT> " + textoDeSalida(s).replace(/\n/g, " | ")); return null; },
  vendedor: async (t, n, s) => { log.push(`VENDEDOR ${n} (${t})> ` + textoDeSalida(s).replace(/\n/g, " | ")); },
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
afirmar(b[0]?.startsWith("BOT> [Imagen]") && b[1]?.startsWith("BOT> [Ubicación]") && b[2]?.includes("¿Podría indicarme su nombre"), `bienvenida: foto, ubicación y saludo (${b.length} mensajes)`);
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

console.log(fallos ? `\n${fallos} PRUEBA(S) FALLARON` : "\nTODAS LAS PRUEBAS PASARON");
if (fallos) process.exitCode = 1;
