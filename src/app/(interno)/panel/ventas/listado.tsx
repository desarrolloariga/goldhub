import Link from "next/link";

import { Tarjeta } from "@/components/ui/tarjeta";
import { BotonBorrar } from "@/components/ui/boton-borrar";
import { Rotulo } from "@/components/ui/campo";
import { fecha, moneda } from "@/lib/format";
import { eliminarVentaDirecta } from "@/lib/acciones/ventas-directas";
import type { VentaDirecta } from "@/lib/datos/ventas";

const CAMPO =
  "border-ink/12 bg-paper text-ink rounded-field focus:border-taupe border px-3 py-[8px] text-[12px] transition-colors outline-none";

/**
 * El historial de ventas sin vale, con borrado línea por línea.
 *
 * Arranca en las dos últimas semanas —lo recién anotado, que es lo que se
 * repasa a diario— pero admite fechas: corregir algo de hace un mes exige
 * poder verlo, y el reporte enseña cifras pero no deja tocarlas.
 *
 * Cada tienda ve y borra las suyas; el administrador, las de todas. Eso lo
 * decide el alcance de la sesión en la página, no este componente.
 */
export function Listado({
  ventas,
  mostrarTienda,
  desde,
  hasta,
  aMedida,
  hoy,
}: {
  ventas: VentaDirecta[];
  /** El administrador ve de qué tienda es cada una; la tienda no. */
  mostrarTienda: boolean;
  desde: string;
  hasta: string;
  /** Con fechas escritas, el título deja de decir «últimas dos semanas». */
  aMedida: boolean;
  hoy: string;
}) {
  return (
    <Tarjeta className="flex flex-col gap-0 overflow-hidden p-0">
      <div className="border-ink/8 flex flex-wrap items-center justify-between gap-3 border-b px-5 py-[14px]">
        <h3 className="font-display m-0 text-[16px] leading-none font-normal">
          {aMedida ? "Historial" : "Últimas dos semanas"}
        </h3>
        <span className="text-ink/45 text-[12px]">
          {ventas.length} {ventas.length === 1 ? "registro" : "registros"}
        </span>
      </div>

      {/* El filtro va aquí y no arriba: pertenece a esta lista, no a la
          pantalla —el formulario de captura no se filtra por fecha—. */}
      <form
        action="/panel/ventas"
        className="border-ink/8 flex flex-wrap items-end gap-3 border-b px-5 py-3"
      >
        <label className="flex flex-col gap-[5px]">
          <Rotulo>DESDE</Rotulo>
          <input type="date" name="desde" defaultValue={desde} max={hoy} className={CAMPO} />
        </label>
        <label className="flex flex-col gap-[5px]">
          <Rotulo>HASTA</Rotulo>
          <input type="date" name="hasta" defaultValue={hasta} max={hoy} className={CAMPO} />
        </label>
        <button
          type="submit"
          className="bg-ink text-taupe-light rounded-field cursor-pointer px-4 py-[9px] text-[11px] font-semibold tracking-[0.1em]"
        >
          VER
        </button>
        {aMedida ? (
          <Link
            href="/panel/ventas"
            className="text-ink/45 hover:text-ink py-[9px] text-[12px] transition-colors"
          >
            Quitar fechas
          </Link>
        ) : null}
      </form>

      {ventas.length === 0 ? (
        <p className="text-ink/45 m-0 px-5 py-10 text-center text-[12.5px]">
          {aMedida
            ? "No hay ventas en esas fechas."
            : "Todavía no hay ventas sin vale anotadas."}
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
              <BotonBorrar
                id={v.id}
                titulo="Borrar esta venta"
                descripcion={`la venta de ${moneda(Number(v.total))} del ${fecha(`${v.dia}T12:00:00Z`)}${
                  mostrarTienda ? ` en ${v.tienda}` : ""
                }`}
                accion={eliminarVentaDirecta}
              />
            </li>
          ))}
        </ul>
      )}
    </Tarjeta>
  );
}
