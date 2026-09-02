import { REGION } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Medidor de proporción: qué parte del todo representa una cifra.
 *
 * Para una sola relación —conversión, descuento sobre venta— una barra de
 * proporción dice más que una gráfica de pastel de dos porciones, que es
 * justo el caso donde el pastel falla.
 */
export function Medidor({
  etiqueta,
  parte,
  total,
  parteTexto,
  totalTexto,
  nota,
  color = "var(--color-serie-a1)",
  className,
}: {
  etiqueta: string;
  parte: number;
  total: number;
  parteTexto?: string;
  totalTexto?: string;
  nota?: string;
  color?: string;
  className?: string;
}) {
  const proporcion = total > 0 ? Math.min(parte / total, 1) : 0;
  const porcentaje = total > 0 ? Math.round(proporcion * 1000) / 10 : 0;

  return (
    <div className={cn("flex flex-col gap-[10px]", className)}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-ink/42 text-[9px] font-medium tracking-[0.2em]">
          {etiqueta}
        </span>
        <span className="text-ink text-[13px] font-semibold tabular-nums">
          {porcentaje}%
        </span>
      </div>

      <div className="bg-ink/6 h-2 w-full overflow-hidden rounded-[1px]">
        <div
          className="h-2 rounded-r-[4px] transition-[width] duration-500"
          style={{
            width: `${Math.max(proporcion * 100, parte > 0 ? 1.5 : 0)}%`,
            background: color,
          }}
        />
      </div>

      <span className="text-ink/45 text-[11.5px]">
        {parteTexto ?? parte.toLocaleString(REGION)} de{" "}
        {totalTexto ?? total.toLocaleString(REGION)}
        {nota ? ` · ${nota}` : ""}
      </span>
    </div>
  );
}
