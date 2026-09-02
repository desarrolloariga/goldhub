import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/utils";

/** Tarjeta blanca sobre crema: el contenedor por defecto del panel. */
export function Tarjeta({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "bg-paper border-ink/7 rounded-card border",
        className,
      )}
      {...props}
    />
  );
}

/** Cabecera de tarjeta: título en display + acciones a la derecha. */
export function TarjetaEncabezado({
  titulo,
  children,
  className,
}: {
  titulo: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "border-ink/7 flex items-center justify-between border-b px-[22px] py-[18px]",
        className,
      )}
    >
      <h3 className="font-display m-0 text-lg leading-none font-normal">
        {titulo}
      </h3>
      {children}
    </div>
  );
}

/** Tarjeta de indicador: rótulo, cifra en display y variación. */
export function TarjetaIndicador({
  etiqueta,
  valor,
  nota,
}: {
  etiqueta: string;
  valor: ReactNode;
  nota?: ReactNode;
}) {
  return (
    <Tarjeta className="flex flex-col gap-3 px-5 py-[18px]">
      <span className="text-ink/42 text-[9px] leading-none font-medium tracking-[0.2em]">
        {etiqueta}
      </span>
      <span className="font-display text-[30px] leading-none font-medium">
        {valor}
      </span>
      {nota ? (
        <span className="text-taupe-dark text-[11px] leading-none">{nota}</span>
      ) : null}
    </Tarjeta>
  );
}
