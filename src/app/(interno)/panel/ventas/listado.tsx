"use client";

import { useActionState } from "react";
import { Trash2 } from "lucide-react";

import { Tarjeta } from "@/components/ui/tarjeta";
import { fecha, moneda } from "@/lib/format";
import {
  eliminarVentaDirecta,
  type EstadoBorrado,
} from "@/lib/acciones/ventas-directas";
import type { VentaDirecta } from "@/lib/datos/ventas";

/**
 * Las ventas sin vale de los últimos días.
 *
 * Corta en dos semanas a propósito: esto es para revisar lo que se acaba de
 * anotar y corregir un cero de más, no para consultar el histórico —eso está
 * en el reporte, que tiene filtro de fechas—.
 */
export function Listado({
  ventas,
  mostrarTienda,
}: {
  ventas: VentaDirecta[];
  /** El administrador ve de qué tienda es cada una; la tienda no. */
  mostrarTienda: boolean;
}) {
  const [estado, borrar] = useActionState<EstadoBorrado, FormData>(
    eliminarVentaDirecta,
    null,
  );

  return (
    <Tarjeta className="flex flex-col gap-0 overflow-hidden p-0">
      <div className="border-ink/8 flex items-center justify-between gap-3 border-b px-5 py-[14px]">
        <h3 className="font-display m-0 text-[16px] leading-none font-normal">
          Últimas dos semanas
        </h3>
        <span className="text-ink/45 text-[12px]">
          {ventas.length} {ventas.length === 1 ? "registro" : "registros"}
        </span>
      </div>

      {estado?.error ? (
        <p role="alert" className="text-clay m-0 px-5 py-3 text-[12px]">
          {estado.error}
        </p>
      ) : null}

      {ventas.length === 0 ? (
        <p className="text-ink/45 m-0 px-5 py-10 text-center text-[12.5px]">
          Todavía no hay ventas sin vale anotadas.
        </p>
      ) : (
        <ul className="m-0 list-none p-0">
          {ventas.map((v) => (
            <li
              key={v.id}
              className="border-ink/6 flex flex-wrap items-center gap-x-4 gap-y-1 border-b px-5 py-[13px] last:border-b-0"
            >
              <span className="flex min-w-0 flex-1 flex-col gap-[2px]">
                <span className="text-ink text-[13px] font-medium">
                  {fecha(`${v.dia}T12:00:00Z`)}
                  {mostrarTienda ? ` · ${v.tienda}` : ""}
                </span>
                <span className="text-ink/45 text-[11.5px]">
                  {[
                    Number(v.monto_oro) > 0
                      ? `oro ${moneda(Number(v.monto_oro))}`
                      : null,
                    Number(v.monto_plata) > 0
                      ? `plata ${moneda(Number(v.monto_plata))}`
                      : null,
                    v.nota,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </span>

              <span className="text-ink shrink-0 text-[14px] font-medium tabular-nums">
                {moneda(Number(v.total))}
              </span>

              {/* Borrar y no anular: una cifra mal tecleada no tiene historia
                  que preservar, y dejarla marcada solo ensucia el listado. */}
              <form action={borrar} className="shrink-0">
                <input type="hidden" name="id" value={v.id} />
                <button
                  type="submit"
                  title="Borrar esta venta"
                  aria-label={`Borrar la venta de ${fecha(`${v.dia}T12:00:00Z`)}`}
                  className="text-ink/30 hover:text-clay cursor-pointer transition-colors"
                >
                  <Trash2 size={14} />
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </Tarjeta>
  );
}
