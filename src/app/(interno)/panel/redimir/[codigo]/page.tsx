import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeft, Check, CircleAlert, ScanLine } from "lucide-react";

import { Tarjeta } from "@/components/ui/tarjeta";
import { ChipTipo } from "@/components/vales/chip-tipo";
import { requerirSesion } from "@/lib/auth/guardas";
import { validarVale } from "@/lib/datos/vales";
import { tarifaVigente } from "@/lib/datos/configuracion";
import { normalizarCodigo } from "@/lib/codigo-vale";
import { fecha } from "@/lib/format";
import { ETIQUETA_SEGMENTO, ETIQUETA_TIPO } from "@/lib/supabase/types";

import { FormularioRedencion } from "./formulario";

export async function generateMetadata({
  params,
}: PageProps<"/panel/redimir/[codigo]">): Promise<Metadata> {
  const { codigo } = await params;
  return { title: `Redimir ${normalizarCodigo(decodeURIComponent(codigo))}` };
}

export default async function PaginaValidacion({
  params,
}: PageProps<"/panel/redimir/[codigo]">) {
  await requerirSesion();
  const { codigo: crudo } = await params;

  const codigo = normalizarCodigo(decodeURIComponent(crudo));

  const [vale, tarifa] = await Promise.all([
    validarVale(codigo),
    tarifaVigente(),
  ]);

  const volver = (
    <Link
      href="/panel/redimir"
      className="text-ink/50 hover:text-ink flex items-center gap-[6px] text-[12.5px] transition-colors"
    >
      <ArrowLeft size={15} />
      Redimir otro vale
    </Link>
  );

  // ── El vale no existe ──────────────────────────────────────────────────
  if (!vale) {
    return (
      <>
        {volver}
        <Tarjeta className="flex flex-col items-center gap-4 px-6 py-14 text-center">
          <CircleAlert size={26} className="text-clay" />
          <h2 className="font-display m-0 text-[24px] leading-tight font-normal">
            No existe ningún vale con ese código
          </h2>
          <p className="text-ink/50 m-0 max-w-sm text-[13px] leading-relaxed">
            Revisa el código{" "}
            <span className="font-mono">{codigo}</span> o pide al cliente que
            vuelva a mostrar el QR.
          </p>
          <Link
            href="/panel/redimir"
            className="bg-ink text-taupe-light rounded-field tracking-action mt-2 flex items-center gap-2 px-5 py-3 text-[11px] font-semibold"
          >
            <ScanLine size={15} />
            ESCANEAR DE NUEVO
          </Link>
        </Tarjeta>
      </>
    );
  }

  const ficha = (
    <Tarjeta
      className={`flex flex-col gap-5 p-6 ${vale.redimible ? "" : "border-clay/30"}`}
    >
      <div className="flex flex-wrap items-center gap-3">
        <ChipTipo tipo={vale.tipo} />
        <span className="font-display text-[24px] leading-none">
          {vale.codigo}
        </span>
      </div>

      {vale.redimible ? (
        <div className="border-taupe/30 bg-taupe/8 rounded-card flex items-center gap-4 border px-5 py-4">
          <Check size={22} className="text-taupe-deep shrink-0" />
          <div className="flex flex-col gap-2">
            {/* Los dos, porque el que se aplique lo decide la forma de pago
                que la cajera elija abajo. */}
            <span className="flex items-baseline gap-[10px]">
              <span className="flex items-baseline gap-[4px]">
                <span className="font-display text-taupe-deep text-[26px] leading-none">
                  {tarifa.visa}%
                </span>
                <span className="text-ink/55 text-[12px]">visa</span>
              </span>
              <span className="text-ink/25 text-[12px]">·</span>
              <span className="flex items-baseline gap-[4px]">
                <span className="font-display text-taupe-deep text-[26px] leading-none">
                  {tarifa.transferencia}%
                </span>
                <span className="text-ink/55 text-[12px]">transferencia</span>
              </span>
            </span>
            <span className="text-ink/55 text-[12px]">
              Vigente hasta el {fecha(vale.fecha_vencimiento)}
            </span>
          </div>
        </div>
      ) : (
        <div className="border-clay/30 bg-clay/8 rounded-card flex items-start gap-3 border px-5 py-4">
          <CircleAlert size={19} className="text-clay mt-[2px] shrink-0" />
          <div className="flex flex-col gap-1">
            <span className="text-clay text-[14px] font-medium">
              {vale.estado === "vencido"
                ? "Este vale ya venció"
                : "Este vale fue anulado"}
            </span>
            <span className="text-ink/55 text-[12px] leading-relaxed">
              {vale.estado === "vencido"
                ? `Su vigencia terminó el ${fecha(vale.fecha_vencimiento)}. No puede aplicarse el descuento.`
                : "No puede aplicarse el descuento. Consulta con el administrador."}
            </span>
          </div>
        </div>
      )}

      <dl className="m-0 grid gap-x-6 gap-y-4 sm:grid-cols-2">
        {(
          [
            ["PORTADOR", vale.portador],
            ["TIPO", `${vale.tipo} · ${ETIQUETA_TIPO[vale.tipo]}`],
            ...(vale.segmento
              ? [["CLASIFICACIÓN", ETIQUETA_SEGMENTO[vale.segmento]]]
              : []),
            ["TIENDA", vale.tienda],
            ["EMITIDO POR", vale.emisora],
            ["EMISIÓN", fecha(vale.fecha_emision)],
            [
              "COMPRAS PREVIAS",
              vale.total_redenciones === 0
                ? "Ninguna todavía"
                : `${vale.total_redenciones} ${vale.total_redenciones === 1 ? "compra" : "compras"}`,
            ],
          ] as [string, string][]
        ).map(([etiqueta, valor]) => (
          <div key={etiqueta} className="flex flex-col gap-1">
            <dt className="text-ink/40 text-[9px] font-medium tracking-[0.18em]">
              {etiqueta}
            </dt>
            <dd className="text-ink m-0 text-[13.5px] break-words">{valor}</dd>
          </div>
        ))}
      </dl>

      {vale.total_redenciones > 0 && vale.redimible ? (
        <p className="border-ink/8 text-ink/45 m-0 border-t pt-4 text-[12px] leading-relaxed">
          Este vale ya se usó {vale.total_redenciones}{" "}
          {vale.total_redenciones === 1 ? "vez" : "veces"}. Es normal: puede
          redimirse cuantas veces haga falta mientras esté vigente.
        </p>
      ) : null}
    </Tarjeta>
  );

  return (
    <>
      {volver}


      <div className="grid gap-6 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)] lg:items-start">
        {ficha}

        {vale.redimible ? (
          <Tarjeta className="flex flex-col gap-5 p-6">
            <div className="flex flex-col gap-1">
              <span className="text-taupe-dark tracking-eyebrow text-[9px] font-medium">
                REGISTRAR COMPRA
              </span>
              <h3 className="font-display m-0 text-[20px] leading-tight font-normal">
                Datos de quien está pagando
              </h3>
              <p className="text-ink/50 m-0 text-[12.5px] leading-relaxed">
                Puede ser una persona distinta de quien recibió el vale. El
                descuento lo calcula el sistema con el porcentaje que el vale
                lleva congelado.
              </p>
            </div>

            <FormularioRedencion
              codigo={vale.codigo}
              portador={vale.portador}
              visa={tarifa.visa}
              transferencia={tarifa.transferencia}
            />
          </Tarjeta>
        ) : (
          <Tarjeta className="flex flex-col items-start gap-3 p-6">
            <h3 className="font-display m-0 text-[20px] leading-tight font-normal">
              No se puede registrar la compra
            </h3>
            <p className="text-ink/55 m-0 text-[13px] leading-relaxed">
              {vale.estado === "vencido"
                ? "El vale perdió vigencia. Si el cliente quiere seguir comprando, su asesora puede emitirle uno nuevo."
                : "El vale está anulado y no admite compras."}
            </p>
            <Link
              href="/panel/emitir"
              className="border-ink/16 text-ink/70 hover:border-taupe hover:text-ink rounded-field tracking-action mt-1 px-5 py-3 text-[11px] font-semibold transition-colors"
            >
              EMITIR UN VALE NUEVO
            </Link>
          </Tarjeta>
        )}
      </div>

      {/* Los montos de la compra se muestran ya registrados en el vale */}
    </>
  );
}
