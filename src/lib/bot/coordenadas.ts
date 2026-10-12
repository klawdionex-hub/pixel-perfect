/**
 * Saca latitud y longitud de lo que el usuario copie de Google Maps:
 * "19.5123, -98.8812", un enlace con "@19.51,-98.88,17z", "?q=19.51,-98.88" o "!3d19.51!4d-98.88".
 */
export function leerCoordenadas(texto: string): { lat: number; lng: number } | null {
  const t = texto.trim();
  const patrones = [
    /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/,
    /@(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/,
    /[?&](?:q|query|ll|destination)=(-?\d+(?:\.\d+)?)(?:,|%2C)\s*(-?\d+(?:\.\d+)?)/i,
    /^(-?\d+(?:\.\d+)?)\s*[,;\s]\s*(-?\d+(?:\.\d+)?)$/,
  ];
  for (const p of patrones) {
    const m = p.exec(t);
    if (!m) continue;
    const lat = Number(m[1]);
    const lng = Number(m[2]);
    if (Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
      return { lat, lng };
    }
  }
  return null;
}
