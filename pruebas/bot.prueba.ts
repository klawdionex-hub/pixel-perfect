// Pruebas del bot con base de datos falsa. Ejecutar:  npm run prueba:bot
import { procesarMensajeCliente, procesarRecordatorios, type Canal } from "@/lib/bot/motor.server";
import { procesarMensajeVendedor } from "@/lib/bot/vendedores.server";
import { textoDeSalida, type Salida } from "@/lib/bot/salida";
import { crearBD } from "./bd-falsa";

const servicios = ["Abatible hacia afuera", "Abatible hacia adentro", "Elevadizo con paneles tipo americano", "Corredizo", "Plegadizas", "De maroma", "Cortina eléctrica", "Reparación", "Mantenimiento"].map(
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
for (const t of ["Hola", "juan pérez", "1", "si", "Texcoco, San Lorenzo", "elevadizo", "Sí, ya lo tengo", "4 x 2.4 m", "3", "omitir", "tarde"]) await cliente(A, t);
const sA = solDe(A);
afirmar(sA?.codigo === "3-1-0001" && sA.completa && sA.datos.material === "Lámina", `instalación crea folio ${sA?.codigo}`);
afirmar(log.some((l) => l.includes("folio 3-1-0001")), "cierre con folio");
const avisos = log.filter((l) => l.startsWith("VENDEDOR") && l.includes("afpam_nuevo_prospecto"));
afirmar(avisos.length === 2 && avisos.every((l) => !l.includes("Juan") && !l.includes("551 111")), "aviso a 2 vendedores sin datos de contacto");

// --- Lo tomo y venta
tablas["usuarios_perfil"]![0]!.ultimo_mensaje_wa = reloj.ahora.toISOString();
await vendedor("v1", "Lo tomo", `tomar:${sA!.id}`);
afirmar(sA!.vendedor_id === "v1" && log.some((l) => l.includes(`[Contacto] ${sA!.codigo} Juan`)), "Lo tomo asigna y manda tarjeta");
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

console.log(fallos ? `\n${fallos} PRUEBA(S) FALLARON` : "\nTODAS LAS PRUEBAS PASARON");
if (fallos) process.exitCode = 1;
