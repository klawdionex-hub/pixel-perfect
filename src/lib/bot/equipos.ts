// Catálogo de equipos (línea AFPAM): compartido entre el bot y el panel.

/** Categorías del catálogo; son las mismas opciones de "Compra de equipo" de la encuesta. */
export const CATEGORIAS_EQUIPO = ["Motor de cadena", "Pistones", "Motor de cremallera", "Motor para cortina", "Otro"] as const;

/** Índice de la categoría (las que no están en la lista cuentan como "Otro"). */
export function indiceCategoria(categoria: string): number {
  const i = (CATEGORIAS_EQUIPO as readonly string[]).indexOf(categoria);
  return i >= 0 ? i : CATEGORIAS_EQUIPO.length - 1;
}

/** Pie de foto para el cliente: clave, nombre y descripción. Nunca incluye las notas internas. */
export function pieDeFoto(e: { clave: string; nombre: string; descripcion?: string | null }): string {
  return [`*${e.clave}*`, e.nombre, e.descripcion?.trim() ? `\n${e.descripcion.trim()}` : ""].filter(Boolean).join("\n");
}
