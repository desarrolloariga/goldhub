import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft, Check, UserPlus } from "lucide-react";

import { ChipEstado } from "@/components/ui/chip-estado";
import { Tarjeta } from "@/components/ui/tarjeta";
import { ChipTipo } from "@/components/vales/chip-tipo";
import { TarjetaVale } from "@/components/vales/tarjeta-vale";

import { AccionesAdmin } from "./acciones-admin";
import { requerirSesion } from "@/lib/auth/guardas";
import { redencionesDeVale } from "@/lib/datos/redenciones";
import { valePorCodigo } from "@/lib/datos/vales";
import { fecha, fechaHora, moneda } from "@/lib/format";
import { urlLogo } from "@/lib/logos";
import { ETIQUETA_SEGMENTO, ETIQUETA_TIPO } from "@/lib/supabase/types";

export async function generateMetadata({
  params,
}: PageProps<"/panel/vales/[codigo]">): Promise<Metadata> {
  const { codigo } = await params;
  return { title: `Vale ${decodeURIComponent(codigo).toUpperCase()}` };
}

export default async function PaginaVale({
  params,
  searchParams,
}: PageProps<"/panel/vales/[codigo]">) {
  const { codigo } = await params;
  const { nuevo } = await searchParams;

  const sesion = await requerirSesion();
  const vale = await valePorCodigo(decodeURIComponent(codigo));

  if (!vale) notFound();

  // Una tienda solo ve los vales que emitió ella.
  if (sesion.rol !== "admin" && vale.usuario_id !== sesion.usuarioId) {
    notFound();
  }

  const redenciones = await redencionesDeVale(vale.id);

  const datos: [string, string][] = [
    ["TIPO", `${vale.tipo} · ${ETIQUETA_TIPO[vale.tipo]}`],
    ...(vale.segmento
      ? ([["CLASIFICACIÓN", ETIQUETA_SEGMENTO[vale.segmento]]] as [string, string][])
      : []),
    ...(vale.origen ? ([["ORIGEN", vale.origen]] as [string, string][]) : []),
    // De quién viene: es el dato que da sentido a la puerta A4.
    ...(vale.referidor
      ? ([
          ["LO REFIRIÓ", `${vale.referidor} · ${vale.origen_codigo}`],
        ] as [string, string][])
      : []),
    ...(vale.tienda ? ([["PUNTO DE VENTA", vale.tienda]] as [string, string][]) : []),
    ["PORTADOR", vale.portador],
    ["TELÉFONO", `+${vale.portador_telefono}`],
    ...(vale.portador_correo
      ? ([["CORREO", vale.portador_correo]] as [string, string][])
      : []),
    [
      "EMITIDO POR",
      // Los vales de autorregistro no tienen cuenta emisora: los crea el propio
      // cliente desde el QR del mostrador.
      vale.emisora ?? `Autorregistro${vale.tienda ? ` · ${vale.tienda}` : ""}`,
    ],
    ["EMISIÓN", fechaHora(vale.fecha_emision)],
    ["VENCIMIENTO", fecha(vale.fecha_vencimiento)],
  ];

  return (
    <>
      <div className="flex items-center gap-3">
        <Link
          href="/panel/vales"
          className="text-ink/50 hover:text-ink flex items-center gap-[6px] text-[12.5px] transition-colors"
        >
          <ArrowLeft size={15} />
          Vales
        </Link>
      </div>

      {/* El referido ya compró: cerrar el ciclo es emitirle su A1. Aparece
          solo cuando tiene compra registrada, que es cuando deja de ser un
          prospecto y pasa a ser cliente. */}
      {vale.tipo === "A4" && vale.total_redenciones > 0 && !vale.convertido ? (
        <div className="border-taupe/35 bg-taupe/8 rounded-card flex flex-wrap items-center gap-x-4 gap-y-3 border px-5 py-4">
          <div className="flex min-w-0 flex-1 flex-col gap-[2px]">
            <span className="text-taupe-deep text-[13px] font-medium">
              {vale.portador.split(" ")[0]} ya compró
            </span>
            <span className="text-ink/55 text-[12px] leading-relaxed">
              Conviértela en cliente de la casa: se le emite su vale A1 con
              los datos que ya dio.
            </span>
          </div>
          <Link
            href={`/panel/emitir/a1?de=${encodeURIComponent(vale.codigo)}`}
            className="bg-ink text-taupe-light rounded-field tracking-action flex shrink-0 items-center gap-2 px-5 py-3 text-[11px] font-semibold transition-opacity hover:opacity-90"
          >
            <UserPlus size={15} />
            EMITIR SU VALE A1
          </Link>
        </div>
      ) : null}

      {vale.tipo === "A4" && vale.convertido ? (
        <p className="border-ink/10 bg-ink/2 text-ink/55 rounded-card m-0 flex items-center gap-2 border px-4 py-3 text-[12.5px]">
          <Check size={15} className="text-taupe-deep" />
          Este referido ya es cliente: tiene su vale A1 emitido.
        </p>
      ) : null}

      {/* Cuántas personas ha traído este vale. Es lo que mide de verdad el
          boca en boca: no cuántas veces se usó, sino a cuántos arrastró. */}
      {vale.referidos > 0 ? (
        <p className="border-ink/10 bg-ink/2 text-ink/55 rounded-card m-0 border px-4 py-3 text-[12.5px] leading-relaxed">
          Con este vale han llegado{" "}
          <strong className="text-ink font-semibold">{vale.referidos}</strong>{" "}
          {vale.referidos === 1 ? "persona" : "personas"} a tienda
          {vale.referidos_convertidos > 0
            ? `, ${vale.referidos_convertidos} ya ${vale.referidos_convertidos === 1 ? "convertida" : "convertidas"} en cliente`
            : ""}
          .
        </p>
      ) : null}

      {nuevo ? (
        <p className="border-taupe/35 bg-taupe/8 text-taupe-deep rounded-card m-0 flex items-center gap-2 border px-4 py-3 text-[13px]">
          <Check size={16} />
          Vale generado. Envíaselo al cliente por WhatsApp o descárgalo.
        </p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[340px_minmax(0,1fr)] lg:items-start">
        <TarjetaVale
          vale={{
            codigo: vale.codigo,
            token: vale.token,
            tipo: vale.tipo,
            estado: vale.estado,
            descuentoOro: Number(vale.descuento_oro_pct),
            tienda: vale.tienda,
            logo: urlLogo(vale),
            portador: vale.portador,
            telefono: vale.portador_telefono,
            vigencia: fecha(vale.fecha_vencimiento),
          }}
        />

        <div className="flex flex-col gap-5">
          <Tarjeta className="flex flex-col gap-5 p-6">
            <div className="flex flex-wrap items-center gap-3">
              <ChipTipo tipo={vale.tipo} />
              <span className="font-display text-[24px] leading-none">
                {vale.codigo}
              </span>
              <ChipEstado estado={vale.estado} />
            </div>

            {vale.anulado && vale.motivo_anulacion ? (
              <p className="border-clay/25 bg-clay/6 text-clay rounded-field m-0 border px-3 py-2 text-[12px]">
                Anulado: {vale.motivo_anulacion}
              </p>
            ) : null}

            <dl className="m-0 grid gap-x-6 gap-y-4 sm:grid-cols-2">
              {datos.map(([etiqueta, valor]) => (
                <div key={etiqueta} className="flex flex-col gap-1">
                  <dt className="text-ink/40 text-[9px] font-medium tracking-[0.18em]">
                    {etiqueta}
                  </dt>
                  <dd className="text-ink m-0 text-[13.5px] break-words">
                    {valor}
                  </dd>
                </div>
              ))}
            </dl>

            {sesion.rol === "admin" ? (
              <AccionesAdmin
                codigo={vale.codigo}
                anulado={vale.anulado}
                motivo={vale.motivo_anulacion}
                compras={vale.total_redenciones}
                referidos={vale.referidos}
                vencido={vale.estado === "vencido"}
              />
            ) : null}
          </Tarjeta>

          <Tarjeta className="overflow-hidden">
            <div className="border-ink/7 flex items-center justify-between border-b px-5 py-4">
              <h3 className="font-display m-0 text-lg leading-none font-normal">
                Compras con este vale
              </h3>
              <span className="text-ink/45 text-[12px]">
                {redenciones.length}{" "}
                {redenciones.length === 1 ? "redención" : "redenciones"}
              </span>
            </div>

            {redenciones.length === 0 ? (
              <p className="text-ink/45 m-0 px-5 py-8 text-center text-[12.5px] leading-relaxed">
                Todavía nadie ha comprado con este vale.
                <br />
                Puede usarse cuantas veces haga falta mientras esté vigente.
              </p>
            ) : (
              <ul className="m-0 list-none p-0">
                {redenciones.map((r) => (
                  <li
                    key={r.id}
                    className="border-ink/6 flex flex-wrap items-center gap-x-4 gap-y-1 border-t px-5 py-[14px] first:border-t-0"
                  >
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-[13px] font-medium">
                        {r.comprador}
                      </span>
                      <span className="text-ink/42 truncate text-[11px]">
                        {r.referido_por ? `vía ${r.referido_por} · ` : ""}
                        {r.tienda} · {fechaHora(r.fecha_creacion)}
                      </span>
                    </span>
                    <span className="flex flex-col items-end">
                      <span className="text-[13px] font-semibold">
                        {moneda(r.monto_oro)}
                      </span>
                      <span className="text-taupe-dark text-[11px]">
                        −{moneda(r.descuento_aplicado)}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}

            {redenciones.length > 0 ? (
              <div className="border-ink/6 bg-ink/2 flex justify-between border-t px-5 py-3 text-[12px]">
                <span className="text-ink/50">Total generado</span>
                <span className="font-semibold">
                  {moneda(Number(vale.ingreso_generado))}
                </span>
              </div>
            ) : null}
          </Tarjeta>
        </div>
      </div>
    </>
  );
}
