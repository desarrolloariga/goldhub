import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft, PencilLine } from "lucide-react";

import { Tarjeta } from "@/components/ui/tarjeta";
import { ChipTipo } from "@/components/vales/chip-tipo";
import { requerirAdmin } from "@/lib/auth/guardas";
import { redencionPorId } from "@/lib/datos/redenciones";
import { valePorCodigo } from "@/lib/datos/vales";
import { fecha, fechaHora, moneda } from "@/lib/format";

import { FormularioEdicion } from "./formulario";

export const metadata: Metadata = { title: "Corregir compra" };

/**
 * Una compra registrada, para corregirla o retirarla. Solo administración.
 *
 * El vale al que pertenece no se puede cambiar: una compra es de aquel vale
 * con el que se pagó, y moverla sería inventar historia. Si se capturó
 * contra el vale equivocado, se elimina y se vuelve a registrar donde toca.
 */
export default async function PaginaRedencion({
  params,
}: PageProps<"/panel/redenciones/[id]">) {
  await requerirAdmin();

  const { id } = await params;
  const numeroId = Number(id);
  if (!Number.isInteger(numeroId) || numeroId <= 0) notFound();

  const redencion = await redencionPorId(numeroId);
  if (!redencion) notFound();

  const vale = await valePorCodigo(redencion.codigo);
  if (!vale) notFound();

  const resumen: [string, string][] = [
    ["REGISTRADA", fechaHora(redencion.fecha_creacion)],
    ["LA CAPTURÓ", redencion.registrada_por || "—"],
    ["VALE", `${vale.tipo} · ${redencion.codigo}`],
    ["PORTADOR DEL VALE", vale.portador],
    ["VENCIMIENTO DEL VALE", fecha(vale.fecha_vencimiento)],
    ["DESCUENTO DEL VALE", `${vale.descuento_oro_pct}% en oro`],
  ];

  return (
    <>
      <div className="flex items-center gap-3">
        <Link
          href="/panel/redenciones"
          className="text-ink/50 hover:text-ink flex items-center gap-[6px] text-[12.5px] transition-colors"
        >
          <ArrowLeft size={15} />
          Redenciones
        </Link>
      </div>

      {redencion.editada_por ? (
        <p className="border-taupe/30 bg-taupe/6 text-taupe-deep rounded-card m-0 flex items-center gap-2 border px-4 py-3 text-[12.5px]">
          <PencilLine size={15} className="shrink-0" />
          Ya se corrigió: {redencion.editada_por}
          {redencion.fecha_edicion
            ? `, el ${fechaHora(redencion.fecha_edicion)}`
            : ""}
          .
        </p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
        <Tarjeta className="flex flex-col gap-6 p-6 sm:p-8">
          <div className="flex flex-col gap-2">
            <span className="text-taupe-dark tracking-eyebrow text-[9px] font-medium">
              CORREGIR COMPRA
            </span>
            <h2 className="font-display m-0 text-[24px] leading-tight font-normal">
              {moneda(Number(redencion.monto_oro))} de {redencion.comprador}
            </h2>
            <p className="text-ink/50 m-0 text-[13px] leading-relaxed">
              Lo que cambies aquí mueve la venta generada y la conversión.
              Queda registrado quién lo corrigió.
            </p>
          </div>

          <FormularioEdicion
            datos={{
              id: redencion.id,
              comprador: redencion.comprador,
              telefono: redencion.comprador_telefono,
              correo: redencion.comprador_correo,
              montoOro: Number(redencion.monto_oro),
              descuento: Number(redencion.descuento_aplicado),
              referidoPor: redencion.referido_por,
            }}
            // El de esa compra, no el del vale: corregir el monto no
            // cambia el trato ya cerrado. Nulo en las compras anteriores al
            // descuento por forma de pago, que siguen con el del vale.
            descuentoOro={
              redencion.descuento_pct ?? Number(vale.descuento_oro_pct)
            }
          />
        </Tarjeta>

        <aside className="flex flex-col gap-4">
          <Tarjeta className="flex flex-col gap-4 p-5">
            <div className="flex items-center gap-2">
              <ChipTipo tipo={vale.tipo} />
              <Link
                href={`/panel/vales/${redencion.codigo}`}
                className="text-taupe-dark font-mono text-[12px] hover:underline"
              >
                {redencion.codigo}
              </Link>
            </div>

            <dl className="m-0 flex flex-col gap-3">
              {resumen.map(([etiqueta, valor]) => (
                <div key={etiqueta} className="flex flex-col gap-[3px]">
                  <dt className="text-ink/40 text-[9px] font-medium tracking-[0.18em]">
                    {etiqueta}
                  </dt>
                  <dd className="text-ink m-0 text-[12.5px] break-words">
                    {valor}
                  </dd>
                </div>
              ))}
            </dl>
          </Tarjeta>

          <p className="text-ink/45 m-0 px-1 text-[11.5px] leading-relaxed">
            La compra no se puede mover a otro vale: pertenece a aquel con el
            que se pagó. Si se capturó contra el vale equivocado, elimínala y
            vuelve a registrarla donde toca.
          </p>
        </aside>
      </div>
    </>
  );
}
