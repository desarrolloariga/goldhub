import Link from "next/link";

import { Rotulo } from "@/components/ui/campo";

/**
 * Rango y acotaciones del tablero de ventas.
 *
 * Se queda en el servidor: no tiene estado ni manejadores —los atajos son
 * enlaces y el rango a medida un formulario GET—, y siendo de cliente no
 * podría recibir el constructor de URL que arma la página.
 *
 * Los atajos son enlaces y el rango a medida un formulario: lo primero es un
 * clic —«los últimos 7 días» es la pregunta de todos los lunes— y lo segundo
 * pide escribir dos fechas. Todo viaja en la URL, así que un periodo concreto
 * se puede guardar o mandar a quien lo pidió.
 */

export type Atajo = { clave: string; etiqueta: string };

export const ATAJOS: Atajo[] = [
  { clave: "hoy", etiqueta: "HOY" },
  { clave: "ayer", etiqueta: "AYER" },
  { clave: "7", etiqueta: "7 DÍAS" },
  { clave: "30", etiqueta: "30 DÍAS" },
  { clave: "mes", etiqueta: "ESTE MES" },
  { clave: "todo", etiqueta: "TODO" },
];

const CAMPO =
  "border-ink/12 bg-paper text-ink rounded-field focus:border-taupe w-full border px-3 py-[10px] text-[12.5px] transition-colors outline-none";

const SELECTOR = `${CAMPO} cursor-pointer appearance-none bg-[length:9px] bg-[right_11px_center] bg-no-repeat pr-8 bg-[image:url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 10 6%22><path d=%22M1 1l4 4 4-4%22 fill=%22none%22 stroke=%22%230B0B0C%22 stroke-opacity=%22.45%22 stroke-width=%221.5%22/></svg>')]`;

export function FiltrosVentas({
  atajo,
  desde,
  hasta,
  tienda,
  medida,
  tiendas,
  enlace,
}: {
  atajo: string;
  desde: string;
  hasta: string;
  tienda: string;
  medida: string;
  tiendas: { id: number; nombre: string }[];
  enlace: (cambios: Record<string, string>) => string;
}) {
  return (
    <div className="border-ink/7 bg-paper rounded-card flex flex-col gap-4 border p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-[6px]">
        {ATAJOS.map((a) => (
          <Link
            key={a.clave}
            href={enlace({ rango: a.clave, desde: "", hasta: "" })}
            className={`rounded-field px-3 py-[6px] text-[10px] font-medium tracking-[0.12em] transition-colors ${
              atajo === a.clave && !desde
                ? "bg-ink text-taupe-light"
                : "border-ink/12 text-ink/55 hover:border-taupe border"
            }`}
          >
            {a.etiqueta}
          </Link>
        ))}
      </div>

      <form
        action="/panel/reportes/ventas"
        className="border-ink/7 flex flex-wrap items-end gap-3 border-t pt-4"
      >
        {/* La medida y las acotaciones sobreviven al cambio de fechas. */}
        {medida !== "venta" ? (
          <input type="hidden" name="medida" value={medida} />
        ) : null}

        <label className="flex flex-col gap-[6px]">
          <Rotulo>DESDE</Rotulo>
          <input type="date" name="desde" defaultValue={desde} className={CAMPO} />
        </label>

        <label className="flex flex-col gap-[6px]">
          <Rotulo>HASTA</Rotulo>
          <input type="date" name="hasta" defaultValue={hasta} className={CAMPO} />
        </label>

        <label className="flex min-w-[170px] flex-col gap-[6px]">
          <Rotulo>SUCURSAL</Rotulo>
          <select name="tienda" defaultValue={tienda} className={SELECTOR}>
            <option value="">Todas</option>
            {tiendas.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nombre}
              </option>
            ))}
          </select>
        </label>

        <button
          type="submit"
          className="bg-ink text-taupe-light rounded-field tracking-action cursor-pointer px-5 py-[11px] text-[11px] font-semibold transition-opacity hover:opacity-90"
        >
          APLICAR
        </button>

        {desde || hasta || tienda ? (
          <Link
            href="/panel/reportes/ventas"
            className="text-ink/45 hover:text-taupe-dark flex items-center py-[11px] text-[12px] transition-colors"
          >
            Limpiar
          </Link>
        ) : null}
      </form>
    </div>
  );
}
