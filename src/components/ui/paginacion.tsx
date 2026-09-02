import Link from "next/link";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";

/**
 * Paginación de tabla.
 *
 * Se navega con enlaces y no con estado de cliente: cada página es una URL
 * propia, así que se puede abrir en otra pestaña, guardar y volver atrás con
 * el botón del navegador. Nada de esto funciona si el número de página vive
 * solo en memoria.
 */

/**
 * Los números a enseñar, con saltos cuando hay demasiadas páginas.
 *
 * Siempre aparecen la primera, la última y las vecinas de la actual: son las
 * que alguien pulsa de verdad. `null` marca dónde va un salto.
 */
export function ventanaPaginas(actual: number, total: number, vecinas = 1) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);

  const paginas = new Set<number>([1, total, actual]);
  for (let d = 1; d <= vecinas; d++) {
    if (actual - d > 0) paginas.add(actual - d);
    if (actual + d <= total) paginas.add(actual + d);
  }

  const ordenadas = [...paginas].sort((a, b) => a - b);
  const salida: (number | null)[] = [];

  for (const [i, p] of ordenadas.entries()) {
    if (i > 0 && p - ordenadas[i - 1] > 1) salida.push(null);
    salida.push(p);
  }
  return salida;
}

export function Paginacion({
  pagina,
  paginas,
  total,
  porPagina,
  opcionesPorPagina,
  enlace,
}: {
  pagina: number;
  paginas: number;
  total: number;
  porPagina: number;
  opcionesPorPagina: readonly number[];
  /** Construye la URL de un cambio de parámetros, conservando los filtros. */
  enlace: (cambios: Record<string, string>) => string;
}) {
  const desde = total === 0 ? 0 : (pagina - 1) * porPagina + 1;
  const hasta = Math.min(pagina * porPagina, total);

  const salto =
    "rounded-field border-ink/12 text-ink/55 hover:border-taupe hover:text-ink flex size-8 items-center justify-center border transition-colors";
  const inerte =
    "rounded-field border-ink/8 text-ink/20 flex size-8 items-center justify-center border";

  return (
    <div className="border-ink/6 flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-t px-5 py-3">
      <span className="text-ink/50 text-[12px]">
        {total === 0 ? "Sin resultados" : `${desde}–${hasta} de ${total}`}
      </span>

      {paginas > 1 ? (
        <div className="flex items-center gap-1">
          {pagina > 1 ? (
            <>
              <Link href={enlace({ pagina: "1" })} aria-label="Primera página" className={salto}>
                <ChevronsLeft size={15} />
              </Link>
              <Link
                href={enlace({ pagina: String(pagina - 1) })}
                aria-label="Página anterior"
                className={salto}
              >
                <ChevronLeft size={15} />
              </Link>
            </>
          ) : (
            <>
              <span className={inerte}>
                <ChevronsLeft size={15} />
              </span>
              <span className={inerte}>
                <ChevronLeft size={15} />
              </span>
            </>
          )}

          {ventanaPaginas(pagina, paginas).map((p, i) =>
            p === null ? (
              <span key={`salto-${i}`} className="text-ink/30 px-1 text-[12px]">
                …
              </span>
            ) : p === pagina ? (
              <span
                key={p}
                aria-current="page"
                className="bg-ink text-taupe-light rounded-field flex h-8 min-w-8 items-center justify-center px-2 text-[12px] font-semibold tabular-nums"
              >
                {p}
              </span>
            ) : (
              <Link
                key={p}
                href={enlace({ pagina: String(p) })}
                className="rounded-field border-ink/12 text-ink/60 hover:border-taupe hover:text-ink flex h-8 min-w-8 items-center justify-center border px-2 text-[12px] tabular-nums transition-colors"
              >
                {p}
              </Link>
            ),
          )}

          {pagina < paginas ? (
            <>
              <Link
                href={enlace({ pagina: String(pagina + 1) })}
                aria-label="Página siguiente"
                className={salto}
              >
                <ChevronRight size={15} />
              </Link>
              <Link
                href={enlace({ pagina: String(paginas) })}
                aria-label="Última página"
                className={salto}
              >
                <ChevronsRight size={15} />
              </Link>
            </>
          ) : (
            <>
              <span className={inerte}>
                <ChevronRight size={15} />
              </span>
              <span className={inerte}>
                <ChevronsRight size={15} />
              </span>
            </>
          )}
        </div>
      ) : null}

      <span className="text-ink/45 flex items-center gap-2 text-[12px]">
        Por página
        {opcionesPorPagina.map((n) => (
          <Link
            key={n}
            // Cambiar el tamaño vuelve a la primera: la página 7 de cincuenta
            // en cincuenta no es la página 7 de doscientos en doscientos.
            href={enlace({ porPagina: String(n), pagina: "1" })}
            className={
              n === porPagina
                ? "text-ink font-semibold tabular-nums"
                : "hover:text-taupe-dark tabular-nums underline-offset-2 hover:underline"
            }
          >
            {n}
          </Link>
        ))}
      </span>
    </div>
  );
}
