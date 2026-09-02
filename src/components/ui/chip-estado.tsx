import type { EstadoVale } from "@/lib/supabase/types";
import { cn } from "@/lib/utils";

/**
 * Estado del vale. Se deriva en SQL (`vw_vales_detalle.estado`), no es una
 * columna almacenada: un vale vence por el paso del tiempo, sin que nadie
 * tenga que actualizarlo.
 *
 * El estado NO usa los colores de serie: esos identifican el tipo de vale.
 * Mezclarlos haría que un color significara dos cosas distintas.
 */

const ESTILOS: Record<EstadoVale, string> = {
  activo: "bg-taupe/16 text-taupe-deep",
  vencido: "bg-ink/6 text-ink/50",
  anulado: "bg-clay/10 text-clay",
};

const ETIQUETAS: Record<EstadoVale, string> = {
  activo: "VIGENTE",
  vencido: "VENCIDO",
  anulado: "ANULADO",
};

export function ChipEstado({
  estado,
  className,
}: {
  estado: EstadoVale;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "rounded-field shrink-0 px-[10px] py-1 text-[9.5px] font-semibold tracking-[0.1em]",
        ESTILOS[estado],
        className,
      )}
    >
      {ETIQUETAS[estado]}
    </span>
  );
}
