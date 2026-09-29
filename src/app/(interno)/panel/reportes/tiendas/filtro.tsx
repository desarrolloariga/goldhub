import Link from "next/link";

import { Rotulo } from "@/components/ui/campo";
import { ATAJOS } from "@/app/(interno)/panel/reportes/ventas/filtros";

const CAMPO =
  "border-ink/12 bg-paper text-ink rounded-field focus:border-taupe w-full border px-3 py-[10px] text-[12.5px] transition-colors outline-none";

/**
 * El rango del reporte: atajos y fechas a medida.
 *
 * Los atajos son enlaces y el rango a medida un formulario GET, así que todo
 * el estado vive en la URL: el reporte se puede compartir o guardar en
 * marcadores y sigue mostrando el mismo periodo.
 *
 * Reutiliza `ATAJOS` de la pantalla de Ventas en vez de copiar la lista: dos
 * reportes que ofrecen «este mes» tienen que entender lo mismo por ello.
 *
 * Aquí no hay selector de tienda, al contrario que en Ventas: este reporte
 * es precisamente la tabla de todas, y filtrar a una sola lo dejaría en una
 * fila con su propio total debajo.
 */
export function FiltroFechas({
  atajo,
  desde,
  hasta,
}: {
  atajo: string;
  desde: string;
  hasta: string;
}) {
  const enlace = (clave: string) =>
    `/panel/reportes/tiendas${clave === "30" ? "" : `?rango=${clave}`}`;

  return (
    <div className="border-ink/7 bg-paper rounded-card flex flex-col gap-4 border p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-[6px]">
        {ATAJOS.map((a) => (
          <Link
            key={a.clave}
            href={enlace(a.clave)}
            className={`rounded-field px-3 py-[6px] text-[10px] font-medium tracking-[0.12em] transition-colors ${
              // Con fechas a medida puestas, ningún atajo está activo: el
              // periodo que manda es el escrito.
              atajo === a.clave && !desde && !hasta
                ? "bg-ink text-taupe-light"
                : "border-ink/12 text-ink/55 hover:border-taupe border"
            }`}
          >
            {a.etiqueta}
          </Link>
        ))}
      </div>

      <form
        action="/panel/reportes/tiendas"
        className="border-ink/7 flex flex-wrap items-end gap-3 border-t pt-4"
      >
        <label className="flex flex-col gap-[6px]">
          <Rotulo>DESDE</Rotulo>
          <input type="date" name="desde" defaultValue={desde} className={CAMPO} />
        </label>

        <label className="flex flex-col gap-[6px]">
          <Rotulo>HASTA</Rotulo>
          <input type="date" name="hasta" defaultValue={hasta} className={CAMPO} />
        </label>

        <button
          type="submit"
          className="bg-ink text-taupe-light rounded-field tracking-action cursor-pointer px-5 py-[11px] text-[11px] font-semibold"
        >
          APLICAR
        </button>

        {desde || hasta ? (
          <Link
            href="/panel/reportes/tiendas"
            className="text-ink/45 hover:text-ink py-[11px] text-[12px] transition-colors"
          >
            Quitar fechas
          </Link>
        ) : null}
      </form>
    </div>
  );
}
