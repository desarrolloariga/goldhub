import Link from "next/link";

import { Rotulo } from "@/components/ui/campo";
import { ATAJOS } from "@/app/(interno)/panel/reportes/ventas/filtros";

const CAMPO =
  "border-ink/12 bg-paper text-ink rounded-field focus:border-taupe w-full border px-3 py-[10px] text-[12.5px] transition-colors outline-none";

/**
 * Rango, tienda y tipo de venta.
 *
 * Todo vive en la URL —los atajos son enlaces y el resto un formulario GET—,
 * así que el reporte se puede compartir o guardar en marcadores y sigue
 * mostrando lo mismo.
 */
export function Filtros({
  atajo,
  desde,
  hasta,
  tienda,
  tipo,
  tiendas,
}: {
  atajo: string;
  desde: string;
  hasta: string;
  tienda: string;
  tipo: string;
  tiendas: { id: number; nombre: string }[];
}) {
  const base = (cambios: Record<string, string>) => {
    const q = new URLSearchParams();
    const todo: Record<string, string> = {
      rango: atajo,
      desde,
      hasta,
      tienda,
      tipo,
      ...cambios,
    };
    for (const [k, v] of Object.entries(todo)) {
      if (!v) continue;
      if (k === "rango" && v === "30") continue;
      q.set(k, v);
    }
    const s = q.toString();
    return `/panel/reportes/movimientos${s ? `?${s}` : ""}`;
  };

  return (
    <div className="border-ink/7 bg-paper rounded-card flex flex-col gap-4 border p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-[6px]">
        {ATAJOS.map((a) => (
          <Link
            key={a.clave}
            href={base({ rango: a.clave, desde: "", hasta: "" })}
            className={`rounded-field px-3 py-[6px] text-[10px] font-medium tracking-[0.12em] transition-colors ${
              atajo === a.clave && !desde && !hasta
                ? "bg-ink text-taupe-light"
                : "border-ink/12 text-ink/55 hover:border-taupe border"
            }`}
          >
            {a.etiqueta}
          </Link>
        ))}
      </div>

      {/* El tipo va como chips y no en el desplegable: son tres opciones y
          es el filtro propio de esta pantalla, el que la distingue. */}
      <div className="flex flex-wrap items-center gap-[6px]">
        {(
          [
            ["", "TODAS"],
            ["vale", "CON VALE"],
            ["normal", "NORMALES"],
          ] as const
        ).map(([clave, etiqueta]) => (
          <Link
            key={etiqueta}
            href={base({ tipo: clave })}
            className={`rounded-field px-3 py-[6px] text-[10px] font-medium tracking-[0.12em] transition-colors ${
              tipo === clave
                ? "bg-taupe-dark text-white"
                : "border-ink/12 text-ink/55 hover:border-taupe border"
            }`}
          >
            {etiqueta}
          </Link>
        ))}
      </div>

      <form
        action="/panel/reportes/movimientos"
        className="border-ink/7 flex flex-wrap items-end gap-3 border-t pt-4"
      >
        {/* El tipo sobrevive al cambio de fechas: se eligió aparte. */}
        {tipo ? <input type="hidden" name="tipo" value={tipo} /> : null}

        <label className="flex flex-col gap-[6px]">
          <Rotulo>DESDE</Rotulo>
          <input type="date" name="desde" defaultValue={desde} className={CAMPO} />
        </label>

        <label className="flex flex-col gap-[6px]">
          <Rotulo>HASTA</Rotulo>
          <input type="date" name="hasta" defaultValue={hasta} className={CAMPO} />
        </label>

        <label className="flex min-w-[170px] flex-col gap-[6px]">
          <Rotulo>TIENDA</Rotulo>
          <select
            name="tienda"
            defaultValue={tienda}
            className={`${CAMPO} cursor-pointer`}
          >
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
          className="bg-ink text-taupe-light rounded-field tracking-action cursor-pointer px-5 py-[11px] text-[11px] font-semibold"
        >
          APLICAR
        </button>

        {desde || hasta || tienda || tipo ? (
          <Link
            href="/panel/reportes/movimientos"
            className="text-ink/45 hover:text-ink py-[11px] text-[12px] transition-colors"
          >
            Quitar filtros
          </Link>
        ) : null}
      </form>
    </div>
  );
}
