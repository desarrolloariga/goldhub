import { cn } from "@/lib/utils";

/**
 * Marca GOLD HUB.
 *
 * No hay isotipo: la firma es el propio nombre compuesto en la serif de la
 * interfaz. Eso ahorra el ida y vuelta de generar PNG, favicon, icono de iOS
 * y una copia en base64 cada vez que la marca cambia —y hace que la firma se
 * vea igual en la pantalla, en el PDF y en la imagen que dibuja el servidor,
 * que es donde una imagen empotrada siempre acababa desalineada—.
 *
 * Las dos palabras van en tintas distintas a propósito: es lo único que
 * separa «GOLD HUB» de un título cualquiera cuando no hay símbolo que lo
 * anuncie.
 */
export function Marca({
  tamano = 22,
  className,
}: {
  /** Cuerpo de la tipografía en px. La marca escala desde aquí. */
  tamano?: number;
  className?: string;
}) {
  return (
    <span
      className={cn("font-display inline-flex leading-none font-normal", className)}
      style={{ fontSize: tamano, letterSpacing: "0.18em" }}
    >
      <span className="text-taupe-light">GOLD</span>
      {/* El espacio va como elemento propio: con `letter-spacing` alto, un
          espacio normal se estira tanto que las dos palabras se separan. */}
      <span style={{ width: tamano * 0.26 }} />
      <span className="text-bone/85">HUB</span>
    </span>
  );
}

/**
 * Marca + nombre del producto, como aparece en la cabecera del panel.
 *
 * Aquí sí se nombra SMART VALE: dentro del panel el rótulo tiene que decir
 * qué aplicación es, no solo de quién.
 */
export function MarcaCompacta({ className }: { className?: string }) {
  return (
    <div className={cn("flex flex-col gap-[7px]", className)}>
      <Marca tamano={17} />
      <span className="text-bone/40 text-[8px] leading-none tracking-[0.36em]">
        SMART VALE
      </span>
    </div>
  );
}
