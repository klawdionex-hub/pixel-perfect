export function cabeza(titulo: string, descripcion: string) {
  const t = `${titulo} — AFPAM Bot`;
  return {
    meta: [
      { title: t },
      { name: "description", content: descripcion },
      { property: "og:title", content: t },
      { property: "og:description", content: descripcion },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  };
}
