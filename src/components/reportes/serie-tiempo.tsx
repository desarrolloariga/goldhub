"use client";

import { useMemo, useRef, useState } from "react";

import { REGION } from "@/lib/format";

/**
 * Serie temporal de dos líneas con cruceta y tooltip.
 *
 * Es la única gráfica del tablero cuyos puntos no llevan etiqueta escrita
 * —serían decenas—, así que el tooltip es la lectura fina y la tabla de
 * abajo garantiza que ningún valor quede detrás del ratón: en un móvil o
 * con teclado el tooltip no existe.
 */

export type PuntoSerie = {
  dia: string;
  emitidos: number;
  redenciones: number;
};

const ALTO = 190;
const ANCHO = 760;
const MARGEN = { arriba: 14, derecha: 14, abajo: 26, izquierda: 40 };

const SERIES = [
  { clave: "emitidos", nombre: "Vales emitidos", color: "var(--color-serie-a1)" },
  { clave: "redenciones", nombre: "Compras", color: "var(--color-serie-a2)" },
] as const;

function formatoDia(iso: string) {
  const d = new Date(`${iso}T12:00:00`);
  return d.toLocaleDateString(REGION, { day: "numeric", month: "short" });
}

export function SerieTiempo({ datos }: { datos: PuntoSerie[] }) {
  const svg = useRef<SVGSVGElement>(null);
  const [activo, setActivo] = useState<number | null>(null);

  const { puntos, tope, ticksY } = useMemo(() => {
    const maximo = Math.max(
      1,
      ...datos.map((d) => Math.max(d.emitidos, d.redenciones)),
    );
    // Redondeo del eje a números limpios: 1 / 2 / 5 × 10ⁿ.
    const magnitud = 10 ** Math.floor(Math.log10(maximo));
    const paso = [1, 2, 5, 10].find((p) => p * magnitud >= maximo)! * magnitud;
    const divisiones = 4;

    const anchoUtil = ANCHO - MARGEN.izquierda - MARGEN.derecha;
    const altoUtil = ALTO - MARGEN.arriba - MARGEN.abajo;

    return {
      tope: paso,
      ticksY: Array.from({ length: divisiones + 1 }, (_, i) => {
        const valor = (paso / divisiones) * i;
        return { valor, y: MARGEN.arriba + altoUtil - (valor / paso) * altoUtil };
      }),
      puntos: datos.map((d, i) => ({
        ...d,
        x:
          MARGEN.izquierda +
          (datos.length === 1 ? anchoUtil / 2 : (i / (datos.length - 1)) * anchoUtil),
        yEmitidos: MARGEN.arriba + altoUtil - (d.emitidos / paso) * altoUtil,
        yRedenciones:
          MARGEN.arriba + altoUtil - (d.redenciones / paso) * altoUtil,
      })),
    };
  }, [datos]);

  if (datos.length === 0) {
    return (
      <p className="text-ink/45 m-0 px-4 py-12 text-center text-[12.5px]">
        Todavía no hay actividad que graficar.
      </p>
    );
  }

  const trazo = (clave: "yEmitidos" | "yRedenciones") =>
    puntos.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p[clave]}`).join(" ");

  const p = activo !== null ? puntos[activo] : null;

  /** Coordenada del ratón → índice del punto más cercano. */
  function alMover(e: React.MouseEvent<SVGRectElement>) {
    const caja = svg.current?.getBoundingClientRect();
    if (!caja) return;
    const x = ((e.clientX - caja.left) / caja.width) * ANCHO;
    let cercano = 0;
    let dist = Infinity;
    puntos.forEach((punto, i) => {
      const d = Math.abs(punto.x - x);
      if (d < dist) {
        dist = d;
        cercano = i;
      }
    });
    setActivo(cercano);
  }

  // Cinco marcas como mucho, con los extremos siempre presentes. Se descarta
  // la penúltima si queda pegada a la última, para que no se solapen.
  const paso = Math.max(1, Math.ceil(puntos.length / 5));
  const etiquetasX = puntos.filter((_, i) => {
    if (i === 0 || i === puntos.length - 1) return true;
    if (puntos.length - 1 - i < paso / 2) return false;
    return i % paso === 0;
  });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-4">
        {SERIES.map((s) => (
          <span key={s.clave} className="flex items-center gap-2">
            <span
              aria-hidden
              className="inline-block h-[2px] w-4 rounded-full"
              style={{ background: s.color }}
            />
            <span className="text-ink/55 text-[11.5px]">{s.nombre}</span>
          </span>
        ))}
      </div>

      <div className="relative">
        <svg
          ref={svg}
          viewBox={`0 0 ${ANCHO} ${ALTO}`}
          className="h-[190px] w-full"
          role="img"
          aria-label="Vales emitidos y compras por día"
          onMouseLeave={() => setActivo(null)}
        >
          {/* Rejilla: línea sólida de un paso sobre el fondo, nunca punteada */}
          {ticksY.map((t) => (
            <g key={t.valor}>
              <line
                x1={MARGEN.izquierda}
                x2={ANCHO - MARGEN.derecha}
                y1={t.y}
                y2={t.y}
                stroke="var(--color-rejilla)"
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
              />
              <text
                x={MARGEN.izquierda - 8}
                y={t.y + 3.5}
                textAnchor="end"
                className="fill-ink/40 text-[10px] tabular-nums"
              >
                {t.valor.toLocaleString(REGION)}
              </text>
            </g>
          ))}

          {/* Los extremos se anclan hacia dentro: centrados se salen del lienzo
              y el navegador los recorta. */}
          {etiquetasX.map((punto, i) => (
            <text
              key={punto.dia}
              x={punto.x}
              y={ALTO - 8}
              textAnchor={
                i === 0 ? "start" : i === etiquetasX.length - 1 ? "end" : "middle"
              }
              className="fill-ink/40 text-[10px]"
            >
              {formatoDia(punto.dia)}
            </text>
          ))}

          {p ? (
            <line
              x1={p.x}
              x2={p.x}
              y1={MARGEN.arriba}
              y2={ALTO - MARGEN.abajo}
              stroke="var(--color-eje)"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
          ) : null}

          {SERIES.map((s) => {
            const clave = s.clave === "emitidos" ? "yEmitidos" : "yRedenciones";
            return (
              <path
                key={s.clave}
                d={trazo(clave)}
                fill="none"
                stroke={s.color}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
            );
          })}

          {/* Marcadores solo del punto activo, con anillo del color del fondo */}
          {p
            ? SERIES.map((s) => {
                const y = s.clave === "emitidos" ? p.yEmitidos : p.yRedenciones;
                return (
                  <circle
                    key={s.clave}
                    cx={p.x}
                    cy={y}
                    r={4.5}
                    fill={s.color}
                    stroke="var(--color-paper)"
                    strokeWidth={2}
                    vectorEffect="non-scaling-stroke"
                  />
                );
              })
            : null}

          {/* Capa de captura: el objetivo es toda la altura, no el punto */}
          <rect
            x={MARGEN.izquierda}
            y={MARGEN.arriba}
            width={ANCHO - MARGEN.izquierda - MARGEN.derecha}
            height={ALTO - MARGEN.arriba - MARGEN.abajo}
            fill="transparent"
            onMouseMove={alMover}
          />
        </svg>

        {p ? (
          <div
            className="border-ink/10 bg-paper pointer-events-none absolute top-2 flex flex-col gap-1 rounded-[3px] border px-3 py-2 shadow-[0_6px_20px_rgba(11,11,12,0.09)]"
            style={{
              left: `${(p.x / ANCHO) * 100}%`,
              transform:
                p.x > ANCHO / 2 ? "translateX(calc(-100% - 12px))" : "translateX(12px)",
            }}
          >
            <span className="text-ink/45 text-[10px]">{formatoDia(p.dia)}</span>
            {SERIES.map((s) => (
              <span key={s.clave} className="flex items-center gap-2 text-[11.5px]">
                <span
                  aria-hidden
                  className="inline-block size-[7px] rounded-full"
                  style={{ background: s.color }}
                />
                <span className="text-ink/55">{s.nombre}</span>
                <span className="text-ink ml-auto font-semibold tabular-nums">
                  {s.clave === "emitidos" ? p.emitidos : p.redenciones}
                </span>
              </span>
            ))}
          </div>
        ) : null}
      </div>

      {/* Los valores nunca quedan solo detrás del ratón */}
      <details className="group">
        <summary className="text-ink/45 hover:text-taupe-dark cursor-pointer text-[11.5px] transition-colors">
          Ver los datos como tabla
        </summary>
        <div className="mt-3 max-h-64 overflow-y-auto">
          <table className="w-full border-collapse text-[12px]">
            <thead className="bg-ink/2 sticky top-0">
              <tr className="text-ink/45 text-left">
                <th className="px-3 py-2 font-medium">Día</th>
                <th className="px-3 py-2 text-right font-medium">Emitidos</th>
                <th className="px-3 py-2 text-right font-medium">Compras</th>
              </tr>
            </thead>
            <tbody>
              {datos.map((d) => (
                <tr key={d.dia} className="border-ink/6 border-t">
                  <td className="px-3 py-[6px]">{formatoDia(d.dia)}</td>
                  <td className="px-3 py-[6px] text-right tabular-nums">
                    {d.emitidos}
                  </td>
                  <td className="px-3 py-[6px] text-right tabular-nums">
                    {d.redenciones}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>

      <span className="sr-only">
        Escala máxima {tope.toLocaleString(REGION)}.
      </span>
    </div>
  );
}
