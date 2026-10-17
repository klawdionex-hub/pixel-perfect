import { Fragment } from "react";

/** Muestra un texto como lo ve WhatsApp: *negritas* y _cursivas_. */
export function TextoWhatsApp({ texto }: { texto: string }) {
  const partes = texto.split(/(\*[^*\n]+\*|_[^_\n]+_)/g);
  return (
    <>
      {partes.map((p, i) => {
        if (/^\*[^*\n]+\*$/.test(p)) return <strong key={i}>{p.slice(1, -1)}</strong>;
        if (/^_[^_\n]+_$/.test(p)) return <em key={i}>{p.slice(1, -1)}</em>;
        return <Fragment key={i}>{p}</Fragment>;
      })}
    </>
  );
}
