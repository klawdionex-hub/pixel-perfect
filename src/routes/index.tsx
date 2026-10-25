import { createFileRoute, redirect } from "@tanstack/react-router";
import { cabeza } from "@/lib/cabeza";

export const Route = createFileRoute("/")({
  ssr: false,
  head: () => cabeza("AFPAM", "Panel de solicitudes, ventas y atención de AFPAM Texcoco."),
  beforeLoad: () => {
    throw redirect({ to: "/panel" });
  },
  component: () => null,
});
