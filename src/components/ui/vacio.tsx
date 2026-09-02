import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Estado vacío. Dice qué falta y qué hacer al respecto, en lugar de dejar
 * una tabla en blanco que parece un error.
 */
export function Vacio({
  titulo,
  descripcion,
  accion,
  className,
}: {
  titulo: string;
  descripcion?: ReactNode;
  accion?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-3 px-6 py-14 text-center",
        className,
      )}
    >
      <span className="border-taupe/40 inline-block size-3 rotate-45 border" />
      <h3 className="font-display m-0 text-xl leading-tight font-normal">
        {titulo}
      </h3>
      {descripcion ? (
        <p className="text-ink/50 m-0 max-w-sm text-[13px] leading-relaxed">
          {descripcion}
        </p>
      ) : null}
      {accion}
    </div>
  );
}
