// Envío de mensajes por la API oficial de WhatsApp (Meta Cloud API).
const VERSION = "v21.0";

export type Salida =
  | { tipo: "texto"; texto: string }
  | { tipo: "imagen"; url: string; texto?: string }
  | { tipo: "documento"; url: string; nombre?: string; texto?: string }
  | { tipo: "ubicacion"; lat: number; lng: number; nombre?: string; direccion?: string }
  | { tipo: "contacto"; nombre: string; telefono: string }
  | { tipo: "lista"; texto: string; boton?: string; opciones: string[] }
  | { tipo: "botones"; texto: string; opciones: string[] }
  | { tipo: "plantilla"; nombre: string; idioma?: string; parametros?: string[] };

function recortar(t: string, n: number) {
  return t.length > n ? t.slice(0, n - 1) + "." : t;
}

export function cuerpoMeta(to: string, s: Salida): Record<string, unknown> {
  const base = { messaging_product: "whatsapp", to };
  switch (s.tipo) {
    case "texto":
      return { ...base, type: "text", text: { body: s.texto } };
    case "imagen":
      return { ...base, type: "image", image: { link: s.url, caption: s.texto } };
    case "documento":
      return { ...base, type: "document", document: { link: s.url, filename: s.nombre, caption: s.texto } };
    case "ubicacion":
      return { ...base, type: "location", location: { latitude: s.lat, longitude: s.lng, name: s.nombre, address: s.direccion } };
    case "contacto":
      return {
        ...base,
        type: "contacts",
        contacts: [{ name: { formatted_name: s.nombre, first_name: s.nombre }, phones: [{ phone: s.telefono, type: "WORK" }] }],
      };
    case "lista":
      return {
        ...base,
        type: "interactive",
        interactive: {
          type: "list",
          body: { text: s.texto },
          action: {
            button: recortar(s.boton ?? "Ver opciones", 20),
            sections: [{ title: "Opciones", rows: s.opciones.slice(0, 10).map((o, i) => ({ id: String(i + 1), title: recortar(o, 24) })) }],
          },
        },
      };
    case "botones":
      return {
        ...base,
        type: "interactive",
        interactive: {
          type: "button",
          body: { text: s.texto },
          action: { buttons: s.opciones.slice(0, 3).map((o, i) => ({ type: "reply", reply: { id: String(i + 1), title: recortar(o, 20) } })) },
        },
      };
    case "plantilla":
      return {
        ...base,
        type: "template",
        template: {
          name: s.nombre,
          language: { code: s.idioma ?? "es_MX" },
          components: s.parametros?.length
            ? [{ type: "body", parameters: s.parametros.map((p) => ({ type: "text", text: p })) }]
            : [],
        },
      };
  }
}

export async function enviarWhatsApp(telefono: string, s: Salida): Promise<string | null> {
  const token = process.env["WHATSAPP_TOKEN"];
  const phoneId = process.env["WHATSAPP_PHONE_NUMBER_ID"];
  if (!token || !phoneId) throw new Error("Faltan WHATSAPP_TOKEN o WHATSAPP_PHONE_NUMBER_ID");
  const r = await fetch(`https://graph.facebook.com/${VERSION}/${phoneId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(cuerpoMeta(telefono, s)),
  });
  const texto = await r.text();
  if (!r.ok) {
    console.error(`WhatsApp envío falló [${r.status}]: ${texto}`);
    throw new Error(`WhatsApp [${r.status}]: ${texto}`);
  }
  const j = JSON.parse(texto) as { messages?: { id: string }[] };
  return j.messages?.[0]?.id ?? null;
}

export async function descargarMedia(mediaId: string): Promise<{ bytes: ArrayBuffer; mime: string }> {
  const token = process.env["WHATSAPP_TOKEN"]!;
  const meta = await fetch(`https://graph.facebook.com/${VERSION}/${mediaId}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!meta.ok) throw new Error(`Media meta [${meta.status}]: ${await meta.text()}`);
  const info = (await meta.json()) as { url: string; mime_type: string; file_size?: number };
  if ((info.file_size ?? 0) > 50 * 1024 * 1024) throw new Error("Archivo demasiado grande");
  const bin = await fetch(info.url, { headers: { Authorization: `Bearer ${token}` } });
  if (!bin.ok) throw new Error(`Media descarga [${bin.status}]`);
  return { bytes: await bin.arrayBuffer(), mime: info.mime_type };
}

export async function verificarFirma(cuerpo: string, firma: string | null): Promise<boolean> {
  const secreto = process.env["META_APP_SECRET"];
  if (!secreto || !firma?.startsWith("sha256=")) return false;
  const { createHmac, timingSafeEqual } = await import("node:crypto");
  const esperado = Buffer.from(createHmac("sha256", secreto).update(cuerpo, "utf8").digest("hex"));
  const recibido = Buffer.from(firma.slice(7));
  return esperado.length === recibido.length && timingSafeEqual(esperado, recibido);
}
