import { createFileRoute } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { LogoAfpam } from "@/components/LogoAfpam";
import { cabeza } from "@/lib/cabeza";

// Página pública: Meta la pide para publicar la app de WhatsApp.
export const Route = createFileRoute("/privacidad")({
  head: () => cabeza("Aviso de privacidad", "Aviso de privacidad de AFPAM Texcoco, Puertas Automáticas."),
  component: Pagina,
});

function Seccion({ id, titulo, children }: { id?: string; titulo: string; children: ReactNode }) {
  return (
    <section id={id} className="space-y-2">
      <h2 className="text-lg text-foreground">{titulo}</h2>
      <div className="space-y-2 text-sm leading-relaxed text-muted-foreground">{children}</div>
    </section>
  );
}

function Pagina() {
  return (
    <div className="min-h-screen bg-background">
      <header className="bg-carbon px-4 py-5">
        <div className="mx-auto max-w-3xl">
          <LogoAfpam />
        </div>
      </header>
      <main className="mx-auto max-w-3xl space-y-8 px-4 py-10">
        <div>
          <h1 className="text-2xl text-foreground">Aviso de privacidad</h1>
          <p className="mt-1 text-sm text-muted-foreground">Última actualización: 27 de septiembre de 2026</p>
        </div>

        <Seccion titulo="Responsable">
          <p>
            AFPAM Texcoco, Puertas Automáticas (en adelante, "AFPAM"), con domicilio en Texcoco, Estado de México,
            es responsable del tratamiento de los datos personales que usted nos proporciona a través de WhatsApp y
            de nuestros demás canales de contacto, conforme a la Ley Federal de Protección de Datos Personales en
            Posesión de los Particulares.
          </p>
        </Seccion>

        <Seccion titulo="Datos que recabamos">
          <p>Cuando se comunica con nosotros por WhatsApp, nuestro asistente virtual puede recabar:</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>Nombre y número de teléfono.</li>
            <li>Municipio y colonia donde se realizaría el servicio.</li>
            <li>Información del servicio solicitado: tipo de portón o equipo, medidas, material, marca, falla y horario preferido.</li>
            <li>Fotografías o videos que usted decida enviar.</li>
            <li>El contenido de los mensajes intercambiados con el asistente.</li>
          </ul>
          <p>No solicitamos datos personales sensibles ni datos bancarios por este medio.</p>
        </Seccion>

        <Seccion titulo="Finalidades">
          <ul className="list-disc space-y-1 pl-5">
            <li>Atender su solicitud y canalizarla con uno de nuestros asesores.</li>
            <li>Elaborar cotizaciones y dar seguimiento a los servicios de instalación, reparación y mantenimiento.</li>
            <li>Enviarle recordatorios relacionados con su solicitud o con el mantenimiento de su equipo.</li>
            <li>Enviarle, si usted no se opone, información sobre promociones de nuestros servicios.</li>
          </ul>
        </Seccion>

        <Seccion titulo="Con quién compartimos sus datos">
          <p>
            Sus datos son utilizados únicamente por el personal de AFPAM. Los mensajes se transmiten mediante la
            plataforma de WhatsApp Business de Meta Platforms, y la información se almacena en servicios de
            alojamiento contratados por AFPAM. No vendemos ni rentamos sus datos personales a terceros.
          </p>
        </Seccion>

        <Seccion titulo="Promociones">
          <p>
            Puede dejar de recibir promociones en cualquier momento solicitándolo por nuestro chat de WhatsApp o al
            595 954 4763.
          </p>
        </Seccion>

        <Seccion id="eliminacion" titulo="Derechos ARCO y eliminación de datos">
          <p>
            Usted puede solicitar el acceso, rectificación, cancelación u oposición al tratamiento de sus datos
            personales, así como la eliminación de su información, escribiéndonos por WhatsApp o llamando al
            595 954 4763. Atenderemos su solicitud en un plazo máximo de 20 días hábiles.
          </p>
        </Seccion>

        <Seccion titulo="Conservación">
          <p>
            Conservamos sus datos mientras exista una relación comercial o sean necesarios para las finalidades
            descritas, y posteriormente durante el tiempo que exijan las disposiciones legales aplicables.
          </p>
        </Seccion>

        <Seccion titulo="Cambios a este aviso">
          <p>Cualquier modificación a este aviso de privacidad se publicará en esta misma página.</p>
        </Seccion>
      </main>
    </div>
  );
}
