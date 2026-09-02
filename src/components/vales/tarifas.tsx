import { cn } from "@/lib/utils";

/**
 * La tarifa del vale.
 *
 * Una sola cifra: aquí solo se vende oro. Antes eran dos —oro y plata— y
 * tenían que aparecer juntas para que el cliente no esperara ese porcentaje
 * sobre toda su compra. Con un solo material el riesgo es el mismo, y por
 * eso el rótulo «en oro» no es decorativo: sin él, un 15% suelto se lee como
 * un 15% sobre todo lo que se lleve.
 */
export function Tarifa({
  oro,
  tamano = "normal",
  className,
}: {
  oro: number;
  tamano?: "normal" | "grande" | "compacto";
  className?: string;
}) {
  if (tamano === "compacto") {
    return (
      <span className={cn("text-[11.5px] tabular-nums", className)}>
        {oro}% en oro
      </span>
    );
  }

  const cifra =
    tamano === "grande"
      ? "font-display text-[46px] leading-none"
      : "font-display text-[30px] leading-none";

  return (
    <span className={cn("flex flex-col items-center gap-[3px]", className)}>
      <span className={cifra}>{oro}%</span>
      <span className="text-[10px] tracking-[0.2em] uppercase opacity-60">
        en oro
      </span>
    </span>
  );
}
