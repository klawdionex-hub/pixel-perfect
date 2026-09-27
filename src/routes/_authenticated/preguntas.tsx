import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { EncabezadoPagina } from "@/components/AppLayout";
import { Tabla, Celda } from "@/components/Tabla";
import { claves, traerPreguntas } from "@/lib/datos";
import { fechaHora, telefonoBonito } from "@/lib/afpam";
import { cabeza } from "@/lib/cabeza";

export const Route = createFileRoute("/_authenticated/preguntas")({
  head: () => cabeza("Preguntas frecuentes", "Preguntas que los clientes hacen al bot y sus respuestas."),
  component: Pagina,
});

function Pagina() {
  const q = useQuery({ queryKey: claves.preguntas, queryFn: traerPreguntas });
  return (
    <div>
      <EncabezadoPagina titulo="Preguntas frecuentes" descripcion="Lo que preguntan los clientes fuera del menú." />
      <div className="p-8">
        <Tabla encabezados={["Fecha", "Cliente", "Pregunta", "Respuesta del asistente"]}>
          {(q.data ?? []).map((p) => (
            <tr key={p.id}>
              <Celda className="whitespace-nowrap">{fechaHora(p.creada_en)}</Celda>
              <Celda>
                {p.contactos?.nombre_mostrado ?? (p.contactos ? telefonoBonito(p.contactos.telefono) : "—")}
              </Celda>
              <Celda>{p.pregunta}</Celda>
              <Celda className="text-muted-foreground">{p.respuesta_ia ?? "—"}</Celda>
            </tr>
          ))}
          {q.data?.length === 0 ? (
            <tr><Celda className="text-muted-foreground">Sin preguntas registradas.</Celda></tr>
          ) : null}
        </Tabla>
      </div>
    </div>
  );
}
