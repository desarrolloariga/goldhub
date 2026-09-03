import { cn } from "@/lib/utils";

/**
 * La tarifa del vale: los descuentos por forma de pago.
 *
 * Dos cifras y no una, con el mismo peso, porque el descuento depende de
 * cómo se pague y destacar una haría que la otra pareciera la letra pequeña
 * de una oferta que en realidad son dos. Mismo criterio que `Descuento` en
 * lib/vale-imagen.tsx, que dibuja esto en el vale.
 *
 * Los rótulos —«visa», «transferencia»— no son decorativos: sin ellos, dos
 * porcentajes sueltos no dicen de qué depende cobrar uno u otro.
 *
 * Antes era una sola cifra, el porcentaje sobre el oro que iba congelado
 * dentro de cada vale. Cambió al pasar el descuento a depender de la forma
 * de pago: aquello era la promesa escrita del cliente, esto son condiciones
 * de la red que valen para todos los vales vivos.
 */
export function Tarifa({
  visa,
  transferencia,
  tamano = "normal",
  className,
}: {
  visa: number;
  transferencia: number;
  tamano?: "normal" | "grande" | "compacto";
  className?: string;
}) {
  /*
   * Con un porcentaje en cero esa forma de pago desaparece, que es como se
   * retira una sin dejar un «0%» anunciado. Si se van las dos no queda nada
   * que enseñar.
   */
  const cajas = [
    visa > 0 ? { pct: visa, rotulo: "visa" } : null,
    transferencia > 0 ? { pct: transferencia, rotulo: "transferencia" } : null,
  ].filter((c): c is { pct: number; rotulo: string } => c !== null);

  if (!cajas.length) return null;

  if (tamano === "compacto") {
    return (
      <span className={cn("text-[11.5px] tabular-nums", className)}>
        {cajas.map((c) => `${c.pct}% ${c.rotulo}`).join(" · ")}
      </span>
    );
  }

  const cifra =
    tamano === "grande"
      ? "font-display text-[38px] leading-none"
      : "font-display text-[26px] leading-none";

  return (
    <span className={cn("flex items-center gap-4", className)}>
      {cajas.map((c, i) => (
        <span key={c.rotulo} className="flex items-center gap-4">
          {i > 0 ? (
            <span className="bg-ink/12 h-[26px] w-px" aria-hidden="true" />
          ) : null}
          <span className="flex flex-col items-center gap-[3px]">
            <span className={cifra}>{c.pct}%</span>
            <span className="text-[10px] tracking-[0.18em] uppercase opacity-60">
              {c.rotulo}
            </span>
          </span>
        </span>
      ))}
    </span>
  );
}
