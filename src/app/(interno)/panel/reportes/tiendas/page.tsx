import type { Metadata } from "next";
import { Download } from "lucide-react";

import { Tarjeta } from "@/components/ui/tarjeta";
import { PestanasReportes } from "@/components/reportes/pestanas";
import { requerirAdmin } from "@/lib/auth/guardas";
import { consolidado, consolidadoPorTienda } from "@/lib/datos/ventas";
import { fecha, moneda } from "@/lib/format";
import { rangoPedido } from "@/lib/rango-fechas";

import { FiltroFechas } from "./filtro";

export const metadata: Metadata = { title: "Reporte por tienda" };

function texto(v: string | string[] | undefined) {
  return typeof v === "string" ? v.trim() : "";
}

/**
 * Reporte por tienda: la cuenta de cada una y la de toda la red.
 *
 * Es una tabla y no un gráfico a propósito. La pantalla de Ventas ya dibuja
 * la evolución y el desempeño relativo; esto es para cuadrar cifras, que se
 * hace leyendo números en columna y sumándolos, no mirando barras.
 *
 * «Comisiones» es el descuento del vale, con el nombre que se usa en la
 * operación. No hay dos conceptos: lo que se le descuenta al cliente es lo
 * que la tienda deja de cobrar.
 */
export default async function PaginaReporteTiendas({
  searchParams,
}: PageProps<"/panel/reportes/tiendas">) {
  await requerirAdmin();
  const params = await searchParams;

  const atajo = texto(params.rango) || "30";
  const desdeParam = texto(params.desde);
  const hastaParam = texto(params.hasta);

  const { desde, hasta } = rangoPedido(atajo, desdeParam, hastaParam);

  const [filas, totales] = await Promise.all([
    consolidadoPorTienda({ desde, hasta }),
    consolidado({ desde, hasta, tiendaId: null }),
  ]);

  /*
   * Los totales se suman aquí sobre las mismas filas que se pintan, no con
   * otra consulta. Con dos consultas distintas —una para el detalle y otra
   * para el total— basta un filtro que no coincida para que la suma de la
   * columna no dé el total impreso abajo, y eso en un reporte de cuadre es
   * lo peor que puede pasar.
   */
  const total = filas.reduce(
    (a, f) => ({
      bruta: a.bruta + Number(f.vale_bruta),
      descuento: a.descuento + Number(f.vale_descuento),
      neta: a.neta + Number(f.vale_neta),
      oro: a.oro + Number(f.directa_oro),
      plata: a.plata + Number(f.directa_plata),
      directa: a.directa + Number(f.directa_total),
      gran: a.gran + Number(f.gran_total),
    }),
    { bruta: 0, descuento: 0, neta: 0, oro: 0, plata: 0, directa: 0, gran: 0 },
  );

  const periodo =
    desde && hasta
      ? desde === hasta
        ? fecha(`${desde}T12:00:00Z`)
        : `${fecha(`${desde}T12:00:00Z`)} – ${fecha(`${hasta}T12:00:00Z`)}`
      : desde
        ? `Desde el ${fecha(`${desde}T12:00:00Z`)}`
        : hasta
          ? `Hasta el ${fecha(`${hasta}T12:00:00Z`)}`
          : "Todo el histórico";

  // El mismo rango viaja a la descarga: el Excel tiene que traer lo que se
  // está viendo, no todo.
  const descarga = new URLSearchParams();
  if (desde) descarga.set("desde", desde);
  if (hasta) descarga.set("hasta", hasta);

  return (
    <>
      <PestanasReportes activa="/panel/reportes/tiendas" />

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="font-display m-0 text-[22px] leading-tight font-normal">
            Venta por tienda
          </h2>
          <p className="text-ink/50 m-0 text-[13px]">{periodo}</p>
        </div>

        <a
          href={`/api/reportes/tiendas?${descarga.toString()}`}
          className="border-ink/16 text-ink/70 hover:border-taupe hover:text-ink rounded-field tracking-action flex items-center gap-2 px-4 py-[10px] text-[11px] font-semibold transition-colors"
        >
          <Download size={14} />
          DESCARGAR EXCEL
        </a>
      </div>

      <FiltroFechas atajo={atajo} desde={desdeParam} hasta={hastaParam} />

      {/*
        Los cuatro totales, antes de la tabla. Vienen de la base y no de
        sumar las filas: son la misma consulta que usa el resto del sistema,
        y así una diferencia entre estas cifras y la suma de abajo delataría
        un problema real en vez de esconderlo.
      */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {(
          [
            [
              "BRUTA CON VALES",
              moneda(Number(totales.vale_bruta)),
              "antes del descuento",
              false,
            ],
            [
              "NETA CON VALES",
              moneda(Number(totales.vale_neta)),
              `menos ${moneda(Number(totales.vale_descuento))} de comisiones`,
              false,
            ],
            [
              "VENTAS NORMALES",
              moneda(Number(totales.directa_total)),
              `oro ${moneda(Number(totales.directa_oro))} · plata ${moneda(Number(totales.directa_plata))}`,
              false,
            ],
            [
              "GRAN TOTAL",
              moneda(Number(totales.gran_total)),
              "neta con vales + ventas normales",
              true,
            ],
          ] as [string, string, string, boolean][]
        ).map(([etiqueta, valor, nota, destacado]) => (
          <div
            key={etiqueta}
            className={`rounded-card flex flex-col gap-[6px] border p-4 ${
              destacado
                ? "border-taupe/40 bg-taupe/8"
                : "border-ink/8 bg-paper"
            }`}
          >
            <span
              className={`text-[9px] font-medium tracking-[0.18em] ${
                destacado ? "text-taupe-dark" : "text-ink/42"
              }`}
            >
              {etiqueta}
            </span>
            <span
              className={`leading-none font-medium tabular-nums ${
                destacado
                  ? "font-display text-taupe-deep text-[26px]"
                  : "text-ink text-[20px]"
              }`}
            >
              {valor}
            </span>
            <span className="text-ink/45 text-[11px] leading-snug">{nota}</span>
          </div>
        ))}
      </div>

      <Tarjeta className="overflow-hidden p-0">
        {filas.length === 0 ? (
          <p className="text-ink/45 m-0 py-12 text-center text-[13px]">
            Sin ventas en el periodo.
          </p>
        ) : (
          /* La tabla se desplaza sola en pantallas estrechas en vez de
             apretar las columnas hasta que los números no se lean. */
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr className="border-ink/10 border-b">
                  {(
                    [
                      ["TIENDA", "left"],
                      ["ASESORA", "left"],
                      ["BRUTA C/VALE", "right"],
                      ["COMISIONES", "right"],
                      ["NETA C/VALE", "right"],
                      ["ORO", "right"],
                      ["PLATA", "right"],
                      ["SIN VALE", "right"],
                      ["GRAN TOTAL", "right"],
                    ] as const
                  ).map(([t, alinea]) => (
                    <th
                      key={t}
                      className={`text-ink/42 px-4 py-[11px] text-[9px] font-medium tracking-[0.16em] ${
                        alinea === "right" ? "text-right" : "text-left"
                      }`}
                    >
                      {t}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {filas.map((f) => (
                  <tr
                    key={f.tienda_id}
                    className="border-ink/6 hover:bg-bone/60 border-b transition-colors"
                  >
                    <td className="text-ink px-4 py-[11px] font-medium">
                      {f.tienda}
                    </td>
                    <td className="text-ink/55 px-4 py-[11px] text-[12px]">
                      {f.asesora ?? "—"}
                    </td>
                    <td className="text-ink/70 px-4 py-[11px] text-right tabular-nums">
                      {moneda(Number(f.vale_bruta))}
                    </td>
                    <td className="text-taupe-deep px-4 py-[11px] text-right tabular-nums">
                      {moneda(Number(f.vale_descuento))}
                    </td>
                    <td className="text-ink px-4 py-[11px] text-right tabular-nums">
                      {moneda(Number(f.vale_neta))}
                    </td>
                    {/* El oro y la plata en gris: son el desglose de la
                        columna siguiente, no cifras que se sumen aparte. */}
                    <td className="text-ink/55 px-4 py-[11px] text-right tabular-nums">
                      {moneda(Number(f.directa_oro))}
                    </td>
                    <td className="text-ink/55 px-4 py-[11px] text-right tabular-nums">
                      {moneda(Number(f.directa_plata))}
                    </td>
                    <td className="text-ink px-4 py-[11px] text-right tabular-nums">
                      {moneda(Number(f.directa_total))}
                    </td>
                    <td className="text-ink px-4 py-[11px] text-right font-semibold tabular-nums">
                      {moneda(Number(f.gran_total))}
                    </td>
                  </tr>
                ))}
              </tbody>

              {/* Los totales, con la línea gruesa que separa el detalle de la
                  suma: es lo primero que se busca al cuadrar. */}
              <tfoot>
                <tr className="border-ink/25 bg-bone/70 border-t-2">
                  <td className="text-ink px-4 py-[13px] font-semibold">
                    TOTAL
                  </td>
                  <td className="px-4 py-[13px]">
                    <span className="text-ink/40 text-[11px]">
                      {filas.length} tienda{filas.length === 1 ? "" : "s"}
                    </span>
                  </td>
                  {(
                    [
                      total.bruta,
                      total.descuento,
                      total.neta,
                      total.oro,
                      total.plata,
                      total.directa,
                      total.gran,
                    ] as number[]
                  ).map((valor, i) => (
                    <td
                      key={i}
                      className={`px-4 py-[13px] text-right font-semibold tabular-nums ${
                        i === 6 ? "text-taupe-deep" : "text-ink"
                      }`}
                    >
                      {moneda(valor)}
                    </td>
                  ))}
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Tarjeta>

      <p className="text-ink/40 m-0 text-[11.5px] leading-relaxed">
        Las <strong className="font-medium">comisiones</strong> son el
        descuento aplicado al cliente al redimir su vale: 20% con visa y 25%
        por transferencia, o 15% y 20% en los vales A3. Las{" "}
        <strong className="font-medium">ventas normales</strong> son las que
        la tienda hace sin vale, y no llevan descuento de campaña. El{" "}
        <strong className="font-medium">gran total</strong> suma la venta
        neta con vales y las normales: lo que de verdad entró en caja.
      </p>
    </>
  );
}
