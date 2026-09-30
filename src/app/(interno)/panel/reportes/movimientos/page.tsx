import type { Metadata } from "next";
import { Download } from "lucide-react";

import { Tarjeta } from "@/components/ui/tarjeta";
import { PestanasReportes } from "@/components/reportes/pestanas";
import { requerirAdmin } from "@/lib/auth/guardas";
import { todasLasVentas } from "@/lib/datos/ventas";
import { listarTiendas } from "@/lib/datos/tiendas";
import { fecha, moneda } from "@/lib/format";
import { rangoPedido } from "@/lib/rango-fechas";

import { Filtros } from "./filtros";

export const metadata: Metadata = { title: "Todas las ventas" };

function texto(v: string | string[] | undefined) {
  return typeof v === "string" ? v.trim() : "";
}

/**
 * Todas las ventas, con vale y sin él, en una sola lista.
 *
 * Las dos existen por separado en sus propias pantallas —Redenciones y Venta
 * sin vale— y allí la columna «tipo» diría siempre lo mismo. Aquí sí informa:
 * es el único sitio donde se ven mezcladas y ordenadas por fecha, que es como
 * se revisa lo que hizo una tienda un día concreto.
 */
export default async function PaginaMovimientos({
  searchParams,
}: PageProps<"/panel/reportes/movimientos">) {
  await requerirAdmin();
  const params = await searchParams;

  const atajo = texto(params.rango) || "30";
  const desdeParam = texto(params.desde);
  const hastaParam = texto(params.hasta);
  const tienda = texto(params.tienda);
  const tipoParam = texto(params.tipo);
  const tipo = tipoParam === "vale" || tipoParam === "normal" ? tipoParam : "";

  const { desde, hasta } = rangoPedido(atajo, desdeParam, hastaParam);

  const [ventas, tiendas] = await Promise.all([
    todasLasVentas({
      desde,
      hasta,
      tiendaId: Number(tienda) || null,
      tipo: tipo || null,
    }),
    listarTiendas(false),
  ]);

  /*
   * Los totales se suman sobre las mismas filas que se pintan: si vinieran
   * de otra consulta, un filtro que no coincidiera dejaría una columna que
   * no suma el total de abajo.
   */
  const total = ventas.reduce(
    (a, v) => ({
      oro: a.oro + Number(v.monto_oro),
      plata: a.plata + Number(v.monto_plata),
      descuento: a.descuento + Number(v.descuento),
      neto: a.neto + Number(v.neto),
      vale: a.vale + (v.tipo === "vale" ? 1 : 0),
      normal: a.normal + (v.tipo === "normal" ? 1 : 0),
    }),
    { oro: 0, plata: 0, descuento: 0, neto: 0, vale: 0, normal: 0 },
  );

  const periodo =
    desde && hasta
      ? desde === hasta
        ? fecha(`${desde}T12:00:00Z`)
        : `${fecha(`${desde}T12:00:00Z`)} – ${fecha(`${hasta}T12:00:00Z`)}`
      : "Todo el histórico";

  const descarga = new URLSearchParams();
  if (desde) descarga.set("desde", desde);
  if (hasta) descarga.set("hasta", hasta);
  if (tienda) descarga.set("tienda", tienda);
  if (tipo) descarga.set("tipo", tipo);

  return (
    <>
      <PestanasReportes activa="/panel/reportes/movimientos" />

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="font-display m-0 text-[22px] leading-tight font-normal">
            Todas las ventas
          </h2>
          <p className="text-ink/50 m-0 text-[13px]">
            {periodo} · {total.vale} con vale, {total.normal}{" "}
            {total.normal === 1 ? "normal" : "normales"}
          </p>
        </div>

        <a
          href={`/api/reportes/movimientos?${descarga.toString()}`}
          className="border-ink/16 text-ink/70 hover:border-taupe hover:text-ink rounded-field tracking-action flex items-center gap-2 px-4 py-[10px] text-[11px] font-semibold transition-colors"
        >
          <Download size={14} />
          DESCARGAR EXCEL
        </a>
      </div>

      <Filtros
        atajo={atajo}
        desde={desdeParam}
        hasta={hastaParam}
        tienda={tienda}
        tipo={tipo}
        tiendas={tiendas.map((t) => ({ id: t.id, nombre: t.nombre }))}
      />

      <Tarjeta className="overflow-hidden p-0">
        {ventas.length === 0 ? (
          <p className="text-ink/45 m-0 py-12 text-center text-[13px]">
            Sin ventas en el periodo.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr className="border-ink/10 border-b">
                  {(
                    [
                      ["FECHA", "left"],
                      ["TIPO", "left"],
                      ["TIENDA", "left"],
                      ["DETALLE", "left"],
                      ["ORO", "right"],
                      ["PLATA", "right"],
                      ["DESCUENTO", "right"],
                      ["NETO", "right"],
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
                {ventas.map((v) => (
                  <tr
                    key={v.clave}
                    className="border-ink/6 hover:bg-bone/60 border-b transition-colors"
                  >
                    <td className="text-ink/70 px-4 py-[11px] whitespace-nowrap">
                      {fecha(`${v.dia}T12:00:00Z`)}
                    </td>
                    <td className="px-4 py-[11px]">
                      {/* La distinción va en color y no solo en la palabra:
                          al recorrer cien filas se busca el patrón, no se
                          lee cada celda. */}
                      <span
                        className={`rounded-field inline-flex px-2 py-[2px] text-[10px] font-semibold tracking-[0.08em] ${
                          v.tipo === "vale"
                            ? "bg-taupe/16 text-taupe-deep"
                            : "border-ink/12 text-ink/55 border"
                        }`}
                      >
                        {v.tipo === "vale" ? "VALE" : "NORMAL"}
                      </span>
                    </td>
                    <td className="text-ink px-4 py-[11px]">{v.tienda}</td>
                    <td className="text-ink/55 px-4 py-[11px] text-[12px]">
                      {v.tipo === "vale"
                        ? [v.codigo, v.comprador].filter(Boolean).join(" · ")
                        : v.detalle || "—"}
                    </td>
                    <td className="text-ink/70 px-4 py-[11px] text-right tabular-nums">
                      {Number(v.monto_oro) > 0 ? moneda(Number(v.monto_oro)) : "—"}
                    </td>
                    <td className="text-ink/70 px-4 py-[11px] text-right tabular-nums">
                      {Number(v.monto_plata) > 0
                        ? moneda(Number(v.monto_plata))
                        : "—"}
                    </td>
                    <td className="text-taupe-deep px-4 py-[11px] text-right tabular-nums">
                      {Number(v.descuento) > 0
                        ? moneda(Number(v.descuento))
                        : "—"}
                    </td>
                    <td className="text-ink px-4 py-[11px] text-right font-medium tabular-nums">
                      {moneda(Number(v.neto))}
                    </td>
                  </tr>
                ))}
              </tbody>

              <tfoot>
                <tr className="border-ink/25 bg-bone/70 border-t-2">
                  <td className="text-ink px-4 py-[13px] font-semibold" colSpan={4}>
                    TOTAL · {ventas.length}{" "}
                    {ventas.length === 1 ? "venta" : "ventas"}
                  </td>
                  {([total.oro, total.plata, total.descuento, total.neto] as number[]).map(
                    (valor, i) => (
                      <td
                        key={i}
                        className={`px-4 py-[13px] text-right font-semibold tabular-nums ${
                          i === 3 ? "text-taupe-deep" : "text-ink"
                        }`}
                      >
                        {moneda(valor)}
                      </td>
                    ),
                  )}
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Tarjeta>

      <p className="text-ink/40 m-0 text-[11.5px] leading-relaxed">
        <strong className="font-medium">Vale</strong>: compra en la que el
        cliente presentó su vale y se le aplicó el descuento de campaña.{" "}
        <strong className="font-medium">Normal</strong>: venta de la tienda sin
        vale, en oro o plata, sin descuento. El{" "}
        <strong className="font-medium">neto</strong> es lo que quedó en caja
        en cada línea.
      </p>
    </>
  );
}
