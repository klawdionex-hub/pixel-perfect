// Base de datos falsa en memoria que imita lo que el bot usa de Supabase.
// Solo para pruebas locales: no forma parte de la app.
export type Fila = Record<string, any>;

export function crearBD(inicial: Record<string, Fila[]>) {
  const tablas: Record<string, Fila[]> = { contactos: [], solicitudes: [], mensajes: [], archivos: [], estado_conversacion: [], ...inicial };
  let seq = 1;
  let uid = 1;
  const reloj = { ahora: new Date("2026-09-28T16:00:00Z") }; // lunes 10:00 CDMX
  const PK: Record<string, string> = { estado_conversacion: "contacto_id", configuracion: "id", servicios: "codigo" };

  function recalcular(x: Fila) {
    const parte = [8, 9].includes(x.servicio_codigo) && x.equipo_codigo ? `${x.servicio_codigo}.${x.equipo_codigo}` : String(x.servicio_codigo ?? 0);
    x.codigo = `${parte}-${x.etapa}-${String(x.numero).padStart(4, "0")}`;
    x.comision = x.monto_venta != null ? Math.round(x.monto_venta * 3) / 100 : null;
  }

  function nueva(t: string, r: Fila): Fila {
    const base: Fila = { id: `id${uid++}` };
    if (t === "contactos") Object.assign(base, { nombre: null, municipio: null, en_estado_de_mexico: true, es_cliente: false, es_ejemplo: false });
    if (t === "solicitudes") {
      Object.assign(base, { etapa: 1, vendedor_id: null, tomada_en: null, monto_venta: null, notas: null, control_bot: {}, es_ejemplo: false, numero: seq++, creada_en: new Date(reloj.ahora.getTime() + uid).toISOString() });
      const x = { ...base, ...r };
      recalcular(x);
      return x;
    }
    return { ...base, ...r };
  }

  class Q {
    filtros: Array<(f: Fila) => boolean> = [];
    op = "select";
    datos: any;
    modo: "lista" | "single" | "maybe" = "lista";
    cols = "*";
    selecciono = false;
    lim?: number;
    ord?: [string, boolean];
    constructor(public t: string) {}
    select(c = "*") { this.cols = c; this.selecciono = true; return this; }
    insert(d: any) { this.op = "insert"; this.datos = d; return this; }
    update(d: any) { this.op = "update"; this.datos = d; return this; }
    upsert(d: any) { this.op = "upsert"; this.datos = d; return this; }
    delete() { this.op = "delete"; return this; }
    eq(c: string, v: any) { this.filtros.push((f) => f[c] === v); return this; }
    is(c: string, v: any) { this.filtros.push((f) => (f[c] ?? null) === v); return this; }
    in(c: string, v: any[]) { this.filtros.push((f) => v.includes(f[c])); return this; }
    not(c: string) { this.filtros.push((f) => f[c] != null); return this; }
    lt(c: string, v: any) { this.filtros.push((f) => f[c] < v); return this; }
    order(c: string, o?: { ascending?: boolean }) { this.ord = [c, o?.ascending !== false]; return this; }
    limit(n: number) { this.lim = n; return this; }
    single() { this.modo = "single"; return this; }
    maybeSingle() { this.modo = "maybe"; return this; }
    then(res: any, rej: any) { try { res(this.run()); } catch (e) { rej(e); } }
    run() {
      const tabla = (tablas[this.t] ??= []);
      let filas: Fila[] = [];
      if (this.op === "insert") {
        const r = nueva(this.t, this.datos);
        if (this.t === "mensajes" && r.wa_message_id && tabla.some((m) => m.wa_message_id === r.wa_message_id)) {
          return { data: null, error: { code: "23505", message: "duplicado" } };
        }
        tabla.push(r);
        filas = [r];
      } else if (this.op === "upsert") {
        const pk = PK[this.t] ?? "id";
        const i = tabla.findIndex((f) => f[pk] === this.datos[pk]);
        if (i >= 0) tabla[i] = { ...tabla[i], ...this.datos };
        else tabla.push({ ...this.datos });
        return { data: null, error: null };
      } else {
        filas = tabla.filter((f) => this.filtros.every((fn) => fn(f)));
        if (this.op === "update") {
          filas.forEach((f) => { Object.assign(f, this.datos); if (this.t === "solicitudes") recalcular(f); });
          if (!this.selecciono) return { data: null, error: null };
        }
        if (this.op === "delete") { tablas[this.t] = tabla.filter((f) => !filas.includes(f)); return { data: null, error: null }; }
      }
      if (this.ord) { const [c, asc] = this.ord; filas = [...filas].sort((a, b) => (a[c] > b[c] ? 1 : -1) * (asc ? 1 : -1)); }
      if (this.lim) filas = filas.slice(0, this.lim);
      if (this.cols.includes("contactos(*)")) filas = filas.map((f) => ({ ...f, contactos: tablas["contactos"]!.find((c) => c.id === f.contacto_id) }));
      if (this.modo === "lista") return { data: filas, error: null };
      if (!filas[0] && this.modo === "single") return { data: null, error: { message: "sin filas" } };
      return { data: filas[0] ?? null, error: null };
    }
  }

  return { db: { from: (t: string) => new Q(t) } as any, tablas, reloj };
}
