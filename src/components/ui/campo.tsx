import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
} from "react";

import { cn } from "@/lib/utils";

/** Rótulo en versalitas espaciadas: el patrón tipográfico de toda la interfaz. */
export function Rotulo({
  children,
  className,
  tono = "oscuro",
}: {
  children: ReactNode;
  className?: string;
  tono?: "oscuro" | "claro" | "oro";
}) {
  return (
    <span
      className={cn(
        "tracking-field text-[10px] leading-none font-medium",
        tono === "oscuro" && "text-ink/50",
        tono === "claro" && "text-bone/40",
        tono === "oro" && "text-taupe-dark",
        className,
      )}
    >
      {children}
    </span>
  );
}

export type CampoProps = InputHTMLAttributes<HTMLInputElement> & {
  etiqueta?: string;
  error?: string;
  /** Nota bajo el campo. El error la sustituye cuando lo hay. */
  ayuda?: ReactNode;
};

/** Campo de texto con rótulo y estado de error. */
export function Campo({
  etiqueta,
  error,
  ayuda,
  className,
  ...props
}: CampoProps) {
  return (
    <label className="flex flex-col gap-[7px]">
      {etiqueta ? <Rotulo>{etiqueta}</Rotulo> : null}
      <input
        aria-invalid={error ? true : undefined}
        className={cn(
          "border-ink/14 bg-paper text-ink rounded-field w-full border px-[14px] py-[13px] text-sm",
          "transition-[border-color,box-shadow] duration-150",
          "focus:border-taupe focus:shadow-[0_0_0_3px_rgba(198,161,91,0.16)]",
          error && "border-clay focus:border-clay focus:shadow-[0_0_0_3px_rgba(142,69,52,0.16)]",
          className,
        )}
        {...props}
      />
      {ayuda && !error ? (
        <span className="text-ink/40 text-[11px] leading-relaxed">{ayuda}</span>
      ) : null}
      {error ? <span className="text-clay text-[11px]">{error}</span> : null}
    </label>
  );
}

export type SelectorProps = SelectHTMLAttributes<HTMLSelectElement> & {
  etiqueta?: string;
  error?: string;
  ayuda?: ReactNode;
};

/** Desplegable con el mismo tratamiento visual que `Campo`. */
export function Selector({
  etiqueta,
  error,
  ayuda,
  className,
  children,
  ...props
}: SelectorProps) {
  return (
    <label className="flex flex-col gap-[7px]">
      {etiqueta ? <Rotulo>{etiqueta}</Rotulo> : null}
      <select
        aria-invalid={error ? true : undefined}
        className={cn(
          "border-ink/14 bg-paper text-ink rounded-field w-full cursor-pointer appearance-none border px-[14px] py-[13px] text-sm",
          "transition-[border-color,box-shadow] duration-150",
          "focus:border-taupe focus:shadow-[0_0_0_3px_rgba(198,161,91,0.16)]",
          // Flecha dibujada en el fondo: los select nativos no se pueden
          // estilar de forma consistente entre navegadores.
          "bg-[length:9px] bg-[right_14px_center] bg-no-repeat pr-9",
          "bg-[image:url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 10 6%22><path d=%22M1 1l4 4 4-4%22 fill=%22none%22 stroke=%22%230B0B0C%22 stroke-opacity=%22.45%22 stroke-width=%221.5%22/></svg>')]",
          error && "border-clay focus:border-clay",
          className,
        )}
        {...props}
      >
        {children}
      </select>
      {ayuda && !error ? (
        <span className="text-ink/40 text-[11px] leading-relaxed">{ayuda}</span>
      ) : null}
      {error ? <span className="text-clay text-[11px]">{error}</span> : null}
    </label>
  );
}
