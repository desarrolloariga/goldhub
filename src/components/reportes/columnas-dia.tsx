"use client";

import { useMemo, useState } from "react";

import { REGION, moneda, monedaCorta } from "@/lib/format";

/**
 * Venta día a día, en columnas.
 *
 * Columnas y no línea: cada día es un total cerrado, no una medición de algo
 * continuo. Una línea uniría dos días con venta saltándose el que quedó a
 * cero, y dibujaría una pendiente donde lo que hubo fue una tienda cerrada.
 *
 * Una sola serie, así que no lleva leyenda —el título dice qué es— y toma el
 * primer color de la paleta. La cifra fina va en el tooltip; debajo, en la
 * pantalla, queda la tabla que hace que ningún valor dependa del ratón.
 */

export type DiaVenta = {
  dia: string;
  venta: number;
  tickets: number;
};

const ALTO = 170;

/** Solo el número: es lo que va debajo de cada columna. */
function numeroDia(iso: string) {
  return new Date(`${iso}T12:00:00Z`).getUTCDate();
}

function etiquetaDia(iso: string) {
  // Mediodía a propósito: `2026-08-20` a secas es medianoche UTC y en
  // Guatemala caería en el día anterior.
  return new Date(`${iso}T12:00:00`).toLocaleDateString(REGION, {
    day: "numeric",
    month: "short",
  });
}

export function ColumnasDia({
  datos,
  medida,
}: {
  datos: DiaVenta[];
  medida: "venta" | "tickets";
}) {
  const [activo, setActivo] = useState<number | null>(null);

  const valorDe = (d: DiaVenta) =>
    medida === "venta" ? Number(d.venta) : d.tickets;

  const { tope, ticks } = useMemo(() => {
    const maximo = Math.max(1, ...datos.map(valorDe));
    // Eje redondeado a números limpios: 1 / 2 / 5 × 10ⁿ.
    const magnitud = 10 ** Math.floor(Math.log10(maximo));
    const paso =
      [1, 1.5, 2, 3, 5, 10].find((p) => p * magnitud >= maximo)! * magnitud;
    return {
      tope: paso,
      ticks: [0, 0.5, 1].map((f) => paso * f),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datos, medida]);

  if (datos.length === 0) {
    return (
      <p className="text-ink/45 m-0 py-8 text-center text-[12.5px]">
        No hubo ventas en el periodo elegido.
      </p>
    );
  }

  const formato = (v: number) =>
    medida === "venta" ? moneda(v) : `${v} ${v === 1 ? "compra" : "compras"}`;

  /*
   * Cada rótulo necesita unos 22 px para no tocar al vecino. Se calcula
   * cuántos días caben y se salta el resto: es preferible enseñar uno de
   * cada tres que apretar treinta números hasta que se solapen.
   */
  const paso = Math.max(1, Math.ceil(datos.length / 16));

  return (
    <div className="flex flex-col gap-2">
      <div className="relative flex" style={{ height: ALTO }}>
        {/* Eje: tres referencias, retrocedidas para no competir con los datos */}
        <div className="text-ink/35 flex w-11 shrink-0 flex-col justify-between pr-2 text-right text-[9.5px] tabular-nums">
          {[...ticks].reverse().map((t) => (
            <span key={t}>{medida === "venta" ? monedaCorta(t) : t}</span>
          ))}
        </div>

        <div className="relative min-w-0 flex-1">
          {ticks.map((t) => (
            <span
              key={t}
              className="bg-rejilla absolute right-0 left-0 h-px"
              style={{ bottom: `${(t / tope) * 100}%` }}
            />
          ))}

          <div
            className="absolute inset-0 flex items-end gap-[2px]"
            onMouseLeave={() => setActivo(null)}
          >
            {datos.map((d, i) => {
              const v = valorDe(d);
              return (
                <button
                  key={d.dia}
                  type="button"
                  onMouseEnter={() => setActivo(i)}
                  onFocus={() => setActivo(i)}
                  aria-label={`${etiquetaDia(d.dia)}: ${formato(v)}`}
                  className="group relative flex h-full min-w-0 flex-1 cursor-default items-end"
                >
                  {/* La columna. El área de acierto es toda la altura, que es
                      mucho más fácil de alcanzar que la barra en sí. */}
                  <span
                    className="w-full rounded-t-[4px] transition-opacity"
                    style={{
                      height: `${Math.max((v / tope) * 100, v > 0 ? 1.5 : 0)}%`,
                      background: "var(--color-serie-a1)",
                      opacity: activo === null || activo === i ? 1 : 0.45,
                    }}
                  />
                </button>
              );
            })}
          </div>

          {activo !== null ? (
            <div
              className="border-ink/10 bg-paper pointer-events-none absolute -top-1 z-10 rounded-[6px] border px-3 py-2 text-[11.5px] whitespace-nowrap shadow-[0_6px_20px_rgba(11,11,12,0.10)]"
              style={{
                left: `${((activo + 0.5) / datos.length) * 100}%`,
                transform: `translateX(${activo > datos.length / 2 ? "-100%" : "0"})`,
              }}
            >
              <span className="text-ink/50">{etiquetaDia(datos[activo].dia)}</span>
              <span className="text-ink ml-2 font-semibold">
                {formato(valorDe(datos[activo]))}
              </span>
            </div>
          ) : null}
        </div>
      </div>

      {/*
        El eje X, alineado columna a columna: cada celda ocupa lo mismo que su
        barra, así que el número cae debajo de la suya y no a ojo.

        Con muchos días no caben todos los rótulos, así que se saltan de N en
        N —nunca se encogen hasta ser ilegibles—. El primero y el último
        siempre salen: son los que acotan el periodo.
      */}
      {/* El mismo `gap` que las columnas: sin él cada rótulo se desplaza dos
          píxeles por columna y al final del eje señala al día equivocado. */}
      <div className="flex gap-[2px] pl-11">
        {datos.map((d, i) => {
          const ultima = i === datos.length - 1;
          const toca = i % paso === 0 || ultima;
          // Se omite el penúltimo rótulo si va a chocar con el último.
          const choca = !ultima && datos.length - 1 - i < paso / 2;

          return (
            <span
              key={d.dia}
              className="text-ink/35 min-w-0 flex-1 text-center text-[9.5px] tabular-nums"
            >
              {toca && !choca ? numeroDia(d.dia) : ""}
            </span>
          );
        })}
      </div>

      {/* El mes va aparte: repetirlo en cada columna sería ruido. */}
      <div className="text-ink/30 flex justify-between pl-11 text-[9.5px]">
        <span>{etiquetaDia(datos[0].dia)}</span>
        {datos.length > 1 ? <span>{etiquetaDia(datos[datos.length - 1].dia)}</span> : null}
      </div>
    </div>
  );
}
