import Link from "next/link";

/**
 * Las dos caras de inteligencia comercial.
 *
 * Van como pestañas y no como dos entradas del menú porque responden a
 * preguntas del mismo dueño en el mismo momento: la campaña y la venta. Cada
 * una es su propia ruta, así que se pueden guardar y compartir por separado.
 */

const PESTANAS = [
  { href: "/panel/reportes", nombre: "Campaña" },
  { href: "/panel/reportes/ventas", nombre: "Ventas" },
];

export function PestanasReportes({ activa }: { activa: string }) {
  return (
    <nav className="border-ink/8 flex gap-1 border-b" aria-label="Vistas de inteligencia comercial">
      {PESTANAS.map((p) => {
        const esActiva = p.href === activa;
        return (
          <Link
            key={p.href}
            href={p.href}
            aria-current={esActiva ? "page" : undefined}
            className={`-mb-px border-b-2 px-4 py-[10px] text-[13px] transition-colors ${
              esActiva
                ? "border-taupe text-ink font-medium"
                : "text-ink/45 hover:text-ink border-transparent"
            }`}
          >
            {p.nombre}
          </Link>
        );
      })}
    </nav>
  );
}
