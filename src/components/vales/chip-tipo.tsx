import type { TipoVale } from "@/lib/supabase/types";
import { cn } from "@/lib/utils";

/**
 * Distintivo de la puerta de entrada del vale.
 *
 * Usa los mismos cuatro colores que las gráficas del tablero: quien aprende
 * que A2 es azul en un listado lo reconoce igual en un reporte. El color va
 * con la entidad, nunca con su posición.
 *
 * Sobre su propio lavado el texto usa un paso más oscuro del mismo tono,
 * para no depender del color puro de serie —que está calibrado como marca,
 * no como texto.
 */

const ESTILOS: Record<TipoVale, string> = {
  A1: "bg-[color-mix(in_srgb,var(--color-serie-a1)_14%,transparent)] text-[var(--color-serie-a1-texto)]",
  A2: "bg-[color-mix(in_srgb,var(--color-serie-a2)_14%,transparent)] text-[var(--color-serie-a2-texto)]",
  A3: "bg-[color-mix(in_srgb,var(--color-serie-a3)_14%,transparent)] text-[var(--color-serie-a3-texto)]",
  A4: "bg-[color-mix(in_srgb,var(--color-serie-a4)_14%,transparent)] text-[var(--color-serie-a4-texto)]",
};

export function ChipTipo({
  tipo,
  className,
}: {
  tipo: TipoVale;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "rounded-field inline-flex shrink-0 px-2 py-[3px] font-mono text-[10px] font-semibold tracking-[0.08em]",
        ESTILOS[tipo],
        className,
      )}
    >
      {tipo}
    </span>
  );
}

/** Punto de color de la serie, para leyendas y filas de tabla. */
export function PuntoTipo({
  tipo,
  className,
}: {
  tipo: TipoVale;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn("inline-block size-[9px] shrink-0 rotate-45", className)}
      style={{ background: `var(--color-serie-${tipo.toLowerCase()})` }}
    />
  );
}
