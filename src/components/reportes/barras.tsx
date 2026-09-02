import { REGION } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Barras horizontales.
 *
 * Cada valor lleva su etiqueta al final de la barra, así que la gráfica no
 * depende de un tooltip para leerse ni necesita rejilla: la magnitud se ve
 * en la longitud y la cifra exacta está escrita al lado.
 */

export type Barra = {
  etiqueta: string;
  /** Segunda línea bajo la etiqueta. */
  detalle?: string;
  valor: number;
  /** Texto que sustituye al número crudo (moneda, porcentaje…). */
  valorTexto?: string;
  /** Color de la marca. Por omisión, el ámbar de la primera ranura. */
  color?: string;
};

export function Barras({
  datos,
  className,
  maximo,
}: {
  datos: Barra[];
  className?: string;
  /** Escala compartida entre varias gráficas. Si falta, se usa el máximo local. */
  maximo?: number;
}) {
  const tope = Math.max(maximo ?? 0, ...datos.map((d) => d.valor), 1);

  return (
    <ul className={cn("m-0 flex list-none flex-col gap-4 p-0", className)}>
      {datos.map((d) => {
        const proporcion = Math.max(d.valor / tope, 0);
        return (
          <li key={d.etiqueta} className="flex flex-col gap-[6px]">
            <div className="flex items-baseline justify-between gap-3">
              <span className="flex min-w-0 items-baseline gap-2">
                <span className="text-ink truncate text-[12.5px] font-medium">
                  {d.etiqueta}
                </span>
                {d.detalle ? (
                  <span className="text-ink/42 truncate text-[11px]">
                    {d.detalle}
                  </span>
                ) : null}
              </span>
              <span className="text-ink shrink-0 text-[12.5px] font-semibold tabular-nums">
                {d.valorTexto ?? d.valor.toLocaleString(REGION)}
              </span>
            </div>

            {/* La pista es el hueco, no una segunda barra: solo el dato lleva tinta. */}
            <div className="bg-ink/6 h-2 w-full overflow-hidden rounded-[1px]">
              <div
                className="h-2 rounded-r-[4px] transition-[width] duration-500"
                style={{
                  width: `${Math.max(proporcion * 100, d.valor > 0 ? 1.5 : 0)}%`,
                  background: d.color ?? "var(--color-serie-a1)",
                }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
